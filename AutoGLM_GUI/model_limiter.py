"""Global model concurrency limiter."""

from __future__ import annotations

import asyncio
import os
import threading
from contextlib import asynccontextmanager, contextmanager

from AutoGLM_GUI.logger import logger


def _parse_limit(env_key: str, default: int) -> int:
    value = os.getenv(env_key)
    if value is None:
        return default
    try:
        limit = int(value)
        if limit <= 0:
            logger.warning(
                f"Invalid {env_key}={value}, fallback to default {default}"
            )
            return default
        return limit
    except Exception:
        logger.warning(f"Invalid {env_key}={value}, fallback to default {default}")
        return default


class ModelLimiter:
    """Simple cross-thread concurrency limiter with hot update support."""

    def __init__(self, name: str, limit: int) -> None:
        self.name = name
        self._limit = limit
        self._sem = threading.BoundedSemaphore(limit)
        self._lock = threading.Lock()

    @property
    def limit(self) -> int:
        return self._limit

    def update_limit(self, new_limit: int) -> None:
        """热更新并发限制.

        注意: 新限制只对后续请求生效。如果当前有 N 个请求在运行，
        它们会正常完成，不会被强制中断。
        """
        if new_limit <= 0:
            raise ValueError(f"Limit must be positive, got {new_limit}")
        with self._lock:
            old_limit = self._limit
            if new_limit == old_limit:
                return
            # 重建信号量（不影响已进入临界区的请求）
            self._sem = threading.BoundedSemaphore(new_limit)
            self._limit = new_limit
            logger.info(
                f"ModelLimiter[{self.name}] updated: {old_limit} -> {new_limit}"
            )

    @contextmanager
    def acquire(self):
        # 捕获当前信号量引用，避免 update_limit 替换后 release 到错误的信号量
        sem = self._sem
        sem.acquire()
        try:
            yield
        finally:
            sem.release()

    @asynccontextmanager
    async def acquire_async(self):
        # 捕获当前信号量引用，避免 update_limit 替换后 release 到错误的信号量
        sem = self._sem
        await asyncio.to_thread(sem.acquire)
        try:
            yield
        finally:
            sem.release()


# Default concurrency limits (can be overridden by env vars)
EXECUTION_LIMIT = _parse_limit("AUTOGLM_MAX_CONCURRENT_EXECUTION", 2)
DECISION_LIMIT = _parse_limit("AUTOGLM_MAX_CONCURRENT_DECISION", 2)
REPLY_LIMIT = _parse_limit("AUTOGLM_MAX_CONCURRENT_REPLY", 2)

execution_limiter = ModelLimiter("execution", EXECUTION_LIMIT)
decision_limiter = ModelLimiter("decision", DECISION_LIMIT)
reply_limiter = ModelLimiter("reply", REPLY_LIMIT)
