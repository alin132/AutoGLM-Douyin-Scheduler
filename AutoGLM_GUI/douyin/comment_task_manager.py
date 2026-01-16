"""抖音评论引流任务管理模块.

Features:
- 继承 BaseTaskManager 基类
- 任务 CRUD
- 定时调度
- 执行历史记录
- 模拟真实用户行为
"""

import asyncio
import random
import re
import threading
import uuid as uuid_lib
from datetime import datetime
from pathlib import Path
from typing import Callable

from AutoGLM_GUI.base_task_manager import BaseTaskManager, ExecutionStatus, TaskStatus
from AutoGLM_GUI.douyin.reply_history_db import reply_history_db
from AutoGLM_GUI.logger import logger


# 默认配置
DEFAULT_VIDEO_FILTER = {
    "min_likes": 1000,
    "max_likes": 50000,
    "publish_time": "default",  # default, day, week, half_year
    "sort_by": "latest",  # latest, most_liked, default
}

DEFAULT_INTERACTION = {
    "watch_video": True,
    "watch_duration_ratio": 0.8,
    "like_video": True,
    "favorite_video": True,
    "like_probability": 0.9,
}

DEFAULT_COMMENT = {
    "mode": "reply",  # reply: 回复评论, direct: 直接评论视频
    "reply_ratio": 0.01,
    "max_replies_per_video": 5,
    "min_replies_per_video": 1,
    "target_hot_comments": True,
    "target_question_comments": False,  # 优先回复问答形式的评论
    "target_regions": [],  # 目标地区 IP，如 ["山东", "四川"]，空则不限
    "reply_interval_min": 10,
    "reply_interval_max": 30,
}

DEFAULT_CONTENT = {
    "use_ai": True,
    "style": "koc",
    "templates": [
        "确实，说得太对了",
        "学到了，下次试试",
        "看饿了，想马上做一个",
        "这个做法不错，收藏了",
    ],
}

DEFAULT_EXECUTION = {
    "videos_per_run": 5,
    "video_interval_min": 60,  # 1分钟
    "video_interval_max": 180,  # 3分钟
}


class DouyinCommentTaskManager(BaseTaskManager):
    """抖音评论引流任务管理器（单例模式）."""

    _instance: "DouyinCommentTaskManager | None" = None
    _instance_lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, "_initialized"):
            return
        
        config_dir = Path.home() / ".config" / "autoglm"
        super().__init__(
            tasks_path=config_dir / "douyin_comment_tasks.json",
            history_path=config_dir / "douyin_comment_history.json",
            manager_name="Douyin comment task",
        )
        
        self._initialized = True
        # 记录任务 uuid -> device_id 的映射，用于 abort 时找到对应设备
        self._task_device_map: dict[str, str] = {}
        
        # 启动时清理超过30天的回复记录
        reply_history_db.cleanup_old_records(days=30)

    # ==================== 任务创建/更新 ====================

    def create_task(
        self,
        name: str,
        device_id: str,
        search_keywords: list[str],
        video_filter: dict | None = None,
        interaction: dict | None = None,
        comment: dict | None = None,
        content: dict | None = None,
        execution: dict | None = None,
        cron_expression: str | None = None,
        end_time: str | None = None,
        enabled: bool = True,
    ) -> dict:
        """创建任务.
        
        Args:
            end_time: 结束时间，格式 "HH:MM"，到达此时间后停止定时调度
        """
        # 验证 cron 表达式
        if cron_expression:
            self._validate_cron(cron_expression)

        tasks = self._load_tasks()
        now = datetime.now().isoformat()

        new_task = {
            "uuid": str(uuid_lib.uuid4()),
            "name": name,
            "device_id": device_id,
            "search_keywords": search_keywords,
            "video_filter": {**DEFAULT_VIDEO_FILTER, **(video_filter or {})},
            "interaction": {**DEFAULT_INTERACTION, **(interaction or {})},
            "comment": {**DEFAULT_COMMENT, **(comment or {})},
            "content": {**DEFAULT_CONTENT, **(content or {})},
            "execution": {**DEFAULT_EXECUTION, **(execution or {})},
            "cron_expression": cron_expression,
            "end_time": end_time,
            "status": TaskStatus.ENABLED.value if enabled else TaskStatus.DISABLED.value,
            "created_at": now,
            "updated_at": now,
            "last_run": None,
            "next_run": None,
        }

        tasks.append(new_task)
        self._save_tasks(tasks)

        # 如果启用且有 cron，注册到调度器
        if enabled and cron_expression and self._scheduler:
            self._register_job(new_task)
            new_task["next_run"] = self._get_next_run_time(new_task["uuid"])

        logger.info(f"Created douyin comment task: {name} (uuid={new_task['uuid']})")
        return new_task

    def update_task(self, uuid: str, **kwargs) -> dict | None:
        """更新任务."""
        tasks = self._load_tasks()

        for task in tasks:
            if task["uuid"] == uuid:
                # 验证 cron 表达式
                if "cron_expression" in kwargs and kwargs["cron_expression"]:
                    self._validate_cron(kwargs["cron_expression"])

                # 更新字段
                for key, value in kwargs.items():
                    if key not in task:
                        # 允许新增 end_time 字段
                        if key == "end_time":
                            task[key] = value
                        continue

                    # Allow explicitly clearing some fields
                    if value is None:
                        if key in {"cron_expression", "next_run", "last_run", "end_time"}:
                            task[key] = None
                        continue
                    
                    # 空字符串也视为清除
                    if value == "" and key in {"cron_expression", "end_time"}:
                        task[key] = None
                        continue

                    if isinstance(task[key], dict) and isinstance(value, dict):
                        task[key] = {**task[key], **value}
                    else:
                        task[key] = value

                task["updated_at"] = datetime.now().isoformat()

                # 重新注册调度任务
                self._unregister_job(uuid)
                if task["status"] == TaskStatus.ENABLED.value and task.get("cron_expression"):
                    self._register_job(task)
                    task["next_run"] = self._get_next_run_time(uuid)
                else:
                    task["next_run"] = None

                self._save_tasks(tasks)
                logger.info(f"Updated douyin comment task: uuid={uuid}")
                return task

        return None

    # ==================== 执行控制 ====================

    def abort_task(self, uuid: str) -> bool:
        """中止正在运行的任务."""
        if uuid not in self._running_tasks:
            return False

        handle = self._running_task_handles.get(uuid)
        if handle is not None and not handle.done():
            handle.cancel()

        # 获取设备 ID，用于停止底层 agent
        device_id = self._task_device_map.get(uuid)

        # 从运行集合中移除
        self._running_tasks.discard(uuid)
        self._task_device_map.pop(uuid, None)

        # 停止底层 PhoneAgent 并释放设备锁
        if device_id:
            try:
                from AutoGLM_GUI.phone_agent_manager import PhoneAgentManager
                manager = PhoneAgentManager.get_instance()
                manager.abort_streaming_chat(device_id)
                agent = manager.get_agent(device_id)
                if agent:
                    agent.abort()
                manager.force_release_device(device_id)
                logger.info(f"Aborted underlying agent for device {device_id}")
            except Exception as e:
                logger.warning(f"Failed to abort underlying agent: {e}")

        # 更新任务状态
        self._update_task_status(uuid, TaskStatus.ENABLED)
        logger.info(f"Aborted douyin comment task: uuid={uuid}")
        return True

    def run_task_now(self, uuid: str) -> bool:
        """立即执行任务."""
        task = self.get_task(uuid)
        if not task:
            return False

        if uuid in self._running_tasks:
            logger.warning(f"Task {uuid} is already running")
            return False

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            thread = threading.Thread(
                target=lambda: asyncio.run(self._execute_task(task)),
                daemon=True,
            )
            thread.start()
            return True

        self._schedule_task(uuid, loop, task)
        return True

    # ==================== 任务执行 ====================

    async def _execute_task(self, task: dict) -> None:
        """分步执行任务：先搜索，再逐个处理视频."""
        uuid = task["uuid"]
        if uuid in self._running_tasks:
            return

        self._running_tasks.add(uuid)
        self._task_device_map[uuid] = task["device_id"]
        self._update_task_status(uuid, TaskStatus.RUNNING)

        execution_config = task["execution"]
        videos_count = execution_config['videos_per_run']

        execution_record = {
            "uuid": str(uuid_lib.uuid4()),
            "task_uuid": uuid,
            "task_name": task["name"],
            "device_id": task["device_id"],
            "started_at": datetime.now().isoformat(),
            "finished_at": None,
            "status": ExecutionStatus.FAILED.value,
            "videos_processed": 0,
            "comments_sent": 0,
            "details": [],
            "error": None,
        }

        try:
            if self._task_executor is None:
                raise RuntimeError("Task executor not set")

            # 阶段1：搜索并进入第一个视频
            logger.info(f"[{task['name']}] 阶段1: 搜索视频")
            search_prompt = self._build_search_prompt(task)
            await asyncio.to_thread(
                self._task_executor,
                uuid,
                task["device_id"],
                search_prompt,
            )

            comment_mode = task["comment"].get("mode", "reply")

            # 阶段2：逐个处理视频
            for i in range(videos_count):
                # 检查是否被中止
                if uuid not in self._running_tasks:
                    logger.info(f"[{task['name']}] 任务被中止")
                    break

                # 阶段2a-1：获取视频信息（在视频播放页面）
                logger.info(f"[{task['name']}] 视频{i+1}: 获取视频信息")
                video_info_prompt = self._build_get_video_info_prompt(task, i)
                video_info_result = await asyncio.to_thread(
                    self._task_executor,
                    uuid,
                    task["device_id"],
                    video_info_prompt,
                )
                
                # 检查是否被中止
                if uuid not in self._running_tasks:
                    logger.info(f"[{task['name']}] 任务被中止")
                    break
                
                # 提取视频基本信息
                video_base_info = await self._extract_video_info(video_info_result)
                
                # 阶段2a-2：进入评论区找目标评论
                logger.info(f"[{task['name']}] 视频{i+1}: 查找目标评论")
                comment_prompt = self._build_find_comment_prompt(task, comment_mode)
                find_result = await asyncio.to_thread(
                    self._task_executor,
                    uuid,
                    task["device_id"],
                    comment_prompt,
                )
                
                # 检查是否被中止
                if uuid not in self._running_tasks:
                    logger.info(f"[{task['name']}] 任务被中止")
                    break
                
                execution_record["videos_processed"] = i + 1
                
                # 提取评论信息并合并
                comment_info = await self._extract_video_info(find_result)
                video_info = {**(video_base_info or {}), **(comment_info or {})}
                
                logger.info(f"[{task['name']}] 视频{i+1}: find_result={find_result[:200] if find_result else 'None'}...")
                
                # 检查是否已回复/已评论
                is_already_processed = find_result and ("已回复" in find_result or "已评论" in find_result)
                logger.info(f"[{task['name']}] 视频{i+1}: comment_mode={comment_mode}, is_already_processed={is_already_processed}")
                
                if is_already_processed:
                    logger.info(f"[{task['name']}] 视频{i+1}: 已处理过，跳过")
                    # 关闭评论区
                    await asyncio.to_thread(
                        self._task_executor,
                        uuid,
                        task["device_id"],
                        self._build_close_comment_prompt(),
                    )
                else:
                    # 阶段2b：生成回复内容
                    original_comment = video_info.get("original_comment", "")
                    
                    # 构建完整的视频上下文信息
                    video_context_parts = []
                    if video_info.get("video_author"):
                        video_context_parts.append(f"作者: {video_info['video_author']}")
                    if video_info.get("video_title"):
                        video_context_parts.append(f"标题: {video_info['video_title']}")
                    if video_info.get("video_content"):
                        video_context_parts.append(f"内容: {video_info['video_content']}")
                    video_context = ", ".join(video_context_parts) if video_context_parts else ""
                    
                    logger.info(f"[{task['name']}] 视频{i+1}: 生成回复内容, 上下文: {video_context}")
                    reply_content = await self._generate_reply(task, original_comment, video_context)
                    
                    if reply_content:
                        # 阶段2c：发送回复
                        logger.info(f"[{task['name']}] 视频{i+1}: 发送回复")
                        send_prompt = self._build_send_reply_prompt(reply_content)
                        await asyncio.to_thread(
                            self._task_executor,
                            uuid,
                            task["device_id"],
                            send_prompt,
                        )
                        
                        # 记录回复信息（使用本地生成的内容）
                        record_info = {
                            "video_author": video_info.get("video_author", "unknown"),
                            "video_title": video_info.get("video_title", ""),
                            "replied_user": video_info.get("replied_user", ""),
                            "original_comment": original_comment,
                            "reply_content": reply_content,
                        }
                        self._save_reply_record(uuid, record_info)
                        execution_record["comments_sent"] += 1
                        logger.info(f"[{task['name']}] 视频{i+1}: 回复成功 - {reply_content[:20]}...")
                    else:
                        # 生成失败，关闭评论区
                        logger.warning(f"[{task['name']}] 视频{i+1}: 生成回复失败")
                        await asyncio.to_thread(
                            self._task_executor,
                            uuid,
                            task["device_id"],
                            self._build_close_comment_prompt(),
                        )
                
                # 阶段3：上滑到下一个视频（最后一个视频不用上滑）
                if i < videos_count - 1:
                    logger.info(f"[{task['name']}] 上滑到下一个视频")
                    swipe_prompt = "上滑屏幕，进入下一个视频"
                    await asyncio.to_thread(
                        self._task_executor,
                        uuid,
                        task["device_id"],
                        swipe_prompt,
                    )

            # 阶段4：返回主页
            logger.info(f"[{task['name']}] 返回主页")
            exit_prompt = "点击左上角返回按钮，回到抖音主页，再回到桌面"
            await asyncio.to_thread(
                self._task_executor,
                uuid,
                task["device_id"],
                exit_prompt,
            )

            execution_record["status"] = ExecutionStatus.SUCCESS.value
            logger.info(f"Douyin comment task executed: {task['name']}, processed {execution_record['videos_processed']} videos, sent {execution_record['comments_sent']} comments")

        except asyncio.CancelledError:
            execution_record["status"] = ExecutionStatus.ABORTED.value
            execution_record["error"] = "cancelled"
            logger.info(f"Douyin comment task cancelled: {task['name']}")

        except Exception as e:
            execution_record["status"] = ExecutionStatus.FAILED.value
            execution_record["error"] = str(e)
            logger.error(f"Douyin comment task failed: {task['name']}, error: {e}")

        finally:
            execution_record["finished_at"] = datetime.now().isoformat()
            
            if uuid not in self._running_tasks:
                execution_record["status"] = ExecutionStatus.ABORTED.value
            
            self._save_execution_record(execution_record)

            self._running_tasks.discard(uuid)
            self._task_device_map.pop(uuid, None)
            self._running_task_handles.pop(uuid, None)

            current_task = self.get_task(uuid)
            if current_task and current_task["status"] == TaskStatus.RUNNING.value:
                self._update_task_status(uuid, TaskStatus.ENABLED)
                self._update_last_run(uuid)

    def _build_search_prompt(self, task: dict) -> str:
        """构建搜索阶段的指令."""
        keywords = task["search_keywords"]
        keyword = random.choice(keywords) if keywords else "美食"
        video_filter = task["video_filter"]
        
        # 筛选相关指令
        filter_parts = []
        publish_time = video_filter.get('publish_time', 'default')
        if publish_time == 'day':
            filter_parts.append('选择"一天内"')
        elif publish_time == 'week':
            filter_parts.append('选择"一周内"')
        elif publish_time == 'half_year':
            filter_parts.append('选择"半年内"')
        
        sort_by = video_filter.get('sort_by', 'default')
        if sort_by == 'latest':
            filter_parts.append('选择"最新发布"')
        elif sort_by == 'most_liked':
            filter_parts.append('选择"最多点赞"')
        
        filter_instruction = '然后点击筛选，' + '，'.join(filter_parts) + '。' if filter_parts else ""
        
        # 随机滚动次数，增加随机性避免重复
        scroll_times = random.randint(2, 8)
        
        return f"""打开抖音，搜索"{keyword}"，切换到视频标签。{filter_instruction}
向下滑动{scroll_times}次，然后随机点击一个点赞量 {video_filter['min_likes']}-{video_filter['max_likes']} 的视频进入。"""

    def _build_single_video_prompt(self, task: dict, video_index: int) -> str:
        """构建单个视频处理的指令."""
        interaction = task["interaction"]
        comment_config = task["comment"]
        comment_mode = comment_config.get("mode", "reply")
        target_regions = comment_config.get("target_regions", [])
        
        # 互动指令
        actions = []
        if interaction.get('like_video'):
            actions.append("点赞")
        if interaction.get('favorite_video'):
            actions.append("收藏")
        interaction_text = "、".join(actions) if actions else ""
        
        return f"""当前在视频播放页面（第{video_index + 1}个视频）：
1. 看视频左下角，记住视频作者昵称和标题
2. 简要描述视频内容（在讲什么）
3. {interaction_text if interaction_text else "不需要点赞收藏"}

完成后报告（格式必须严格遵守）：
---
作者：[视频作者昵称]
标题：[视频标题前20字]
内容：[视频在讲什么，20字以内]
---

【禁止】不要点击评论！只看视频信息然后报告！"""

    def _build_get_video_info_prompt(self, task: dict, video_index: int) -> str:
        """构建获取视频信息的指令."""
        interaction = task["interaction"]
        
        actions = []
        if interaction.get('like_video'):
            actions.append("点赞")
        if interaction.get('favorite_video'):
            actions.append("收藏")
        interaction_text = "、".join(actions) if actions else ""
        
        return f"""当前在视频播放页面（第{video_index + 1}个视频）：
1. 看视频左下角，记住视频作者昵称和标题
2. 简要描述视频内容（在讲什么）
3. {interaction_text if interaction_text else "不需要点赞收藏"}

完成后报告（格式必须严格遵守）：
---
作者：[视频作者昵称]
标题：[视频标题前20字]
内容：[视频在讲什么，20字以内]
---

【禁止】不要点击评论！只看视频信息然后报告！"""

    def _build_find_comment_prompt(self, task: dict, comment_mode: str) -> str:
        """构建查找评论的指令."""
        comment_config = task["comment"]
        target_regions = comment_config.get("target_regions", [])
        
        if comment_mode == "direct":
            return """点击评论图标进入评论区：
1. 最多滚动3次，看评论列表里有没有带「我」标签的评论（说明已评论过）
2. 有「我」标签 → 报告"已评论"然后【立即停止】
3. 没有「我」标签 → 点击底部输入框让键盘弹出，然后【立即停止】

完成后报告：
---
状态：[已评论/待评论]
---

【禁止】不要滚动超过3次！不要输入任何文字！"""
        else:
            if target_regions:
                regions_str = '、'.join(target_regions)
                find_instruction = f"找一条IP属地为{regions_str}的评论"
            else:
                find_instruction = "随便选一条评论"
            
            return f"""点击评论图标进入评论区，然后：

1. {find_instruction}
2. 如果有"展开N条回复"就点击展开，没有就跳过
3. 快速扫一眼当前屏幕的回复，看有没有「我」标签
4. 结果：
   - 有「我」→ 报告"已回复"，停止
   - 没有「我」或没看到 → 点击"回复"，输入框弹出后停止

报告格式：
---
状态：[已回复/待回复]
目标用户：[评论者昵称]
原评论：[评论内容]
---

【禁止】不要滚动查看更多！扫一眼没看到「我」就直接点回复！"""

    def _build_send_reply_prompt(self, reply_content: str) -> str:
        """构建发送回复的指令."""
        return f"""现在输入框已经激活，请：
1. 输入以下内容（一字不差）：{reply_content}
2. 点击发送按钮
3. 等待发送成功
4. 关闭评论区

完成后报告"回复已发送"。"""

    def _build_close_comment_prompt(self) -> str:
        """构建关闭评论区的指令."""
        return "关闭评论区，回到视频播放页面。"

    async def _extract_video_info(self, result: str) -> dict | None:
        """使用决策模型从 GUI 模型返回结果中提取视频和评论信息."""
        if not result:
            return None
        
        logger.debug(f"Extracting video info from result: {result[:500]}...")
        
        # 构建提取指令
        extract_prompt = f"""从以下文本中提取信息，以JSON格式返回：
{{
  "video_author": "视频作者昵称",
  "video_title": "视频标题",
  "video_content": "视频内容描述",
  "replied_user": "被回复的用户昵称（如果是回复评论模式）",
  "original_comment": "对方的原评论内容（如果是回复评论模式）"
}}

文本：
{result}

只返回JSON，不要其他内容。如果某个字段找不到，填空字符串。"""

        try:
            from AutoGLM_GUI.config_manager import config_manager
            from openai import OpenAI
            import json
            
            config = config_manager.get_effective_config()
            
            # 使用决策模型配置
            decision_base_url = config.decision_base_url
            decision_api_key = config.decision_api_key
            decision_model = config.decision_model_name
            
            if not decision_base_url or not decision_model:
                logger.warning("Decision model not configured, using regex fallback")
                return self._regex_extract_video_info(result)
            
            logger.debug(f"Calling decision model to extract video info: {decision_model}")
            
            client = OpenAI(
                base_url=decision_base_url,
                api_key=decision_api_key or "EMPTY",
            )
            
            response = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model=decision_model,
                    messages=[{"role": "user", "content": extract_prompt}],
                    temperature=0.1,
                )
            )
            
            if not response.choices:
                logger.warning("No choices in decision model response")
                return self._regex_extract_video_info(result)
            
            content = response.choices[0].message.content
            if not content:
                logger.warning("Empty content from decision model")
                return self._regex_extract_video_info(result)
            
            # 提取 JSON
            json_match = re.search(r'\{[^{}]*\}', content, re.DOTALL)
            if json_match:
                try:
                    info = json.loads(json_match.group(0))
                    # 过滤空值
                    info = {k: v for k, v in info.items() if v}
                    logger.info(f"Extracted video info using decision model: {info}")
                    return info if info else None
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse JSON: {e}")
                    return self._regex_extract_video_info(result)
            else:
                logger.warning(f"No JSON found in response: {content}")
                return self._regex_extract_video_info(result)
                
        except Exception as e:
            logger.error(f"Failed to extract video info using decision model: {e}")
            return self._regex_extract_video_info(result)
    
    def _regex_extract_video_info(self, result: str) -> dict | None:
        """使用正则表达式提取视频信息（后备方案）."""
        info = {}
        
        # 提取视频作者
        author_patterns = [
            r'作者[：:]\s*([^\s标\n]+)',
            r'视频作者[：:]\s*([^\n]+)',
            r'@([^\s""\n]+)',
        ]
        for pattern in author_patterns:
            match = re.search(pattern, result)
            if match:
                info["video_author"] = match.group(1).strip().strip('[]「」""')
                if info["video_author"] and len(info["video_author"]) > 1:
                    break
        
        # 提取视频标题
        title_patterns = [
            r'标题[：:]\s*([^\n]+)',
            r'视频标题[：:]\s*([^\n]+)',
        ]
        for pattern in title_patterns:
            match = re.search(pattern, result)
            if match:
                info["video_title"] = match.group(1).strip().strip('[]「」""')[:30]
                break
        
        # 提取视频内容描述
        content_patterns = [
            r'视频内容[：:]\s*([^\n]+)',
            r'内容[：:]\s*([^\n]+)',
        ]
        for pattern in content_patterns:
            match = re.search(pattern, result)
            if match:
                info["video_content"] = match.group(1).strip().strip('[]「」""')[:50]
                break
        
        # 提取目标用户
        user_patterns = [
            r'目标用户[：:]\s*([^\n]+)',
            r'被回复用户[：:]\s*([^\n]+)',
            r'回复\s*@?([^\s:：\n]+)',
        ]
        for pattern in user_patterns:
            match = re.search(pattern, result)
            if match:
                info["replied_user"] = match.group(1).strip().strip('[]「」""@')
                break
        
        # 提取原评论
        comment_patterns = [
            r'原评论[：:]\s*([^\n]+)',
            r'评论内容[：:]\s*([^\n]+)',
            r'对方评论[：:]\s*([^\n]+)',
            r'评论[：:]\s*[「""]([^「""]+)[」""]',
        ]
        for pattern in comment_patterns:
            match = re.search(pattern, result)
            if match:
                info["original_comment"] = match.group(1).strip().strip('[]「」""')
                break
        
        logger.info(f"Extracted video info using regex: {info}")
        return info if info else None

    async def _extract_reply_info(self, result: str, mode: str) -> dict | None:
        """使用 AI 从混乱的回复中提取结构化信息."""
        if not result:
            return None
        
        # 构建提取指令
        if mode == "direct":
            extract_prompt = f"""从以下文本中提取信息，以JSON格式返回：
{{
  "video_author": "视频作者昵称",
  "video_title": "视频标题（前15字）",
  "reply_content": "我发的评论内容"
}}

文本：
{result}

只返回JSON，不要其他内容。"""
        else:
            extract_prompt = f"""从以下文本中提取信息，以JSON格式返回：
{{
  "video_author": "视频作者昵称",
  "video_title": "视频标题（前15字）",
  "replied_user": "被回复的用户昵称",
  "original_comment": "对方的原评论",
  "reply_content": "我的回复内容"
}}

文本：
{result}

只返回JSON，不要其他内容。如果有多条回复，返回数组。"""
        
        try:
            # 调用决策模型提取结构化信息
            from AutoGLM_GUI.config_manager import config_manager
            from openai import OpenAI
            import json
            
            config = config_manager.get_effective_config()
            
            # 使用决策模型配置
            decision_base_url = config.decision_base_url
            decision_api_key = config.decision_api_key
            decision_model = config.decision_model_name
            
            if not decision_base_url or not decision_model:
                logger.warning("Decision model not configured, using regex fallback")
                return self._regex_extract(result, mode)
            
            logger.info(f"Calling decision model: {decision_model} at {decision_base_url}")
            
            # 创建 OpenAI 客户端
            client = OpenAI(
                base_url=decision_base_url,
                api_key=decision_api_key or "EMPTY",
            )
            
            # 调用决策模型
            response = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model=decision_model,
                    messages=[
                        {"role": "user", "content": extract_prompt}
                    ],
                    temperature=0.1,
                )
            )
            
            logger.info(f"Decision model raw response: {response}")
            
            # 解析响应
            if not response.choices:
                logger.warning("No choices in decision model response")
                return self._regex_extract(result, mode)
            
            content = response.choices[0].message.content
            if not content:
                logger.warning(f"Empty content from decision model")
                return self._regex_extract(result, mode)
            
            logger.info(f"Decision model content: {content}")
            
            # 提取 JSON - 支持嵌套的 JSON
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', content)
            if json_match:
                try:
                    info = json.loads(json_match.group(0))
                    logger.info(f"Extracted info using decision model: {info}")
                    return info
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse JSON: {e}, content: {content}")
                    return self._regex_extract(result, mode)
            else:
                logger.warning(f"No JSON found in decision model response: {content}")
                return self._regex_extract(result, mode)
            
        except Exception as e:
            logger.error(f"Failed to extract reply info using decision model: {e}")
            return self._regex_extract(result, mode)
    
    def _regex_extract(self, result: str, mode: str) -> dict | None:
        """使用正则表达式提取信息（后备方案）."""
        info = {}
        
        # 提取视频作者
        author_patterns = [
            r'作者[：:]\s*([^\s标\n]+)',
            r'视频作者[：:]\s*([^\n]+)',
            r'@([^\s""\n]+)',
        ]
        for pattern in author_patterns:
            match = re.search(pattern, result)
            if match:
                info["video_author"] = match.group(1).strip().strip('[]「」""')
                if info["video_author"] and len(info["video_author"]) > 1:
                    break
        
        # 提取视频标题
        title_patterns = [
            r'标题[：:]\s*([^\n]+)',
            r'视频标题[：:]\s*([^\n]+)',
        ]
        for pattern in title_patterns:
            match = re.search(pattern, result)
            if match:
                info["video_title"] = match.group(1).strip().strip('[]「」""')[:30]
                break
        
        if mode == "direct":
            # 提取评论内容
            comment_patterns = [
                r'评论[：:]\s*[「""]([^「""]+)[」""]',
                r'发送了[：:]*\s*[「""]([^「""]+)[」""]',
            ]
            for pattern in comment_patterns:
                match = re.search(pattern, result)
                if match:
                    info["reply_content"] = match.group(1).strip()
                    break
        else:
            # 提取回复信息
            reply_pattern = r'回复[：:]\s*([^|]+)\|([^|]+)\|([^\n]+)'
            match = re.search(reply_pattern, result)
            if match:
                info["replied_user"] = match.group(1).strip().strip('[]「」""')
                info["original_comment"] = match.group(2).strip().strip('[]「」""')
                info["reply_content"] = match.group(3).strip().strip('[]「」""')
            else:
                # 尝试自然语言提取
                user_patterns = [
                    r'用户[：:]*\s*([^\s的]+)的评论',
                    r'回复了?\s*([^\s的]+)\s*的评论',
                ]
                for pattern in user_patterns:
                    match = re.search(pattern, result)
                    if match:
                        info["replied_user"] = match.group(1).strip().strip('[]「」""')
                        break
                
                original_patterns = [
                    r'评论[：:]*\s*[「""]([^「""]+)[」""]',
                ]
                for pattern in original_patterns:
                    match = re.search(pattern, result)
                    if match:
                        info["original_comment"] = match.group(1).strip()
                        break
                
                reply_patterns = [
                    r'回复了?[：:]*\s*[「""]([^「""]+)[」""]',
                ]
                for pattern in reply_patterns:
                    match = re.search(pattern, result)
                    if match:
                        info["reply_content"] = match.group(1).strip()
                        break
        
        return info if info else None

    async def _generate_reply(self, task: dict, original_comment: str, video_info: str = "") -> str | None:
        """使用回复模型生成评论回复内容.
        
        Args:
            task: 任务配置
            original_comment: 原评论内容
            video_info: 视频信息（可选，用于上下文）
            
        Returns:
            生成的回复内容，失败返回 None
        """
        try:
            from AutoGLM_GUI.config_manager import config_manager
            from openai import OpenAI
            
            config = config_manager.get_effective_config()
            
            # 使用回复模型配置
            reply_base_url = config.reply_base_url
            reply_api_key = config.reply_api_key
            reply_model = config.reply_model_name
            
            if not reply_base_url or not reply_model:
                logger.info("Reply model not configured, using template fallback")
                return self._get_template_reply(task)
            
            # 获取回复风格配置
            content_config = task.get("content", DEFAULT_CONTENT)
            style = content_config.get("style", "koc")
            
            # 构建人设 prompt
            style_prompts = {
                "koc": "你是一个热情友好的普通用户，喜欢分享生活，语气自然亲切，偶尔用emoji",
                "professional": "你是一个专业人士，回复简洁专业，有见地",
                "funny": "你是一个幽默风趣的人，喜欢开玩笑，但不过分",
                "curious": "你是一个好奇宝宝，喜欢提问和互动",
            }
            persona = style_prompts.get(style, style_prompts["koc"])
            
            prompt = f"""{persona}

【重要】你是一个普通抖音用户，不是视频作者！你在别人的视频下回复其他用户的评论。

现在有人在视频下评论了："{original_comment}"
{f"视频相关信息：{video_info}" if video_info else ""}

请生成一条自然的回复，要求：
1. 简短有趣，10-30字为宜
2. 符合抖音评论区的风格
3. 可以适当用1-2个emoji
4. 不要太正式，要像真人聊天
5. 不要直接推销或打广告
6. 可以表达认同、分享经验、或友好互动

只返回回复内容，不要其他解释。"""

            logger.info(f"Calling reply model: {reply_model} at {reply_base_url}")
            
            # 创建 OpenAI 客户端
            client = OpenAI(
                base_url=reply_base_url,
                api_key=reply_api_key or "EMPTY",
            )
            
            # 调用回复模型
            response = await asyncio.to_thread(
                lambda: client.chat.completions.create(
                    model=reply_model,
                    messages=[
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.8,  # 稍高的温度增加多样性
                    max_tokens=100,
                )
            )
            
            if not response.choices:
                logger.warning("No choices in reply model response")
                return self._get_template_reply(task)
            
            content = response.choices[0].message.content
            if not content:
                logger.warning("Empty content from reply model")
                return self._get_template_reply(task)
            
            # 清理回复内容
            reply = content.strip().strip('"\'')
            logger.info(f"Generated reply: {reply}")
            return reply
            
        except Exception as e:
            logger.error(f"Failed to generate reply using reply model: {e}")
            return self._get_template_reply(task)
    
    def _get_template_reply(self, task: dict) -> str:
        """从模板中随机选择一条回复（后备方案）."""
        content_config = task.get("content", DEFAULT_CONTENT)
        templates = content_config.get("templates", DEFAULT_CONTENT["templates"])
        return random.choice(templates) if templates else "说得对👍"
    
    def _save_reply_record(self, task_uuid: str, info: dict) -> None:
        """保存提取的回复记录到数据库."""
        video_author = info.get("video_author", "unknown")
        video_title = info.get("video_title", "")
        reply_content = info.get("reply_content", "")
        
        if info.get("replied_user"):
            # 回复评论模式
            reply_history_db.add_reply(
                task_uuid,
                video_author,
                info["replied_user"],
                "reply",
                video_title,
                info.get("original_comment", ""),
                reply_content,
            )
            logger.info(f"Recorded reply to {info['replied_user']} on {video_author}'s video")
        elif reply_content:
            # 直接评论模式
            reply_history_db.add_reply(
                task_uuid,
                video_author,
                "_video_",
                "direct",
                video_title,
                "",
                reply_content,
            )
            logger.info(f"Recorded direct comment on {video_author}'s video")


# 单例实例
douyin_comment_task_manager = DouyinCommentTaskManager()
