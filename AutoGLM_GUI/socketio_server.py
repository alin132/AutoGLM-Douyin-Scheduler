"""Socket.IO server for Scrcpy video streaming."""

from __future__ import annotations

import asyncio
import time

from typing_extensions import NotRequired, TypedDict

import socketio

from AutoGLM_GUI.logger import logger
from AutoGLM_GUI.scrcpy_protocol import ScrcpyMediaStreamPacket
from AutoGLM_GUI.scrcpy_stream import ScrcpyStreamer


class VideoPacketPayload(TypedDict):
    type: str
    data: bytes
    timestamp: int
    keyframe: NotRequired[bool | None]
    pts: NotRequired[int | None]


sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    server_kwargs={"socketio_path": "/socket.io"},
)

_socket_streamers: dict[str, ScrcpyStreamer] = {}
_stream_tasks: dict[str, asyncio.Task] = {}
_device_locks: dict[
    str, asyncio.Lock
] = {}  # Lock per device to prevent concurrent connections
_sid_device_keys: dict[str, str] = {}


async def _stop_stream_for_sid(sid: str) -> None:
    task = _stream_tasks.pop(sid, None)
    if task:
        task.cancel()

    streamer = _socket_streamers.pop(sid, None)
    if streamer:
        streamer.stop()
    _sid_device_keys.pop(sid, None)


def _classify_error(exc: Exception) -> dict:
    """Classify error and return user-friendly message."""
    error_str = str(exc)

    if "Address already in use" in error_str or (
        "Port" in error_str and "occupied" in error_str
    ):
        return {
            "message": "端口冲突，视频流端口仍被占用。通常会自动解决，如果持续出现请重启应用。",
            "type": "port_conflict",
            "technical_details": error_str,
        }
    elif "Device" in error_str and (
        "not available" in error_str or "not found" in error_str
    ):
        return {
            "message": "设备无响应，请检查 USB/WiFi 连接。",
            "type": "device_offline",
            "technical_details": error_str,
        }
    elif "timeout" in error_str.lower() or "timed out" in error_str.lower():
        return {
            "message": "连接超时，请检查设备连接后重试。",
            "type": "timeout",
            "technical_details": error_str,
        }
    elif "Failed to connect" in error_str:
        return {
            "message": "无法连接到 scrcpy 服务器，请检查设备连接。",
            "type": "connection_failed",
            "technical_details": error_str,
        }
    else:
        return {
            "message": error_str,
            "type": "unknown",
            "technical_details": error_str,
        }


def stop_streamers(device_id: str | None = None) -> None:
    """Stop active scrcpy streamers (all or by device)."""
    sids = list(_socket_streamers.keys())
    for sid in sids:
        streamer = _socket_streamers.get(sid)
        if not streamer:
            continue
        if device_id:
            try:
                from AutoGLM_GUI.device_manager import DeviceManager

                device_manager = DeviceManager.get_instance()
                device_key, actual_device_id = device_manager.resolve_device_ids(
                    device_id
                )
            except Exception:
                device_key, actual_device_id = device_id, device_id

            if _sid_device_keys.get(sid) != device_key and streamer.device_id != actual_device_id:
                continue
        task = _stream_tasks.pop(sid, None)
        if task:
            task.cancel()
        streamer.stop()
        _socket_streamers.pop(sid, None)
        _sid_device_keys.pop(sid, None)


async def _stream_packets(sid: str, streamer: ScrcpyStreamer) -> None:
    try:
        async for packet in streamer.iter_packets():
            payload = _packet_to_payload(packet)
            await sio.emit("video-data", payload, to=sid)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.exception("Video streaming failed: %s", exc)
        try:
            await sio.emit("error", {"message": str(exc)}, to=sid)
        except Exception:
            pass
    finally:
        await _stop_stream_for_sid(sid)


def _packet_to_payload(packet: ScrcpyMediaStreamPacket) -> VideoPacketPayload:
    payload: VideoPacketPayload = {
        "type": packet.type,
        "data": packet.data,
        "timestamp": int(time.time() * 1000),
    }
    if packet.type == "data":
        payload["keyframe"] = packet.keyframe
        payload["pts"] = packet.pts
    return payload


@sio.event
async def connect(sid: str, environ: dict) -> None:
    logger.info("Socket.IO client connected: %s", sid)


@sio.event
async def disconnect(sid: str) -> None:
    logger.info("Socket.IO client disconnected: %s", sid)
    await _stop_stream_for_sid(sid)


# ==================== 任务状态推送 ====================


async def emit_task_event(
    event_type: str,
    task_uuid: str,
    task_name: str,
    status: str,
    extra: dict | None = None,
) -> None:
    """广播任务状态变化事件给所有连接的前端客户端.

    Args:
        event_type: 事件类型，如 "task_started", "task_finished", "task_aborted"
        task_uuid: 任务 UUID
        task_name: 任务名称
        status: 任务状态，如 "running", "enabled", "disabled"
        extra: 额外信息
    """
    payload = {
        "type": event_type,
        "task_uuid": task_uuid,
        "task_name": task_name,
        "status": status,
        **(extra or {}),
    }
    try:
        await sio.emit("task-event", payload)
        logger.debug(f"Emitted task event: {event_type} for {task_uuid}")
    except Exception as e:
        logger.warning(f"Failed to emit task event: {e}")


@sio.on("connect-device")  # type: ignore[misc]
async def connect_device(sid: str, data: dict | None) -> None:
    payload = data or {}
    device_id = payload.get("device_id") or payload.get("deviceId")
    if not device_id:
        await sio.emit(
            "error",
            {"message": "Device ID is required", "type": "invalid_request"},
            to=sid,
        )
        return
    try:
        from AutoGLM_GUI.device_manager import DeviceManager

        device_manager = DeviceManager.get_instance()
        device_key, actual_device_id = device_manager.resolve_device_ids(device_id)
    except Exception:
        device_key, actual_device_id = device_id, device_id

    max_size = int(payload.get("maxSize") or 1280)
    bit_rate = int(payload.get("bitRate") or 4_000_000)

    # Stop any existing stream for this sid
    await _stop_stream_for_sid(sid)

    # Get or create a lock for this device
    if device_key not in _device_locks:
        _device_locks[device_key] = asyncio.Lock()

    device_lock = _device_locks[device_key]

    # Acquire lock to prevent concurrent connections to the same device
    async with device_lock:
        logger.debug(f"Acquired device lock for {device_id}, sid: {sid}")

        # Stop any existing streams for the same device (from other sids)
        sids_to_stop = [
            s
            for s in _socket_streamers.keys()
            if s != sid and _sid_device_keys.get(s) == device_key
        ]
        for s in sids_to_stop:
            logger.info(
                f"Stopping existing stream for device {device_key} from sid {s}"
            )
            await _stop_stream_for_sid(s)

        # Auto-connect WiFi/mDNS devices before starting scrcpy
        if ":" in actual_device_id and not actual_device_id.startswith("emulator"):
            # This is a network device (IP:port), try to connect first
            from AutoGLM_GUI.adb import ADBConnection
            
            try:
                adb_conn = ADBConnection()
                # Check if already connected
                devices = adb_conn.list_devices()
                if not any(d.device_id == actual_device_id for d in devices):
                    logger.info(f"Auto-connecting to WiFi device: {actual_device_id}")
                    success, msg = adb_conn.connect(actual_device_id)
                    if not success:
                        logger.warning(
                            f"Failed to auto-connect {actual_device_id}: {msg}"
                        )
                    else:
                        logger.info(f"Successfully connected to {actual_device_id}")
            except Exception as e:
                logger.warning(f"Auto-connect failed for {actual_device_id}: {e}")

        streamer = ScrcpyStreamer(
            device_id=actual_device_id,
            max_size=max_size,
            bit_rate=bit_rate,
        )

        try:
            await streamer.start()  # ScrcpyStreamer has built-in retry logic
            metadata = await streamer.read_video_metadata()
            await sio.emit(
                "video-metadata",
                {
                    "deviceName": metadata.device_name,
                    "width": metadata.width,
                    "height": metadata.height,
                    "codec": metadata.codec,
                },
                to=sid,
            )

            _socket_streamers[sid] = streamer
            _stream_tasks[sid] = asyncio.create_task(_stream_packets(sid, streamer))
            _sid_device_keys[sid] = device_key

        except Exception as exc:
            streamer.stop()
            logger.exception("Failed to start scrcpy stream: %s", exc)
            # Use unified error classification
            error_info = _classify_error(exc)
            await sio.emit("error", error_info, to=sid)
