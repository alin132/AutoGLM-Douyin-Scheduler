import axios from 'redaxios';

/**
 * 从 axios/redaxios 错误中提取详细的错误信息
 * 优先返回后端 FastAPI HTTPException 的 detail 字段
 */
export function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    // redaxios 错误格式: { data: { detail: string }, status: number }
    const axiosError = error as {
      data?: { detail?: string };
      status?: number;
      message?: string;
    };

    // 优先使用后端返回的 detail 字段
    if (axiosError.data?.detail) {
      return axiosError.data.detail;
    }

    // 其次使用 message 字段
    if (axiosError.message) {
      return axiosError.message;
    }

    // 如果有状态码，返回状态码信息
    if (axiosError.status) {
      return `HTTP error! status: ${axiosError.status}`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

export interface AgentStatus {
  state: 'idle' | 'busy' | 'error' | 'initializing';
  created_at: number;
  last_used: number;
  error_message: string | null;
  model_name: string;
}

export interface Device {
  id: string;
  serial: string; // Hardware serial number (always present)
  model: string;
  status: string;
  connection_type: string;
  state: string;
  is_available_only: boolean;
  display_name: string | null; // Custom display name (null if not set)
  agent: AgentStatus | null; // Agent runtime status (null if not initialized)
}

export interface DeviceListResponse {
  devices: Device[];
}

export interface ChatResponse {
  result: string;
  steps: number;
  success: boolean;
}

export interface StatusResponse {
  version: string;
  initialized: boolean;
  step_count: number;
}

export interface APIModelConfig {
  base_url?: string;
  api_key?: string;
  model_name?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
}

export interface APIAgentConfig {
  max_steps?: number;
  device_id?: string | null;
  verbose?: boolean;
}

export interface InitRequest {
  model_config?: APIModelConfig;
  agent_config?: APIAgentConfig;
  // Agent 类型配置
  agent_type?: string;
  agent_config_params?: Record<string, unknown>;
  // Hot-reload support
  force?: boolean;
}

export interface ScreenshotRequest {
  device_id?: string | null;
}

export interface ScreenshotResponse {
  success: boolean;
  image: string; // base64 encoded PNG
  width: number;
  height: number;
  is_sensitive: boolean;
  error?: string;
}

export interface ThinkingChunkEvent {
  type: 'thinking_chunk';
  role: 'assistant';
  chunk: string;
}

export interface StepEvent {
  type: 'step';
  role: 'assistant';
  step: number;
  thinking: string;
  action: Record<string, unknown>;
  success: boolean;
  finished: boolean;
}

export interface DoneEvent {
  type: 'done';
  role: 'assistant';
  message: string;
  steps: number;
  success: boolean;
}

export interface ErrorEvent {
  type: 'error';
  role: 'assistant';
  message: string;
}

export interface AbortedEvent {
  type: 'aborted';
  role: 'assistant';
  message: string;
}

export type StreamEvent =
  | ThinkingChunkEvent
  | StepEvent
  | DoneEvent
  | ErrorEvent
  | AbortedEvent;

export interface TapRequest {
  x: number;
  y: number;
  device_id?: string | null;
  delay?: number;
}

export interface TapResponse {
  success: boolean;
  error?: string;
}

export interface SwipeRequest {
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
  duration_ms?: number;
  device_id?: string | null;
  delay?: number;
}

export interface SwipeResponse {
  success: boolean;
  error?: string;
}

export interface TouchDownRequest {
  x: number;
  y: number;
  device_id?: string | null;
  delay?: number;
}

export interface TouchDownResponse {
  success: boolean;
  error?: string;
}

export interface TouchMoveRequest {
  x: number;
  y: number;
  device_id?: string | null;
  delay?: number;
}

export interface TouchMoveResponse {
  success: boolean;
  error?: string;
}

export interface TouchUpRequest {
  x: number;
  y: number;
  device_id?: string | null;
  delay?: number;
}

export interface TouchUpResponse {
  success: boolean;
  error?: string;
}

export interface WiFiConnectRequest {
  device_id?: string | null;
  port?: number;
}

export interface WiFiConnectResponse {
  success: boolean;
  message: string;
  device_id?: string;
  address?: string;
  error?: string;
}

export interface WiFiDisconnectResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface WiFiManualConnectRequest {
  ip: string;
  port?: number;
}

export interface WiFiManualConnectResponse {
  success: boolean;
  message: string;
  device_id?: string;
  error?: string;
}

export interface WiFiPairRequest {
  ip: string;
  pairing_port: number;
  pairing_code: string;
  connection_port?: number;
}

export interface WiFiPairResponse {
  success: boolean;
  message: string;
  device_id?: string;
  error?: string;
}

export interface MdnsDevice {
  name: string;
  ip: string;
  port: number;
  has_pairing: boolean;
  service_type: string;
  pairing_port?: number;
}

export interface MdnsDiscoverResponse {
  success: boolean;
  devices: MdnsDevice[];
  error?: string;
}

export interface RemoteDeviceInfo {
  device_id: string;
  model: string;
  platform: string;
  status: string;
}

export interface RemoteDeviceDiscoverRequest {
  base_url: string;
  timeout?: number;
}

export interface RemoteDeviceDiscoverResponse {
  success: boolean;
  devices: RemoteDeviceInfo[];
  message: string;
  error?: string;
}

export interface RemoteDeviceAddRequest {
  base_url: string;
  device_id: string;
}

export interface RemoteDeviceAddResponse {
  success: boolean;
  message: string;
  serial?: string;
  error?: string;
}

export interface RemoteDeviceRemoveRequest {
  serial: string;
}

export interface RemoteDeviceRemoveResponse {
  success: boolean;
  message: string;
  error?: string;
}

export async function listDevices(): Promise<DeviceListResponse> {
  const res = await axios.get<DeviceListResponse>('/api/devices');
  return res.data;
}

export async function getDevices(): Promise<Device[]> {
  const response = await axios.get<DeviceListResponse>('/api/devices');
  return response.data.devices;
}

export async function connectWifi(
  payload: WiFiConnectRequest
): Promise<WiFiConnectResponse> {
  const res = await axios.post<WiFiConnectResponse>(
    '/api/devices/connect_wifi',
    payload
  );
  return res.data;
}

export async function disconnectWifi(
  deviceId: string
): Promise<WiFiDisconnectResponse> {
  const response = await axios.post<WiFiDisconnectResponse>(
    '/api/devices/disconnect_wifi',
    {
      device_id: deviceId,
    }
  );
  return response.data;
}

export async function connectWifiManual(
  payload: WiFiManualConnectRequest
): Promise<WiFiManualConnectResponse> {
  const res = await axios.post<WiFiManualConnectResponse>(
    '/api/devices/connect_wifi_manual',
    payload
  );
  return res.data;
}

export async function pairWifi(
  payload: WiFiPairRequest
): Promise<WiFiPairResponse> {
  const res = await axios.post<WiFiPairResponse>(
    '/api/devices/pair_wifi',
    payload
  );
  return res.data;
}

export async function discoverRemoteDevices(
  payload: RemoteDeviceDiscoverRequest
): Promise<RemoteDeviceDiscoverResponse> {
  const res = await axios.post<RemoteDeviceDiscoverResponse>(
    '/api/devices/discover_remote',
    payload
  );
  return res.data;
}

export async function addRemoteDevice(
  payload: RemoteDeviceAddRequest
): Promise<RemoteDeviceAddResponse> {
  const res = await axios.post<RemoteDeviceAddResponse>(
    '/api/devices/add_remote',
    payload
  );
  return res.data;
}

export async function removeRemoteDevice(
  serial: string
): Promise<RemoteDeviceRemoveResponse> {
  const res = await axios.post<RemoteDeviceRemoveResponse>(
    '/api/devices/remove_remote',
    { serial }
  );
  return res.data;
}

export async function initAgent(
  config?: InitRequest
): Promise<{ success: boolean; message: string; device_id?: string }> {
  const res = await axios.post('/api/init', config ?? {});
  return res.data;
}

export async function sendMessage(message: string): Promise<ChatResponse> {
  const res = await axios.post('/api/chat', { message });
  return res.data;
}

export function sendMessageStream(
  message: string,
  deviceId: string,
  onThinkingChunk: (event: ThinkingChunkEvent) => void,
  onStep: (event: StepEvent) => void,
  onDone: (event: DoneEvent) => void,
  onError: (event: ErrorEvent) => void,
  onAborted?: (event: AbortedEvent) => void
): { close: () => void } {
  const controller = new AbortController();

  fetch('/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, device_id: deviceId }),
    signal: controller.signal,
  })
    .then(async response => {
      if (!response.ok) {
        let errorDetail = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            errorDetail = errorData.detail;
          }
        } catch {
          // 如果无法解析响应体，使用默认的状态码错误
        }
        throw new Error(errorDetail);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = 'message'; // 移到外部，跨 chunks 保持状态

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // 保留最后一行（可能不完整）
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (eventType === 'thinking_chunk') {
                console.log('[SSE] Received thinking_chunk event:', data);
                onThinkingChunk(data as ThinkingChunkEvent);
              } else if (eventType === 'step') {
                console.log('[SSE] Received step event:', data);
                onStep(data as StepEvent);
              } else if (eventType === 'done') {
                console.log('[SSE] Received done event:', data);
                onDone(data as DoneEvent);
              } else if (eventType === 'aborted') {
                console.log('[SSE] Received aborted event:', data);
                if (onAborted) {
                  onAborted(data as AbortedEvent);
                }
              } else if (eventType === 'error') {
                console.log('[SSE] Received error event:', data);
                onError(data as ErrorEvent);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', line, e);
            }
          }
        }
      }
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        // User manually aborted the connection
        if (onAborted) {
          onAborted({
            type: 'aborted',
            role: 'assistant',
            message: 'Connection aborted by user',
          });
        }
      } else {
        onError({ type: 'error', role: 'assistant', message: error.message });
      }
    });

  return {
    close: () => controller.abort(),
  };
}

export async function getStatus(): Promise<StatusResponse> {
  const res = await axios.get('/api/status');
  return res.data;
}

export async function resetChat(deviceId: string): Promise<{
  success: boolean;
  message: string;
  device_id?: string;
}> {
  const res = await axios.post('/api/reset', { device_id: deviceId });
  return res.data;
}

export async function abortChat(deviceId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await axios.post('/api/chat/abort', { device_id: deviceId });
  return res.data;
}

export async function getScreenshot(
  deviceId?: string | null
): Promise<ScreenshotResponse> {
  const res = await axios.post(
    '/api/screenshot',
    { device_id: deviceId ?? null },
    {}
  );
  return res.data;
}

export async function sendTap(
  x: number,
  y: number,
  deviceId?: string | null,
  delay: number = 0
): Promise<TapResponse> {
  const res = await axios.post<TapResponse>('/api/control/tap', {
    x,
    y,
    device_id: deviceId ?? null,
    delay,
  });
  return res.data;
}

export async function sendSwipe(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  durationMs?: number,
  deviceId?: string | null,
  delay: number = 0
): Promise<SwipeResponse> {
  const swipeData = {
    start_x: Math.round(startX),
    start_y: Math.round(startY),
    end_x: Math.round(endX),
    end_y: Math.round(endY),
    duration_ms: Math.round(durationMs || 300),
    device_id: deviceId ?? null,
    delay: Math.round(delay * 1000) / 1000,
  };

  try {
    const res = await axios.post<SwipeResponse>(
      '/api/control/swipe',
      swipeData
    );
    return res.data;
  } catch (error) {
    console.error('[API] Swipe request failed:', error);
    throw error;
  }
}

export async function sendTouchDown(
  x: number,
  y: number,
  deviceId?: string | null,
  delay: number = 0
): Promise<TouchDownResponse> {
  const res = await axios.post<TouchDownResponse>('/api/control/touch/down', {
    x: Math.round(x),
    y: Math.round(y),
    device_id: deviceId ?? null,
    delay,
  });
  return res.data;
}

export async function sendTouchMove(
  x: number,
  y: number,
  deviceId?: string | null,
  delay: number = 0
): Promise<TouchMoveResponse> {
  const res = await axios.post<TouchMoveResponse>('/api/control/touch/move', {
    x: Math.round(x),
    y: Math.round(y),
    device_id: deviceId ?? null,
    delay,
  });
  return res.data;
}

export async function sendTouchUp(
  x: number,
  y: number,
  deviceId?: string | null,
  delay: number = 0
): Promise<TouchUpResponse> {
  const res = await axios.post<TouchUpResponse>('/api/control/touch/up', {
    x: Math.round(x),
    y: Math.round(y),
    device_id: deviceId ?? null,
    delay,
  });
  return res.data;
}

// Configuration Management

export interface ConfigResponse {
  base_url: string;
  model_name: string;
  api_key: string;
  source: string;
  // 双模型配置
  dual_model_enabled: boolean;
  decision_base_url: string;
  decision_model_name: string;
  decision_api_key: string;
  // 回复模型配置
  reply_base_url?: string;
  reply_model_name?: string;
  reply_api_key?: string;
  // Agent 类型配置
  agent_type?: string;
  agent_config_params?: Record<string, unknown>;
  // Agent 执行配置
  default_max_steps: number;
}

export interface ConfigSaveRequest {
  base_url: string;
  model_name: string;
  api_key?: string;
  // 双模型配置
  dual_model_enabled?: boolean;
  decision_base_url?: string;
  decision_model_name?: string;
  decision_api_key?: string;
  // 回复模型配置
  reply_base_url?: string;
  reply_model_name?: string;
  reply_api_key?: string;
  // Agent 类型配置
  agent_type?: string;
  agent_config_params?: Record<string, unknown>;
  // Agent 执行配置
  default_max_steps?: number;
}

export async function getConfig(): Promise<ConfigResponse> {
  const res = await axios.get<ConfigResponse>('/api/config');
  return res.data;
}

export async function saveConfig(
  config: ConfigSaveRequest
): Promise<{ success: boolean; message: string }> {
  const res = await axios.post('/api/config', config);
  return res.data;
}

export async function deleteConfig(): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await axios.delete('/api/config');
  return res.data;
}

export interface ReinitAllAgentsResponse {
  success: boolean;
  total: number;
  succeeded: string[];
  failed: Record<string, string>;
  message: string;
}

export async function reinitAllAgents(): Promise<ReinitAllAgentsResponse> {
  const res = await axios.post<ReinitAllAgentsResponse>(
    '/api/agents/reinit-all'
  );
  return res.data;
}

export interface VersionCheckResponse {
  current_version: string;
  latest_version: string | null;
  has_update: boolean;
  release_url: string | null;
  published_at: string | null;
  error: string | null;
}

export async function checkVersion(): Promise<VersionCheckResponse> {
  const res = await axios.get<VersionCheckResponse>('/api/version/latest');
  return res.data;
}

export async function discoverMdnsDevices(): Promise<MdnsDiscoverResponse> {
  const res = await axios.get<MdnsDiscoverResponse>(
    '/api/devices/discover_mdns'
  );
  return res.data;
}

// QR Code Pairing

export interface QRPairGenerateResponse {
  success: boolean;
  qr_payload?: string;
  session_id?: string;
  expires_at?: number;
  message: string;
  error?: string;
}

export interface QRPairStatusResponse {
  session_id: string;
  status: string; // "listening" | "pairing" | "paired" | "connecting" | "connected" | "timeout" | "error"
  device_id?: string;
  message: string;
  error?: string;
}

export interface QRPairCancelResponse {
  success: boolean;
  message: string;
}

export async function generateQRPairing(
  timeout: number = 90
): Promise<QRPairGenerateResponse> {
  const res = await axios.post<QRPairGenerateResponse>(
    '/api/devices/qr_pair/generate',
    { timeout }
  );
  return res.data;
}

export async function getQRPairingStatus(
  sessionId: string
): Promise<QRPairStatusResponse> {
  const res = await axios.get<QRPairStatusResponse>(
    `/api/devices/qr_pair/status/${sessionId}`
  );
  return res.data;
}

export async function cancelQRPairing(
  sessionId: string
): Promise<QRPairCancelResponse> {
  const res = await axios.delete<QRPairCancelResponse>(
    `/api/devices/qr_pair/${sessionId}`
  );
  return res.data;
}

// ==================== Workflow API ====================

export interface Workflow {
  uuid: string;
  name: string;
  text: string;
}

export interface WorkflowListResponse {
  workflows: Workflow[];
}

export interface WorkflowCreateRequest {
  name: string;
  text: string;
}

export interface WorkflowUpdateRequest {
  name: string;
  text: string;
}

export async function listWorkflows(): Promise<WorkflowListResponse> {
  const res = await axios.get<WorkflowListResponse>('/api/workflows');
  return res.data;
}

export async function getWorkflow(uuid: string): Promise<Workflow> {
  const res = await axios.get<Workflow>(`/api/workflows/${uuid}`);
  return res.data;
}

export async function createWorkflow(
  request: WorkflowCreateRequest
): Promise<Workflow> {
  const res = await axios.post<Workflow>('/api/workflows', request);
  return res.data;
}

export async function updateWorkflow(
  uuid: string,
  request: WorkflowUpdateRequest
): Promise<Workflow> {
  const res = await axios.put<Workflow>(`/api/workflows/${uuid}`, request);
  return res.data;
}

export async function deleteWorkflow(uuid: string): Promise<void> {
  await axios.delete(`/api/workflows/${uuid}`);
}

// ==================== Dual Model API ====================

export interface DualModelInitRequest {
  device_id: string;
  decision_base_url?: string;
  decision_api_key: string;
  decision_model_name?: string;
  vision_base_url?: string;
  vision_api_key?: string;
  vision_model_name?: string;
  thinking_mode?: 'fast' | 'deep' | 'turbo';
  max_steps?: number;
}

export interface DualModelChatRequest {
  device_id: string;
  message: string;
}

// Dual Model SSE Event Types
export interface DualModelDecisionStartEvent {
  type: 'decision_start';
  model: 'decision';
  stage: string;
  task?: string;
  step: number;
  timestamp: number;
}

export interface DualModelDecisionThinkingEvent {
  type: 'decision_thinking';
  model: 'decision';
  chunk: string;
  step: number;
  timestamp: number;
}

export interface DualModelDecisionResultEvent {
  type: 'decision_result';
  model: 'decision';
  decision: {
    action: string;
    target: string;
    reasoning: string;
    content?: string;
    finished: boolean;
  };
  reasoning: string;
  step: number;
  timestamp: number;
}

export interface DualModelTaskPlanEvent {
  type: 'task_plan';
  model: 'decision';
  plan: {
    summary: string;
    steps: string[];
    estimated_actions: number;
  };
  step: number;
  timestamp: number;
}

export interface DualModelVisionStartEvent {
  type: 'vision_start';
  model: 'vision';
  stage: string;
  step: number;
  timestamp: number;
}

export interface DualModelVisionRecognitionEvent {
  type: 'vision_recognition';
  model: 'vision';
  description: string;
  current_app: string;
  elements: string[];
  step: number;
  timestamp: number;
}

export interface DualModelActionStartEvent {
  type: 'action_start';
  model: 'vision';
  action: {
    action: string;
    target: string;
    content?: string;
  };
  step: number;
  timestamp: number;
}

export interface DualModelActionResultEvent {
  type: 'action_result';
  model: 'vision';
  success: boolean;
  action_type: string;
  target: string;
  position?: [number, number];
  message: string;
  step: number;
  timestamp: number;
}

export interface DualModelStepCompleteEvent {
  type: 'step_complete';
  step: number;
  success: boolean;
  finished: boolean;
  timestamp: number;
}

export interface DualModelTaskCompleteEvent {
  type: 'task_complete';
  success: boolean;
  message: string;
  steps: number;
  timestamp: number;
}

export interface DualModelErrorEvent {
  type: 'error';
  message: string;
  timestamp: number;
}

export interface DualModelAbortedEvent {
  type: 'aborted';
  message: string;
  timestamp: number;
}

export type DualModelStreamEvent =
  | DualModelDecisionStartEvent
  | DualModelDecisionThinkingEvent
  | DualModelDecisionResultEvent
  | DualModelTaskPlanEvent
  | DualModelVisionStartEvent
  | DualModelVisionRecognitionEvent
  | DualModelActionStartEvent
  | DualModelActionResultEvent
  | DualModelStepCompleteEvent
  | DualModelTaskCompleteEvent
  | DualModelErrorEvent
  | DualModelAbortedEvent;

export interface DualModelStatusResponse {
  active: boolean;
  device_id?: string;
  state?: {
    decision: {
      active: boolean;
      stage: string;
      thinking: string;
      result: string;
    };
    vision: {
      active: boolean;
      stage: string;
      description: string;
      action: string;
    };
    progress: {
      current_step: number;
      total_steps: number;
      task_plan: string[];
    };
  };
}

export async function initDualModel(
  request: DualModelInitRequest
): Promise<{ success: boolean; message: string; device_id?: string }> {
  const res = await axios.post('/api/dual/init', request);
  return res.data;
}

export function sendDualModelStream(
  message: string,
  deviceId: string,
  onEvent: (event: DualModelStreamEvent) => void,
  onError: (error: Error) => void
): { close: () => void } {
  const controller = new AbortController();

  fetch('/api/dual/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, device_id: deviceId }),
    signal: controller.signal,
  })
    .then(async response => {
      if (!response.ok) {
        let errorDetail = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            errorDetail = errorData.detail;
          }
        } catch {
          // 如果无法解析响应体，使用默认的状态码错误
        }
        throw new Error(errorDetail);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = 'message';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('[DualModel SSE] Received event:', eventType, data);
              onEvent(data as DualModelStreamEvent);
            } catch (e) {
              console.error('Failed to parse SSE data:', line, e);
            }
          }
        }
      }
    })
    .catch(error => {
      if (error.name !== 'AbortError') {
        onError(error);
      }
    });

  return {
    close: () => controller.abort(),
  };
}

export async function abortDualModelChat(deviceId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await axios.post('/api/dual/chat/abort', { device_id: deviceId });
  return res.data;
}

export async function getDualModelStatus(
  deviceId?: string
): Promise<DualModelStatusResponse> {
  const url = deviceId
    ? `/api/dual/status?device_id=${encodeURIComponent(deviceId)}`
    : '/api/dual/status';
  const res = await axios.get<DualModelStatusResponse>(url);
  return res.data;
}

export async function resetDualModel(deviceId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await axios.post('/api/dual/reset', { device_id: deviceId });
  return res.data;
}

// ==================== Layered Agent API ====================

export async function abortLayeredAgentChat(sessionId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await axios.post('/api/layered-agent/abort', {
    session_id: sessionId,
  });
  return res.data;
}

// ==================== History API ====================

export interface MessageRecordResponse {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  thinking?: string | null;
  action?: Record<string, unknown> | null;
  step?: number | null;
}

export interface HistoryRecordResponse {
  id: string;
  task_text: string;
  final_message: string;
  success: boolean;
  steps: number;
  start_time: string;
  end_time: string | null;
  duration_ms: number;
  source: 'chat' | 'layered' | 'scheduled';
  source_detail: string;
  error_message: string | null;
  messages: MessageRecordResponse[];
}

export interface HistoryListResponse {
  records: HistoryRecordResponse[];
  total: number;
  limit: number;
  offset: number;
}

export async function listHistory(
  serialno: string,
  limit: number = 50,
  offset: number = 0
): Promise<HistoryListResponse> {
  const res = await axios.get<HistoryListResponse>(`/api/history/${serialno}`, {
    params: { limit, offset },
  });
  return res.data;
}

export async function getHistoryRecord(
  serialno: string,
  recordId: string
): Promise<HistoryRecordResponse> {
  const res = await axios.get<HistoryRecordResponse>(
    `/api/history/${serialno}/${recordId}`
  );
  return res.data;
}

export async function deleteHistoryRecord(
  serialno: string,
  recordId: string
): Promise<void> {
  await axios.delete(`/api/history/${serialno}/${recordId}`);
}

export async function clearHistory(serialno: string): Promise<void> {
  await axios.delete(`/api/history/${serialno}`);
}

// ==================== Scheduled Tasks API ====================

export type ExecutionMode = 'classic' | 'layered_agent';

export interface ScheduledTask {
  uuid: string;
  name: string;
  device_id: string;
  message: string;
  cron_expression: string;
  execution_mode: ExecutionMode;
  status: 'enabled' | 'disabled' | 'running';
  created_at: string;
  last_run: string | null;
  next_run: string | null;
}

export interface ScheduledTaskListResponse {
  tasks: ScheduledTask[];
}

export interface ScheduledTaskCreateRequest {
  name: string;
  device_id: string;
  message: string;
  cron_expression: string;
  execution_mode?: ExecutionMode;
  enabled?: boolean;
}

export interface ScheduledTaskUpdateRequest {
  name?: string;
  device_id?: string;
  message?: string;
  cron_expression?: string;
  execution_mode?: ExecutionMode;
}

export interface TaskHistory {
  uuid: string;
  task_uuid: string;
  task_name: string;
  device_id: string;
  message: string;
  execution_mode: ExecutionMode;
  started_at: string;
  finished_at: string | null;
  status: 'success' | 'failed' | 'aborted';
  result: string | null;
  error: string | null;
}

export interface TaskHistoryListResponse {
  history: TaskHistory[];
}

export async function listScheduledTasks(): Promise<ScheduledTaskListResponse> {
  const res = await axios.get<ScheduledTaskListResponse>(
    '/api/scheduled-tasks'
  );
  return res.data;
}

export async function getScheduledTask(uuid: string): Promise<ScheduledTask> {
  const res = await axios.get<ScheduledTask>(`/api/scheduled-tasks/${uuid}`);
  return res.data;
}

export async function createScheduledTask(
  request: ScheduledTaskCreateRequest
): Promise<ScheduledTask> {
  const res = await axios.post<ScheduledTask>('/api/scheduled-tasks', request);
  return res.data;
}

export async function updateScheduledTask(
  uuid: string,
  request: ScheduledTaskUpdateRequest
): Promise<ScheduledTask> {
  const res = await axios.put<ScheduledTask>(
    `/api/scheduled-tasks/${uuid}`,
    request
  );
  return res.data;
}

export async function deleteScheduledTask(uuid: string): Promise<void> {
  await axios.delete(`/api/scheduled-tasks/${uuid}`);
}

export async function enableScheduledTask(
  uuid: string
): Promise<ScheduledTask> {
  const res = await axios.post<ScheduledTask>(
    `/api/scheduled-tasks/${uuid}/enable`
  );
  return res.data;
}

export async function disableScheduledTask(
  uuid: string
): Promise<ScheduledTask> {
  const res = await axios.post<ScheduledTask>(
    `/api/scheduled-tasks/${uuid}/disable`
  );
  return res.data;
}

export async function runScheduledTaskNow(uuid: string): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await axios.post(`/api/scheduled-tasks/${uuid}/run`);
  return res.data;
}

export async function getTaskHistory(
  taskUuid: string,
  limit: number = 50
): Promise<TaskHistoryListResponse> {
  const res = await axios.get<TaskHistoryListResponse>(
    `/api/scheduled-tasks/${taskUuid}/history`,
    { params: { limit } }
  );
  return res.data;
}

export async function getAllTaskHistory(
  limit: number = 50
): Promise<TaskHistoryListResponse> {
  const res = await axios.get<TaskHistoryListResponse>('/api/task-history', {
    params: { limit },
  });
  return res.data;
}

// ==================== Douyin Auto-Reply API ====================

export interface DouyinReplyRule {
  uuid: string;
  name: string;
  trigger_pattern: string;
  trigger_type: 'keyword' | 'regex';
  reply_message: string;
  device_id: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DouyinReplyHistory {
  uuid: string;
  rule_uuid: string;
  rule_name: string;
  sender: string;
  original_message: string;
  reply_sent: string;
  status: 'success' | 'failed';
  timestamp: string;
  error?: string;
}

export interface DouyinRuleCreateRequest {
  name: string;
  trigger_pattern: string;
  trigger_type: 'keyword' | 'regex';
  reply_message: string;
  device_id: string;
  enabled?: boolean;
}

export interface DouyinRuleUpdateRequest {
  name?: string;
  trigger_pattern?: string;
  trigger_type?: 'keyword' | 'regex';
  reply_message?: string;
  device_id?: string;
  enabled?: boolean;
}

export interface DouyinTestRuleResponse {
  success: boolean;
  matched: boolean;
  reply?: string;
  error?: string;
}

export async function listDouyinRules(): Promise<DouyinReplyRule[]> {
  const res = await axios.get<DouyinReplyRule[]>('/api/douyin/rules');
  return res.data;
}

export async function getDouyinRule(uuid: string): Promise<DouyinReplyRule> {
  const res = await axios.get<DouyinReplyRule>(`/api/douyin/rules/${uuid}`);
  return res.data;
}

export async function createDouyinRule(
  request: DouyinRuleCreateRequest
): Promise<DouyinReplyRule> {
  const res = await axios.post<DouyinReplyRule>('/api/douyin/rules', request);
  return res.data;
}

export async function updateDouyinRule(
  uuid: string,
  request: DouyinRuleUpdateRequest
): Promise<DouyinReplyRule> {
  const res = await axios.put<DouyinReplyRule>(
    `/api/douyin/rules/${uuid}`,
    request
  );
  return res.data;
}

export async function deleteDouyinRule(uuid: string): Promise<void> {
  await axios.delete(`/api/douyin/rules/${uuid}`);
}

export async function enableDouyinRule(uuid: string): Promise<DouyinReplyRule> {
  const res = await axios.post<DouyinReplyRule>(
    `/api/douyin/rules/${uuid}/enable`
  );
  return res.data;
}

export async function disableDouyinRule(
  uuid: string
): Promise<DouyinReplyRule> {
  const res = await axios.post<DouyinReplyRule>(
    `/api/douyin/rules/${uuid}/disable`
  );
  return res.data;
}

export async function testDouyinRule(
  uuid: string,
  testMessage: string
): Promise<DouyinTestRuleResponse> {
  const res = await axios.post<DouyinTestRuleResponse>(
    `/api/douyin/rules/${uuid}/test`,
    { test_message: testMessage }
  );
  return res.data;
}

export async function getDouyinReplyHistory(
  limit: number = 50
): Promise<DouyinReplyHistory[]> {
  const res = await axios.get<DouyinReplyHistory[]>('/api/douyin/history', {
    params: { limit },
  });
  return res.data;
}

export async function clearDouyinHistory(): Promise<void> {
  await axios.delete('/api/douyin/history');
}

// ==================== Douyin Message Monitor API ====================

export interface DouyinMonitorStatus {
  status: 'stopped' | 'running' | 'paused' | 'checking' | 'replying';
  device_id: string | null;
  check_interval: number;
  auto_reply_enabled: boolean;
  reply_prompt_template: string;
  decision_model_enabled: boolean;
  decision_model_active: boolean;
  fastgpt_enabled: boolean;
  fastgpt_base_url: string;
  fastgpt_api_key: string;
  fastgpt_timeout: number;
  current_action: string;
  last_check_time: string | null;
  messages_replied: number;
}

export interface DouyinMonitorConfig {
  device_id: string | null;
  check_interval: number;
  auto_reply_enabled: boolean;
  reply_prompt_template: string;
  decision_model_enabled: boolean;
  fastgpt_enabled: boolean;
  fastgpt_base_url: string;
  fastgpt_api_key: string;
  fastgpt_timeout: number;
}

export interface DouyinMonitorConfigUpdate {
  device_id?: string;
  check_interval?: number;
  auto_reply_enabled?: boolean;
  reply_prompt_template?: string;
  decision_model_enabled?: boolean;
  fastgpt_enabled?: boolean;
  fastgpt_base_url?: string;
  fastgpt_api_key?: string;
  fastgpt_timeout?: number;
}

export interface DouyinMonitorReplyHistory {
  timestamp: string;
  sender: string;
  received_message: string;
  reply_message: string;
  success: boolean;
  error?: string;
}

export interface DouyinMonitorLog {
  timestamp: string;
  level: string;
  message: string;
}

export async function getDouyinMonitorStatus(): Promise<DouyinMonitorStatus> {
  const res = await axios.get<DouyinMonitorStatus>(
    '/api/douyin/monitor/status'
  );
  return res.data;
}

export async function getDouyinMonitorConfig(): Promise<DouyinMonitorConfig> {
  const res = await axios.get<DouyinMonitorConfig>(
    '/api/douyin/monitor/config'
  );
  return res.data;
}

export async function updateDouyinMonitorConfig(
  config: DouyinMonitorConfigUpdate
): Promise<DouyinMonitorConfig> {
  const res = await axios.put<DouyinMonitorConfig>(
    '/api/douyin/monitor/config',
    config
  );
  return res.data;
}

export async function startDouyinMonitor(
  deviceId?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const res = await axios.post('/api/douyin/monitor/start', {
    device_id: deviceId,
  });
  return res.data;
}

export async function stopDouyinMonitor(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const res = await axios.post('/api/douyin/monitor/stop');
  return res.data;
}

export async function pauseDouyinMonitor(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const res = await axios.post('/api/douyin/monitor/pause');
  return res.data;
}

export async function resumeDouyinMonitor(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const res = await axios.post('/api/douyin/monitor/resume');
  return res.data;
}

export async function testDouyinMonitorOnce(): Promise<{
  success: boolean;
  result?: string;
  error?: string;
}> {
  const res = await axios.post('/api/douyin/monitor/test');
  return res.data;
}

export async function getDouyinMonitorHistory(
  limit: number = 50
): Promise<DouyinMonitorReplyHistory[]> {
  const res = await axios.get<DouyinMonitorReplyHistory[]>(
    '/api/douyin/monitor/history',
    { params: { limit } }
  );
  return res.data;
}

export async function clearDouyinMonitorHistory(): Promise<void> {
  await axios.delete('/api/douyin/monitor/history');
}

export async function getDouyinMonitorLogs(
  limit: number = 50
): Promise<DouyinMonitorLog[]> {
  const res = await axios.get<DouyinMonitorLog[]>('/api/douyin/monitor/logs', {
    params: { limit },
  });
  return res.data;
}

// ==================== Douyin Comment Task API ====================

export interface DouyinCommentVideoFilter {
  min_likes: number;
  max_likes: number;
  publish_time: 'default' | 'day' | 'week' | 'half_year';
  sort_by: 'latest' | 'most_liked' | 'default';
}

export interface DouyinCommentInteraction {
  watch_video: boolean;
  watch_duration_ratio: number;
  like_video: boolean;
  favorite_video: boolean;
  like_probability: number;
}

export interface DouyinCommentConfig {
  mode: 'reply' | 'direct';
  reply_ratio: number;
  max_replies_per_video: number;
  min_replies_per_video: number;
  target_hot_comments: boolean;
  target_question_comments: boolean;
  target_regions: string[];
  reply_interval_min: number;
  reply_interval_max: number;
}

export interface DouyinCommentContent {
  use_ai: boolean;
  style: string;
  templates: string[];
}

export interface DouyinCommentExecution {
  videos_per_run: number;
  video_interval_min: number;
  video_interval_max: number;
}

export interface DouyinCommentTask {
  uuid: string;
  name: string;
  device_id: string;
  search_keywords: string[];
  video_filter: DouyinCommentVideoFilter;
  interaction: DouyinCommentInteraction;
  comment: DouyinCommentConfig;
  content: DouyinCommentContent;
  execution: DouyinCommentExecution;
  cron_expression: string | null;
  end_time: string | null;
  status: 'enabled' | 'disabled' | 'running';
  created_at: string;
  updated_at: string;
  last_run: string | null;
  next_run: string | null;
}

export interface DouyinCommentTaskCreateRequest {
  name: string;
  device_id: string;
  search_keywords: string[];
  video_filter?: Partial<DouyinCommentVideoFilter>;
  interaction?: Partial<DouyinCommentInteraction>;
  comment?: Partial<DouyinCommentConfig>;
  content?: Partial<DouyinCommentContent>;
  execution?: Partial<DouyinCommentExecution>;
  cron_expression?: string;
  end_time?: string;
  enabled?: boolean;
}

export interface DouyinCommentTaskUpdateRequest {
  name?: string;
  device_id?: string;
  search_keywords?: string[];
  video_filter?: Partial<DouyinCommentVideoFilter>;
  interaction?: Partial<DouyinCommentInteraction>;
  comment?: Partial<DouyinCommentConfig>;
  content?: Partial<DouyinCommentContent>;
  execution?: Partial<DouyinCommentExecution>;
  cron_expression?: string;
  end_time?: string;
}

export interface DouyinCommentTaskListResponse {
  tasks: DouyinCommentTask[];
}

export interface DouyinCommentDetail {
  video: string;
  original_comment: string;
  my_reply: string;
}

export interface DouyinCommentHistory {
  uuid: string;
  task_uuid: string;
  task_name: string;
  device_id: string;
  started_at: string;
  finished_at: string | null;
  status: 'success' | 'partial' | 'failed' | 'aborted';
  videos_processed: number;
  comments_sent: number;
  error: string | null;
  result?: string | null;
  details?: DouyinCommentDetail[];
}

export interface DouyinCommentHistoryListResponse {
  history: DouyinCommentHistory[];
}

export async function listDouyinCommentTasks(): Promise<DouyinCommentTaskListResponse> {
  const res = await axios.get<DouyinCommentTaskListResponse>(
    '/api/douyin/comment/tasks'
  );
  return res.data;
}

export async function getDouyinCommentTask(
  uuid: string
): Promise<DouyinCommentTask> {
  const res = await axios.get<DouyinCommentTask>(
    `/api/douyin/comment/tasks/${uuid}`
  );
  return res.data;
}

export async function createDouyinCommentTask(
  request: DouyinCommentTaskCreateRequest
): Promise<DouyinCommentTask> {
  const res = await axios.post<DouyinCommentTask>(
    '/api/douyin/comment/tasks',
    request
  );
  return res.data;
}

export async function updateDouyinCommentTask(
  uuid: string,
  request: DouyinCommentTaskUpdateRequest
): Promise<DouyinCommentTask> {
  const res = await axios.put<DouyinCommentTask>(
    `/api/douyin/comment/tasks/${uuid}`,
    request
  );
  return res.data;
}

export async function deleteDouyinCommentTask(uuid: string): Promise<void> {
  await axios.delete(`/api/douyin/comment/tasks/${uuid}`);
}

export async function enableDouyinCommentTask(
  uuid: string
): Promise<DouyinCommentTask> {
  const res = await axios.post<DouyinCommentTask>(
    `/api/douyin/comment/tasks/${uuid}/enable`
  );
  return res.data;
}

export async function disableDouyinCommentTask(
  uuid: string
): Promise<DouyinCommentTask> {
  const res = await axios.post<DouyinCommentTask>(
    `/api/douyin/comment/tasks/${uuid}/disable`
  );
  return res.data;
}

export async function runDouyinCommentTaskNow(uuid: string): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await axios.post(`/api/douyin/comment/tasks/${uuid}/run`);
  return res.data;
}

export async function abortDouyinCommentTask(uuid: string): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await axios.post(`/api/douyin/comment/tasks/${uuid}/abort`);
  return res.data;
}

export async function getDouyinCommentTaskHistory(
  taskUuid: string,
  limit: number = 50
): Promise<DouyinCommentHistoryListResponse> {
  const res = await axios.get<DouyinCommentHistoryListResponse>(
    `/api/douyin/comment/tasks/${taskUuid}/history`,
    { params: { limit } }
  );
  return res.data;
}

export async function getAllDouyinCommentHistory(
  limit: number = 50
): Promise<DouyinCommentHistoryListResponse> {
  const res = await axios.get<DouyinCommentHistoryListResponse>(
    '/api/douyin/comment/history',
    { params: { limit } }
  );
  return res.data;
}

// ==================== Douyin Comment Stats API ====================

export interface DouyinReplyStats {
  total_replies: number;
  unique_videos: number;
  unique_users: number;
  task_count?: number;
}

export interface DouyinReplyRecord {
  id: number;
  task_uuid: string;
  video_author: string;
  video_title: string;
  replied_user: string;
  original_comment: string;
  reply_content: string;
  reply_type: string;
  replied_at: string;
}

export interface DouyinReplyListResponse {
  records: DouyinReplyRecord[];
  total: number;
}

export interface DouyinDailyStat {
  date: string;
  reply_count: number;
  video_count: number;
}

export interface DouyinDailyStatsResponse {
  stats: DouyinDailyStat[];
}

export async function getDouyinReplyStats(
  taskUuid?: string,
  days: number = 30
): Promise<DouyinReplyStats> {
  const params: Record<string, string | number> = { days };
  if (taskUuid) params.task_uuid = taskUuid;
  const res = await axios.get<DouyinReplyStats>(
    '/api/douyin/comment/stats/replies',
    { params }
  );
  return res.data;
}

export async function getDouyinReplyList(
  taskUuid?: string,
  days: number = 7,
  limit: number = 100,
  offset: number = 0
): Promise<DouyinReplyListResponse> {
  const params: Record<string, string | number> = { days, limit, offset };
  if (taskUuid) params.task_uuid = taskUuid;
  const res = await axios.get<DouyinReplyListResponse>(
    '/api/douyin/comment/stats/replies/list',
    { params }
  );
  return res.data;
}

export async function getDouyinDailyStats(
  taskUuid?: string,
  days: number = 7
): Promise<DouyinDailyStatsResponse> {
  const params: Record<string, string | number> = { days };
  if (taskUuid) params.task_uuid = taskUuid;
  const res = await axios.get<DouyinDailyStatsResponse>(
    '/api/douyin/comment/stats/replies/daily',
    { params }
  );
  return res.data;
}

export interface DeviceNameResponse {
  success: boolean;
  serial: string;
  display_name: string | null;
  error?: string;
}

export async function updateDeviceName(
  serial: string,
  displayName: string | null
): Promise<DeviceNameResponse> {
  const res = await axios.put<DeviceNameResponse>(
    `/api/devices/${serial}/name`,
    { display_name: displayName }
  );
  return res.data;
}

export async function getDeviceName(
  serial: string
): Promise<DeviceNameResponse> {
  const res = await axios.get<DeviceNameResponse>(
    `/api/devices/${serial}/name`
  );
  return res.data;
}
