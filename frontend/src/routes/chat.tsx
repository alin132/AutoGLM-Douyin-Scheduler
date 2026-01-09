import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import {
  connectWifi,
  disconnectWifi,
  listDevices,
  getConfig,
  type Device,
} from '../api';
import { triggerOpenConfig } from './__root';
import { DeviceSidebar } from '../components/DeviceSidebar';
import { DevicePanel } from '../components/DevicePanel';
import { ChatKitPanel } from '../components/ChatKitPanel';
import { Toast, type ToastType } from '../components/Toast';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Layers,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from '../lib/i18n-context';

// Search params type for URL persistence
type ChatSearchParams = {
  serial?: string;
  mode?: 'classic' | 'chatkit';
};

export const Route = createFileRoute('/chat')({
  component: ChatComponent,
  validateSearch: (search: Record<string, unknown>): ChatSearchParams => {
    const mode = search.mode;
    return {
      serial: typeof search.serial === 'string' ? search.serial : undefined,
      mode: mode === 'classic' || mode === 'chatkit' ? mode : undefined,
    };
  },
});

function ChatComponent() {
  const t = useTranslation();
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
  // Chat mode: 'classic' for DevicePanel (single model), 'chatkit' for ChatKitPanel (layered agent)
  // Initialize from URL search params if available
  const [chatMode, setChatMode] = useState<'classic' | 'chatkit'>(
    searchParams.mode || 'classic'
  );

  // Track if we've done initial device selection from URL
  const [initialDeviceSet, setInitialDeviceSet] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: ToastType;
    visible: boolean;
  }>({ message: '', type: 'info', visible: false });

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, visible: true });
  };

  // 检查是否已配置
  const [isConfigured, setIsConfigured] = useState(false);
  useEffect(() => {
    getConfig().then(data => {
      setIsConfigured(!!data.base_url);
    }).catch(() => setIsConfigured(false));
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const response = await listDevices();

      // Filter out disconnected devices
      const connectedDevices = response.devices.filter(
        device => device.state !== 'disconnected'
      );

      const deviceMap = new Map<string, Device>();
      const serialMap = new Map<string, Device[]>();

      for (const device of connectedDevices) {
        if (device.serial) {
          const group = serialMap.get(device.serial) || [];
          group.push(device);
          serialMap.set(device.serial, group);
        } else {
          deviceMap.set(device.id, device);
        }
      }

      Array.from(serialMap.values()).forEach(devices => {
        const wifiDevice = devices.find(
          (d: Device) => d.connection_type === 'wifi'
        );
        const selectedDevice = wifiDevice || devices[0];
        deviceMap.set(selectedDevice.id, selectedDevice);
      });

      const filteredDevices = Array.from(deviceMap.values());
      setDevices(filteredDevices);

      // On initial load, try to select device from URL serial param
      if (filteredDevices.length > 0 && !initialDeviceSet) {
        const urlSerial = searchParams.serial;
        if (urlSerial) {
          const deviceFromUrl = filteredDevices.find(
            d => d.serial === urlSerial
          );
          if (deviceFromUrl) {
            setCurrentDeviceId(deviceFromUrl.id);
          } else {
            // URL serial not found, fallback to first device
            setCurrentDeviceId(filteredDevices[0].id);
          }
        } else if (!currentDeviceId) {
          setCurrentDeviceId(filteredDevices[0].id);
        }
        setInitialDeviceSet(true);
      }

      if (
        currentDeviceId &&
        !filteredDevices.find(d => d.id === currentDeviceId)
      ) {
        setCurrentDeviceId(filteredDevices[0]?.id || '');
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  }, [currentDeviceId, initialDeviceSet, searchParams.serial]);

  useEffect(() => {
    // Initial load with a small delay to avoid synchronous setState
    const timeoutId = setTimeout(() => {
      loadDevices();
    }, 0);

    // Set up interval for periodic updates
    const intervalId = setInterval(loadDevices, 3000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [loadDevices]);

  // Sync state changes to URL search params
  useEffect(() => {
    // Get current device's serial
    const currentDevice = devices.find(d => d.id === currentDeviceId);
    const currentSerial = currentDevice?.serial;

    // Only update URL after initial device selection is done
    if (!initialDeviceSet) return;

    // Check if URL needs updating
    const needsUpdate =
      currentSerial !== searchParams.serial || chatMode !== searchParams.mode;

    if (needsUpdate) {
      navigate({
        to: '/chat',
        search: {
          serial: currentSerial,
          mode: chatMode,
        },
        replace: true, // Don't create new history entry
      });
    }
  }, [
    currentDeviceId,
    chatMode,
    devices,
    initialDeviceSet,
    navigate,
    searchParams.serial,
    searchParams.mode,
  ]);

  const handleConnectWifi = async (deviceId: string) => {
    try {
      const res = await connectWifi({ device_id: deviceId });
      if (res.success && res.device_id) {
        setCurrentDeviceId(res.device_id);
        showToast(t.toasts.wifiConnected, 'success');
      } else if (!res.success) {
        showToast(
          res.message || res.error || t.toasts.connectionFailed,
          'error'
        );
      }
    } catch (e) {
      showToast(t.toasts.wifiConnectionError, 'error');
      console.error('Connect WiFi error:', e);
    }
  };

  const handleDisconnectWifi = async (deviceId: string) => {
    try {
      const res = await disconnectWifi(deviceId);
      if (res.success) {
        showToast(t.toasts.wifiDisconnected, 'success');
      } else {
        showToast(
          res.message || res.error || t.toasts.disconnectFailed,
          'error'
        );
      }
    } catch (e) {
      showToast(t.toasts.wifiDisconnectError, 'error');
      console.error('Disconnect WiFi error:', e);
    }
  };

  return (
    <div className="h-full flex relative min-h-0">
      {toast.visible && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(prev => ({ ...prev, visible: false }))}
        />
      )}

      {/* Sidebar */}
      <DeviceSidebar
        devices={devices}
        currentDeviceId={currentDeviceId}
        onSelectDevice={setCurrentDeviceId}
        onOpenConfig={triggerOpenConfig}
        onConnectWifi={handleConnectWifi}
        onDisconnectWifi={handleDisconnectWifi}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Mode Toggle - Floating Capsule */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <div className="flex items-center gap-0.5 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm rounded-full p-1 shadow-lg border border-slate-200 dark:border-slate-700">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setChatMode('classic')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    chatMode === 'classic'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  {t.chatkit?.classicMode || '经典模式'}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-medium">
                    {t.chatkit?.classicMode || '经典模式'}
                  </p>
                  <p className="text-xs opacity-80">
                    {t.chatkit?.classicModeDesc || '视觉模型直接执行任务'}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setChatMode('chatkit');
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    chatMode === 'chatkit'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  {t.chatkit?.layeredMode || '分层代理'}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-medium">
                    {t.chatkit?.layeredMode || '分层代理'}
                  </p>
                  <p className="text-xs opacity-80">
                    {t.chatkit?.layeredModeDesc ||
                      '规划层分解任务，执行层独立完成子任务'}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 flex items-stretch justify-center min-h-0 px-4 py-4 pt-16">
          {devices.length === 0 ? (
            <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
              <div className="text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 mx-auto mb-4">
                  <svg
                    className="w-10 h-10 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  {t.chat.welcomeTitle}
                </h3>
                <p className="text-slate-500 dark:text-slate-400">
                  {t.chat.connectDevice}
                </p>
              </div>
            </div>
          ) : (
            devices.map(device => (
              <div
                key={device.serial}
                className={`w-full max-w-7xl flex items-stretch justify-center min-h-0 ${
                  device.id === currentDeviceId ? '' : 'hidden'
                }`}
              >
                {chatMode === 'chatkit' ? (
                  <div className="w-full flex items-stretch justify-center">
                    <ChatKitPanel
                      deviceId={device.id}
                      deviceSerial={device.serial}
                      deviceName={device.model}
                      deviceConnectionType={device.connection_type}
                      isVisible={device.id === currentDeviceId}
                    />
                  </div>
                ) : (
                  <div className="w-full flex items-stretch justify-center">
                    <DevicePanel
                      deviceId={device.id}
                      deviceSerial={device.serial}
                      deviceName={device.model}
                      deviceConnectionType={device.connection_type}
                      isConfigured={isConfigured}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
