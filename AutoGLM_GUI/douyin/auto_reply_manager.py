"""抖音私信自动回复管理模块.

Features:
- 单例模式
- JSON 文件持久化
- 规则匹配（关键词/正则）
- 执行历史记录
"""

import json
import re
import uuid as uuid_lib
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Callable

from AutoGLM_GUI.logger import logger


class TriggerType(str, Enum):
    """触发类型."""

    KEYWORD = "keyword"
    REGEX = "regex"


class ReplyStatus(str, Enum):
    """回复状态."""

    SUCCESS = "success"
    FAILED = "failed"


class DouyinAutoReplyManager:
    """抖音私信自动回复管理器（单例模式）."""

    _instance: "DouyinAutoReplyManager | None" = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, "_initialized"):
            return
        self._initialized = True
        self._rules_path = Path.home() / ".config" / "autoglm" / "douyin_rules.json"
        self._history_path = Path.home() / ".config" / "autoglm" / "douyin_history.json"
        self._rules_cache: list[dict] | None = None
        self._rules_mtime: float | None = None
        self._reply_executor: Callable[[str, str, str], str] | None = None
        self._ensure_dirs()

    def _ensure_dirs(self) -> None:
        """确保配置目录存在."""
        self._rules_path.parent.mkdir(parents=True, exist_ok=True)

    def set_reply_executor(self, executor: Callable[[str, str, str], str]) -> None:
        """设置回复执行器.

        Args:
            executor: 执行函数，参数为 (device_id, sender, reply_message)，返回执行结果字符串
        """
        self._reply_executor = executor

    def _load_rules(self) -> list[dict]:
        """加载规则列表."""
        if not self._rules_path.exists():
            return []

        try:
            mtime = self._rules_path.stat().st_mtime
            if self._rules_cache is not None and self._rules_mtime == mtime:
                return self._rules_cache

            with open(self._rules_path, encoding="utf-8") as f:
                data = json.load(f)
                rules = data.get("rules", [])
                self._rules_cache = rules if rules is not None else []
                self._rules_mtime = mtime
                return self._rules_cache or []
        except Exception as e:
            logger.error(f"Failed to load douyin rules: {e}")
            return []

    def _save_rules(self, rules: list[dict]) -> None:
        """保存规则列表."""
        try:
            with open(self._rules_path, "w", encoding="utf-8") as f:
                json.dump({"rules": rules}, f, ensure_ascii=False, indent=2)
            self._rules_cache = rules
            self._rules_mtime = self._rules_path.stat().st_mtime
        except Exception as e:
            logger.error(f"Failed to save douyin rules: {e}")
            raise

    def _load_history(self) -> list[dict]:
        """加载执行历史."""
        if not self._history_path.exists():
            return []

        try:
            with open(self._history_path, encoding="utf-8") as f:
                data = json.load(f)
                return data.get("history", [])
        except Exception as e:
            logger.error(f"Failed to load douyin history: {e}")
            return []

    def _save_history(self, history: list[dict]) -> None:
        """保存执行历史."""
        try:
            with open(self._history_path, "w", encoding="utf-8") as f:
                json.dump({"history": history}, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save douyin history: {e}")

    def _add_history(
        self,
        rule_uuid: str,
        rule_name: str,
        sender: str,
        original_message: str,
        reply_sent: str,
        status: str,
        error: str | None = None,
    ) -> dict:
        """添加执行历史记录."""
        history = self._load_history()
        record = {
            "uuid": str(uuid_lib.uuid4()),
            "rule_uuid": rule_uuid,
            "rule_name": rule_name,
            "sender": sender,
            "original_message": original_message,
            "reply_sent": reply_sent,
            "status": status,
            "timestamp": datetime.now().isoformat(),
            "error": error,
        }
        history.insert(0, record)
        # 只保留最近 500 条记录
        history = history[:500]
        self._save_history(history)
        return record

    # CRUD 操作
    def list_rules(self) -> list[dict]:
        """获取所有规则."""
        return self._load_rules()

    def get_rule(self, rule_uuid: str) -> dict | None:
        """获取单个规则."""
        rules = self._load_rules()
        for rule in rules:
            if rule.get("uuid") == rule_uuid:
                return rule
        return None

    def create_rule(
        self,
        name: str,
        trigger_pattern: str,
        trigger_type: str,
        reply_message: str,
        device_id: str,
        enabled: bool = True,
    ) -> dict:
        """创建新规则."""
        rules = self._load_rules()
        now = datetime.now().isoformat()
        rule = {
            "uuid": str(uuid_lib.uuid4()),
            "name": name,
            "trigger_pattern": trigger_pattern,
            "trigger_type": trigger_type,
            "reply_message": reply_message,
            "device_id": device_id,
            "enabled": enabled,
            "created_at": now,
            "updated_at": now,
        }
        rules.append(rule)
        self._save_rules(rules)
        logger.info(f"Created douyin rule: {name}")
        return rule

    def update_rule(self, rule_uuid: str, **kwargs) -> dict | None:
        """更新规则."""
        rules = self._load_rules()
        for i, rule in enumerate(rules):
            if rule.get("uuid") == rule_uuid:
                for key, value in kwargs.items():
                    if value is not None and key in rule:
                        rule[key] = value
                rule["updated_at"] = datetime.now().isoformat()
                rules[i] = rule
                self._save_rules(rules)
                logger.info(f"Updated douyin rule: {rule_uuid}")
                return rule
        return None

    def delete_rule(self, rule_uuid: str) -> bool:
        """删除规则."""
        rules = self._load_rules()
        for i, rule in enumerate(rules):
            if rule.get("uuid") == rule_uuid:
                rules.pop(i)
                self._save_rules(rules)
                logger.info(f"Deleted douyin rule: {rule_uuid}")
                return True
        return False

    def enable_rule(self, rule_uuid: str) -> dict | None:
        """启用规则."""
        return self.update_rule(rule_uuid, enabled=True)

    def disable_rule(self, rule_uuid: str) -> dict | None:
        """禁用规则."""
        return self.update_rule(rule_uuid, enabled=False)

    # 规则匹配
    def match_message(self, message: str) -> list[dict]:
        """匹配消息，返回所有匹配的启用规则."""
        rules = self._load_rules()
        matched = []
        for rule in rules:
            if not rule.get("enabled"):
                continue
            trigger_type = rule.get("trigger_type", TriggerType.KEYWORD.value)
            pattern = rule.get("trigger_pattern", "")
            if trigger_type == TriggerType.KEYWORD.value:
                # 关键词匹配（支持多个关键词，用 | 分隔）
                keywords = [k.strip() for k in pattern.split("|") if k.strip()]
                if any(kw in message for kw in keywords):
                    matched.append(rule)
            elif trigger_type == TriggerType.REGEX.value:
                # 正则匹配
                try:
                    if re.search(pattern, message, re.IGNORECASE):
                        matched.append(rule)
                except re.error:
                    logger.warning(f"Invalid regex pattern: {pattern}")
        return matched

    def test_rule(self, rule_uuid: str, test_message: str) -> dict:
        """测试规则是否匹配."""
        rule = self.get_rule(rule_uuid)
        if not rule:
            return {"success": False, "matched": False, "error": "Rule not found"}

        trigger_type = rule.get("trigger_type", TriggerType.KEYWORD.value)
        pattern = rule.get("trigger_pattern", "")
        matched = False

        try:
            if trigger_type == TriggerType.KEYWORD.value:
                keywords = [k.strip() for k in pattern.split("|") if k.strip()]
                matched = any(kw in test_message for kw in keywords)
            elif trigger_type == TriggerType.REGEX.value:
                matched = bool(re.search(pattern, test_message, re.IGNORECASE))
        except re.error as e:
            return {"success": False, "matched": False, "error": f"Invalid regex: {e}"}

        return {
            "success": True,
            "matched": matched,
            "reply": rule.get("reply_message") if matched else None,
        }

    # 执行回复
    async def execute_reply(
        self, rule_uuid: str, sender: str, original_message: str
    ) -> dict:
        """执行自动回复."""
        rule = self.get_rule(rule_uuid)
        if not rule:
            return {"success": False, "error": "Rule not found"}

        if not self._reply_executor:
            return {"success": False, "error": "Reply executor not set"}

        device_id = rule.get("device_id")
        if not device_id:
            return {"success": False, "error": "No device_id in rule"}
        reply_message = rule.get("reply_message", "")

        try:
            result = self._reply_executor(device_id, sender, reply_message)
            record = self._add_history(
                rule_uuid=rule_uuid,
                rule_name=rule.get("name", ""),
                sender=sender,
                original_message=original_message,
                reply_sent=reply_message,
                status=ReplyStatus.SUCCESS.value,
            )
            return {"success": True, "result": result, "history": record}
        except Exception as e:
            error_msg = str(e)
            record = self._add_history(
                rule_uuid=rule_uuid,
                rule_name=rule.get("name", ""),
                sender=sender,
                original_message=original_message,
                reply_sent=reply_message,
                status=ReplyStatus.FAILED.value,
                error=error_msg,
            )
            return {"success": False, "error": error_msg, "history": record}

    # 历史记录
    def get_history(self, limit: int = 50) -> list[dict]:
        """获取执行历史."""
        history = self._load_history()
        return history[:limit]

    def clear_history(self) -> None:
        """清空执行历史."""
        self._save_history([])
        logger.info("Cleared douyin reply history")


# 全局单例
douyin_auto_reply_manager = DouyinAutoReplyManager()
