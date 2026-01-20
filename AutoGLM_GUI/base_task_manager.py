"""任务管理器基类.

提供任务管理器的通用功能：
- JSON 文件持久化（带缓存）
- APScheduler 调度器集成
- Cron 表达式验证
- 执行历史记录
"""

import asyncio
import copy
import json
import threading
from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from AutoGLM_GUI.logger import logger


class TaskStatus(str, Enum):
    """任务状态."""
    ENABLED = "enabled"
    DISABLED = "disabled"
    RUNNING = "running"


class ExecutionStatus(str, Enum):
    """执行状态."""
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    ABORTED = "aborted"


class BaseTaskManager(ABC):
    """任务管理器抽象基类.
    
    子类需要实现：
    - _build_execution_prompt(): 构建执行指令
    - _execute_task(): 执行任务的具体逻辑
    - _create_default_task(): 创建默认任务结构
    """

    def __init__(self, tasks_path: Path, history_path: Path, manager_name: str = "task"):
        """初始化任务管理器.
        
        Args:
            tasks_path: 任务配置文件路径
            history_path: 执行历史文件路径
            manager_name: 管理器名称（用于日志）
        """
        self._tasks_path = tasks_path
        self._history_path = history_path
        self._manager_name = manager_name
        
        # 文件缓存
        self._file_cache: list[dict] | None = None
        self._file_mtime: float | None = None
        self._io_lock = threading.RLock()
        
        # 调度器
        self._scheduler: AsyncIOScheduler | None = None
        self._task_executor: Callable | None = None
        self._running_tasks: set[str] = set()
        self._running_task_handles: dict[str, asyncio.Task] = {}
        
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        """确保配置目录存在."""
        self._tasks_path.parent.mkdir(parents=True, exist_ok=True)
        self._history_path.parent.mkdir(parents=True, exist_ok=True)

    def set_task_executor(self, executor: Callable) -> None:
        """设置任务执行器."""
        self._task_executor = executor

    # ==================== 调度器管理 ====================

    def start_scheduler(self) -> None:
        """启动调度器."""
        if self._scheduler is not None and self._scheduler.running:
            return

        self._scheduler = AsyncIOScheduler()
        self._scheduler.start()
        logger.info(f"{self._manager_name} scheduler started")

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
            logger.info(f"{self._manager_name} scheduler stopped")

    # ==================== CRUD 操作 ====================

    def list_tasks(self) -> list[dict]:
        """获取所有任务."""
        return self._load_tasks()

    def get_task(self, uuid: str) -> dict | None:
        """根据 UUID 获取任务."""
        tasks = self._load_tasks()
        return next((t for t in tasks if t["uuid"] == uuid), None)

    def delete_task(self, uuid: str) -> bool:
        """删除任务."""
        tasks = self._load_tasks()
        original_len = len(tasks)
        tasks = [t for t in tasks if t["uuid"] != uuid]

        if len(tasks) < original_len:
            self._save_tasks(tasks)
            self._unregister_job(uuid)
            logger.info(f"Deleted {self._manager_name}: uuid={uuid}")
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

                logger.info(f"Enabled {self._manager_name}: uuid={uuid}")
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

                logger.info(f"Disabled {self._manager_name}: uuid={uuid}")
                return task
        return None

    def is_task_running(self, uuid: str) -> bool:
        """检查任务是否正在运行."""
        return uuid in self._running_tasks

    # ==================== 执行历史 ====================

    def get_history(self, task_uuid: str | None = None, limit: int = 50) -> list[dict]:
        """获取执行历史."""
        history = self._load_history()

        if task_uuid:
            history = [h for h in history if h.get("task_uuid") == task_uuid]

        history.sort(key=lambda x: x.get("started_at", ""), reverse=True)
        return history[:limit]

    # ==================== 调度器内部方法 ====================

    def _register_job(self, task: dict) -> None:
        """注册调度任务（一次性触发，任务完成后再注册下一次）."""
        if self._scheduler is None:
            return

        uuid = task["uuid"]
        cron = task.get("cron_expression")
        if not cron:
            return

        self._unregister_job(uuid)

        try:
            # 计算下一次执行时间
            trigger = CronTrigger.from_crontab(cron)
            next_time = trigger.get_next_fire_time(None, datetime.now())
            
            if next_time:
                # 检查是否超过结束时间
                end_time_str = task.get("end_time")
                if end_time_str and self._is_past_end_time(next_time, end_time_str):
                    logger.info(f"Skipping {self._manager_name} job {uuid}: past end time {end_time_str}")
                    # 更新 next_run 为 None
                    self._update_next_run(uuid, None)
                    return
                
                # 使用 date trigger 安排一次性执行
                from apscheduler.triggers.date import DateTrigger
                self._scheduler.add_job(
                    self._job_wrapper,
                    trigger=DateTrigger(run_date=next_time),
                    id=uuid,
                    args=[task],
                    replace_existing=True,
                )
                # 更新任务的 next_run 字段
                self._update_next_run(uuid, next_time.isoformat())
                logger.debug(f"Registered {self._manager_name} job: {uuid}, next run: {next_time}")
        except Exception as e:
            logger.error(f"Failed to register {self._manager_name} job {uuid}: {e}")
    
    def _update_next_run(self, uuid: str, next_run: str | None) -> None:
        """更新任务的下次执行时间."""
        tasks = self._load_tasks()
        for task in tasks:
            if task["uuid"] == uuid:
                task["next_run"] = next_run
                break
        self._save_tasks(tasks)
    
    def _is_past_end_time(self, check_time: datetime, end_time_str: str) -> bool:
        """检查指定时间是否超过结束时间.
        
        Args:
            check_time: 要检查的时间
            end_time_str: 结束时间字符串，格式 "HH:MM"
            
        Returns:
            True 如果超过结束时间
        """
        try:
            end_hour, end_minute = map(int, end_time_str.split(":"))
            end_datetime = check_time.replace(hour=end_hour, minute=end_minute, second=0, microsecond=0)
            return check_time >= end_datetime
        except (ValueError, AttributeError):
            return False

    def _unregister_job(self, uuid: str) -> None:
        """取消注册调度任务."""
        if self._scheduler is None:
            return

        try:
            self._scheduler.remove_job(uuid)
            logger.debug(f"Unregistered {self._manager_name} job: {uuid}")
        except Exception as e:
            logger.debug(f"Job {uuid} not found or already removed: {e}")

    def _job_wrapper(self, task: dict) -> None:
        """调度任务包装器."""
        uuid = task["uuid"]
        
        # 防止重复执行：如果任务已在运行，跳过本次调度
        if uuid in self._running_tasks:
            logger.info(f"Skipping {self._manager_name} job {uuid}: already running")
            return
        
        current_task = self.get_task(uuid)
        if current_task and current_task["status"] == TaskStatus.ENABLED.value:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                asyncio.run(self._execute_task_and_reschedule(current_task))
                return

            self._schedule_task(uuid, loop, current_task)

    async def _execute_task_and_reschedule(self, task: dict) -> None:
        """执行任务并在完成后重新调度下一次."""
        try:
            await self._execute_task(task)
        finally:
            # 任务完成后，重新注册下一次调度
            uuid = task["uuid"]
            current_task = self.get_task(uuid)
            if current_task and current_task["status"] == TaskStatus.ENABLED.value and current_task.get("cron_expression"):
                self._register_job(current_task)
                logger.info(f"Rescheduled {self._manager_name} job {uuid} after completion")

    def _schedule_task(self, task_uuid: str, loop: asyncio.AbstractEventLoop, task: dict) -> None:
        """在事件循环中调度任务."""
        handle = loop.create_task(self._execute_task_and_reschedule(task))
        self._running_task_handles[task_uuid] = handle

        def _cleanup(_: asyncio.Task) -> None:
            self._running_task_handles.pop(task_uuid, None)

        handle.add_done_callback(_cleanup)

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

    # ==================== 文件操作 ====================

    def _load_tasks(self) -> list[dict]:
        """从文件加载任务（带缓存）."""
        if not self._tasks_path.exists():
            return []

        with self._io_lock:
            current_mtime = self._tasks_path.stat().st_mtime
            if self._file_mtime == current_mtime and self._file_cache is not None:
                return copy.deepcopy(self._file_cache)

            try:
                with open(self._tasks_path, encoding="utf-8") as f:
                    data = json.load(f)
                tasks = data.get("tasks", [])
                self._file_cache = copy.deepcopy(tasks)
                self._file_mtime = current_mtime
                return copy.deepcopy(tasks)
            except Exception as e:
                logger.warning(f"Failed to load {self._manager_name} tasks: {e}")
                return []

    def _save_tasks(self, tasks: list[dict]) -> bool:
        """保存任务到文件（原子写入）."""
        temp_path = self._tasks_path.with_suffix(".tmp")
        with self._io_lock:
            try:
                with open(temp_path, "w", encoding="utf-8") as f:
                    json.dump({"tasks": tasks}, f, indent=2, ensure_ascii=False)
                temp_path.replace(self._tasks_path)
                self._file_cache = copy.deepcopy(tasks)
                self._file_mtime = self._tasks_path.stat().st_mtime
                return True
            except Exception as e:
                logger.error(f"Failed to save {self._manager_name} tasks: {e}")
                if temp_path.exists():
                    temp_path.unlink()
                return False

    def _load_history(self) -> list[dict]:
        """加载执行历史."""
        if not self._history_path.exists():
            return []

        with self._io_lock:
            try:
                with open(self._history_path, encoding="utf-8") as f:
                    data = json.load(f)
                return data.get("history", [])
            except Exception:
                return []

    def _save_execution_record(self, record: dict) -> None:
        """保存执行记录."""
        with self._io_lock:
            history = self._load_history()
            history.append(record)

            # 只保留最近 500 条
            if len(history) > 500:
                history = history[-500:]

            try:
                with open(self._history_path, "w", encoding="utf-8") as f:
                    json.dump({"history": history}, f, indent=2, ensure_ascii=False)
            except Exception as e:
                logger.error(f"Failed to save {self._manager_name} execution history: {e}")

    # ==================== 抽象方法 ====================

    @abstractmethod
    async def _execute_task(self, task: dict) -> None:
        """执行任务（子类实现）."""
        pass
