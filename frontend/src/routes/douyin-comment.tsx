import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
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
  video_filter: {
    min_likes: number;
    max_likes: number;
    publish_time: 'default' | 'day' | 'week' | 'half_year';
    sort_by: 'latest' | 'most_liked' | 'default';
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
  video_filter: {
    min_likes: 1000,
    max_likes: 50000,
    publish_time: 'default' as const,
    sort_by: 'latest' as const,
  },
  interaction: {
    watch_video: true,
    watch_duration_ratio: 0.8,
    like_video: true,
    favorite_video: true,
    like_probability: 0.9,
  },
  comment: {
    mode: 'reply' as const,
    reply_ratio: 0.01,
    max_replies_per_video: 5,
    min_replies_per_video: 1,
    target_hot_comments: true,
    target_question_comments: false,
    target_regions: [],
    reply_interval_min: 10,
    reply_interval_max: 30,
  },
  content: { use_ai: true, style: 'koc', templates: '' },
  execution: {
    videos_per_run: 5,
    video_interval_min: 60,
    video_interval_max: 180,
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
        title: '错误',
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

  // 轮询运行中的任务状态
  useEffect(() => {
    const runningTasks = tasks.filter(t => t.status === 'running');
    if (runningTasks.length === 0) return;

    const interval = setInterval(loadTasks, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const handleCreate = () => {
    setEditingTask(null);
    setFormData({ ...defaultFormData, device_id: devices[0]?.id || '' });
    setShowDialog(true);
  };

  const handleEdit = (task: DouyinCommentTask) => {
    setEditingTask(task);
    setFormData({
      name: task.name,
      device_id: task.device_id,
      search_keywords: task.search_keywords.join('\n'),
      video_filter: {
        ...task.video_filter,
        publish_time: task.video_filter.publish_time || 'default',
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
      const payload = {
        name: formData.name,
        device_id: formData.device_id,
        search_keywords: formData.search_keywords
          .split('\n')
          .filter(k => k.trim()),
        video_filter: formData.video_filter,
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
        cron_expression: formData.cron_expression || undefined,
        end_time: formData.end_time || undefined,
      };
      if (editingTask) {
        await updateDouyinCommentTask(editingTask.uuid, payload);
        toast({ title: '任务已更新' });
      } else {
        await createDouyinCommentTask(payload);
        toast({ title: '任务已创建' });
      }
      setShowDialog(false);
      loadTasks();
    } catch (error) {
      toast({
        title: '错误',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (uuid: string) => {
    if (!window.confirm('确定要删除此任务吗？')) return;
    try {
      await deleteDouyinCommentTask(uuid);
      toast({ title: '任务已删除' });
      loadTasks();
    } catch (error) {
      toast({
        title: '错误',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (task: DouyinCommentTask) => {
    try {
      if (task.status === 'enabled') {
        await disableDouyinCommentTask(task.uuid);
        toast({ title: '任务已禁用' });
      } else {
        await enableDouyinCommentTask(task.uuid);
        toast({ title: '任务已启用' });
      }
      loadTasks();
    } catch (error) {
      toast({
        title: '错误',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleRunNow = async (uuid: string) => {
    try {
      await runDouyinCommentTaskNow(uuid);
      toast({ title: '任务已启动' });
      loadTasks();
    } catch (error) {
      toast({
        title: '错误',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleAbort = async (uuid: string) => {
    try {
      await abortDouyinCommentTask(uuid);
      toast({ title: '任务已停止' });
      loadTasks();
    } catch (error) {
      toast({
        title: '错误',
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
        title: '错误',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'enabled':
        return (
          <Badge className="bg-green-500">
            <Power className="w-3 h-3 mr-1" />
            已启用
          </Badge>
        );
      case 'disabled':
        return (
          <Badge variant="secondary">
            <PowerOff className="w-3 h-3 mr-1" />
            已禁用
          </Badge>
        );
      case 'running':
        return (
          <Badge className="bg-blue-500">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            运行中
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

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '从未';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-6 h-6" />
          <h1 className="text-xl font-bold">
            {t.douyinComment?.title || '抖音评论引流'}
          </h1>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          创建任务
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
            <p className="text-slate-500 mb-4">暂无评论任务</p>
            <Button onClick={handleCreate} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              创建第一个任务
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
                    {getStatusBadge(task.status)}
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
                      回复: {(task.comment.reply_ratio * 100).toFixed(1)}%
                    </span>
                  </div>
                  {task.cron_expression && (
                    <div className="font-mono text-xs text-slate-400">
                      {task.cron_expression}
                    </div>
                  )}
                  <div className="text-xs text-slate-400">
                    下次: {formatDateTime(task.next_run)}
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
            <DialogTitle>{editingTask ? '编辑任务' : '创建任务'}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="basic">基本配置</TabsTrigger>
              <TabsTrigger value="behavior">行为配置</TabsTrigger>
              <TabsTrigger value="content">内容配置</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>任务名称</Label>
                  <Input
                    className="rounded-none"
                    value={formData.name}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="例如：香菇美食评论引流"
                  />
                </div>
                <div className="space-y-2">
                  <Label>设备</Label>
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
                          : '选择设备'}
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
                <Label>搜索关键词（每行一个）</Label>
                <Textarea
                  className="rounded-none resize-none"
                  value={formData.search_keywords}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      search_keywords: e.target.value,
                    }))
                  }
                  placeholder="香菇做法&#10;银耳羹做法&#10;菌菇汤"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>最小点赞数</Label>
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
                  <Label>最大点赞数</Label>
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
                  <Label>发布时间</Label>
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
                          ? '一天内'
                          : formData.video_filter.publish_time === 'week'
                            ? '一周内'
                            : formData.video_filter.publish_time === 'half_year'
                              ? '半年内'
                              : '不限'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">不限</SelectItem>
                      <SelectItem value="day">一天内</SelectItem>
                      <SelectItem value="week">一周内</SelectItem>
                      <SelectItem value="half_year">半年内</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>视频排序</Label>
                  <Select
                    value={formData.video_filter.sort_by}
                    onValueChange={value =>
                      setFormData(prev => ({
                        ...prev,
                        video_filter: {
                          ...prev.video_filter,
                          sort_by: value as 'latest' | 'most_liked' | 'default',
                        },
                      }))
                    }
                  >
                    <SelectTrigger className="rounded-none">
                      <span>
                        {formData.video_filter.sort_by === 'latest'
                          ? '最新发布'
                          : formData.video_filter.sort_by === 'most_liked'
                            ? '最多点赞'
                            : '默认排序'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest">最新发布</SelectItem>
                      <SelectItem value="most_liked">最多点赞</SelectItem>
                      <SelectItem value="default">默认排序</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 定时执行配置 */}
              <div className="space-y-3 p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">定时执行</Label>
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
                      <Label className="text-sm whitespace-nowrap">每隔</Label>
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
                          <SelectItem value="10m">10 分钟</SelectItem>
                          <SelectItem value="15m">15 分钟</SelectItem>
                          <SelectItem value="20m">20 分钟</SelectItem>
                          <SelectItem value="30m">30 分钟</SelectItem>
                          <SelectItem value="45m">45 分钟</SelectItem>
                          <SelectItem value="1h">1 小时</SelectItem>
                          <SelectItem value="2h">2 小时</SelectItem>
                          <SelectItem value="3h">3 小时</SelectItem>
                          <SelectItem value="4h">4 小时</SelectItem>
                          <SelectItem value="6h">6 小时</SelectItem>
                        </SelectContent>
                      </Select>
                      <Label className="text-sm whitespace-nowrap">
                        执行一次
                      </Label>
                    </div>

                    <div className="flex items-center gap-3">
                      <Label className="text-sm whitespace-nowrap">
                        结束时间
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
                        placeholder="不限制"
                      />
                      {formData.end_time && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setFormData(prev => ({ ...prev, end_time: '' }))
                          }
                        >
                          清除
                        </Button>
                      )}
                      <span className="text-xs text-slate-500">
                        到达此时间后停止调度
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="behavior" className="space-y-4">
              <div className="space-y-3">
                <Label className="text-sm font-medium">观看与互动</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">观看视频</Label>
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
                    <Label className="text-sm">点赞视频</Label>
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
                    <Label className="text-sm">收藏视频</Label>
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
                    <Label className="text-sm">优先热门评论</Label>
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
                    <Label className="text-sm">优先问答评论</Label>
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
                  <Label>目标地区 IP（点击选择，留空则不限）</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between rounded-none"
                      >
                        <span className="truncate text-left">
                          {formData.comment.target_regions.length === 0
                            ? '不限'
                            : formData.comment.target_regions.length <= 3
                              ? formData.comment.target_regions.join('、')
                              : `已选择 ${formData.comment.target_regions.length} 个地区`}
                        </span>
                        <div className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>多选</span>
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
                          placeholder="搜索地区…"
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
                          清空选择
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>观看时长比例</Label>
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
                  <Label>点赞概率</Label>
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
                <Label className="text-sm font-medium">评论配置</Label>
                <div className="space-y-2">
                  <Label>评论模式</Label>
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
                          ? '直接评论（结合视频内容）'
                          : '回复评论（回复他人评论）'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">
                        直接评论（结合视频内容）
                      </SelectItem>
                      <SelectItem value="reply">
                        回复评论（回复他人评论）
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.comment.mode === 'reply' && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>回复比例</Label>
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
                        <Label>最少回复数</Label>
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
                        <Label>最多回复数</Label>
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
                        <Label>回复间隔（秒）最小</Label>
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
                        <Label>回复间隔（秒）最大</Label>
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
                <Label className="text-sm font-medium">执行配置</Label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>每次处理视频数</Label>
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
                    <Label>视频间隔（秒）最小</Label>
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
                    <Label>视频间隔（秒）最大</Label>
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
                <Label>使用 AI 生成回复</Label>
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
                <Label>回复风格</Label>
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
                    <SelectItem value="koc">KOC 风格（自然口语化）</SelectItem>
                    <SelectItem value="professional">专业风格</SelectItem>
                    <SelectItem value="casual">随意风格</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>回复模板（每行一个，仅供参考）</Label>
                <Textarea
                  className="rounded-none resize-none"
                  value={formData.content.templates}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      content: { ...prev.content, templates: e.target.value },
                    }))
                  }
                  placeholder="确实，说得太对了&#10;学到了，下次试试&#10;看饿了，想马上做一个"
                  rows={5}
                />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.name || !formData.device_id}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingTask ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 历史记录对话框 */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[70vh]">
          <DialogHeader>
            <DialogTitle>执行历史</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh]">
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : selectedTaskHistory.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                暂无执行记录
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
                        {record.status}
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
