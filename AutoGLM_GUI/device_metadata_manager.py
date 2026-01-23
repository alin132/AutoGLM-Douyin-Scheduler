"""Device metadata persistence manager."""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

from AutoGLM_GUI.logger import logger

DISPLAY_NAME_MAX_LENGTH = 100
MAX_CONNECTION_HISTORY = 50  # 最多保存50条连接历史


@dataclass
class DeviceConnectionHistory:
    """设备连接历史记录."""
    
    ip: str  # 设备 IP 地址
    port: int  # 最后使用的端口
    serial: Optional[str] = None  # 硬件序列号（如果获取到）
    model: Optional[str] = None  # 设备型号
    display_name: Optional[str] = None  # 用户自定义名称
    last_connected: datetime = field(default_factory=datetime.now)
    connection_count: int = 1  # 连接次数
    
    def to_dict(self) -> dict:
        """Convert to serializable dict."""
        return {
            "ip": self.ip,
            "port": self.port,
            "serial": self.serial,
            "model": self.model,
            "display_name": self.display_name,
            "last_connected": self.last_connected.isoformat(),
            "connection_count": self.connection_count,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "DeviceConnectionHistory":
        """Create instance from dict."""
        last_connected_str = data.get("last_connected")
        last_connected = (
            datetime.fromisoformat(last_connected_str)
            if last_connected_str
            else datetime.now()
        )
        return cls(
            ip=data.get("ip", ""),
            port=data.get("port", 5555),
            serial=data.get("serial"),
            model=data.get("model"),
            display_name=data.get("display_name"),
            last_connected=last_connected,
            connection_count=data.get("connection_count", 1),
        )


@dataclass
class DeviceMetadata:
    """Device user-defined metadata."""

    serial: str
    display_name: Optional[str] = None
    last_updated: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict:
        """Convert to serializable dict."""
        return {
            "serial": self.serial,
            "display_name": self.display_name,
            "last_updated": self.last_updated.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "DeviceMetadata":
        """Create instance from dict."""
        last_updated_str = data.get("last_updated")
        last_updated = (
            datetime.fromisoformat(last_updated_str)
            if last_updated_str
            else datetime.now()
        )
        return cls(
            serial=data.get("serial", ""),
            display_name=data.get("display_name"),
            last_updated=last_updated,
        )


class DeviceMetadataManager:
    """
    Singleton manager for device metadata persistence.

    Stores user-defined device names and other metadata.
    Design: Lazy persistence - only save when metadata changes.
    """

    _instance: Optional[DeviceMetadataManager] = None
    _lock = threading.Lock()

    def __init__(self, storage_dir: Optional[Path] = None):
        """Private constructor. Use get_instance() instead."""
        if storage_dir is None:
            storage_dir = Path.home() / ".config" / "autoglm" / "devices"

        self.storage_dir = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_file = self.storage_dir / "metadata.json"
        self.connection_history_file = self.storage_dir / "connection_history.json"

        self._metadata: dict[str, DeviceMetadata] = {}
        self._connection_history: dict[str, DeviceConnectionHistory] = {}  # key: IP
        self._data_lock = threading.RLock()

        self._load_metadata()
        self._load_connection_history()

    @classmethod
    def get_instance(cls, storage_dir: Optional[Path] = None) -> DeviceMetadataManager:
        """Get singleton instance (thread-safe)."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls(storage_dir=storage_dir)
                    logger.info("DeviceMetadataManager singleton created")
        return cls._instance

    def _load_metadata(self) -> None:
        """Load metadata from disk."""
        if not self.metadata_file.exists():
            logger.debug("No metadata file found, starting fresh")
            return

        try:
            with open(self.metadata_file, encoding="utf-8") as f:
                data = json.load(f)

            with self._data_lock:
                self._metadata = {
                    serial: DeviceMetadata.from_dict(meta_dict)
                    for serial, meta_dict in data.items()
                }

            logger.info(f"Loaded metadata for {len(self._metadata)} device(s)")
        except Exception as e:
            logger.error(f"Failed to load device metadata: {e}")
            backup_path = self.metadata_file.with_suffix(".json.bak")
            if self.metadata_file.exists():
                try:
                    self.metadata_file.rename(backup_path)
                    logger.warning(
                        f"Corrupted metadata file moved to {backup_path.name}"
                    )
                except Exception as backup_error:
                    logger.error(f"Failed to create backup: {backup_error}")
            self._metadata = {}

    def _save_metadata(self) -> None:
        """Save metadata to disk atomically."""
        temp_path = self.metadata_file.with_suffix(".json.tmp")
        try:
            with self._data_lock:
                data = {
                    serial: meta.to_dict() for serial, meta in self._metadata.items()
                }

            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            temp_path.replace(self.metadata_file)

            logger.debug(f"Saved metadata for {len(self._metadata)} device(s)")
        except Exception as e:
            logger.error(f"Failed to save device metadata: {e}")
            if temp_path.exists():
                temp_path.unlink()
            raise

    def get_display_name(self, serial: str) -> Optional[str]:
        """Get device display name by serial."""
        with self._data_lock:
            metadata = self._metadata.get(serial)
            return metadata.display_name if metadata else None

    def set_display_name(self, serial: str, display_name: Optional[str]) -> None:
        """Set device display name. Empty string will be treated as None."""
        normalized_name = display_name.strip() if display_name else None
        normalized_name = normalized_name if normalized_name else None

        if normalized_name and len(normalized_name) > DISPLAY_NAME_MAX_LENGTH:
            raise ValueError(
                f"Display name too long: {len(normalized_name)} > {DISPLAY_NAME_MAX_LENGTH}"
            )

        with self._data_lock:
            if serial not in self._metadata:
                self._metadata[serial] = DeviceMetadata(serial=serial)

            current_name = self._metadata[serial].display_name
            if current_name == normalized_name:
                return

            self._metadata[serial].display_name = normalized_name
            self._metadata[serial].last_updated = datetime.now()

            self._save_metadata()

        logger.info(f"Updated display name for device {serial}: {normalized_name}")

    def get_metadata(self, serial: str) -> Optional[DeviceMetadata]:
        """Get full device metadata."""
        with self._data_lock:
            return self._metadata.get(serial)

    def list_all_metadata(self) -> dict[str, DeviceMetadata]:
        """List all stored device metadata."""
        with self._data_lock:
            return dict(self._metadata)

    # ==================== 连接历史管理 ====================

    def _load_connection_history(self) -> None:
        """从磁盘加载连接历史."""
        if not self.connection_history_file.exists():
            logger.debug("No connection history file found")
            return

        try:
            with open(self.connection_history_file, encoding="utf-8") as f:
                data = json.load(f)

            with self._data_lock:
                self._connection_history = {
                    ip: DeviceConnectionHistory.from_dict(hist_dict)
                    for ip, hist_dict in data.items()
                }

            logger.info(f"Loaded {len(self._connection_history)} connection history record(s)")
        except Exception as e:
            logger.error(f"Failed to load connection history: {e}")
            self._connection_history = {}

    def _save_connection_history(self) -> None:
        """保存连接历史到磁盘."""
        temp_path = self.connection_history_file.with_suffix(".json.tmp")
        try:
            with self._data_lock:
                data = {
                    ip: hist.to_dict() for ip, hist in self._connection_history.items()
                }

            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

            temp_path.replace(self.connection_history_file)
            logger.debug(f"Saved {len(self._connection_history)} connection history record(s)")
        except Exception as e:
            logger.error(f"Failed to save connection history: {e}")
            if temp_path.exists():
                temp_path.unlink()
            raise

    def add_connection_history(
        self,
        ip: str,
        port: int,
        serial: Optional[str] = None,
        model: Optional[str] = None,
        display_name: Optional[str] = None,
    ) -> None:
        """添加或更新连接历史.
        
        Args:
            ip: 设备 IP 地址
            port: 连接端口
            serial: 硬件序列号
            model: 设备型号
            display_name: 用户自定义名称
        """
        with self._data_lock:
            if ip in self._connection_history:
                # 更新现有记录
                hist = self._connection_history[ip]
                hist.port = port
                hist.last_connected = datetime.now()
                hist.connection_count += 1
                # 只有新值才更新
                if serial:
                    hist.serial = serial
                if model:
                    hist.model = model
                if display_name:
                    hist.display_name = display_name
            else:
                # 新增记录
                self._connection_history[ip] = DeviceConnectionHistory(
                    ip=ip,
                    port=port,
                    serial=serial,
                    model=model,
                    display_name=display_name,
                )

            # 限制历史记录数量
            if len(self._connection_history) > MAX_CONNECTION_HISTORY:
                # 按最后连接时间排序，删除最旧的
                sorted_items = sorted(
                    self._connection_history.items(),
                    key=lambda x: x[1].last_connected,
                    reverse=True,
                )
                self._connection_history = dict(sorted_items[:MAX_CONNECTION_HISTORY])

            self._save_connection_history()

        logger.info(f"Added/updated connection history for {ip}:{port}")

    def get_connection_history(self) -> list[DeviceConnectionHistory]:
        """获取所有连接历史，按最后连接时间排序."""
        with self._data_lock:
            return sorted(
                self._connection_history.values(),
                key=lambda x: x.last_connected,
                reverse=True,
            )

    def get_connection_history_by_ip(self, ip: str) -> Optional[DeviceConnectionHistory]:
        """根据 IP 获取连接历史."""
        with self._data_lock:
            return self._connection_history.get(ip)

    def remove_connection_history(self, ip: str) -> bool:
        """删除连接历史."""
        with self._data_lock:
            if ip in self._connection_history:
                del self._connection_history[ip]
                self._save_connection_history()
                logger.info(f"Removed connection history for {ip}")
                return True
            return False

    def update_connection_history_name(
        self, ip: str, display_name: Optional[str]
    ) -> bool:
        """更新连接历史的自定义名称."""
        with self._data_lock:
            if ip in self._connection_history:
                self._connection_history[ip].display_name = display_name
                self._save_connection_history()
                logger.info(f"Updated connection history name for {ip}: {display_name}")
                return True
            return False

    def clear_connection_history(self) -> None:
        """清空所有连接历史."""
        with self._data_lock:
            self._connection_history.clear()
            self._save_connection_history()
        logger.info("Cleared all connection history")
