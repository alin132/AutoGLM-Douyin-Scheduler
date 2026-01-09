"""抖音私信自动回复 API 路由."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from AutoGLM_GUI.douyin.auto_reply_manager import douyin_auto_reply_manager
from AutoGLM_GUI.douyin.message_monitor import douyin_message_monitor

router = APIRouter()


# Request/Response Models
class DouyinRuleCreate(BaseModel):
    """创建规则请求."""

    name: str
    trigger_pattern: str
    trigger_type: str = "keyword"  # keyword, regex
    reply_message: str
    device_id: str
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("name cannot be empty")
        if len(v) > 100:
            raise ValueError("name too long (max 100 characters)")
        return v.strip()

    @field_validator("trigger_pattern")
    @classmethod
    def validate_trigger_pattern(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("trigger_pattern cannot be empty")
        if len(v) > 1000:
            raise ValueError("trigger_pattern too long (max 1000 characters)")
        return v.strip()

    @field_validator("trigger_type")
    @classmethod
    def validate_trigger_type(cls, v: str) -> str:
        valid_types = ["keyword", "regex"]
        if v not in valid_types:
            raise ValueError(f"trigger_type must be one of {valid_types}")
        return v

    @field_validator("reply_message")
    @classmethod
    def validate_reply_message(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("reply_message cannot be empty")
        if len(v) > 5000:
            raise ValueError("reply_message too long (max 5000 characters)")
        return v.strip()


class DouyinRuleUpdate(BaseModel):
    """更新规则请求."""

    name: str | None = None
    trigger_pattern: str | None = None
    trigger_type: str | None = None
    reply_message: str | None = None
    device_id: str | None = None
    enabled: bool | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not v.strip():
            raise ValueError("name cannot be empty")
        if len(v) > 100:
            raise ValueError("name too long (max 100 characters)")
        return v.strip()

    @field_validator("trigger_pattern")
    @classmethod
    def validate_trigger_pattern(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not v.strip():
            raise ValueError("trigger_pattern cannot be empty")
        if len(v) > 1000:
            raise ValueError("trigger_pattern too long (max 1000 characters)")
        return v.strip()

    @field_validator("trigger_type")
    @classmethod
    def validate_trigger_type(cls, v: str | None) -> str | None:
        if v is None:
            return None
        valid_types = ["keyword", "regex"]
        if v not in valid_types:
            raise ValueError(f"trigger_type must be one of {valid_types}")
        return v

    @field_validator("reply_message")
    @classmethod
    def validate_reply_message(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not v.strip():
            raise ValueError("reply_message cannot be empty")
        if len(v) > 5000:
            raise ValueError("reply_message too long (max 5000 characters)")
        return v.strip()


class TestRuleRequest(BaseModel):
    """测试规则请求."""

    test_message: str

    @field_validator("test_message")
    @classmethod
    def validate_test_message(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("test_message cannot be empty")
        return v.strip()


# Routes
@router.get("/rules")
async def list_rules():
    """获取所有规则."""
    return douyin_auto_reply_manager.list_rules()


@router.get("/rules/{rule_uuid}")
async def get_rule(rule_uuid: str):
    """获取单个规则."""
    rule = douyin_auto_reply_manager.get_rule(rule_uuid)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.post("/rules")
async def create_rule(data: DouyinRuleCreate):
    """创建新规则."""
    rule = douyin_auto_reply_manager.create_rule(
        name=data.name,
        trigger_pattern=data.trigger_pattern,
        trigger_type=data.trigger_type,
        reply_message=data.reply_message,
        device_id=data.device_id,
        enabled=data.enabled,
    )
    return rule


@router.put("/rules/{rule_uuid}")
async def update_rule(rule_uuid: str, data: DouyinRuleUpdate):
    """更新规则."""
    rule = douyin_auto_reply_manager.update_rule(
        rule_uuid,
        name=data.name,
        trigger_pattern=data.trigger_pattern,
        trigger_type=data.trigger_type,
        reply_message=data.reply_message,
        device_id=data.device_id,
        enabled=data.enabled,
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.delete("/rules/{rule_uuid}")
async def delete_rule(rule_uuid: str):
    """删除规则."""
    success = douyin_auto_reply_manager.delete_rule(rule_uuid)
    if not success:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"success": True}


@router.post("/rules/{rule_uuid}/enable")
async def enable_rule(rule_uuid: str):
    """启用规则."""
    rule = douyin_auto_reply_manager.enable_rule(rule_uuid)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.post("/rules/{rule_uuid}/disable")
async def disable_rule(rule_uuid: str):
    """禁用规则."""
    rule = douyin_auto_reply_manager.disable_rule(rule_uuid)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.post("/rules/{rule_uuid}/test")
async def test_rule(rule_uuid: str, data: TestRuleRequest):
    """测试规则是否匹配."""
    result = douyin_auto_reply_manager.test_rule(rule_uuid, data.test_message)
    return result


@router.get("/history")
async def get_history(limit: int = 50):
    """获取执行历史."""
    return douyin_auto_reply_manager.get_history(limit)


@router.delete("/history")
async def clear_history():
    """清空执行历史."""
    douyin_auto_reply_manager.clear_history()
    return {"success": True}


# ==================== 消息监控 API ====================


class MonitorConfigUpdate(BaseModel):
    """更新监控配置请求."""

    device_id: str | None = None
    check_interval: int | None = None
    auto_reply_enabled: bool | None = None
    reply_prompt_template: str | None = None
    fastgpt_enabled: bool | None = None
    fastgpt_base_url: str | None = None
    fastgpt_api_key: str | None = None
    fastgpt_timeout: int | None = None

    @field_validator("check_interval")
    @classmethod
    def validate_check_interval(cls, v: int | None) -> int | None:
        if v is not None and v < 10:
            raise ValueError("check_interval must be at least 10 seconds")
        return v

    @field_validator("fastgpt_timeout")
    @classmethod
    def validate_fastgpt_timeout(cls, v: int | None) -> int | None:
        if v is not None and v < 10:
            raise ValueError("fastgpt_timeout must be at least 10 seconds")
        return v


class MonitorStartRequest(BaseModel):
    """启动监控请求."""

    device_id: str | None = None


@router.get("/monitor/status")
async def get_monitor_status():
    """获取监控状态."""
    return douyin_message_monitor.get_status()


@router.get("/monitor/config")
async def get_monitor_config():
    """获取监控配置."""
    return douyin_message_monitor.get_config()


@router.put("/monitor/config")
async def update_monitor_config(data: MonitorConfigUpdate):
    """更新监控配置."""
    return douyin_message_monitor.update_config(
        device_id=data.device_id,
        check_interval=data.check_interval,
        auto_reply_enabled=data.auto_reply_enabled,
        reply_prompt_template=data.reply_prompt_template,
        fastgpt_enabled=data.fastgpt_enabled,
        fastgpt_base_url=data.fastgpt_base_url,
        fastgpt_api_key=data.fastgpt_api_key,
        fastgpt_timeout=data.fastgpt_timeout,
    )


@router.post("/monitor/start")
async def start_monitor(data: MonitorStartRequest | None = None):
    """启动监控."""
    device_id = data.device_id if data else None
    return await douyin_message_monitor.start(device_id)


@router.post("/monitor/stop")
async def stop_monitor():
    """停止监控."""
    return await douyin_message_monitor.stop()


@router.post("/monitor/pause")
async def pause_monitor():
    """暂停监控."""
    return await douyin_message_monitor.pause()


@router.post("/monitor/resume")
async def resume_monitor():
    """恢复监控."""
    return await douyin_message_monitor.resume()


@router.post("/monitor/test")
async def test_monitor_once():
    """执行一次测试."""
    return await douyin_message_monitor.test_once()


@router.get("/monitor/history")
async def get_monitor_history(limit: int = 50):
    """获取监控回复历史."""
    return douyin_message_monitor.get_history(limit)


@router.delete("/monitor/history")
async def clear_monitor_history():
    """清空监控回复历史."""
    douyin_message_monitor.clear_history()
    return {"success": True}


@router.get("/monitor/logs")
async def get_monitor_logs(limit: int = 50):
    """获取监控日志."""
    return douyin_message_monitor.get_logs(limit)
