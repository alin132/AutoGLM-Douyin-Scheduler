import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  listDouyinCommentTasks,
  createDouyinCommentTask,
  updateDouyinCommentTask,
  deleteDouyinCommentTask,
  enableDouyinCommentTask,
  disableDouyinCommentTask,
  runDouyinCommentTaskNow,
  abortDouyinCommentTask,
  getDouyinCommentTaskHistory,
  getDevices,
  type DouyinCommentTask,
  type DouyinCommentHistory,
  type Device,
  type SearchMode,
  getErrorMessage,
} from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  Play,
  Square,
  Power,
  PowerOff,
  History,
  MessageCircle,
  Search,
  Heart,
  Star,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useTranslation } from '../lib/i18n-context';
import { useToast } from '@/components/ui/use-toast';

export const Route = createFileRoute('/douyin-comment')({
  component: DouyinCommentComponent,
});

// 中国所有省份/直辖市/自治区/特别行政区
const CHINA_PROVINCES = [
  '北京',
  '天津',
  '上海',
  '重庆',
  '河北',
  '山西',
  '辽宁',
  '吉林',
  '黑龙江',
  '江苏',
  '浙江',
  '安徽',
  '福建',
  '江西',
  '山东',
  '河南',
  '湖北',
  '湖南',
  '广东',
  '海南',
  '四川',
  '贵州',
  '云南',
  '陕西',
  '甘肃',
  '青海',
  '台湾',
  '内蒙古',
  '广西',
  '西藏',
  '宁夏',
  '新疆',
  '香港',
  '澳门',
];

interface FormData {
  name: string;
  device_id: string;
  search_keywords: string;
  search_mode: SearchMode;
  video_filter: {
    min_likes: number;
    max_likes: number;
    publish_time: 'default' | 'day' | 'week' | 'half_year';
    sort_by: 'latest' | 'most_liked' | 'default';
  };
  douyin_index_filter: {
    publish_time: 'default' | '3days' | '7days' | 'month';
  };
  interaction: {
    watch_video: boolean;
    watch_duration_ratio: number;
    like_video: boolean;
    favorite_video: boolean;
    like_probability: number;
  };
  comment: {
    mode: 'reply' | 'direct';
    reply_ratio: number;
    max_replies_per_video: number;
    min_replies_per_video: number;
    target_hot_comments: boolean;
    target_question_comments: boolean;
    target_regions: string[];
    reply_interval_min: number;
    reply_interval_max: number;
  };
  content: {
    use_ai: boolean;
    style: string;
    templates: string;
  };
  execution: {
    videos_per_run: number;
    video_interval_min: number;
    video_interval_max: number;
  };
  cron_expression: string;
  end_time: string;
}

const defaultFormData: FormData = {
  name: '',
  device_id: '',
  search_keywords: '',
  search_mode: 'keyword' as SearchMode,
  video_filter: {
    min_likes: 0,
    max_likes: 50000,
    publish_time: 'default' as const,
    sort_by: 'latest' as const,
  },
  douyin_index_filter: {
    publish_time: 'default' as const,
  },
  interaction: {
    watch_video: false,
    watch_duration_ratio: 0.8,
    like_video: false,
    favorite_video: false,
    like_probability: 0.9,
  },
  comment: {
    mode: 'reply' as const,
    reply_ratio: 0.01,
    max_replies_per_video: 5,
    min_replies_per_video: 1,
    target_hot_comments: false,
    target_question_comments: false,
    target_regions: [],
    reply_interval_min: 10,
    reply_interval_max: 30,
  },
  content: { use_ai: true, style: 'koc', templates: '' },
  execution: {
    videos_per_run: 2,
    video_interval_min: 1,
    video_interval_max: 10,
  },
  cron_expression: '',
  end_time: '',
};

function DouyinCommentComponent() {
  const t = useTranslation();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<DouyinCommentTask[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<DouyinCommentTask | null>(
    null
  );
  const [selectedTaskHistory, setSelectedTaskHistory] = useState<
    DouyinCommentHistory[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>(defaultFormData);
  const [saving, setSaving] = useState(false);
  const [regionQuery, setRegionQuery] = useState('');

  const filteredProvinces = CHINA_PROVINCES.filter(province =>
    province.includes(regionQuery.trim())
  );

  // 处理任务事件的回调
  const handleTaskEvent = useCallback(
    (event: {
      type: string;
      task_uuid: string;
      task_name: string;
      status: string;
    }) => {
      console.log('[DouyinComment] Received task event:', event);
      // 更新本地任务状态
      setTasks(prev =>
        prev.map(t =>
          t.uuid === event.task_uuid
            ? { ...t, status: event.status as DouyinCommentTask['status'] }
            : t
        )
      );
      // 如果任务完成/失败/中止，重新加载完整数据
      if (['task_finished', 'task_aborted'].includes(event.type)) {
        loadTasks();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // 建立 WebSocket 连接
  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('[DouyinComment] Socket connected');
    });

    socket.on('task-event', handleTaskEvent);

    socket.on('disconnect', () => {
      console.log('[DouyinComment] Socket disconnected');
    });

    return () => {
      socket.off('task-event', handleTaskEvent);
      socket.disconnect();
    };
  }, [handleTaskEvent]);

  const toggleRegion = (province: string) => {
    setFormData(prev => ({
      ...prev,
      comment: {
        ...prev.comment,
        target_regions: prev.comment.target_regions.includes(province)
          ? prev.comment.target_regions.filter(r => r !== province)
          : [...prev.comment.target_regions, province],
      },
    }));
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await listDouyinCommentTasks();
      setTasks(data.tasks);
    } catch (error) {
      toast({
        title: t.douyinComment.error,
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDevices = async () => {
    try {
      const deviceList = await getDevices();
      setDevices(deviceList);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  useEffect(() => {
    loadTasks();
    loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebSocket 推送已替代轮询，任务状态变化通过 task-event 事件实时推送

  const handleCreate = () => {
    setEditingTask(null);
    setFormData({ ...defaultFormData, device_id: devices[0]?.id || '' });
    setShowDialog(true);
  };

  const handleEdit = (task: DouyinCommentTask) => {
    setEditingTask(task);
    // 通过 serial 查找当前设备（重启后 device_id 可能变化）
    let resolvedDeviceId = task.device_id;
    if (task.serial) {
      const deviceBySerial = devices.find(d => d.serial === task.serial);
      if (deviceBySerial) {
        resolvedDeviceId = deviceBySerial.id;
      }
    }
    setFormData({
      name: task.name,
      device_id: resolvedDeviceId,
      search_keywords: task.search_keywords.join('\n'),
      search_mode: task.search_mode || 'keyword',
      video_filter: {
        ...task.video_filter,
        publish_time: task.video_filter.publish_time || 'default',
      },
      douyin_index_filter: {
        publish_time: task.douyin_index_filter?.publish_time || 'default',
      },
      interaction: { ...task.interaction },
      comment: {
        ...task.comment,
        mode: task.comment.mode || 'reply',
        target_question_comments:
          task.comment.target_question_comments || false,
        target_regions: task.comment.target_regions || [],
      },
      content: {
        ...task.content,
        templates: task.content.templates.join('\n'),
      },
      execution: { ...task.execution },
      cron_expression: task.cron_expression || '',
      end_time: task.end_time || '',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // 获取选中设备的 serial（稳定标识）
      const selectedDevice = devices.find(d => d.id === formData.device_id);
      const payload = {
        name: formData.name,
        device_id: formData.device_id,
        serial: selectedDevice?.serial, // 传递稳定的硬件序列号
        search_keywords: formData.search_keywords
          .split('\n')
          .filter(k => k.trim()),
        search_mode: formData.search_mode,
        video_filter: formData.video_filter,
        douyin_index_filter: formData.douyin_index_filter,
        interaction: formData.interaction,
        comment: {
          ...formData.comment,
          target_regions: formData.comment.target_regions,
        },
        content: {
          ...formData.content,
          templates: formData.content.templates
            .split('\n')
            .filter(t => t.trim()),
        },
        execution: formData.execution,
        cron_expression: formData.cron_expression, // 空字符串让后端清除定时
        end_time: formData.end_time || undefined,
      };
      if (editingTask) {
        await updateDouyinCommentTask(editingTask.uuid, payload);
        toast({ title: t.douyinComment.taskUpdated });
      } else {
        await createDouyinCommentTask(payload);
        toast({ title: t.douyinComment.taskCreated });
      }
      setShowDialog(false);
      loadTasks();
    } catch (error) {
      toast({
        title: t.douyinComment.error,
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (uuid: string) => {
    if (!window.confirm(t.douyinComment.deleteConfirm)) return;
    try {
      await deleteDouyinCommentTask(uuid);
      toast({ title: t.douyinComment.taskDeleted });
      loadTasks();
    } catch (error) {
      toast({
        title: t.douyinComment.error,
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (task: DouyinCommentTask) => {
    try {
      if (task.status === 'enabled') {
        await disableDouyinCommentTask(task.uuid);
        toast({ title: t.douyinComment.taskDisabled });
      } else {
        await enableDouyinCommentTask(task.uuid);
        toast({ title: t.douyinComment.taskEnabled });
      }
      loadTasks();
    } catch (error) {
      toast({
        title: t.douyinComment.error,
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleRunNow = async (uuid: string) => {
    try {
      await runDouyinCommentTaskNow(uuid);
      toast({ title: t.douyinComment.taskStarted });
      loadTasks();
    } catch (error) {
      toast({
        title: t.douyinComment.error,
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleAbort = async (uuid: string) => {
    try {
      await abortDouyinCommentTask(uuid);
      toast({ title: t.douyinComment.taskStopped });
      loadTasks();
    } catch (error) {
      toast({
        title: t.douyinComment.error,
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleViewHistory = async (task: DouyinCommentTask) => {
    try {
      setHistoryLoading(true);
      setShowHistoryDialog(true);
      const data = await getDouyinCommentTaskHistory(task.uuid, 20);
      setSelectedTaskHistory(data.history);
    } catch (error) {
      toast({
        title: t.douyinComment.error,
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  const getStatusBadge = (task: DouyinCommentTask) => {
    const status = task.status;
    const isAutoPaused = status === 'disabled' && !!task.auto_paused_at;

    if (isAutoPaused) {
      return (
        <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
          {t.douyinComment.autoPausedShort}
        </Badge>
      );
    }

    switch (status) {
      case 'enabled':
        return (
          <Badge className="bg-green-500">
            <Power className="w-3 h-3 mr-1" />
            {t.douyinComment.enabled}
          </Badge>
        );
      case 'disabled':
        return (
          <Badge variant="secondary">
            <PowerOff className="w-3 h-3 mr-1" />
            {t.douyinComment.disabled}
          </Badge>
        );
      case 'running':
        return (
          <Badge className="bg-blue-500">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            {t.douyinComment.running}
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getHistoryStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'partial':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'aborted':
        return <AlertCircle className="w-4 h-4 text-orange-500" />;
      default:
        return null;
    }
  };

  const getHistoryStatusLabel = (status: string) => {
    switch (status) {
      case 'success':
        return t.douyinComment.success;
      case 'partial':
        return t.douyinComment.partial;
      case 'failed':
        return t.douyinComment.failed;
      case 'aborted':
        return t.douyinComment.aborted;
      default:
        return status;
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return t.douyinComment.never;
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-6 h-6" />
          <h1 className="text-xl font-bold">{t.douyinComment.title}</h1>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          {t.douyinComment.createTask}
        </Button>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 mb-4">{t.douyinComment.noTasks}</p>
            <Button onClick={handleCreate} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              {t.douyinComment.createFirst}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tasks.map(task => (
              <Card
                key={task.uuid}
                className="hover:shadow-md transition-shadow"
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-base truncate">
                      {task.name}
                    </CardTitle>
                    {getStatusBadge(task)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Search className="w-3 h-3" />
                    <span className="truncate">
                      {task.search_keywords.slice(0, 2).join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-500">
                    {task.interaction.watch_video && (
                      <Eye className="w-3 h-3" />
                    )}
                    {task.interaction.like_video && (
                      <Heart className="w-3 h-3" />
                    )}
                    {task.interaction.favorite_video && (
                      <Star className="w-3 h-3" />
                    )}
                    <span className="text-xs">
                      {t.douyinComment.replyShort}:{' '}
                      {(task.comment.reply_ratio * 100).toFixed(1)}%
                    </span>
                  </div>
                  {task.cron_expression && (
                    <div className="font-mono text-xs text-slate-400">
                      {task.cron_expression}
                    </div>
                  )}

                  {(() => {
                    const failures = task.consecutive_failures ?? 0;
                    if (failures <= 0) return null;
                    return (
                      <div className="text-xs text-orange-600">
                        {t.douyinComment.consecutiveFailuresShort}: {failures}
                      </div>
                    );
                  })()}

                  {task.status === 'disabled' &&
                    task.auto_paused_at &&
                    task.auto_pause_reason && (
                      <div
                        className="text-xs text-red-500 truncate"
                        title={task.auto_pause_reason}
                      >
                        {t.douyinComment.autoPausedShort}:{' '}
                        {task.auto_pause_reason}
                      </div>
                    )}
                  <div className="text-xs text-slate-400">
                    {t.douyinComment.nextRunShort}:{' '}
                    {formatDateTime(task.next_run)}
                  </div>
                  {/* 操作按钮 */}
                  <div className="flex flex-wrap gap-1 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => handleEdit(task)}
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                    {task.status === 'running' ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => handleAbort(task.uuid)}
                      >
                        <Square className="w-3 h-3" />
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => handleToggleStatus(task)}
                        >
                          {task.status === 'enabled' ? (
                            <PowerOff className="w-3 h-3" />
                          ) : (
                            <Power className="w-3 h-3" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => handleRunNow(task.uuid)}
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => handleViewHistory(task)}
                    >
                      <History className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-red-500 hover:text-red-600"
                      onClick={() => handleDelete(task.uuid)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 创建/编辑对话框 */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTask
                ? t.douyinComment.editTask
                : t.douyinComment.createTask}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="basic">
                {t.douyinComment.tabBasic}
              </TabsTrigger>
              <TabsTrigger value="behavior">
                {t.douyinComment.tabBehavior}
              </TabsTrigger>
              <TabsTrigger value="content">
                {t.douyinComment.tabContent}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.douyinComment.taskName}</Label>
                  <Input
                    className="rounded-none"
                    value={formData.name}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, name: e.target.value }))
                    }
                    placeholder={t.douyinComment.taskNamePlaceholder}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.douyinComment.device}</Label>
                  <Select
                    value={formData.device_id}
                    onValueChange={value =>
                      setFormData(prev => ({ ...prev, device_id: value }))
                    }
                  >
                    <SelectTrigger className="rounded-none">
                      <span>
                        {devices.find(d => d.id === formData.device_id)
                          ? `${devices.find(d => d.id === formData.device_id)?.model} (${formData.device_id})`
                          : t.douyinComment.selectDevice}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {devices.map(device => (
                        <SelectItem key={device.id} value={device.id}>
                          {device.model} ({device.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t.douyinComment.searchKeywordsLabel}</Label>
                <Textarea
                  className="rounded-none resize-none"
                  value={formData.search_keywords}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      search_keywords: e.target.value,
                    }))
                  }
                  placeholder={t.douyinComment.searchKeywordsExamplePlaceholder}
                  rows={3}
                />
              </div>

              {/* 搜索模式选择 */}
              <div className="space-y-2">
                <Label>{t.douyinComment.searchMode}</Label>
                <Select
                  value={formData.search_mode}
                  onValueChange={value =>
                    setFormData(prev => ({
                      ...prev,
                      search_mode: value as SearchMode,
                    }))
                  }
                >
                  <SelectTrigger className="rounded-none">
                    <span>
                      {formData.search_mode === 'douyin_index'
                        ? t.douyinComment.searchModeDouyinIndex
                        : t.douyinComment.searchModeKeyword}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">
                      {t.douyinComment.searchModeKeyword}
                    </SelectItem>
                    <SelectItem value="douyin_index">
                      {t.douyinComment.searchModeDouyinIndex}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  {t.douyinComment.searchModeHint}
                </p>
              </div>

              {/* 关键词搜索模式的筛选配置 */}
              {formData.search_mode === 'keyword' && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{t.douyinComment.minLikes}</Label>
                      <Input
                        className="rounded-none"
                        type="number"
                        value={formData.video_filter.min_likes}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            video_filter: {
                              ...prev.video_filter,
                              min_likes: parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.douyinComment.maxLikes}</Label>
                      <Input
                        className="rounded-none"
                        type="number"
                        value={formData.video_filter.max_likes}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            video_filter: {
                              ...prev.video_filter,
                              max_likes: parseInt(e.target.value) || 0,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.douyinComment.publishTime}</Label>
                      <Select
                        value={formData.video_filter.publish_time}
                        onValueChange={value =>
                          setFormData(prev => ({
                            ...prev,
                            video_filter: {
                              ...prev.video_filter,
                              publish_time: value as
                                | 'default'
                                | 'day'
                                | 'week'
                                | 'half_year',
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="rounded-none">
                          <span>
                            {formData.video_filter.publish_time === 'day'
                              ? t.douyinComment.publishTimeDay
                              : formData.video_filter.publish_time === 'week'
                                ? t.douyinComment.publishTimeWeek
                                : formData.video_filter.publish_time ===
                                    'half_year'
                                  ? t.douyinComment.publishTimeHalfYear
                                  : t.douyinComment.publishTimeDefault}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">
                            {t.douyinComment.publishTimeDefault}
                          </SelectItem>
                          <SelectItem value="day">
                            {t.douyinComment.publishTimeDay}
                          </SelectItem>
                          <SelectItem value="week">
                            {t.douyinComment.publishTimeWeek}
                          </SelectItem>
                          <SelectItem value="half_year">
                            {t.douyinComment.publishTimeHalfYear}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t.douyinComment.videoSort}</Label>
                      <Select
                        value={formData.video_filter.sort_by}
                        onValueChange={value =>
                          setFormData(prev => ({
                            ...prev,
                            video_filter: {
                              ...prev.video_filter,
                              sort_by: value as
                                | 'latest'
                                | 'most_liked'
                                | 'default',
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="rounded-none">
                          <span>
                            {formData.video_filter.sort_by === 'latest'
                              ? t.douyinComment.videoSortLatest
                              : formData.video_filter.sort_by === 'most_liked'
                                ? t.douyinComment.videoSortMostLiked
                                : t.douyinComment.videoSortDefault}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="latest">
                            {t.douyinComment.videoSortLatest}
                          </SelectItem>
                          <SelectItem value="most_liked">
                            {t.douyinComment.videoSortMostLiked}
                          </SelectItem>
                          <SelectItem value="default">
                            {t.douyinComment.videoSortDefault}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* 抖音指数模式的筛选配置 */}
              {formData.search_mode === 'douyin_index' && (
                <div className="space-y-3 p-4 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <Label className="text-sm font-medium">
                    {t.douyinComment.douyinIndexFilterConfig}
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t.douyinComment.douyinIndexPublishTime}</Label>
                      <Select
                        value={formData.douyin_index_filter.publish_time}
                        onValueChange={value =>
                          setFormData(prev => ({
                            ...prev,
                            douyin_index_filter: {
                              ...prev.douyin_index_filter,
                              publish_time: value as
                                | 'default'
                                | '3days'
                                | '7days'
                                | 'month',
                            },
                          }))
                        }
                      >
                        <SelectTrigger className="rounded-none">
                          <span>
                            {formData.douyin_index_filter.publish_time ===
                            '3days'
                              ? t.douyinComment.douyinIndexPublishTime3Days
                              : formData.douyin_index_filter.publish_time ===
                                  '7days'
                                ? t.douyinComment.douyinIndexPublishTime7Days
                                : formData.douyin_index_filter.publish_time ===
                                    'month'
                                  ? t.douyinComment.douyinIndexPublishTimeMonth
                                  : t.douyinComment
                                      .douyinIndexPublishTimeDefault}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">
                            {t.douyinComment.douyinIndexPublishTimeDefault}
                          </SelectItem>
                          <SelectItem value="3days">
                            {t.douyinComment.douyinIndexPublishTime3Days}
                          </SelectItem>
                          <SelectItem value="7days">
                            {t.douyinComment.douyinIndexPublishTime7Days}
                          </SelectItem>
                          <SelectItem value="month">
                            {t.douyinComment.douyinIndexPublishTimeMonth}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    {t.douyinComment.douyinIndexFilterHint}
                  </p>
                </div>
              )}

              {/* 定时执行配置 */}
              <div className="space-y-3 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    {t.douyinComment.scheduleConfig}
                  </Label>
                  <Switch
                    checked={!!formData.cron_expression}
                    onCheckedChange={checked =>
                      setFormData(prev => ({
                        ...prev,
                        cron_expression: checked ? '*/30 * * * *' : '',
                      }))
                    }
                  />
                </div>

                {formData.cron_expression && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-3">
                      <Label className="text-sm whitespace-nowrap">
                        {t.douyinComment.scheduleEvery}
                      </Label>
                      <Select
                        value={(() => {
                          // 解析当前 cron 表达式
                          const parts = formData.cron_expression.split(' ');
                          const minPart = parts[0] || '';
                          const hourPart = parts[1] || '*';

                          // 分钟间隔: */N * * * *
                          const minMatch = minPart.match(/\*\/(\d+)/);
                          if (minMatch && hourPart === '*') {
                            return `${minMatch[1]}m`;
                          }

                          // 小时间隔: 0 */N * * *
                          const hourMatch = hourPart.match(/\*\/(\d+)/);
                          if (hourMatch && minPart === '0') {
                            return `${hourMatch[1]}h`;
                          }

                          return '30m'; // 默认
                        })()}
                        onValueChange={value => {
                          let newCron = '';
                          if (value.endsWith('m')) {
                            const mins = value.replace('m', '');
                            newCron = `*/${mins} * * * *`;
                          } else {
                            const hours = value.replace('h', '');
                            newCron = `0 */${hours} * * *`;
                          }
                          setFormData(prev => ({
                            ...prev,
                            cron_expression: newCron,
                          }));
                        }}
                      >
                        <SelectTrigger className="w-28 rounded-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10m">
                            {t.douyinComment.intervalMinutes.replace(
                              '{value}',
                              '10'
                            )}
                          </SelectItem>
                          <SelectItem value="15m">
                            {t.douyinComment.intervalMinutes.replace(
                              '{value}',
                              '15'
                            )}
                          </SelectItem>
                          <SelectItem value="20m">
                            {t.douyinComment.intervalMinutes.replace(
                              '{value}',
                              '20'
                            )}
                          </SelectItem>
                          <SelectItem value="30m">
                            {t.douyinComment.intervalMinutes.replace(
                              '{value}',
                              '30'
                            )}
                          </SelectItem>
                          <SelectItem value="45m">
                            {t.douyinComment.intervalMinutes.replace(
                              '{value}',
                              '45'
                            )}
                          </SelectItem>
                          <SelectItem value="1h">
                            {t.douyinComment.intervalHours.replace(
                              '{value}',
                              '1'
                            )}
                          </SelectItem>
                          <SelectItem value="2h">
                            {t.douyinComment.intervalHours.replace(
                              '{value}',
                              '2'
                            )}
                          </SelectItem>
                          <SelectItem value="3h">
                            {t.douyinComment.intervalHours.replace(
                              '{value}',
                              '3'
                            )}
                          </SelectItem>
                          <SelectItem value="4h">
                            {t.douyinComment.intervalHours.replace(
                              '{value}',
                              '4'
                            )}
                          </SelectItem>
                          <SelectItem value="6h">
                            {t.douyinComment.intervalHours.replace(
                              '{value}',
                              '6'
                            )}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Label className="text-sm whitespace-nowrap">
                        {t.douyinComment.scheduleOnce}
                      </Label>
                    </div>

                    <div className="flex items-center gap-3">
                      <Label className="text-sm whitespace-nowrap">
                        {t.douyinComment.scheduleEndTime}
                      </Label>
                      <Input
                        type="time"
                        className="w-32 rounded-none"
                        value={formData.end_time}
                        onChange={e =>
                          setFormData(prev => ({
                            ...prev,
                            end_time: e.target.value,
                          }))
                        }
                        placeholder={t.douyinComment.scheduleNoLimitPlaceholder}
                      />
                      {formData.end_time && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setFormData(prev => ({ ...prev, end_time: '' }))
                          }
                        >
                          {t.douyinComment.clear}
                        </Button>
                      )}
                      <span className="text-xs text-slate-500">
                        {t.douyinComment.scheduleEndTimeHint}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="behavior" className="space-y-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {t.douyinComment.interactionSectionTitle}
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">
                      {t.douyinComment.watchVideo}
                    </Label>
                    <Switch
                      checked={formData.interaction.watch_video}
                      onCheckedChange={checked =>
                        setFormData(prev => ({
                          ...prev,
                          interaction: {
                            ...prev.interaction,
                            watch_video: checked,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">
                      {t.douyinComment.likeVideo}
                    </Label>
                    <Switch
                      checked={formData.interaction.like_video}
                      onCheckedChange={checked =>
                        setFormData(prev => ({
                          ...prev,
                          interaction: {
                            ...prev.interaction,
                            like_video: checked,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">
                      {t.douyinComment.favoriteVideo}
                    </Label>
                    <Switch
                      checked={formData.interaction.favorite_video}
                      onCheckedChange={checked =>
                        setFormData(prev => ({
                          ...prev,
                          interaction: {
                            ...prev.interaction,
                            favorite_video: checked,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">
                      {t.douyinComment.targetHotComments}
                    </Label>
                    <Switch
                      checked={formData.comment.target_hot_comments}
                      onCheckedChange={checked =>
                        setFormData(prev => ({
                          ...prev,
                          comment: {
                            ...prev.comment,
                            target_hot_comments: checked,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">
                      {t.douyinComment.targetQuestionComments}
                    </Label>
                    <Switch
                      checked={formData.comment.target_question_comments}
                      onCheckedChange={checked =>
                        setFormData(prev => ({
                          ...prev,
                          comment: {
                            ...prev.comment,
                            target_question_comments: checked,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
              {formData.comment.mode === 'reply' && (
                <div className="space-y-2">
                  <Label>{t.douyinComment.targetRegionsLabel}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between rounded-none"
                      >
                        <span className="truncate text-left">
                          {formData.comment.target_regions.length === 0
                            ? t.douyinComment.noLimit
                            : formData.comment.target_regions.length <= 3
                              ? formData.comment.target_regions.join('、')
                              : t.douyinComment.selectedRegionsCount.replace(
                                  '{count}',
                                  String(formData.comment.target_regions.length)
                                )}
                        </span>
                        <div className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{t.douyinComment.multiSelect}</span>
                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      portal={false}
                      className="w-[420px] rounded-none p-0"
                    >
                      <div className="p-3 pb-2 border-b">
                        <Input
                          className="rounded-none"
                          placeholder={t.douyinComment.searchRegionPlaceholder}
                          value={regionQuery}
                          onChange={e => setRegionQuery(e.target.value)}
                        />
                      </div>

                      {formData.comment.target_regions.length > 0 && (
                        <div className="flex flex-wrap gap-1 p-3 pb-2 border-b">
                          {formData.comment.target_regions.map(region => (
                            <Badge
                              key={region}
                              variant="default"
                              className="cursor-pointer hover:bg-destructive"
                              onClick={() => toggleRegion(region)}
                            >
                              {region} ×
                            </Badge>
                          ))}
                        </div>
                      )}

                      <ScrollArea className="h-56">
                        <div className="p-2">
                          {(regionQuery.trim()
                            ? filteredProvinces
                            : CHINA_PROVINCES
                          ).map(province => {
                            const selected =
                              formData.comment.target_regions.includes(
                                province
                              );
                            return (
                              <button
                                key={province}
                                type="button"
                                className={`relative flex w-full select-none items-center rounded-none py-1.5 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted ${
                                  selected ? 'bg-muted' : ''
                                }`}
                                onClick={() => toggleRegion(province)}
                              >
                                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                  {selected ? (
                                    <Check className="h-4 w-4" />
                                  ) : null}
                                </span>
                                <span className="truncate">{province}</span>
                              </button>
                            );
                          })}
                        </div>
                      </ScrollArea>

                      <div className="p-3 pt-2 border-t">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full rounded-none"
                          onClick={() =>
                            setFormData(prev => ({
                              ...prev,
                              comment: { ...prev.comment, target_regions: [] },
                            }))
                          }
                          disabled={
                            formData.comment.target_regions.length === 0
                          }
                        >
                          {t.douyinComment.clearSelection}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.douyinComment.watchDurationRatioLabel}</Label>
                  <Input
                    className="rounded-none"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={formData.interaction.watch_duration_ratio}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        interaction: {
                          ...prev.interaction,
                          watch_duration_ratio:
                            parseFloat(e.target.value) || 0.8,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.douyinComment.likeProbability}</Label>
                  <Input
                    className="rounded-none"
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={formData.interaction.like_probability}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        interaction: {
                          ...prev.interaction,
                          like_probability: parseFloat(e.target.value) || 0.9,
                        },
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {t.douyinComment.commentConfig}
                </Label>
                <div className="space-y-2">
                  <Label>{t.douyinComment.commentMode}</Label>
                  <Select
                    value={formData.comment.mode}
                    onValueChange={value =>
                      setFormData(prev => ({
                        ...prev,
                        comment: {
                          ...prev.comment,
                          mode: value as 'reply' | 'direct',
                        },
                      }))
                    }
                  >
                    <SelectTrigger className="rounded-none">
                      <span>
                        {formData.comment.mode === 'direct'
                          ? t.douyinComment.commentModeDirect
                          : t.douyinComment.commentModeReply}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">
                        {t.douyinComment.commentModeDirect}
                      </SelectItem>
                      <SelectItem value="reply">
                        {t.douyinComment.commentModeReply}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.comment.mode === 'reply' && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>{t.douyinComment.replyRatio}</Label>
                        <Input
                          className="rounded-none"
                          type="number"
                          step="0.001"
                          min="0"
                          max="1"
                          value={formData.comment.reply_ratio}
                          onChange={e =>
                            setFormData(prev => ({
                              ...prev,
                              comment: {
                                ...prev.comment,
                                reply_ratio: parseFloat(e.target.value) || 0.01,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t.douyinComment.minReplies}</Label>
                        <Input
                          className="rounded-none"
                          type="number"
                          min="0"
                          value={formData.comment.min_replies_per_video}
                          onChange={e =>
                            setFormData(prev => ({
                              ...prev,
                              comment: {
                                ...prev.comment,
                                min_replies_per_video:
                                  parseInt(e.target.value) || 1,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t.douyinComment.maxReplies}</Label>
                        <Input
                          className="rounded-none"
                          type="number"
                          min="1"
                          value={formData.comment.max_replies_per_video}
                          onChange={e =>
                            setFormData(prev => ({
                              ...prev,
                              comment: {
                                ...prev.comment,
                                max_replies_per_video:
                                  parseInt(e.target.value) || 5,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t.douyinComment.replyIntervalMinSeconds}</Label>
                        <Input
                          className="rounded-none"
                          type="number"
                          min="1"
                          value={formData.comment.reply_interval_min}
                          onChange={e =>
                            setFormData(prev => ({
                              ...prev,
                              comment: {
                                ...prev.comment,
                                reply_interval_min:
                                  parseInt(e.target.value) || 10,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t.douyinComment.replyIntervalMaxSeconds}</Label>
                        <Input
                          className="rounded-none"
                          type="number"
                          min="1"
                          value={formData.comment.reply_interval_max}
                          onChange={e =>
                            setFormData(prev => ({
                              ...prev,
                              comment: {
                                ...prev.comment,
                                reply_interval_max:
                                  parseInt(e.target.value) || 30,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {t.douyinComment.executionConfig}
                </Label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t.douyinComment.videosPerRun}</Label>
                    <Input
                      className="rounded-none"
                      type="number"
                      min="1"
                      value={formData.execution.videos_per_run}
                      onChange={e =>
                        setFormData(prev => ({
                          ...prev,
                          execution: {
                            ...prev.execution,
                            videos_per_run: parseInt(e.target.value) || 5,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.douyinComment.videoIntervalMinSeconds}</Label>
                    <Input
                      className="rounded-none"
                      type="number"
                      min="1"
                      value={formData.execution.video_interval_min}
                      onChange={e =>
                        setFormData(prev => ({
                          ...prev,
                          execution: {
                            ...prev.execution,
                            video_interval_min: parseInt(e.target.value) || 60,
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.douyinComment.videoIntervalMaxSeconds}</Label>
                    <Input
                      className="rounded-none"
                      type="number"
                      min="1"
                      value={formData.execution.video_interval_max}
                      onChange={e =>
                        setFormData(prev => ({
                          ...prev,
                          execution: {
                            ...prev.execution,
                            video_interval_max: parseInt(e.target.value) || 180,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t.douyinComment.useAiReply}</Label>
                <Switch
                  checked={formData.content.use_ai}
                  onCheckedChange={checked =>
                    setFormData(prev => ({
                      ...prev,
                      content: { ...prev.content, use_ai: checked },
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t.douyinComment.replyStyle}</Label>
                <Select
                  value={formData.content.style}
                  onValueChange={value =>
                    setFormData(prev => ({
                      ...prev,
                      content: { ...prev.content, style: value },
                    }))
                  }
                >
                  <SelectTrigger className="rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="koc">
                      {t.douyinComment.styleKocNatural}
                    </SelectItem>
                    <SelectItem value="professional">
                      {t.douyinComment.styleProfessional}
                    </SelectItem>
                    <SelectItem value="casual">
                      {t.douyinComment.styleCasual}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.douyinComment.replyTemplatesLabel}</Label>
                <Textarea
                  className="rounded-none resize-none"
                  value={formData.content.templates}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      content: { ...prev.content, templates: e.target.value },
                    }))
                  }
                  placeholder={t.douyinComment.replyTemplatesPlaceholder}
                  rows={5}
                />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !formData.name.trim() ||
                !formData.device_id ||
                !formData.search_keywords.trim()
              }
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingTask ? t.common.save : t.common.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 历史记录对话框 */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[70vh]">
          <DialogHeader>
            <DialogTitle>{t.douyinComment.history}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh]">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : selectedTaskHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                {t.douyinComment.noHistory}
              </div>
            ) : (
              <div className="space-y-2">
                {selectedTaskHistory.map(record => (
                  <div key={record.uuid} className="border rounded-none">
                    <div className="flex items-center gap-3 p-3">
                      {getHistoryStatusIcon(record.status)}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          {formatDateTime(record.started_at)}
                        </div>
                        {record.error && (
                          <div className="text-xs text-red-500 truncate">
                            {record.error}
                          </div>
                        )}
                      </div>
                      <Badge
                        variant={
                          record.status === 'success'
                            ? 'default'
                            : record.status === 'partial'
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        {getHistoryStatusLabel(record.status)}
                      </Badge>
                    </div>
                    {record.result && (
                      <div className="border-t px-3 py-2 bg-slate-50 dark:bg-slate-900">
                        <div className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                          {record.result}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DouyinCommentComponent;
