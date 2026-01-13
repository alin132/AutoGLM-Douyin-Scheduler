"""抖音评论引流任务管理模块.

Features:
- 任务 CRUD
- 定时调度
- 执行历史记录
- 模拟真实用户行为
"""

import json
import random
import uuid as uuid_lib
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore[import-untyped]
from apscheduler.triggers.cron import CronTrigger  # type: ignore[import-untyped]

from AutoGLM_GUI.logger import logger  # type: ignore[attr-defined]


class TaskStatus(str, Enum):
    """任务状态."""
    ENABLED = "enabled"
    DISABLED = "disabled"
    RUNNING = "running"


class ExecutionStatus(str, Enum):
    """执行状态."""
    SUCCESS = "success"
    PARTIAL = "partial"  # 部分成功
    FAILED = "failed"
    ABORTED = "aborted"


# 默认配置
DEFAULT_VIDEO_FILTER = {
    "min_likes": 1000,
    "max_likes": 50000,
    "max_days_ago": 30,
    "sort_by": "latest",  # latest 或 default
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


class DouyinCommentTaskManager:
    """抖音评论引流任务管理器（单例模式）."""

    _instance: "DouyinCommentTaskManager | None" = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, "_initialized"):
            return
        self._initialized = True

        self._config_dir = Path.home() / ".config" / "autoglm"
        self._tasks_path = self._config_dir / "douyin_comment_tasks.json"
        self._history_path = self._config_dir / "douyin_comment_history.json"

        self._file_cache: list[dict] | None = None
        self._file_mtime: float | None = None

        self._scheduler: AsyncIOScheduler | None = None
        self._task_executor: Callable | None = None
        self._running_tasks: set[str] = set()
        # 记录任务 uuid -> device_id 的映射，用于 abort 时找到对应设备
        self._task_device_map: dict[str, str] = {}

        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        """确保配置目录存在."""
        self._config_dir.mkdir(parents=True, exist_ok=True)

    def set_task_executor(self, executor: Callable) -> None:
        """设置任务执行器."""
        self._task_executor = executor

    def start_scheduler(self) -> None:
        """启动调度器."""
        if self._scheduler is not None and self._scheduler.running:
            return

        self._scheduler = AsyncIOScheduler()
        scheduler = self._scheduler
        scheduler.start()  # type: ignore[union-attr]
        logger.info("Douyin comment task scheduler started")

        # 加载并注册所有启用的任务
        tasks = self._load_tasks()
        for task in tasks:
            if task.get("status") == TaskStatus.ENABLED.value:
                self._register_job(task)

    def stop_scheduler(self) -> None:
        """停止调度器."""
        if self._scheduler is not None:
            self._scheduler.shutdown(wait=False)
            self._scheduler = None
            logger.info("Douyin comment task scheduler stopped")

    # ==================== CRUD ====================

    def list_tasks(self) -> list[dict]:
        """获取所有任务."""
        return self._load_tasks()

    def get_task(self, uuid: str) -> dict | None:
        """根据 UUID 获取任务."""
        tasks = self._load_tasks()
        return next((t for t in tasks if t["uuid"] == uuid), None)

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
        enabled: bool = True,
    ) -> dict:
        """创建任务."""
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
                    if value is not None and key in task:
                        if isinstance(task[key], dict) and isinstance(value, dict):
                            task[key] = {**task[key], **value}
                        else:
                            task[key] = value

                task["updated_at"] = datetime.now().isoformat()
                self._save_tasks(tasks)

                # 重新注册调度任务
                if task["status"] == TaskStatus.ENABLED.value and task.get("cron_expression"):
                    self._unregister_job(uuid)
                    self._register_job(task)
                    task["next_run"] = self._get_next_run_time(uuid)

                logger.info(f"Updated douyin comment task: uuid={uuid}")
                return task

        return None

    def delete_task(self, uuid: str) -> bool:
        """删除任务."""
        tasks = self._load_tasks()
        original_len = len(tasks)
        tasks = [t for t in tasks if t["uuid"] != uuid]

        if len(tasks) < original_len:
            self._save_tasks(tasks)
            self._unregister_job(uuid)
            logger.info(f"Deleted douyin comment task: uuid={uuid}")
            return True
        return False

    def enable_task(self, uuid: str) -> dict | None:
        """启用任务."""
        tasks = self._load_tasks()
        for task in tasks:
            if task["uuid"] == uuid:
                if task["status"] == TaskStatus.RUNNING.value:
                    return task

                task["status"] = TaskStatus.ENABLED.value
                task["updated_at"] = datetime.now().isoformat()
                self._save_tasks(tasks)

                if task.get("cron_expression"):
                    self._register_job(task)
                    task["next_run"] = self._get_next_run_time(uuid)

                logger.info(f"Enabled douyin comment task: uuid={uuid}")
                return task
        return None

    def disable_task(self, uuid: str) -> dict | None:
        """禁用任务."""
        tasks = self._load_tasks()
        for task in tasks:
            if task["uuid"] == uuid:
                if task["status"] == TaskStatus.RUNNING.value:
                    return task

                task["status"] = TaskStatus.DISABLED.value
                task["next_run"] = None
                task["updated_at"] = datetime.now().isoformat()
                self._save_tasks(tasks)
                self._unregister_job(uuid)

                logger.info(f"Disabled douyin comment task: uuid={uuid}")
                return task
        return None

    # ==================== 执行 ====================

    def is_task_running(self, uuid: str) -> bool:
        """检查任务是否正在运行."""
        return uuid in self._running_tasks

    def abort_task(self, uuid: str) -> bool:
        """中止正在运行的任务."""
        if uuid not in self._running_tasks:
            return False

        # 获取设备 ID，用于停止底层 agent
        device_id = self._task_device_map.get(uuid)

        # 从运行集合中移除，标记为需要中止
        self._running_tasks.discard(uuid)
        self._task_device_map.pop(uuid, None)

        # 停止底层 PhoneAgent 并释放设备锁
        if device_id:
            try:
                from AutoGLM_GUI.phone_agent_manager import PhoneAgentManager
                manager = PhoneAgentManager.get_instance()
                manager.abort_streaming_chat(device_id)
                # 同时调用 agent 的 abort 方法
                agent = manager.get_agent(device_id)
                if agent:
                    agent.abort()
                # 强制释放设备锁
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

        # 在后台执行
        import asyncio
        import threading

        def run_in_thread():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(self._execute_task(task))
            finally:
                loop.close()

        thread = threading.Thread(target=run_in_thread, daemon=True)
        thread.start()
        return True

    async def _execute_task(self, task: dict) -> None:
        """执行任务."""
        uuid = task["uuid"]
        if uuid in self._running_tasks:
            return

        self._running_tasks.add(uuid)
        self._task_device_map[uuid] = task["device_id"]  # 记录映射，用于 abort
        self._update_task_status(uuid, TaskStatus.RUNNING)

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

            # 构建执行指令
            prompt = self._build_execution_prompt(task)

            # 调用执行器
            import asyncio
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                self._task_executor,
                uuid,
                task["device_id"],
                prompt,
            )

            execution_record["status"] = ExecutionStatus.SUCCESS.value
            execution_record["result"] = result
            
            # 尝试从结果中解析 JSON 格式的执行详情
            self._parse_execution_result(result, execution_record)
            
            logger.info(f"Douyin comment task executed: {task['name']}")

        except Exception as e:
            execution_record["status"] = ExecutionStatus.FAILED.value
            execution_record["error"] = str(e)
            logger.error(f"Douyin comment task failed: {task['name']}, error: {e}")

        finally:
            execution_record["finished_at"] = datetime.now().isoformat()
            
            # 检查是否被中止
            if uuid not in self._running_tasks:
                execution_record["status"] = ExecutionStatus.ABORTED.value
            
            self._save_execution_record(execution_record)

            self._running_tasks.discard(uuid)
            self._task_device_map.pop(uuid, None)  # 清理映射

            current_task = self.get_task(uuid)
            if current_task and current_task["status"] == TaskStatus.RUNNING.value:
                self._update_task_status(uuid, TaskStatus.ENABLED)
                self._update_last_run(uuid)

    def _parse_execution_result(self, result: str | None, record: dict) -> None:
        """从执行结果中解析详情."""
        if not result:
            return
        
        import re
        
        # 方案1：尝试找到 JSON 块
        json_match = re.search(r'\{[\s\S]*"videos_count"[\s\S]*?\}', result)
        if json_match:
            try:
                data = json.loads(json_match.group(0))
                record["videos_processed"] = data.get("videos_count", 0)
                record["comments_sent"] = data.get("comments_count", 0)
                record["details"] = data.get("details", [])
                logger.info(f"Parsed JSON result: {record['videos_processed']} videos, {record['comments_sent']} comments")
                return
            except json.JSONDecodeError:
                pass
        
        # 方案2：从文本中提取数字（备用）
        # 匹配 "X个视频" 或 "X条评论"
        video_match = re.search(r'(\d+)\s*个视频', result)
        comment_match = re.search(r'(\d+)\s*条评论', result)
        
        if video_match:
            record["videos_processed"] = int(video_match.group(1))
        if comment_match:
            record["comments_sent"] = int(comment_match.group(1))
        
        # 尝试提取评论详情（从文本格式）
        # 匹配类似 "视频名 - 回复评论"xxx"" 的模式
        details = []
        detail_pattern = re.findall(r'[第\d]+个视频[：:]\s*(.+?)\s*[-–]\s*(?:已)?回复评论["\"](.+?)["\"]', result)
        for video, reply in detail_pattern:
            details.append({
                "video": video.strip(),
                "original_comment": "",
                "my_reply": reply.strip()
            })
        
        if details:
            record["details"] = details
            if not record["comments_sent"]:
                record["comments_sent"] = len(details)
        
        logger.info(f"Parsed text result: {record['videos_processed']} videos, {record['comments_sent']} comments")

    def _build_execution_prompt(self, task: dict) -> str:
        """构建执行指令."""
        keywords = task["search_keywords"]
        keyword = random.choice(keywords) if keywords else "美食"

        video_filter = task["video_filter"]
        interaction = task["interaction"]
        comment_config = task["comment"]
        content_config = task["content"]
        execution_config = task["execution"]

        # 构建语料参考
        templates_text = "\n".join(f"- {t}" for t in content_config.get("templates", []))
        
        # 排序相关指令
        sort_instruction = '然后点击筛选，选择"最新发布"。' if video_filter.get('sort_by') == 'latest' else ""
        like_action = "点赞、" if interaction['like_video'] else ""
        fav_action = "收藏、" if interaction['favorite_video'] else ""
        interaction_text = f"观看后{like_action}{fav_action}".rstrip("、") if (like_action or fav_action) else "观看视频"

        # 根据评论模式构建不同指令
        comment_mode = comment_config.get("mode", "reply")
        if comment_mode == "direct":
            # 直接评论模式：结合视频内容发评论
            comment_instruction = "进评论区，结合视频内容发一条评论"
        else:
            # 回复评论模式
            comment_instruction = f"""进评论区：
   - 评论少于5条：进评论区，结合视频内容直接发一条评论
   - 评论多：回复 {comment_config['min_replies_per_video']}-{comment_config['max_replies_per_video']} 条{"热门" if comment_config['target_hot_comments'] else ""}评论"""

        videos_count = execution_config['videos_per_run']
        prompt = f"""打开抖音，搜索"{keyword}"，切换到视频标签。{sort_instruction}

【重要】你必须依次处理 {videos_count} 个不同的视频，每处理完一个视频后返回列表继续下一个，直到完成全部 {videos_count} 个视频才能结束任务。

每个视频的处理流程：
1. 从列表中选择一个点赞量 {video_filter['min_likes']}-{video_filter['max_likes']} 的视频并点击进入
2. {interaction_text}
3. {comment_instruction}
4. 返回视频列表
5. 等待 {execution_config['video_interval_min']}-{execution_config['video_interval_max']} 秒
6. 滑动找下一个视频，重复以上步骤

评论要求：
- 必须结合视频具体内容，不要泛泛而谈
- 口语化、接地气，像真人聊天
- 可以带疑问或互动，如"这个火候怎么掌握啊？"
- 每条评论风格要不同，避免重复
- 禁止推销、禁止"看起来很美味"这种万能句
- 示例风格：{templates_text if templates_text else '"这火候掌握得真好"、"学到了，原来要先焯水"、"博主用的什么锅啊"'}

【再次强调】必须处理完 {videos_count} 个视频才能完成任务，处理 1 个视频后不要结束！
"""
        return prompt

    # ==================== 历史记录 ====================

    def get_history(self, task_uuid: str | None = None, limit: int = 50) -> list[dict]:
        """获取执行历史."""
        history = self._load_history()

        if task_uuid:
            history = [h for h in history if h.get("task_uuid") == task_uuid]

        history.sort(key=lambda x: x.get("started_at", ""), reverse=True)
        return history[:limit]

    # ==================== 内部方法 ====================

    def _register_job(self, task: dict) -> None:
        """注册调度任务."""
        if self._scheduler is None:
            return

        uuid = task["uuid"]
        cron = task.get("cron_expression")
        if not cron:
            return

        self._unregister_job(uuid)

        try:
            trigger = CronTrigger.from_crontab(cron)
            self._scheduler.add_job(
                self._job_wrapper,
                trigger=trigger,
                id=uuid,
                args=[task],
                replace_existing=True,
            )
            logger.debug(f"Registered douyin comment job: {uuid}")
        except Exception as e:
            logger.error(f"Failed to register job {uuid}: {e}")

    def _unregister_job(self, uuid: str) -> None:
        """取消注册调度任务."""
        if self._scheduler is None:
            return
        try:
            self._scheduler.remove_job(uuid)
        except Exception:
            pass

    def _job_wrapper(self, task: dict) -> None:
        """调度任务包装器."""
        import asyncio
        # 重新获取最新的任务配置
        current_task = self.get_task(task["uuid"])
        if current_task and current_task["status"] == TaskStatus.ENABLED.value:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(self._execute_task(current_task))
            finally:
                loop.close()

    def _get_next_run_time(self, uuid: str) -> str | None:
        """获取下次执行时间."""
        if self._scheduler is None:
            return None
        job = self._scheduler.get_job(uuid)
        if job and job.next_run_time:
            return job.next_run_time.isoformat()
        return None

    def _update_task_status(self, uuid: str, status: TaskStatus) -> None:
        """更新任务状态."""
        tasks = self._load_tasks()
        for task in tasks:
            if task["uuid"] == uuid:
                task["status"] = status.value
                break
        self._save_tasks(tasks)

    def _update_last_run(self, uuid: str) -> None:
        """更新最后执行时间."""
        tasks = self._load_tasks()
        for task in tasks:
            if task["uuid"] == uuid:
                task["last_run"] = datetime.now().isoformat()
                task["next_run"] = self._get_next_run_time(uuid)
                break
        self._save_tasks(tasks)

    def _validate_cron(self, cron_expression: str) -> None:
        """验证 cron 表达式."""
        try:
            CronTrigger.from_crontab(cron_expression)
        except Exception as e:
            raise ValueError(f"Invalid cron expression: {cron_expression}. {e}")

    def _load_tasks(self) -> list[dict]:
        """加载任务列表."""
        if not self._tasks_path.exists():
            return []

        current_mtime = self._tasks_path.stat().st_mtime
        if self._file_mtime == current_mtime and self._file_cache is not None:
            return self._file_cache.copy()

        try:
            with open(self._tasks_path, encoding="utf-8") as f:
                data = json.load(f)
            tasks = data.get("tasks", [])
            self._file_cache = tasks
            self._file_mtime = current_mtime
            return tasks.copy()
        except Exception as e:
            logger.warning(f"Failed to load douyin comment tasks: {e}")
            return []

    def _save_tasks(self, tasks: list[dict]) -> bool:
        """保存任务列表."""
        temp_path = self._tasks_path.with_suffix(".tmp")
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump({"tasks": tasks}, f, indent=2, ensure_ascii=False)
            temp_path.replace(self._tasks_path)
            self._file_cache = tasks.copy()
            self._file_mtime = self._tasks_path.stat().st_mtime
            return True
        except Exception as e:
            logger.error(f"Failed to save douyin comment tasks: {e}")
            if temp_path.exists():
                temp_path.unlink()
            return False

    def _load_history(self) -> list[dict]:
        """加载执行历史."""
        if not self._history_path.exists():
            return []
        try:
            with open(self._history_path, encoding="utf-8") as f:
                data = json.load(f)
            return data.get("history", [])
        except Exception:
            return []

    def _save_execution_record(self, record: dict) -> None:
        """保存执行记录."""
        history = self._load_history()
        history.append(record)

        # 只保留最近 500 条
        if len(history) > 500:
            history = history[-500:]

        try:
            with open(self._history_path, "w", encoding="utf-8") as f:
                json.dump({"history": history}, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Failed to save execution history: {e}")


# 单例实例
douyin_comment_task_manager = DouyinCommentTaskManager()
