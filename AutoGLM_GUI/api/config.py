"""Configuration API endpoints for hot config reload."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from AutoGLM_GUI.model_limiter import (
    decision_limiter,
    execution_limiter,
    reply_limiter,
)

router = APIRouter(prefix="/api/config", tags=["config"])


class ConcurrencyLimits(BaseModel):
    """Model concurrency limits."""

    execution: int = Field(..., ge=1, le=100, description="Execution model concurrency limit")
    decision: int = Field(..., ge=1, le=100, description="Decision model concurrency limit")
    reply: int = Field(..., ge=1, le=100, description="Reply model concurrency limit")


class ConcurrencyLimitsResponse(ConcurrencyLimits):
    """Response model with current concurrency limits."""

    pass


@router.get("/concurrency", response_model=ConcurrencyLimitsResponse)
async def get_concurrency_limits() -> ConcurrencyLimitsResponse:
    """获取当前模型并发限制."""
    return ConcurrencyLimitsResponse(
        execution=execution_limiter.limit,
        decision=decision_limiter.limit,
        reply=reply_limiter.limit,
    )


@router.put("/concurrency", response_model=ConcurrencyLimitsResponse)
async def update_concurrency_limits(
    limits: ConcurrencyLimits,
) -> ConcurrencyLimitsResponse:
    """热更新模型并发限制.

    新限制只对后续请求生效，不影响已在运行的请求。
    """
    try:
        execution_limiter.update_limit(limits.execution)
        decision_limiter.update_limit(limits.decision)
        reply_limiter.update_limit(limits.reply)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return ConcurrencyLimitsResponse(
        execution=execution_limiter.limit,
        decision=decision_limiter.limit,
        reply=reply_limiter.limit,
    )
