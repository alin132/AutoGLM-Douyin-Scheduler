---
id: configuration
title: 模型配置
---

## 🎯 模型服务配置

AutoGLM-GUI 只需要一个 OpenAI 兼容的模型服务。你可以：

- 使用官方已托管的第三方服务
  - 智谱 BigModel：`--base-url https://open.bigmodel.cn/api/paas/v4`，`--model autoglm-phone`，`--apikey <你的 API Key>`
  - ModelScope：`--base-url https://api-inference.modelscope.cn/v1`，`--model ZhipuAI/AutoGLM-Phone-9B`，`--apikey <你的 API Key>`
- 或自建服务：参考上游项目的[部署文档](https://github.com/zai-org/Open-AutoGLM/blob/main/README.md)用 vLLM/SGLang 部署 `zai-org/AutoGLM-Phone-9B`，启动 OpenAI 兼容端口后将 `--base-url` 指向你的服务。

示例：

```bash
# 使用智谱 BigModel
pip install autoglm-gui
autoglm-gui \
  --base-url https://open.bigmodel.cn/api/paas/v4 \
  --model autoglm-phone \
  --apikey sk-xxxxx

# 使用 ModelScope
pip install autoglm-gui
autoglm-gui \
  --base-url https://api-inference.modelscope.cn/v1 \
  --model ZhipuAI/AutoGLM-Phone-9B \
  --apikey sk-xxxxx

# 指向你自建的 vLLM/SGLang 服务
pip install autoglm-gui
autoglm-gui --base-url http://localhost:8000/v1 --model autoglm-phone-9b
```

## 🧵 模型并发限制（避免多任务同时打满模型）

当多个定时任务同时触发时，会并发请求三个模型。你可以通过环境变量限制并发，系统会自动排队：

- `AUTOGLM_MAX_CONCURRENT_EXECUTION`：执行模型并发数（默认 2）
- `AUTOGLM_MAX_CONCURRENT_DECISION`：决策模型并发数（默认 2）
- `AUTOGLM_MAX_CONCURRENT_REPLY`：回复模型并发数（默认 2）

示例：

```bash
set AUTOGLM_MAX_CONCURRENT_EXECUTION=1
set AUTOGLM_MAX_CONCURRENT_DECISION=1
set AUTOGLM_MAX_CONCURRENT_REPLY=1
```

### 热更新并发限制

除了通过环境变量在启动时设置，你还可以在运行时通过 API 调整并发限制：

```bash
# 查看当前限制
curl http://localhost:8888/api/config/concurrency

# 更新限制
curl -X PUT http://localhost:8888/api/config/concurrency \
  -H "Content-Type: application/json" \
  -d '{"execution": 3, "decision": 3, "reply": 3}'
```

新限制只对后续请求生效，不会影响已在运行的请求。

## ⏱️ 抖音评论引流：定时任务稳定性策略（不堆积）

为了避免多个任务在整点/整十分钟同时启动造成尖峰、以及连续失败时反复打设备/模型，抖音评论引流定时任务内置以下策略：

- **错峰（stagger）**：按任务 uuid 固定偏移 **0~30 秒**
- **抖动（jitter）**：每次调度再随机增加 **0~10 秒**
- **连续失败退避**：失败后会“跳过”若干个 cron 触发点（不补跑，最多跳过 **7 次**）
- **自动暂停**：连续失败达到 **3 次**会把任务自动置为 **disabled**（需要手动再次启用）
- **任务超时保护**：单次任务执行超过 **30 分钟**会自动中止，记录为 FAILED

说明：
- 这些策略不会“补跑”，目标是**稳定、不堆积**。
- 任务被自动暂停后，你可以在前端任务列表点击“启用”恢复运行（会清零连续失败计数）。

## 🔔 实时状态推送（WebSocket）

前端通过 WebSocket 接收任务状态变化事件，无需轮询：

- 任务启动时推送 `task_started` 事件
- 任务完成时推送 `task_finished` 事件
- 任务中止时推送 `task_aborted` 事件

事件通过 Socket.IO 的 `task-event` 频道广播，负载包含 `task_uuid`, `task_name`, `status` 等字段。
