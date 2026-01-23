# 设备连接历史功能

## 功能概述

实现了设备连接历史记录功能，用户可以查看之前连接过的 WiFi 设备，并快速重新连接。

## 解决的问题

- 每次重启后需要重新输入 IP 地址连接设备
- 无线调试端口会在手机重启后随机改变，但 IP 通常不变

## 功能特性

1. **自动记录连接历史** - WiFi 连接成功后自动保存到历史记录
2. **持久化存储** - 历史记录保存在 `~/.config/autoglm/devices/connection_history.json`
3. **快速填充** - 点击历史记录可快速填充 IP 和端口到连接表单
4. **自定义名称** - 可为历史记录设置自定义显示名称
5. **删除记录** - 可删除不需要的历史记录
6. **最多保存 50 条** - 超过后自动删除最旧的记录
7. **信息补全** - 连接成功后会尽量补充设备序列号和型号

## 使用方式

1. 在设备侧边栏点击「添加无线设备」
2. 切换到「历史」标签页
3. 查看之前连接过的设备列表
4. 点击设备可自动填充 IP 地址到「直接连接」表单
5. 由于端口可能变化，请在手机上确认当前端口后再连接

## 技术实现

### 后端

#### 数据结构 (`device_metadata_manager.py`)

```python
@dataclass
class DeviceConnectionHistory:
    ip: str                              # 设备 IP
    port: int                            # 连接端口
    serial: Optional[str] = None         # 设备序列号
    model: Optional[str] = None          # 设备型号
    display_name: Optional[str] = None   # 自定义名称
    last_connected: datetime             # 最后连接时间
    connection_count: int = 1            # 连接次数
```

#### API 端点 (`api/devices.py`)

- `GET /api/devices/connection_history` - 获取连接历史列表
- `DELETE /api/devices/connection_history/{ip}` - 删除指定 IP 的历史记录
- `PUT /api/devices/connection_history/{ip}/name` - 更新历史记录的自定义名称

#### 自动记录

在以下位置自动记录连接历史：
- `connect_wifi()` - USB 转 WiFi 连接
- `connect_wifi_manual()` - 手动 IP 连接
- `pair_wifi()` - 配对并连接

### 前端

#### API 函数 (`api.ts`)

```typescript
getConnectionHistory(): Promise<ConnectionHistoryListResponse>
removeConnectionHistory(ip: string): Promise<ConnectionHistoryRemoveResponse>
updateConnectionHistoryName(ip: string, displayName: string | null): Promise<ConnectionHistoryUpdateNameResponse>
```

#### UI 组件 (`DeviceSidebar.tsx`)

- 新增「历史」标签页
- 显示历史记录列表
- 支持点击快速填充
- 支持编辑名称
- 支持删除记录

## 注意事项

1. **显示优先级** - 自定义名称 > 设备型号 > 设备序列号
2. **端口会变化** - 手机无线调试端口在重启后会随机改变，连接前请确认当前端口
2. **IP 通常不变** - 在同一局域网中，设备 IP 通常保持不变
3. **历史记录上限** - 最多保存 50 条记录，超过后自动清理最旧的

## 相关文件

- `AutoGLM_GUI/device_metadata_manager.py` - 数据存储和管理
- `AutoGLM_GUI/device_manager.py` - 连接记录逻辑
- `AutoGLM_GUI/api/devices.py` - API 端点
- `AutoGLM_GUI/schemas.py` - API 数据模型
- `frontend/src/api.ts` - 前端 API 函数
- `frontend/src/components/DeviceSidebar.tsx` - 前端 UI
- `frontend/src/lib/locales/en.ts` - 英文翻译
- `frontend/src/lib/locales/zh.ts` - 中文翻译
