"""抖音消息解析器模块.

提供消息内容、用户名、未读状态的解析功能。
支持决策模型增强解析和关键词降级匹配。
"""

import json
import re
from typing import TYPE_CHECKING

import requests

from AutoGLM_GUI.config_manager import config_manager
from AutoGLM_GUI.logger import logger

if TYPE_CHECKING:
    from collections.abc import Callable


class MessageParser:
    """消息解析器."""

    def __init__(self, log_callback: "Callable[[str, str], None] | None" = None):
        """初始化解析器.
        
        Args:
            log_callback: 日志回调函数 (message, level)
        """
        self._log_callback = log_callback
        self._decision_model_enabled = False

    def set_decision_model_enabled(self, enabled: bool) -> None:
        """设置是否启用决策模型."""
        self._decision_model_enabled = enabled

    def _log(self, message: str, level: str = "info") -> None:
        """记录日志."""
        if self._log_callback:
            self._log_callback(message, level)
        else:
            if level == "error":
                logger.error(f"[Parser] {message}")
            else:
                logger.info(f"[Parser] {message}")

    def _call_decision_model(self, prompt: str, ai_response: str) -> dict | None:
        """调用决策模型解析 AI 返回结果.
        
        Args:
            prompt: 解析提示词
            ai_response: AutoGLM-Phone 返回的原始结果
            
        Returns:
            解析后的 JSON 字典，失败返回 None
        """
        if not self._decision_model_enabled:
            return None

        # 从全局配置获取决策模型设置
        global_config = config_manager.get_effective_config()
        base_url = global_config.decision_base_url
        api_key = global_config.decision_api_key
        model_name = global_config.decision_model_name

        if not base_url or not model_name:
            self._log("决策模型未配置，请在设置中配置", "error")
            return None

        try:
            full_prompt = f"""{prompt}

AI返回内容：
{ai_response}

请以JSON格式返回结果，不要包含其他内容。"""

            resp = requests.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key or 'EMPTY'}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model_name,
                    "messages": [{"role": "user", "content": full_prompt}],
                    "temperature": 0.1,
                },
                timeout=30,
            )

            if resp.status_code == 200:
                data = resp.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                # 提取 JSON
                json_match = re.search(r"\{[^{}]*\}", content, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group())

            self._log(f"决策模型响应异常: {resp.status_code}", "error")
            return None

        except json.JSONDecodeError as e:
            self._log(f"决策模型返回格式错误: {e}", "error")
            return None
        except Exception as e:
            self._log(f"决策模型调用失败: {e}", "error")
            return None

    def parse_unread_check(self, ai_response: str) -> tuple[bool, str | None]:
        """解析未读消息检查结果.
        
        Args:
            ai_response: AI 返回的原始结果
            
        Returns:
            (has_unread, chat_name): 是否有未读消息，有未读的对话名称
        """
        if self._decision_model_enabled:
            result = self._call_decision_model(
                """分析以下内容，判断抖音私信列表中是否有未读消息。
返回JSON格式：{"has_unread": true/false, "chat_name": "有未读消息的对话名称或null"}""",
                ai_response,
            )
            if result:
                return result.get("has_unread", False), result.get("chat_name")

        # 降级到关键词匹配
        # 优先检查最终结论（通常在末尾）
        # 检查明确的肯定结论
        positive_conclusions = [
            "答案：有未读",
            "答案:有未读",
            "有未读私信",
            "有未读消息",
        ]
        for pattern in positive_conclusions:
            if pattern in ai_response:
                chat_name = self._extract_chat_name(ai_response)
                return True, chat_name

        # 检查明确的否定结论
        negative_conclusions = [
            "答案：没有未读",
            "答案:没有未读",
            "答案：无未读",
            "答案:无未读",
        ]
        for pattern in negative_conclusions:
            if pattern in ai_response:
                return False, None

        # 如果没有明确结论，检查是否提到红色数字（表示有未读）
        unread_indicators = [
            "显示了红色",
            "显示红色",
            "红色数字",
            "红色圆圈",
            "条未读",
            "个未读",
        ]
        for pattern in unread_indicators:
            if pattern in ai_response:
                # 确保不是在否定语境中（如"没有红色数字"）
                # 检查是否有肯定语境
                if "只有" in ai_response or "有1条" in ai_response or "有未读" in ai_response:
                    chat_name = self._extract_chat_name(ai_response)
                    return True, chat_name

        # 最后检查是否明确说没有
        if "没有未读" in ai_response and "有未读" not in ai_response:
            return False, None

        return False, None

    def _extract_chat_name(self, ai_response: str) -> str | None:
        """从 AI 返回结果中提取有未读消息的对话名称."""
        # 尝试匹配 "Xxx" 或 「Xxx」 或 **Xxx** 格式的名字
        patterns = [
            r'"([^"]+)".*?(?:红色|未读)',
            r'「([^」]+)」.*?(?:红色|未读)',
            r'\*\*([^*]+)\*\*.*?(?:红色|未读)',
            r'(?:红色|未读).*?"([^"]+)"',
            r'(?:红色|未读).*?「([^」]+)」',
            r'(?:红色|未读).*?\*\*([^*]+)\*\*',
            r'只有[「"]*([^」"*\s]+)[」"]*',
        ]
        for pattern in patterns:
            match = re.search(pattern, ai_response)
            if match:
                name = match.group(1).strip()
                if name and len(name) < 20:  # 名字不应太长
                    return name
        return None

    def parse_sender_name(self, ai_response: str) -> str:
        """解析对方名字.
        
        Args:
            ai_response: AI 返回的原始结果
            
        Returns:
            解析出的名字，默认返回 "用户"
        """
        if self._decision_model_enabled:
            result = self._call_decision_model(
                """从以下内容中提取对方的名字/昵称。
返回JSON格式：{"name": "名字"}""",
                ai_response,
            )
            if result and result.get("name"):
                return result["name"].replace("**", "").strip()

        # 降级到正则提取
        return self._extract_name(ai_response)

    def parse_message_content(self, ai_response: str) -> str:
        """解析消息内容.
        
        Args:
            ai_response: AI 返回的原始结果
            
        Returns:
            解析出的消息内容
        """
        if self._decision_model_enabled:
            result = self._call_decision_model(
                """从以下内容中提取对方发送的消息内容（白色气泡中的文字）。
返回JSON格式：{"message": "消息内容"}""",
                ai_response,
            )
            if result and result.get("message"):
                return result["message"].replace("**", "").strip()

        # 降级到正则提取
        return self._extract_message_content(ai_response)

    def _extract_message_content(self, raw_result: str) -> str:
        """从 AI 返回结果中提取纯消息内容."""
        if not raw_result:
            return ""

        text = raw_result.strip()

        # 常见的前缀模式，需要去掉
        prefixes = [
            "对方发的最后一条白色气泡消息内容是：",
            "对方发的最后一条白色气泡消息内容是:",
            "对方发的最后一条白色气泡消息是：",
            "对方发的最后一条白色气泡消息是:",
            "对方最后一条消息内容是：",
            "对方最后一条消息内容是:",
            "对方最后一条消息是：",
            "对方最后一条消息是:",
            "最后一条白色气泡消息是：",
            "最后一条白色气泡消息是:",
            "白色气泡消息内容是：",
            "白色气泡消息内容是:",
            "消息内容是：",
            "消息内容是:",
            "内容是：",
            "内容是:",
            "消息：",
            "消息:",
        ]

        for prefix in prefixes:
            if prefix in text:
                text = text.split(prefix, 1)[-1].strip()
                break

        # 去掉可能的引号
        if (
            (text.startswith('"') and text.endswith('"'))
            or (text.startswith("'") and text.endswith("'"))
            or (text.startswith(""") and text.endswith("""))
            or (text.startswith("「") and text.endswith("」"))
        ):
            text = text[1:-1]

        # 去掉 markdown 加粗标记 **
        text = text.replace("**", "")

        return text.strip()

    def _extract_name(self, raw_result: str) -> str:
        """从 AI 返回结果中提取纯名字."""
        if not raw_result:
            return "用户"

        text = raw_result.strip()

        # 常见的前缀模式
        prefixes = [
            "对方的名字是：",
            "对方的名字是:",
            "对方名字是：",
            "对方名字是:",
            "名字是：",
            "名字是:",
            "用户名是：",
            "用户名是:",
            "昵称是：",
            "昵称是:",
        ]

        for prefix in prefixes:
            if prefix in text:
                text = text.split(prefix, 1)[-1].strip()
                break

        # 去掉可能的引号
        if (
            (text.startswith('"') and text.endswith('"'))
            or (text.startswith("'") and text.endswith("'"))
            or (text.startswith(""") and text.endswith("""))
            or (text.startswith("「") and text.endswith("」"))
        ):
            text = text[1:-1]

        # 去掉 markdown 加粗标记 **
        text = text.replace("**", "")

        return text.strip() or "用户"
