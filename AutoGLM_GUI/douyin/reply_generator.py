"""抖音回复生成器模块.

支持 FastGPT 智能回复和关键词匹配降级。
"""

import hashlib
from typing import TYPE_CHECKING

import requests

from AutoGLM_GUI.logger import logger

if TYPE_CHECKING:
    from collections.abc import Callable


class ReplyGenerator:
    """回复生成器."""

    def __init__(self, log_callback: "Callable[[str, str], None] | None" = None):
        """初始化回复生成器.
        
        Args:
            log_callback: 日志回调函数 (message, level)
        """
        self._log_callback = log_callback
        
        # FastGPT 配置
        self._fastgpt_enabled = False
        self._fastgpt_base_url = ""
        self._fastgpt_api_key = ""
        self._fastgpt_timeout = 60
        
        # 用户 chat_id 持久化缓存
        self._user_chat_ids: dict[str, str] = {}

    def _log(self, message: str, level: str = "info") -> None:
        """记录日志."""
        if self._log_callback:
            self._log_callback(message, level)
        else:
            if level == "error":
                logger.error(f"[ReplyGen] {message}")
            else:
                logger.info(f"[ReplyGen] {message}")

    def configure_fastgpt(
        self,
        enabled: bool,
        base_url: str = "",
        api_key: str = "",
        timeout: int = 60,
    ) -> None:
        """配置 FastGPT.
        
        Args:
            enabled: 是否启用
            base_url: API 地址
            api_key: API Key
            timeout: 超时时间（秒）
        """
        self._fastgpt_enabled = enabled
        self._fastgpt_base_url = base_url
        self._fastgpt_api_key = api_key
        self._fastgpt_timeout = max(10, timeout)

    def get_fastgpt_config(self) -> dict:
        """获取 FastGPT 配置."""
        return {
            "fastgpt_enabled": self._fastgpt_enabled,
            "fastgpt_base_url": self._fastgpt_base_url,
            "fastgpt_api_key": self._fastgpt_api_key,
            "fastgpt_timeout": self._fastgpt_timeout,
        }

    def _get_fastgpt_chat_id(self, user_id: str) -> str:
        """根据用户ID获取或生成唯一的chatId.
        
        使用持久化缓存，确保同一用户始终使用相同的 chat_id。
        """
        if user_id not in self._user_chat_ids:
            # 生成稳定的 chat_id
            self._user_chat_ids[user_id] = hashlib.md5(user_id.encode()).hexdigest()[:16]
        return self._user_chat_ids[user_id]

    def _call_fastgpt(self, user_id: str, message: str) -> str | None:
        """调用 FastGPT API 获取回复.
        
        Args:
            user_id: 用户标识（用于生成 chat_id）
            message: 用户消息
            
        Returns:
            回复内容，失败返回 None
        """
        if not self._fastgpt_enabled or not self._fastgpt_base_url or not self._fastgpt_api_key:
            return None

        try:
            chat_id = self._get_fastgpt_chat_id(user_id)
            self._log(f"[FastGPT] 用户: {user_id}, ChatID: {chat_id[:8]}...")

            resp = requests.post(
                self._fastgpt_base_url,
                headers={
                    "Authorization": f"Bearer {self._fastgpt_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "chatId": chat_id,
                    "stream": False,
                    "detail": False,
                    "messages": [{"role": "user", "content": message}],
                },
                timeout=self._fastgpt_timeout,
            )

            if resp.status_code == 200:
                data = resp.json()
                choices = data.get("choices", [])
                if choices:
                    reply = choices[0].get("message", {}).get("content", "")
                    if reply:
                        self._log("[FastGPT] 回复成功")
                        return reply

            self._log(f"[FastGPT] 响应异常: {resp.status_code}", "error")
            return None

        except requests.Timeout:
            self._log("[FastGPT] 请求超时", "error")
            return None
        except Exception as e:
            self._log(f"[FastGPT] 错误: {e}", "error")
            return None

    def generate_reply(self, message: str, sender_name: str = "用户") -> str:
        """根据消息内容生成回复.
        
        优先使用 FastGPT，失败则降级到关键词匹配。
        
        Args:
            message: 用户消息
            sender_name: 发送者名称（用于 FastGPT chat_id）
            
        Returns:
            生成的回复内容
        """
        # 优先使用 FastGPT
        if self._fastgpt_enabled:
            fastgpt_reply = self._call_fastgpt(sender_name, message)
            if fastgpt_reply:
                return fastgpt_reply
            self._log("FastGPT 未返回有效回复，使用关键词匹配")

        # 降级到关键词匹配
        return self._keyword_reply(message)

    def _keyword_reply(self, message: str) -> str:
        """基于关键词生成回复.
        
        Args:
            message: 用户消息
            
        Returns:
            匹配的回复内容
        """
        msg = message.lower()

        # 问候
        if any(w in msg for w in ["你好", "hi", "hello", "嗨", "在吗", "在不在", "在么"]):
            return "你好！有什么可以帮你的吗？"

        # 感谢
        if any(w in msg for w in ["谢谢", "感谢", "thanks", "thank", "3q"]):
            return "不客气！"

        # 价格
        if any(w in msg for w in ["多少钱", "价格", "怎么卖", "什么价", "报价"]):
            return "您好，价格请私聊详谈～"

        # 询问
        if any(w in msg for w in ["怎么", "如何", "能不能", "可以吗", "能吗"]):
            return "您好，请问具体是什么问题呢？"

        # 好的/收到
        if any(w in msg for w in ["好的", "好", "ok", "收到", "明白"]):
            return "好的～"

        # 默认
        return "收到，感谢您的消息！"
