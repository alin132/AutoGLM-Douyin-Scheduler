"""抖音回复历史记录数据库.

使用 SQLite 存储已回复的记录，避免重复回复。
"""

import sqlite3
import threading
from datetime import datetime
from pathlib import Path

from AutoGLM_GUI.logger import logger


class ReplyHistoryDB:
    """回复历史数据库（单例模式）."""

    _instance: "ReplyHistoryDB | None" = None
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
        config_dir.mkdir(parents=True, exist_ok=True)
        self._db_path = config_dir / "douyin_reply_history.db"
        self._local = threading.local()
        self._init_db()
        self._initialized = True

    def _get_conn(self) -> sqlite3.Connection:
        """获取当前线程的数据库连接."""
        if not hasattr(self._local, "conn") or self._local.conn is None:
            self._local.conn = sqlite3.connect(str(self._db_path))
            self._local.conn.row_factory = sqlite3.Row
        return self._local.conn

    def _init_db(self) -> None:
        """初始化数据库表."""
        conn = self._get_conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS reply_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_uuid TEXT NOT NULL,
                video_author TEXT NOT NULL,
                video_title TEXT DEFAULT '',
                replied_user TEXT NOT NULL,
                original_comment TEXT DEFAULT '',
                reply_content TEXT DEFAULT '',
                reply_type TEXT DEFAULT 'reply',
                replied_at TEXT NOT NULL,
                UNIQUE(task_uuid, video_author, replied_user)
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_task_video 
            ON reply_history(task_uuid, video_author)
        """)
        # 添加 replied_at 索引，优化按日期查询
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_replied_at 
            ON reply_history(replied_at)
        """)
        
        # 尝试添加新列（如果不存在）
        for col in ['video_title', 'original_comment', 'reply_content']:
            try:
                conn.execute(f"ALTER TABLE reply_history ADD COLUMN {col} TEXT DEFAULT ''")
                conn.commit()
            except sqlite3.OperationalError:
                pass  # 列已存在
        
        conn.commit()
        logger.info(f"Reply history DB initialized: {self._db_path}")

    def add_reply(
        self,
        task_uuid: str,
        video_author: str,
        replied_user: str,
        reply_type: str = "reply",
        video_title: str = "",
        original_comment: str = "",
        reply_content: str = "",
    ) -> bool:
        """记录一条回复."""
        try:
            conn = self._get_conn()
            conn.execute(
                """
                INSERT OR IGNORE INTO reply_history 
                (task_uuid, video_author, video_title, replied_user, original_comment, reply_content, reply_type, replied_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (task_uuid, video_author, video_title, replied_user, original_comment, reply_content, reply_type, datetime.now().isoformat()),
            )
            conn.commit()
            logger.debug(f"Recorded reply: {video_author} -> {replied_user}")
            return True
        except Exception as e:
            logger.error(f"Failed to record reply: {e}")
            return False

    def has_replied(self, task_uuid: str, video_author: str, replied_user: str) -> bool:
        """检查是否已回复过某用户."""
        conn = self._get_conn()
        cursor = conn.execute(
            """
            SELECT 1 FROM reply_history 
            WHERE task_uuid = ? AND video_author = ? AND replied_user = ?
            LIMIT 1
            """,
            (task_uuid, video_author, replied_user),
        )
        return cursor.fetchone() is not None

    def has_commented_video(self, task_uuid: str, video_author: str) -> bool:
        """检查是否已在某视频下评论过（直接评论模式）."""
        conn = self._get_conn()
        cursor = conn.execute(
            """
            SELECT 1 FROM reply_history 
            WHERE task_uuid = ? AND video_author = ? AND reply_type = 'direct'
            LIMIT 1
            """,
            (task_uuid, video_author),
        )
        return cursor.fetchone() is not None

    def get_replied_users(self, task_uuid: str, video_author: str, limit: int = 50) -> list[str]:
        """获取某视频下已回复过的用户列表."""
        conn = self._get_conn()
        cursor = conn.execute(
            """
            SELECT replied_user FROM reply_history 
            WHERE task_uuid = ? AND video_author = ?
            ORDER BY replied_at DESC
            LIMIT ?
            """,
            (task_uuid, video_author, limit),
        )
        return [row["replied_user"] for row in cursor.fetchall()]

    def get_all_replied_users(self, task_uuid: str, days: int = 7, limit: int = 50) -> list[str]:
        """获取任务下最近N天已回复过的用户（去重）."""
        conn = self._get_conn()
        cursor = conn.execute(
            """
            SELECT DISTINCT replied_user FROM reply_history 
            WHERE task_uuid = ? 
              AND replied_at >= datetime('now', '-' || ? || ' days')
            ORDER BY replied_at DESC
            LIMIT ?
            """,
            (task_uuid, days, limit),
        )
        return [row["replied_user"] for row in cursor.fetchall()]

    def get_commented_videos(self, task_uuid: str, days: int = 7, limit: int = 30) -> list[str]:
        """获取最近N天已评论过的视频作者列表（直接评论模式）."""
        conn = self._get_conn()
        cursor = conn.execute(
            """
            SELECT DISTINCT video_author FROM reply_history 
            WHERE task_uuid = ? AND reply_type = 'direct'
              AND replied_at >= datetime('now', '-' || ? || ' days')
            ORDER BY replied_at DESC
            LIMIT ?
            """,
            (task_uuid, days, limit),
        )
        return [row["video_author"] for row in cursor.fetchall()]

    def cleanup_old_records(self, days: int = 30) -> int:
        """清理超过N天的旧记录."""
        conn = self._get_conn()
        cursor = conn.execute(
            "DELETE FROM reply_history WHERE replied_at < datetime('now', '-' || ? || ' days')",
            (days,),
        )
        conn.commit()
        deleted = cursor.rowcount
        if deleted > 0:
            logger.info(f"Cleaned up {deleted} old reply records (older than {days} days)")
        return deleted

    def get_reply_count(self, task_uuid: str) -> int:
        """获取任务的总回复数."""
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT COUNT(*) as cnt FROM reply_history WHERE task_uuid = ?",
            (task_uuid,),
        )
        row = cursor.fetchone()
        return row["cnt"] if row else 0

    def get_reply_stats(self, task_uuid: str | None = None, days: int = 30) -> dict:
        """获取回复统计数据."""
        conn = self._get_conn()
        
        if task_uuid:
            # 单个任务的统计
            cursor = conn.execute(
                """
                SELECT 
                    COUNT(*) as total_replies,
                    COUNT(DISTINCT video_author) as unique_videos,
                    COUNT(DISTINCT replied_user) as unique_users
                FROM reply_history 
                WHERE task_uuid = ? 
                  AND replied_at >= datetime('now', '-' || ? || ' days')
                """,
                (task_uuid, days),
            )
        else:
            # 所有任务的统计
            cursor = conn.execute(
                """
                SELECT 
                    COUNT(*) as total_replies,
                    COUNT(DISTINCT video_author) as unique_videos,
                    COUNT(DISTINCT replied_user) as unique_users,
                    COUNT(DISTINCT task_uuid) as task_count
                FROM reply_history 
                WHERE replied_at >= datetime('now', '-' || ? || ' days')
                """,
                (days,),
            )
        
        row = cursor.fetchone()
        return dict(row) if row else {}

    def get_reply_list(
        self, 
        task_uuid: str | None = None, 
        days: int = 7, 
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """获取回复记录列表."""
        conn = self._get_conn()
        
        if task_uuid:
            cursor = conn.execute(
                """
                SELECT id, task_uuid, video_author, video_title, replied_user, 
                       original_comment, reply_content, reply_type, replied_at
                FROM reply_history 
                WHERE task_uuid = ? 
                  AND replied_at >= datetime('now', '-' || ? || ' days')
                ORDER BY replied_at DESC
                LIMIT ? OFFSET ?
                """,
                (task_uuid, days, limit, offset),
            )
        else:
            cursor = conn.execute(
                """
                SELECT id, task_uuid, video_author, video_title, replied_user,
                       original_comment, reply_content, reply_type, replied_at
                FROM reply_history 
                WHERE replied_at >= datetime('now', '-' || ? || ' days')
                ORDER BY replied_at DESC
                LIMIT ? OFFSET ?
                """,
                (days, limit, offset),
            )
        
        return [dict(row) for row in cursor.fetchall()]

    def get_daily_stats(self, task_uuid: str | None = None, days: int = 7) -> list[dict]:
        """获取每日回复统计."""
        conn = self._get_conn()
        
        if task_uuid:
            cursor = conn.execute(
                """
                SELECT 
                    date(replied_at) as date,
                    COUNT(*) as reply_count,
                    COUNT(DISTINCT video_author) as video_count
                FROM reply_history 
                WHERE task_uuid = ? 
                  AND replied_at >= datetime('now', '-' || ? || ' days')
                GROUP BY date(replied_at)
                ORDER BY date DESC
                """,
                (task_uuid, days),
            )
        else:
            cursor = conn.execute(
                """
                SELECT 
                    date(replied_at) as date,
                    COUNT(*) as reply_count,
                    COUNT(DISTINCT video_author) as video_count
                FROM reply_history 
                WHERE replied_at >= datetime('now', '-' || ? || ' days')
                GROUP BY date(replied_at)
                ORDER BY date DESC
                """,
                (days,),
            )
        
        return [dict(row) for row in cursor.fetchall()]

    def clear_task_history(self, task_uuid: str) -> int:
        """清除某任务的所有回复记录."""
        conn = self._get_conn()
        cursor = conn.execute(
            "DELETE FROM reply_history WHERE task_uuid = ?",
            (task_uuid,),
        )
        conn.commit()
        deleted = cursor.rowcount
        logger.info(f"Cleared {deleted} reply records for task {task_uuid}")
        return deleted


# 单例实例
reply_history_db = ReplyHistoryDB()
