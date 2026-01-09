import { Link, useMatchRoute } from '@tanstack/react-router';
import {
  MessageSquare,
  ListChecks,
  FileText,
  History,
  Clock,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from '../lib/i18n-context';
import logoImage from '@/assets/logo.png';

interface NavigationItem {
  id: string;
  icon: LucideIcon;
  label: string;
  path: string;
}

interface NavigationSidebarProps {
  className?: string;
}

export function NavigationSidebar({ className }: NavigationSidebarProps) {
  const t = useTranslation();
  const matchRoute = useMatchRoute();

  const navigationItems: NavigationItem[] = [
    {
      id: 'chat',
      icon: MessageSquare,
      label: t.navigation.chat,
      path: '/chat',
    },
    {
      id: 'workflows',
      icon: ListChecks,
      label: t.navigation.workflows,
      path: '/workflows',
    },
    {
      id: 'history',
      icon: History,
      label: t.navigation.history || '历史记录',
      path: '/history',
    },
    {
      id: 'scheduled-tasks',
      icon: Clock,
      label: t.navigation.scheduledTasks || '定时任务',
      path: '/scheduled-tasks',
    },
    {
      id: 'douyin-auto-reply',
      icon: MessageCircle,
      label: t.navigation.douyinAutoReply || '抖音自动回复',
      path: '/douyin-auto-reply',
    },
    {
      id: 'logs',
      icon: FileText,
      label: t.navigation.logs,
      path: '/logs',
    },
  ];

  return (
    <nav
      className={`w-40 h-full flex flex-col bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 ${className || ''}`}
    >
      <div className="flex flex-col py-4 gap-1">
        {/* Logo at top */}
        <div className="mb-4 pb-4 border-b border-slate-200 dark:border-slate-800 px-3">
          <Link to="/chat" className="flex items-center gap-2">
            <img
              src={logoImage}
              alt="AutoGLM Logo"
              className="w-8 h-8 object-contain"
            />
            <span className="font-semibold text-slate-900 dark:text-slate-100">AutoGLM</span>
          </Link>
        </div>

        {/* Navigation items */}
        <div className="px-2 space-y-1">
          {navigationItems.map(item => {
            const Icon = item.icon;
            const isActive = matchRoute({ to: item.path });

            return (
              <Link
                key={item.id}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm ${
                  isActive
                    ? 'bg-[#1d9bf0]/10 text-[#1d9bf0] font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
