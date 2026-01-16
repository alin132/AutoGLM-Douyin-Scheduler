"""定时任务管理模块.

Features:
- 继承 BaseTaskManager 基类
- JSON 文件持久化
- APScheduler 调度器
- Cron 表达式支持
- 任务执行历史记录
- 支持多种执行模式（经典、双模型、分层代理）
"""

import asyncio
import threading
import uuid as uuid_lib
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Callable

from AutoGLM_GUI.base_task_manager import BaseTaskManager, ExecutionStatus, TaskStatus
from AutoGLM_GUI.logger import logger


class ExecutionMode(str, Enum):
    """执行模式."""
    CLASSIC = "classic"  # 经典模式（单模型）
    DUAL_MODEL = "dual_model"  # 双模型协作
    LAYERED_AGENT = "layered_agent"  # 分层代理


class ScheduledTaskManager(BaseTaskManager):
    """定时任务管理器（单例模式）."""

    _instance: "ScheduledTaskManager | None" = None
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
            tasks_path=config_dir / "scheduled_tasks.json",
            history_path=config_dir / "task_history.json",
            manager_name="Scheduled task",
        )
        
        self._initialized = True
        # 类型更精确的执行器
        self._task_executor: Callable[[str, str, str, str], str] | None = None

    def set_task_executor(
        self, executor: Callable[[str, str, str, str], str]
    ) -> None:
        """设置任务执行器.

        Args:
            executor: 执行函数，参数为 (task_uuid, device_id, message, execution_mode)，返回执行结果字符串
        """
        self._task_executor = executor

    # ==================== 任务创建/更新 ====================

    def create_task(
        self,
        name: str,
        device_id: str,
        message: str,
        cron_expression: str,
        execution_mode: str = ExecutionMode.CLASSIC.value,
        thinking_mode: str = "deep",
        enabled: bool = True,
    ) -> dict:
        """创建定时任务.

        Args:
            name: 任务名称
            device_id: 目标设备 ID
            message: 要执行的指令
            cron_expression: Cron 表达式 (分 时 日 月 周)
            execution_mode: 执行模式 (classic/dual_model/layered_agent)
            thinking_mode: 思考模式 (fast/deep/turbo)，仅双模型模式有效
            enabled: 是否启用

        Returns:
            dict: 新创建的任务
        """
        # 验证 cron 表达式
        self._validate_cron(cron_expression)

        # 验证执行模式
        valid_modes = [m.value for m in ExecutionMode]
        if execution_mode not in valid_modes:
            raise ValueError(f"Invalid execution_mode: {execution_mode}")

        tasks = self._load_tasks()
        new_task = {
            "uuid": str(uuid_lib.uuid4()),
            "name": name,
            "device_id": device_id,
            "message": message,
            "cron_expression": cron_expression,
            "execution_mode": execution_mode,
            "thinking_mode": thinking_mode,
            "status": TaskStatus.ENABLED.value if enabled else TaskStatus.DISABLED.value,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "last_run": None,
            "next_run": None,
        }

        tasks.append(new_task)
        self._save_tasks(tasks)

        # 如果启用，注册到调度器
        if enabled and self._scheduler is not None:
            self._register_job(new_task)
            new_task["next_run"] = self._get_next_run_time(new_task["uuid"])

        logger.info(
            f"Created scheduled task: {name} (uuid={new_task['uuid']}, mode={execution_mode})"
        )
        return new_task

    def update_task(
        self,
        uuid: str,
        name: str | None = None,
        device_id: str | None = None,
        message: str | None = None,
        cron_expression: str | None = None,
        execution_mode: str | None = None,
        thinking_mode: str | None = None,
    ) -> dict | None:
        """更新任务."""
        tasks = self._load_tasks()
        for task in tasks:
            if task["uuid"] == uuid:
                if name is not None:
                    task["name"] = name
                if device_id is not None:
                    task["device_id"] = device_id
                if message is not None:
                    task["message"] = message
                if cron_expression is not None:
                    self._validate_cron(cron_expression)
                    task["cron_expression"] = cron_expression
                if execution_mode is not None:
                    valid_modes = [m.value for m in ExecutionMode]
                    if execution_mode not in valid_modes:
                        raise ValueError(f"Invalid execution_mode: {execution_mode}")
                    task["execution_mode"] = execution_mode
                if thinking_mode is not None:
                    task["thinking_mode"] = thinking_mode

                task["updated_at"] = datetime.now().isoformat()
                self._save_tasks(tasks)

                # 如果任务已启用，重新注册
                if task["status"] == TaskStatus.ENABLED.value:
                    self._unregister_job(uuid)
                    self._register_job(task)
                    task["next_run"] = self._get_next_run_time(uuid)

                logger.info(f"Updated scheduled task: uuid={uuid}")
                return task
        return None

    def run_task_now(self, uuid: str) -> bool:
        """立即执行任务."""
        task = self.get_task(uuid)
        if not task:
            return False

        if uuid in self._running_tasks:
            logger.warning(f"Task {uuid} is already running")
            return False

        # 在后台线程中异步执行
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

    def get_task_history(
        self, task_uuid: str | None = None, limit: int = 50
    ) -> list[dict]:
        """获取执行历史（兼容旧 API）."""
        return self.get_history(task_uuid, limit)

    # ==================== 任务执行 ====================

    async def _execute_task(self, task: dict) -> None:
        """执行任务."""
        uuid = task["uuid"]
        if uuid in self._running_tasks:
            return

        self._running_tasks.add(uuid)
        self._update_task_status(uuid, TaskStatus.RUNNING)

        execution_mode = task.get("execution_mode", ExecutionMode.CLASSIC.value)

        execution_record = {
            "uuid": str(uuid_lib.uuid4()),
            "task_uuid": uuid,
            "task_name": task["name"],
            "device_id": task["device_id"],
            "message": task["message"],
            "execution_mode": execution_mode,
            "started_at": datetime.now().isoformat(),
            "finished_at": None,
            "status": ExecutionStatus.FAILED.value,
            "result": None,
            "error": None,
        }

        try:
            if self._task_executor is None:
                raise RuntimeError("Task executor not set")

            # 调用执行器，传入执行模式
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                self._task_executor,
                uuid,
                task["device_id"],
                task["message"],
                execution_mode,
            )

            execution_record["status"] = ExecutionStatus.SUCCESS.value
            execution_record["result"] = result if result else "Task completed"
            logger.info(
                f"Scheduled task executed successfully: {task['name']} (mode={execution_mode})"
            )

        except Exception as e:
            execution_record["status"] = ExecutionStatus.FAILED.value
            execution_record["error"] = str(e)
            logger.error(f"Scheduled task failed: {task['name']}, error: {e}")

        finally:
            execution_record["finished_at"] = datetime.now().isoformat()
            self._save_execution_record(execution_record)

            self._running_tasks.discard(uuid)

            # 恢复原状态
            current_task = self.get_task(uuid)
            if current_task and current_task["status"] == TaskStatus.RUNNING.value:
                self._update_task_status(uuid, TaskStatus.ENABLED)
                self._update_last_run(uuid)

    # 重写 _job_wrapper 使用同步包装器
    def _job_wrapper(self, task: dict) -> None:
        """调度任务同步包装器."""
        current_task = self.get_task(task["uuid"])
        if current_task and current_task["status"] != TaskStatus.DISABLED.value:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                # 使用基类的执行+重注册流程，避免任务只执行一次
                loop.run_until_complete(self._execute_task_and_reschedule(current_task))
            finally:
                loop.close()


# 单例实例
scheduled_task_manager = ScheduledTaskManager()
