"""抖音私信监控模块.

采用分步执行策略，先检查当前页面状态再决定下一步操作。
使用 AutoGLM-Phone 视觉模型执行操作。
支持可选的决策模型来解析 AI 返回结果。
支持 FastGPT 智能回复。
"""

import asyncio
import json
from collections import deque
from datetime import datetime
from enum import Enum
from pathlib import Path

from AutoGLM_GUI.douyin.parsers import MessageParser
from AutoGLM_GUI.douyin.reply_generator import ReplyGenerator
from AutoGLM_GUI.logger import logger


class MonitorStatus(str, Enum):
    """监控状态."""

    STOPPED = "stopped"
    RUNNING = "running"
    PAUSED = "paused"
    CHECKING = "checking"
    REPLYING = "replying"


class DouyinMessageMonitor:
    """抖音私信监控器."""

    _instance: "DouyinMessageMonitor | None" = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, "_initialized"):
            return
        self._initialized = True

        # 配置路径
        self._config_dir = Path.home() / ".config" / "autoglm"
        self._config_path = self._config_dir / "douyin_monitor.json"
        self._history_path = self._config_dir / "douyin_reply_history.json"

        # 状态
        self._status = MonitorStatus.STOPPED
        self._device_id: str | None = None
        self._check_interval: int = 30
        self._monitor_task: asyncio.Task | None = None
        self._auto_reply_enabled: bool = False
        self._reply_prompt_template: str = ""

        # 实时日志
        self._logs: deque = deque(maxlen=100)
        self._current_action: str = ""
        self._last_check_time: str | None = None
        self._messages_replied: int = 0

        # 初始化子模块
        self._parser = MessageParser(log_callback=self._add_log)
        self._reply_generator = ReplyGenerator(log_callback=self._add_log)

        self._ensure_dirs()
        self._load_config()

    def _ensure_dirs(self) -> None:
        self._config_dir.mkdir(parents=True, exist_ok=True)

    def _add_log(self, message: str, level: str = "info") -> None:
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message,
        }
        self._logs.append(log_entry)
        if level == "error":
            logger.error(f"[DouyinMonitor] {message}")
        else:
            logger.info(f"[DouyinMonitor] {message}")

    def _load_config(self) -> None:
        if not self._config_path.exists():
            return
        try:
            with open(self._config_path, encoding="utf-8") as f:
                config = json.load(f)
                self._device_id = config.get("device_id")
                self._check_interval = config.get("check_interval", 30)
                self._reply_prompt_template = config.get("reply_prompt_template", "")
                self._auto_reply_enabled = config.get("auto_reply_enabled", False)

                # 决策模型开关
                decision_enabled = config.get("decision_model_enabled", False)
                self._parser.set_decision_model_enabled(decision_enabled)

                # FastGPT 配置
                self._reply_generator.configure_fastgpt(
                    enabled=config.get("fastgpt_enabled", False),
                    base_url=config.get("fastgpt_base_url", ""),
                    api_key=config.get("fastgpt_api_key", ""),
                    timeout=config.get("fastgpt_timeout", 60),
                )
        except Exception as e:
            logger.error(f"Failed to load config: {e}")

    def _save_config(self) -> None:
        try:
            fastgpt_config = self._reply_generator.get_fastgpt_config()
            config = {
                "device_id": self._device_id,
                "check_interval": self._check_interval,
                "reply_prompt_template": self._reply_prompt_template,
                "auto_reply_enabled": self._auto_reply_enabled,
                "decision_model_enabled": self._parser._decision_model_enabled,
                **fastgpt_config,
            }
            with open(self._config_path, "w", encoding="utf-8") as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save config: {e}")


    # ==================== 历史记录管理 ====================

    def _load_history(self) -> list[dict]:
        if not self._history_path.exists():
            return []
        try:
            with open(self._history_path, encoding="utf-8") as f:
                return json.load(f).get("history", [])
        except Exception:
            return []

    def _save_history(self, history: list[dict]) -> None:
        try:
            with open(self._history_path, "w", encoding="utf-8") as f:
                json.dump({"history": history}, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    def _add_history(
        self,
        sender: str,
        received_message: str,
        reply_message: str,
        success: bool,
        error: str | None = None,
    ) -> dict:
        history = self._load_history()
        record = {
            "timestamp": datetime.now().isoformat(),
            "sender": sender,
            "received_message": received_message,
            "reply_message": reply_message,
            "success": success,
            "error": error,
        }
        history.insert(0, record)
        history = history[:500]
        self._save_history(history)
        return record

    def get_history(self, limit: int = 50) -> list[dict]:
        return self._load_history()[:limit]

    def clear_history(self) -> None:
        self._save_history([])

    # ==================== 状态和配置 API ====================

    def get_status(self) -> dict:
        fastgpt_config = self._reply_generator.get_fastgpt_config()
        return {
            "status": self._status.value,
            "device_id": self._device_id,
            "check_interval": self._check_interval,
            "auto_reply_enabled": self._auto_reply_enabled,
            "reply_prompt_template": self._reply_prompt_template,
            "decision_model_enabled": self._parser._decision_model_enabled,
            **fastgpt_config,
            "current_action": self._current_action,
            "last_check_time": self._last_check_time,
            "messages_replied": self._messages_replied,
        }

    def get_config(self) -> dict:
        fastgpt_config = self._reply_generator.get_fastgpt_config()
        return {
            "device_id": self._device_id,
            "check_interval": self._check_interval,
            "auto_reply_enabled": self._auto_reply_enabled,
            "reply_prompt_template": self._reply_prompt_template,
            "decision_model_enabled": self._parser._decision_model_enabled,
            **fastgpt_config,
        }

    def get_logs(self, limit: int = 50) -> list[dict]:
        return list(self._logs)[-limit:]

    def update_config(
        self,
        device_id: str | None = None,
        check_interval: int | None = None,
        auto_reply_enabled: bool | None = None,
        reply_prompt_template: str | None = None,
        decision_model_enabled: bool | None = None,
        fastgpt_enabled: bool | None = None,
        fastgpt_base_url: str | None = None,
        fastgpt_api_key: str | None = None,
        fastgpt_timeout: int | None = None,
    ) -> dict:
        if device_id is not None:
            self._device_id = device_id
        if check_interval is not None:
            self._check_interval = max(10, check_interval)
        if auto_reply_enabled is not None:
            self._auto_reply_enabled = auto_reply_enabled
        if reply_prompt_template is not None:
            self._reply_prompt_template = reply_prompt_template
        if decision_model_enabled is not None:
            self._parser.set_decision_model_enabled(decision_model_enabled)

        # 更新 FastGPT 配置
        current_fastgpt = self._reply_generator.get_fastgpt_config()
        self._reply_generator.configure_fastgpt(
            enabled=fastgpt_enabled if fastgpt_enabled is not None else current_fastgpt["fastgpt_enabled"],
            base_url=fastgpt_base_url if fastgpt_base_url is not None else current_fastgpt["fastgpt_base_url"],
            api_key=fastgpt_api_key if fastgpt_api_key is not None else current_fastgpt["fastgpt_api_key"],
            timeout=fastgpt_timeout if fastgpt_timeout is not None else current_fastgpt["fastgpt_timeout"],
        )

        self._save_config()
        return self.get_config()

    # ==================== Agent 执行 ====================

    def _run_single_step(self, instruction: str, max_steps: int = 3) -> str:
        """执行单个简单指令."""
        if not self._device_id:
            return "ERROR: 未选择设备"

        from AutoGLM_GUI.phone_agent_manager import PhoneAgentManager

        manager = PhoneAgentManager.get_instance()

        acquired = manager.acquire_device(
            self._device_id,
            timeout=0,
            raise_on_timeout=False,
            auto_initialize=True,
        )

        if not acquired:
            return "ERROR: 设备忙碌"

        try:
            agent = manager.get_agent(self._device_id)
            if agent is None:
                return "ERROR: 无法获取 Agent"

            original_max_steps = agent.agent_config.max_steps
            agent.agent_config.max_steps = max_steps

            try:
                agent.reset()
                result = agent.run(instruction)
                return result if result else "完成"
            finally:
                agent.agent_config.max_steps = original_max_steps
        finally:
            manager.release_device(self._device_id)

    async def _run_step_async(self, instruction: str, max_steps: int = 3) -> str:
        """异步执行单个指令."""
        return await asyncio.get_event_loop().run_in_executor(
            None,
            self._run_single_step,
            instruction,
            max_steps,
        )


    # ==================== 监控控制 ====================

    async def start(self, device_id: str | None = None) -> dict:
        if self._status in [MonitorStatus.RUNNING, MonitorStatus.CHECKING, MonitorStatus.REPLYING]:
            return {"success": False, "error": "Monitor is already running"}

        if device_id:
            self._device_id = device_id
            self._save_config()

        if not self._device_id:
            return {"success": False, "error": "No device selected"}

        self._status = MonitorStatus.RUNNING
        self._logs.clear()
        self._messages_replied = 0
        self._add_log("监控已启动")

        self._monitor_task = asyncio.create_task(self._monitor_loop())

        return {"success": True, "message": "Monitor started"}

    async def stop(self) -> dict:
        if self._status == MonitorStatus.STOPPED:
            return {"success": False, "error": "Monitor is not running"}

        self._status = MonitorStatus.STOPPED
        self._current_action = ""

        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None

        self._add_log("监控已停止")
        return {"success": True, "message": "Monitor stopped"}

    async def pause(self) -> dict:
        if self._status not in [MonitorStatus.RUNNING, MonitorStatus.CHECKING, MonitorStatus.REPLYING]:
            return {"success": False, "error": "Monitor is not running"}

        self._status = MonitorStatus.PAUSED
        self._current_action = "已暂停"
        self._add_log("监控已暂停")
        return {"success": True, "message": "Monitor paused"}

    async def resume(self) -> dict:
        if self._status != MonitorStatus.PAUSED:
            return {"success": False, "error": "Monitor is not paused"}

        self._status = MonitorStatus.RUNNING
        self._current_action = ""
        self._add_log("监控已恢复")
        return {"success": True, "message": "Monitor resumed"}

    # ==================== 页面导航 ====================

    async def _ensure_on_message_page(self) -> bool:
        """确保当前在抖音消息页面，返回是否成功."""
        self._current_action = "检查当前页面..."
        self._add_log("检查是否在抖音消息页")

        check_result = await self._run_step_async(
            "看屏幕，当前是否在抖音APP的消息页面？抖音消息页的特征是：屏幕底部有「首页」「朋友」「+」「消息」「我」五个按钮，且「消息」按钮是高亮选中状态。如果是，回答「在抖音消息页」；如果不是，回答「不在」",
            2,
        )

        self._add_log(f"页面状态: {check_result[:50]}...")

        if "在抖音消息页" in check_result:
            self._add_log("已在抖音消息页")
            return True

        # 检查是否在抖音APP内
        self._current_action = "检查是否在抖音..."
        check_douyin = await self._run_step_async(
            "看屏幕底部，是否有「首页」「朋友」「+」「消息」「我」这五个按钮？有就回答「在抖音」，没有就回答「不在抖音」",
            2,
        )

        self._add_log(f"抖音检查: {check_douyin[:30]}...")

        if "在抖音" in check_douyin and "不在" not in check_douyin:
            self._current_action = "点击抖音消息按钮..."
            self._add_log("点击抖音底部的消息按钮")
            await self._run_step_async("点击屏幕底部的「消息」按钮（在「+」右边）", 2)
            await asyncio.sleep(1)
            return True

        # 不在抖音，打开抖音
        self._current_action = "打开抖音..."
        self._add_log("打开抖音APP")
        await self._run_step_async("打开抖音APP", 3)
        await asyncio.sleep(2)

        self._current_action = "进入消息页面..."
        self._add_log("点击抖音底部的消息按钮")
        await self._run_step_async("点击屏幕底部的「消息」按钮（在「+」右边）", 2)
        await asyncio.sleep(1)

        return True


    # ==================== 监控循环 ====================

    async def _monitor_loop(self) -> None:
        """监控循环."""
        # 首次确保在消息页面
        await self._ensure_on_message_page()
        self._add_log("开始监控消息")

        while self._status != MonitorStatus.STOPPED:
            if self._status == MonitorStatus.PAUSED:
                await asyncio.sleep(1)
                continue

            try:
                self._status = MonitorStatus.CHECKING
                self._last_check_time = datetime.now().strftime("%H:%M:%S")

                if self._auto_reply_enabled:
                    await self._ensure_on_message_page()
                    await self._check_and_reply()

                self._status = MonitorStatus.RUNNING

            except Exception as e:
                self._add_log(f"出错: {e}", "error")
                self._status = MonitorStatus.RUNNING

            # 等待下次检查
            for i in range(self._check_interval):
                if self._status == MonitorStatus.STOPPED:
                    break
                if self._status == MonitorStatus.PAUSED:
                    break
                self._current_action = f"等待 {self._check_interval - i} 秒..."
                await asyncio.sleep(1)

    async def _check_and_reply(self) -> None:
        """检查并回复消息（假设已在消息页面）."""
        self._current_action = "检查未读私信..."
        self._add_log("检查私信列表未读消息")

        check_result = await self._run_step_async(
            "看抖音消息页面的私信列表。每条私信右侧如果有红色圆圈数字（如①②③），表示有未读消息。注意：用户名旁边的火花图标和数字不是未读标记。私信列表中是否有对话右侧显示红色数字？有就回答「有未读私信」，没有就回答「没有未读」",
            2,
        )

        self._add_log(f"检查结果: {check_result[:50]}...")

        # 解析是否有未读消息
        has_unread, unread_chat_name = self._parser.parse_unread_check(check_result)

        if not has_unread:
            self._add_log("没有未读私信，跳过")
            return

        # 点击未读私信对话
        self._status = MonitorStatus.REPLYING
        self._current_action = "进入对话..."
        self._add_log("点击未读私信对话")

        if unread_chat_name:
            self._add_log(f"点击对话: {unread_chat_name}")
            await self._run_step_async(f"点击名为「{unread_chat_name}」的私信对话", 2)
        else:
            await self._run_step_async("在私信列表中，找到右侧有红色数字的那条私信，点击它进入聊天", 2)
        await asyncio.sleep(1.5)

        # 检查最后一条消息是谁发的（避免重复回复）
        self._current_action = "检查是否需要回复..."
        self._add_log("检查聊天界面最后一条消息")

        last_msg_check = await self._run_step_async(
            "看聊天界面，最后一条消息（最底部的气泡）是什么颜色？蓝色是我发的，白色是对方发的。只回答「蓝色」或「白色」",
            2,
        )

        self._add_log(f"最后消息: {last_msg_check[:30]}...")

        # 如果最后是蓝色气泡（我发的），说明已经回复过了
        if "蓝" in last_msg_check and "白" not in last_msg_check:
            self._add_log("最后一条是我发的消息，已回复过，跳过")
            self._current_action = "返回列表..."
            await self._run_step_async("点击左上角返回按钮", 2)
            return

        # 读取对方名字
        self._current_action = "读取对方名字..."
        self._add_log("读取对方名字")

        name_result = await self._run_step_async(
            "看聊天界面顶部，对方的名字是什么？只告诉我名字",
            2,
        )
        sender_name = self._parser.parse_sender_name(name_result) if name_result else "用户"
        self._add_log(f"对方名字: {sender_name}")

        # 读取对方消息
        self._current_action = "读取消息..."
        self._add_log("读取对方消息")

        read_result = await self._run_step_async(
            "看聊天界面，白色气泡是对方发的消息，蓝色气泡是我发的消息。对方发的最后一条白色气泡消息内容是什么？只告诉我消息内容",
            2,
        )
        received_message = self._parser.parse_message_content(read_result)

        self._add_log(f"对方消息: {received_message[:50]}...")

        # 生成回复
        reply_content = self._reply_generator.generate_reply(received_message, sender_name)
        self._add_log(f"回复内容: {reply_content}")

        # 发送消息（最多重试2次）
        send_success = await self._send_message_with_retry(reply_content, max_retries=2)

        # 返回
        self._current_action = "返回列表..."
        self._add_log("返回消息列表")
        await self._run_step_async("点击左上角返回按钮", 2)

        if send_success:
            self._messages_replied += 1
            self._add_log(f"✓ 回复完成 (总计: {self._messages_replied})")

        # 记录历史
        self._add_history(
            sender=sender_name,
            received_message=received_message[:100] if received_message else "",
            reply_message=reply_content,
            success=send_success,
            error=None if send_success else "消息发送失败",
        )

    async def _send_message_with_retry(self, reply_content: str, max_retries: int = 2) -> bool:
        """发送消息，支持重试."""
        for attempt in range(max_retries + 1):
            if attempt > 0:
                self._add_log(f"第 {attempt + 1} 次尝试发送...")

            # 点击输入框
            self._current_action = "输入回复..."
            self._add_log("点击输入框")
            await self._run_step_async("点击底部的输入框", 2)
            await asyncio.sleep(0.5)

            # 输入回复
            await self._run_step_async(f"输入文字：{reply_content}", 2)
            await asyncio.sleep(0.5)

            # 发送
            self._current_action = "发送消息..."
            self._add_log("点击发送")
            await self._run_step_async("点击发送按钮", 2)
            await asyncio.sleep(1)

            # 检查是否发送成功
            self._current_action = "检查发送结果..."
            self._add_log("检查消息是否发送成功")
            check_result = await self._run_step_async(
                f"看聊天界面，最后一条蓝色气泡消息是否是「{reply_content[:20]}」？是就回答「发送成功」，不是就回答「发送失败」",
                2,
            )

            send_success = "成功" in check_result and "失败" not in check_result

            if send_success:
                self._add_log("✓ 消息发送成功")
                return True
            else:
                if attempt < max_retries:
                    self._add_log("发送失败，准备重试...", "error")
                    await asyncio.sleep(1)
                else:
                    self._add_log("✗ 消息发送失败，已达最大重试次数", "error")

        return False


    # ==================== 测试功能 ====================

    async def test_once(self) -> dict:
        """执行一次测试."""
        if not self._device_id:
            return {"success": False, "error": "No device selected"}

        if self._status in [MonitorStatus.CHECKING, MonitorStatus.REPLYING]:
            return {"success": False, "error": "Monitor is busy"}

        old_status = self._status
        try:
            self._status = MonitorStatus.CHECKING
            self._add_log("=== 开始测试 ===")

            # 确保在消息页面
            await self._ensure_on_message_page()

            # 检查未读消息
            self._current_action = "检查未读..."
            self._add_log("检查私信列表未读消息")
            result = await self._run_step_async(
                "看抖音消息页面的私信列表。每条私信右侧如果有红色圆圈数字（如①②③），表示有未读消息。注意：用户名旁边的火花图标和数字不是未读标记。私信列表中是否有对话右侧显示红色数字？有就回答「有未读私信」，没有就回答「没有未读」",
                2,
            )
            self._add_log(f"结果: {result}")

            self._add_log("=== 测试完成 ===")
            return {"success": True, "result": result}

        except Exception as e:
            self._add_log(f"测试失败: {e}", "error")
            return {"success": False, "error": str(e)}
        finally:
            self._status = old_status if old_status != MonitorStatus.STOPPED else MonitorStatus.STOPPED
            self._current_action = ""


# 全局单例
douyin_message_monitor = DouyinMessageMonitor()
