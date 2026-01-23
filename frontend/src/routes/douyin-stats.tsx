import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import {
  getDouyinReplyList,
  listDouyinCommentTasks,
  type DouyinReplyRecord,
  type DouyinCommentTask,
  getErrorMessage,
} from '../api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Loader2,
  MessageCircle,
  Users,
  Video,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export const Route = createFileRoute('/douyin-stats')({
  component: DouyinStatsComponent,
});

function DouyinStatsComponent() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [records, setRecords] = useState<DouyinReplyRecord[]>([]);
  const [tasks, setTasks] = useState<DouyinCommentTask[]>([]);
  const [selectedTaskUuid, setSelectedTaskUuid] = useState<string>('all');

  // 加载任务列表
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const data = await listDouyinCommentTasks();
        setTasks(data.tasks);
      } catch (error) {
        console.error('Failed to load tasks:', error);
      }
    };
    loadTasks();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const today = new Date();
      const selected = new Date(selectedDate);
      const diffTime = today.getTime() - selected.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      const taskUuid =
        selectedTaskUuid === 'all' ? undefined : selectedTaskUuid;
      const listData = await getDouyinReplyList(taskUuid, diffDays, 500, 0);
      const filteredRecords = listData.records.filter(r =>
        r.replied_at.startsWith(selectedDate)
      );
      setRecords(filteredRecords);
    } catch (error) {
      toast({
        title: '加载失败',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedTaskUuid]);

  const changeDate = (delta: number) => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + delta);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  // 获取任务名称
  const getTaskName = (taskUuid: string) => {
    const task = tasks.find(t => t.uuid === taskUuid);
    return task?.name || taskUuid.slice(0, 8);
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      {/* 顶部：任务选择 + 日期选择 */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div className="flex items-center gap-3">
          {/* 任务筛选 */}
          <Select value={selectedTaskUuid} onValueChange={setSelectedTaskUuid}>
            <SelectTrigger className="w-[160px]">
              <span className="truncate">
                {selectedTaskUuid === 'all'
                  ? '全部任务'
                  : getTaskName(selectedTaskUuid)}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部任务</SelectItem>
              {tasks.map(task => (
                <SelectItem key={task.uuid} value={task.uuid}>
                  {task.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 日期选择 */}
          <Button variant="outline" size="sm" onClick={() => changeDate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm border rounded-none"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => changeDate(1)}
            disabled={isToday}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadStats}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* 统计数字 */}
      <div className="flex gap-6 mb-4 shrink-0 text-sm">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-blue-500" />
          <span className="text-slate-500">评论</span>
          <span className="font-bold">{records.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-green-500" />
          <span className="text-slate-500">视频</span>
          <span className="font-bold">
            {new Set(records.map(r => r.video_author)).size}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-500" />
          <span className="text-slate-500">用户</span>
          <span className="font-bold">
            {new Set(records.map(r => r.replied_user)).size}
          </span>
        </div>
      </div>

      {/* 回复内容列表 */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="h-full overflow-auto p-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              当天无评论记录
            </div>
          ) : (
            <div className="space-y-2">
              {records.map(record => (
                <div
                  key={record.id}
                  className="p-3 bg-slate-50 dark:bg-slate-800 rounded text-sm space-y-1"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {selectedTaskUuid === 'all' && (
                        <span className="text-blue-600 dark:text-blue-400 mr-2">
                          [{getTaskName(record.task_uuid)}]
                        </span>
                      )}
                      @{record.video_author}
                      {record.replied_user && ` → ${record.replied_user}`}
                    </span>
                    <span>{record.replied_at.split('T')[1]?.slice(0, 5)}</span>
                  </div>
                  <div className="text-slate-900 dark:text-slate-100">
                    {record.reply_content || '-'}
                  </div>
                  {record.original_comment && (
                    <div className="text-xs text-slate-400 border-l-2 border-slate-300 pl-2">
                      {record.original_comment}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default DouyinStatsComponent;
