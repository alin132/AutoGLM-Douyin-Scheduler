import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getDouyinMonitorStatus,
  updateDouyinMonitorConfig,
  startDouyinMonitor,
  stopDouyinMonitor,
  pauseDouyinMonitor,
  resumeDouyinMonitor,
  testDouyinMonitorOnce,
  getDouyinMonitorHistory,
  getDouyinMonitorLogs,
  getDevices,
  type DouyinMonitorStatus,
  type DouyinMonitorReplyHistory,
  type DouyinMonitorLog,
  type Device,
  getErrorMessage,
} from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Play,
  Square,
  Pause,
  RotateCcw,
  Settings,
  CheckCircle2,
  XCircle,
  MessageCircle,
  FlaskConical,
  Clock,
  Activity,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from '../lib/i18n-context';
import { useToast } from '@/components/ui/use-toast';

export const Route = createFileRoute('/douyin-auto-reply')({
  component: DouyinAutoReplyComponent,
});

function DouyinAutoReplyComponent() {
  const t = useTranslation();
  const { toast } = useToast();
  const [status, setStatus] = useState<DouyinMonitorStatus | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<DouyinMonitorLog[]>([]);
  const [history, setHistory] = useState<DouyinMonitorReplyHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const [configForm, setConfigForm] = useState({
    device_id: '',
    check_interval: 30,
    auto_reply_enabled: true,
    reply_prompt_template: '',
    decision_model_enabled: false,
    fastgpt_enabled: false,
    fastgpt_base_url: '',
    fastgpt_api_key: '',
    fastgpt_timeout: 60,
  });

  const loadStatus = useCallback(async () => {
    try {
      const [statusData, logsData] = await Promise.all([
        getDouyinMonitorStatus(),
        getDouyinMonitorLogs(50),
      ]);
      setStatus(statusData);
      setLogs(logsData);
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusData, devicesData, logsData, historyData] = await Promise.all([
        getDouyinMonitorStatus(),
        getDevices(),
        getDouyinMonitorLogs(50),
        getDouyinMonitorHistory(20),
      ]);
      setStatus(statusData);
      setDevices(devicesData);
      setLogs(logsData);
      setHistory(historyData);
      setConfigForm({
        device_id: statusData.device_id || '',
        check_interval: statusData.check_interval,
        auto_reply_enabled: statusData.auto_reply_enabled,
        reply_prompt_template: statusData.reply_prompt_template,
        decision_model_enabled: statusData.decision_model_enabled,
        fastgpt_enabled: statusData.fastgpt_enabled,
        fastgpt_base_url: statusData.fastgpt_base_url || '',
        fastgpt_api_key: statusData.fastgpt_api_key || '',
        fastgpt_timeout: statusData.fastgpt_timeout || 60,
      });
    } catch (error) {
      toast({
        title: '加载失败',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 定期刷新状态和日志
  useEffect(() => {
    const interval = setInterval(loadStatus, 2000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  // 自动滚动日志到底部
  useEffect(() => {
    if (logsContainerRef.current) {
      // 找到 ScrollArea 的 viewport 元素并滚动
      const viewport = logsContainerRef.current.closest('[data-slot="scroll-area-viewport"]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [logs]);

  const handleStart = async () => {
    if (!configForm.device_id) {
      toast({
        title: '错误',
        description: '请先选择设备',
        variant: 'destructive',
      });
      return;
    }
    setActionLoading(true);
    try {
      await updateDouyinMonitorConfig(configForm);
      const result = await startDouyinMonitor(configForm.device_id);
      if (result.success) {
        toast({ title: '监控已启动' });
        loadStatus();
      } else {
        toast({ title: '启动失败', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: '错误', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await stopDouyinMonitor();
      toast({ title: '监控已停止' });
      loadStatus();
    } catch (error) {
      toast({ title: '错误', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    try {
      await pauseDouyinMonitor();
      loadStatus();
    } catch (error) {
      toast({ title: '错误', description: getErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleResume = async () => {
    try {
      await resumeDouyinMonitor();
      loadStatus();
    } catch (error) {
      toast({ title: '错误', description: getErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleTest = async () => {
    if (!configForm.device_id) {
      toast({ title: '错误', description: '请先选择设备', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      await updateDouyinMonitorConfig(configForm);
      const result = await testDouyinMonitorOnce();
      if (result.success) {
        toast({ title: '测试已启动' });
      } else {
        toast({ title: '测试失败', description: result.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: '错误', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setActionLoading(false);
      loadStatus();
    }
  };

  const handleSaveConfig = async () => {
    try {
      await updateDouyinMonitorConfig(configForm);
      toast({ title: '配置已保存' });
    } catch (error) {
      toast({ title: '错误', description: getErrorMessage(error), variant: 'destructive' });
    }
  };

  const getStatusInfo = () => {
    if (!status) return { color: 'bg-gray-500', text: '未知', icon: AlertCircle };
    switch (status.status) {
      case 'running':
        return { color: 'bg-green-500', text: '运行中', icon: Activity };
      case 'checking':
        return { color: 'bg-blue-500', text: '检查中', icon: Loader2 };
      case 'replying':
        return { color: 'bg-purple-500', text: '回复中', icon: MessageSquare };
      case 'paused':
        return { color: 'bg-yellow-500', text: '已暂停', icon: Pause };
      default:
        return { color: 'bg-gray-500', text: '已停止', icon: Square };
    }
  };

  const statusInfo = getStatusInfo();
  const isRunning = status?.status && status.status !== 'stopped';

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 gap-4">
      {/* 顶部标题和控制 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-6 w-6" />
          <h1 className="text-xl font-bold">抖音私信自动回复</h1>
          <Badge className={`${statusInfo.color} text-white`}>
            {status?.status === 'checking' || status?.status === 'replying' ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : null}
            {statusInfo.text}
          </Badge>
        </div>
        <div className="flex gap-2">
          {!isRunning ? (
            <Button onClick={handleStart} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              启动
            </Button>
          ) : (
            <>
              {status?.status === 'paused' ? (
                <Button onClick={handleResume} variant="outline">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  恢复
                </Button>
              ) : (
                <Button onClick={handlePause} variant="outline">
                  <Pause className="h-4 w-4 mr-2" />
                  暂停
                </Button>
              )}
              <Button onClick={handleStop} variant="destructive">
                <Square className="h-4 w-4 mr-2" />
                停止
              </Button>
            </>
          )}
          <Button onClick={handleTest} variant="outline" disabled={actionLoading || (isRunning && status?.status !== 'paused')}>
            <FlaskConical className="h-4 w-4 mr-2" />
            测试
          </Button>
        </div>
      </div>

      {/* 主体内容 - 左右布局 */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 左侧：配置 - 固定宽度 */}
        <Card className="w-72 shrink-0 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              配置
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 space-y-4 overflow-auto">
            <div>
              <Label className="text-sm">设备</Label>
              <Select
                value={configForm.device_id}
                onValueChange={(value) => setConfigForm({ ...configForm, device_id: value })}
              >
                <SelectTrigger className="mt-1" disabled={isRunning}>
                  <SelectValue placeholder="选择设备" />
                </SelectTrigger>
                <SelectContent>
                  {devices.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.model || device.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm">检查间隔</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  min={10}
                  value={configForm.check_interval}
                  onChange={(e) => setConfigForm({ ...configForm, check_interval: parseInt(e.target.value) || 30 })}
                  disabled={isRunning}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">秒</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={configForm.auto_reply_enabled}
                onCheckedChange={(checked) => setConfigForm({ ...configForm, auto_reply_enabled: checked })}
                disabled={isRunning}
              />
              <Label className="text-sm">启用自动回复</Label>
            </div>

            <div>
              <Label className="text-sm">回复风格</Label>
              <Textarea
                value={configForm.reply_prompt_template}
                onChange={(e) => setConfigForm({ ...configForm, reply_prompt_template: e.target.value })}
                placeholder="例如：友好、专业、简洁..."
                rows={2}
                className="mt-1"
                disabled={isRunning}
              />
              <p className="text-xs text-muted-foreground mt-1">
                自定义 AI 回复的风格和要求
              </p>
            </div>

            {/* FastGPT 配置 */}
            <div className="pt-3 border-t space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={configForm.fastgpt_enabled}
                  onCheckedChange={(checked) => setConfigForm({ ...configForm, fastgpt_enabled: checked })}
                  disabled={isRunning}
                />
                <Label className="text-sm">启用 FastGPT 智能回复</Label>
              </div>
              
              {configForm.fastgpt_enabled && (
                <div className="space-y-3 pl-2 border-l-2 border-blue-200 dark:border-blue-800">
                  <div>
                    <Label className="text-xs">API 地址</Label>
                    <Input
                      value={configForm.fastgpt_base_url}
                      onChange={(e) => setConfigForm({ ...configForm, fastgpt_base_url: e.target.value })}
                      placeholder="http://xxx/api/v1/chat/completions"
                      className="mt-1 text-xs"
                      disabled={isRunning}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">API Key</Label>
                    <Input
                      type="password"
                      value={configForm.fastgpt_api_key}
                      onChange={(e) => setConfigForm({ ...configForm, fastgpt_api_key: e.target.value })}
                      placeholder="fastgpt-xxx"
                      className="mt-1 text-xs"
                      disabled={isRunning}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">超时时间</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        min={10}
                        value={configForm.fastgpt_timeout}
                        onChange={(e) => setConfigForm({ ...configForm, fastgpt_timeout: parseInt(e.target.value) || 60 })}
                        className="w-20 text-xs"
                        disabled={isRunning}
                      />
                      <span className="text-xs text-muted-foreground">秒</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Button onClick={handleSaveConfig} className="w-full" disabled={isRunning}>
              保存配置
            </Button>

            {/* 统计信息 */}
            <div className="pt-4 border-t space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">已回复消息</span>
                <span className="font-medium">{status?.messages_replied || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">上次检查</span>
                <span className="font-medium">{status?.last_check_time || '-'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 右侧：日志和历史 - 自适应宽度 */}
        <Card className="flex-1 flex flex-col min-w-0">
          <Tabs defaultValue="logs" className="flex-1 flex flex-col">
            <CardHeader className="pb-0">
              <TabsList>
                <TabsTrigger value="logs" className="flex items-center gap-1">
                  <Activity className="h-4 w-4" />
                  实时日志
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  回复历史
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="flex-1 pt-4 min-h-0">
              <TabsContent value="logs" className="h-full m-0">
                <div className="h-full flex flex-col">
                  {/* 当前动作 */}
                  {status?.current_action && (
                    <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-lg flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span className="text-sm text-blue-700 dark:text-blue-300">
                        {status.current_action}
                      </span>
                    </div>
                  )}
                  <ScrollArea className="flex-1 border rounded-lg">
                    <div ref={logsContainerRef} className="p-3 space-y-1 font-mono text-xs">
                      {logs.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                          暂无日志，启动监控后将显示实时日志
                        </p>
                      ) : (
                        logs.map((log, index) => (
                          <div
                            key={index}
                            className={`flex gap-2 ${log.level === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}
                          >
                            <span className="text-gray-400 shrink-0">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span>{log.message}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
              <TabsContent value="history" className="h-full m-0">
                <ScrollArea className="h-full border rounded-lg">
                  <div className="p-3 space-y-3">
                    {history.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        暂无回复历史
                      </p>
                    ) : (
                      history.map((item, index) => (
                        <div key={index} className="border rounded-lg p-3 space-y-1 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">用户：{item.sender || '未知'}</span>
                            <div className="flex items-center gap-2">
                              {item.success ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(item.timestamp).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">收到: </span>
                            {item.received_message || '-'}
                          </div>
                          <div>
                            <span className="text-muted-foreground">回复: </span>
                            {item.reply_message || '-'}
                          </div>
                          {item.error && (
                            <div className="text-red-500">错误: {item.error}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
