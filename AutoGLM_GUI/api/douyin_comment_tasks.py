"""抖音评论引流任务 API 路由."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from AutoGLM_GUI.douyin.comment_task_manager import (
    DEFAULT_COMMENT,
    DEFAULT_CONTENT,
    DEFAULT_EXECUTION,
    DEFAULT_INTERACTION,
    DEFAULT_VIDEO_FILTER,
    douyin_comment_task_manager,
)

router = APIRouter()


# ==================== 请求/响应模型 ====================


class VideoFilterConfig(BaseModel):
    """视频筛选配置."""
    min_likes: int = DEFAULT_VIDEO_FILTER["min_likes"]
    max_likes: int = DEFAULT_VIDEO_FILTER["max_likes"]
    publish_time: str = DEFAULT_VIDEO_FILTER["publish_time"]  # default, day, week, half_year
    sort_by: str = DEFAULT_VIDEO_FILTER["sort_by"]  # latest, most_liked, default


class InteractionConfig(BaseModel):
    """互动行为配置."""
    watch_video: bool = DEFAULT_INTERACTION["watch_video"]
    watch_duration_ratio: float = DEFAULT_INTERACTION["watch_duration_ratio"]
    like_video: bool = DEFAULT_INTERACTION["like_video"]
    favorite_video: bool = DEFAULT_INTERACTION["favorite_video"]
    like_probability: float = DEFAULT_INTERACTION["like_probability"]


class CommentConfig(BaseModel):
    """评论配置."""
    mode: str = DEFAULT_COMMENT["mode"]  # reply: 回复评论, direct: 直接评论
    reply_ratio: float = DEFAULT_COMMENT["reply_ratio"]
    max_replies_per_video: int = DEFAULT_COMMENT["max_replies_per_video"]
    min_replies_per_video: int = DEFAULT_COMMENT["min_replies_per_video"]
    target_hot_comments: bool = DEFAULT_COMMENT["target_hot_comments"]
    target_question_comments: bool = DEFAULT_COMMENT["target_question_comments"]
    target_regions: list[str] = DEFAULT_COMMENT["target_regions"]
    reply_interval_min: int = DEFAULT_COMMENT["reply_interval_min"]
    reply_interval_max: int = DEFAULT_COMMENT["reply_interval_max"]


class ContentConfig(BaseModel):
    """评论内容配置."""
    use_ai: bool = DEFAULT_CONTENT["use_ai"]
    style: str = DEFAULT_CONTENT["style"]
    templates: list[str] = DEFAULT_CONTENT["templates"]


class ExecutionConfig(BaseModel):
    """执行配置."""
    videos_per_run: int = DEFAULT_EXECUTION["videos_per_run"]
    video_interval_min: int = DEFAULT_EXECUTION["video_interval_min"]
    video_interval_max: int = DEFAULT_EXECUTION["video_interval_max"]


class TaskCreateRequest(BaseModel):
    """创建任务请求."""
    name: str
    device_id: str
    search_keywords: list[str]
    video_filter: VideoFilterConfig | None = None
    interaction: InteractionConfig | None = None
    comment: CommentConfig | None = None
    content: ContentConfig | None = None
    execution: ExecutionConfig | None = None
    cron_expression: str | None = None
    end_time: str | None = None
    enabled: bool = True


class TaskUpdateRequest(BaseModel):
    """更新任务请求."""
    name: str | None = None
    device_id: str | None = None
    search_keywords: list[str] | None = None
    video_filter: VideoFilterConfig | None = None
    interaction: InteractionConfig | None = None
    comment: CommentConfig | None = None
    content: ContentConfig | None = None
    execution: ExecutionConfig | None = None
    cron_expression: str | None = None
    end_time: str | None = None


class TaskResponse(BaseModel):
    """任务响应."""
    uuid: str
    name: str
    device_id: str
    search_keywords: list[str]
    video_filter: dict
    interaction: dict
    comment: dict
    content: dict
    execution: dict
    cron_expression: str | None
    end_time: str | None = None
    status: str
    created_at: str
    updated_at: str
    last_run: str | None
    next_run: str | None


class TaskListResponse(BaseModel):
    """任务列表响应."""
    tasks: list[TaskResponse]


class HistoryResponse(BaseModel):
    """执行历史响应."""
    uuid: str
    task_uuid: str
    task_name: str
    device_id: str
    started_at: str
    finished_at: str | None
    status: str
    videos_processed: int
    comments_sent: int
    error: str | None
    result: str | None = None
    details: list[dict] | None = None

    model_config = {"extra": "ignore"}  # 忽略额外字段


class HistoryListResponse(BaseModel):
    """执行历史列表响应."""
    history: list[HistoryResponse]


# ==================== API 路由 ====================


@router.get("/tasks", response_model=TaskListResponse)
def list_tasks():
    """获取所有评论任务."""
    tasks = douyin_comment_task_manager.list_tasks()
    return TaskListResponse(tasks=[TaskResponse(**t) for t in tasks])


@router.get("/tasks/{task_uuid}", response_model=TaskResponse)
def get_task(task_uuid: str):
    """获取单个任务."""
    task = douyin_comment_task_manager.get_task(task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/tasks", response_model=TaskResponse)
def create_task(request: TaskCreateRequest):
    """创建评论任务."""
    try:
        task = douyin_comment_task_manager.create_task(
            name=request.name,
            device_id=request.device_id,
            search_keywords=request.search_keywords,
            video_filter=request.video_filter.model_dump() if request.video_filter else None,
            interaction=request.interaction.model_dump() if request.interaction else None,
            comment=request.comment.model_dump() if request.comment else None,
            content=request.content.model_dump() if request.content else None,
            execution=request.execution.model_dump() if request.execution else None,
            cron_expression=request.cron_expression,
            end_time=request.end_time,
            enabled=request.enabled,
        )
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/tasks/{task_uuid}", response_model=TaskResponse)
def update_task(task_uuid: str, request: TaskUpdateRequest):
    """更新任务."""
    try:
        update_data = {}
        if request.name is not None:
            update_data["name"] = request.name
        if request.device_id is not None:
            update_data["device_id"] = request.device_id
        if request.search_keywords is not None:
            update_data["search_keywords"] = request.search_keywords
        if request.video_filter is not None:
            update_data["video_filter"] = request.video_filter.model_dump()
        if request.interaction is not None:
            update_data["interaction"] = request.interaction.model_dump()
        if request.comment is not None:
            update_data["comment"] = request.comment.model_dump()
        if request.content is not None:
            update_data["content"] = request.content.model_dump()
        if request.execution is not None:
            update_data["execution"] = request.execution.model_dump()
        if request.cron_expression is not None:
            update_data["cron_expression"] = request.cron_expression
        if request.end_time is not None:
            update_data["end_time"] = request.end_time if request.end_time else None

        task = douyin_comment_task_manager.update_task(task_uuid, **update_data)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return task
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/tasks/{task_uuid}")
def delete_task(task_uuid: str):
    """删除任务."""
    success = douyin_comment_task_manager.delete_task(task_uuid)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"success": True, "message": "Task deleted"}


@router.post("/tasks/{task_uuid}/enable", response_model=TaskResponse)
def enable_task(task_uuid: str):
    """启用任务."""
    task = douyin_comment_task_manager.enable_task(task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/tasks/{task_uuid}/disable", response_model=TaskResponse)
def disable_task(task_uuid: str):
    """禁用任务."""
    task = douyin_comment_task_manager.disable_task(task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/tasks/{task_uuid}/run")
def run_task_now(task_uuid: str):
    """立即执行任务."""
    task = douyin_comment_task_manager.get_task(task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if douyin_comment_task_manager.is_task_running(task_uuid):
        raise HTTPException(status_code=409, detail="Task is already running")

    success = douyin_comment_task_manager.run_task_now(task_uuid)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to start task")

    return {"success": True, "message": "Task started"}


@router.post("/tasks/{task_uuid}/abort")
def abort_task(task_uuid: str):
    """中止正在运行的任务."""
    task = douyin_comment_task_manager.get_task(task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # 检查任务状态，如果状态是 running 但实际没在运行（比如强行关闭后），也允许重置
    if task.get("status") == "running" and not douyin_comment_task_manager.is_task_running(task_uuid):
        # 任务状态不一致，重置为 enabled
        from AutoGLM_GUI.base_task_manager import TaskStatus
        douyin_comment_task_manager._update_task_status(task_uuid, TaskStatus.ENABLED)
        return {"success": True, "message": "Task status reset (was stale)"}
    
    if not douyin_comment_task_manager.is_task_running(task_uuid):
        raise HTTPException(status_code=409, detail="Task is not running")

    success = douyin_comment_task_manager.abort_task(task_uuid)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to abort task")

    return {"success": True, "message": "Task aborted"}


@router.get("/tasks/{task_uuid}/history", response_model=HistoryListResponse)
def get_task_history(task_uuid: str, limit: int = 50):
    """获取任务执行历史."""
    history = douyin_comment_task_manager.get_history(task_uuid, limit)
    return HistoryListResponse(history=[HistoryResponse(**h) for h in history])


@router.get("/history", response_model=HistoryListResponse)
def get_all_history(limit: int = 50):
    """获取所有执行历史."""
    history = douyin_comment_task_manager.get_history(None, limit)
    return HistoryListResponse(history=[HistoryResponse(**h) for h in history])


# ==================== 数据统计 API ====================


class ReplyStatsResponse(BaseModel):
    """回复统计响应."""
    total_replies: int = 0
    unique_videos: int = 0
    unique_users: int = 0
    task_count: int | None = None


class ReplyRecordResponse(BaseModel):
    """回复记录响应."""
    id: int
    task_uuid: str
    video_author: str
    video_title: str = ""
    replied_user: str
    original_comment: str = ""
    reply_content: str = ""
    reply_type: str
    replied_at: str


class ReplyListResponse(BaseModel):
    """回复记录列表响应."""
    records: list[ReplyRecordResponse]
    total: int


class DailyStatResponse(BaseModel):
    """每日统计响应."""
    date: str
    reply_count: int
    video_count: int


class DailyStatsResponse(BaseModel):
    """每日统计列表响应."""
    stats: list[DailyStatResponse]


@router.get("/stats/replies", response_model=ReplyStatsResponse)
def get_reply_stats(task_uuid: str | None = None, days: int = 30):
    """获取回复统计数据."""
    from AutoGLM_GUI.douyin.reply_history_db import reply_history_db
    stats = reply_history_db.get_reply_stats(task_uuid, days)
    return ReplyStatsResponse(
        total_replies=stats.get("total_replies") or 0,
        unique_videos=stats.get("unique_videos") or 0,
        unique_users=stats.get("unique_users") or 0,
        task_count=stats.get("task_count"),
    )


@router.get("/stats/replies/list", response_model=ReplyListResponse)
def get_reply_list(
    task_uuid: str | None = None, 
    days: int = 7, 
    limit: int = 100,
    offset: int = 0,
):
    """获取回复记录列表."""
    from AutoGLM_GUI.douyin.reply_history_db import reply_history_db
    records = reply_history_db.get_reply_list(task_uuid, days, limit, offset)
    # 处理 None 值
    for r in records:
        if r.get("video_title") is None:
            r["video_title"] = ""
        if r.get("original_comment") is None:
            r["original_comment"] = ""
        if r.get("reply_content") is None:
            r["reply_content"] = ""
    # 获取总数用于分页
    stats = reply_history_db.get_reply_stats(task_uuid, days)
    return ReplyListResponse(
        records=[ReplyRecordResponse(**r) for r in records],
        total=stats.get("total_replies", 0),
    )


@router.get("/stats/replies/daily", response_model=DailyStatsResponse)
def get_daily_stats(task_uuid: str | None = None, days: int = 7):
    """获取每日回复统计."""
    from AutoGLM_GUI.douyin.reply_history_db import reply_history_db
    stats = reply_history_db.get_daily_stats(task_uuid, days)
    return DailyStatsResponse(stats=[DailyStatResponse(**s) for s in stats])
