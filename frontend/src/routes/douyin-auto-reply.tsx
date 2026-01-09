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
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export const Route = createFileRoute('/douyin-auto-reply')({
  component: DouyinAutoReplyComponent,
});

function DouyinAutoReplyComponent() {
  const { toast } = useToast();
  const [status, setStatus] = useState<DouyinMonitorStatus | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [logs, setLogs] = useState<DouyinMonitorLog[]>([]);
  const [history, setHistory] = useState<DouyinMonitorReplyHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // 日志过滤
  const [logFilter, setLogFilter] = useState<'all' | 'error'>('all');
  const [historySearch, setHistorySearch] = useState('');

  // 高级选项折叠状态
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
      // 如果有高级选项已启用，自动展开
      if (statusData.decision_model_enabled || statusData.fastgpt_enabled) {
        setAdvancedOpen(true);
      }
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
    if (logsEndRef.current) {
      const viewport = logsEndRef.current.closest('[data-slot="scroll-area-viewport"]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [logs]);

  // 过滤后的日志
  const filteredLogs = logs.filter(log => {
    if (logFilter === 'error') return log.level === 'error';
    return true;
  });

  // 过滤后的历史
  const filteredHistory = history.filter(item => {
    if (!historySearch) return true;
    const search = historySearch.toLowerCase();
    return (
      item.sender?.toLowerCase().includes(search) ||
      item.received_message?.toLowerCase().includes(search) ||
      item.reply_message?.toLowerCase().includes(search)
    );
  });

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
  const errorCount = logs.filter(l => l.level === 'error').length;


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
          <CardContent className="flex-1 overflow-auto">
            <ScrollArea className="h-full pr-2">
              <div className="space-y-4">
                {/* 基础配置 */}
                <div>
                  <Label className="text-sm">设备</Label>
                  <Select
                    value={configForm.device_id}
                    onValueChange={(value) => setConfigForm({ ...configForm, device_id: value })}
                  >
                    <SelectTrigger className="mt-1" disabled={isRunning}>
                      <span className="truncate">
                        {configForm.device_id
                          ? devices.find((d) => d.id === configForm.device_id)?.model || configForm.device_id
                          : '选择设备'}
                      </span>
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
                </div>

                {/* 高级选项 - 可折叠 */}
                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium w-full py-2 hover:text-primary transition-colors">
                    {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    高级选项
                    {(configForm.decision_model_enabled || configForm.fastgpt_enabled) && (
                      <Badge variant="secondary" className="ml-auto text-xs">已启用</Badge>
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-2">
                    {/* 决策模型开关 */}
                    <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={configForm.decision_model_enabled}
                          onCheckedChange={(checked) => setConfigForm({ ...configForm, decision_model_enabled: checked })}
                          disabled={isRunning}
                        />
                        <Label className="text-sm">决策模型解析</Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        使用决策模型解析 AI 返回结果，提高识别准确性（在设置中配置）
                      </p>
                    </div>

                    {/* FastGPT 配置 */}
                    <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={configForm.fastgpt_enabled}
                          onCheckedChange={(checked) => setConfigForm({ ...configForm, fastgpt_enabled: checked })}
                          disabled={isRunning}
                        />
                        <Label className="text-sm">FastGPT 智能回复</Label>
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
                  </CollapsibleContent>
                </Collapsible>

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
              </div>
            </ScrollArea>
          </CardContent>
        </Card>


        {/* 右侧：日志和历史 - 自适应宽度 */}
        <Card className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Tabs defaultValue="logs" className="flex-1 flex flex-col min-h-0">
            <CardHeader className="pb-0 shrink-0">
              <TabsList>
                <TabsTrigger value="logs" className="flex items-center gap-1">
                  <Activity className="h-4 w-4" />
                  实时日志
                  {errorCount > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                      {errorCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="history" className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  回复历史
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="flex-1 pt-4 min-h-0 overflow-hidden">
              <TabsContent value="logs" className="h-full m-0 overflow-hidden">
                <div className="h-full flex flex-col overflow-hidden gap-2">
                  {/* 日志过滤器 */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Button
                      variant={logFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setLogFilter('all')}
                    >
                      全部
                    </Button>
                    <Button
                      variant={logFilter === 'error' ? 'destructive' : 'outline'}
                      size="sm"
                      onClick={() => setLogFilter('error')}
                    >
                      仅错误 {errorCount > 0 && `(${errorCount})`}
                    </Button>
                  </div>

                  {/* 当前动作 */}
                  {status?.current_action && (
                    <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg flex items-center gap-2 shrink-0">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span className="text-sm text-blue-700 dark:text-blue-300">
                        {status.current_action}
                      </span>
                    </div>
                  )}

                  <ScrollArea className="flex-1 border rounded-lg min-h-0">
                    <div className="p-3 space-y-1 font-mono text-xs">
                      {filteredLogs.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                          {logFilter === 'error' ? '暂无错误日志' : '暂无日志，启动监控后将显示实时日志'}
                        </p>
                      ) : (
                        filteredLogs.map((log, index) => (
                          <div
                            key={index}
                            className={`flex gap-2 ${log.level === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}
                          >
                            <span className="text-gray-400 shrink-0">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="break-words">{log.message}</span>
                          </div>
                        ))
                      )}
                      <div ref={logsEndRef} />
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
              <TabsContent value="history" className="h-full m-0 overflow-hidden">
                <div className="h-full flex flex-col overflow-hidden gap-2">
                  {/* 历史搜索 */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="搜索用户名或消息内容..."
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>

                  <ScrollArea className="flex-1 border rounded-lg min-h-0">
                    <div className="p-3 space-y-3">
                      {filteredHistory.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                          {historySearch ? '未找到匹配的记录' : '暂无回复历史'}
                        </p>
                      ) : (
                        filteredHistory.map((item, index) => (
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
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
