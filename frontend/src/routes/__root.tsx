import * as React from 'react';
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { getStatus, checkVersion, type VersionCheckResponse } from '../api';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Github, Globe, Settings } from 'lucide-react';
import { useLocale, useTranslation } from '../lib/i18n-context';
import { ThemeToggle } from '../components/ThemeToggle';
import { NavigationSidebar } from '../components/NavigationSidebar';
import { ConfigDialog } from '../components/ConfigDialog';
import { Toast, type ToastType } from '../components/Toast';

// 全局状态：配置对话框
const configDialogState = {
  setOpen: null as ((open: boolean) => void) | null,
};

// eslint-disable-next-line react-refresh/only-export-components
export const triggerOpenConfig = () => {
  configDialogState.setOpen?.(true);
};

export const Route = createRootRoute({
  component: RootComponent,
});

function Footer({ onOpenConfig }: { onOpenConfig: () => void }) {
  const buildBackendVersion = __BACKEND_VERSION__ || 'unknown';
  const [backendVersion, setBackendVersion] = React.useState<string | null>(
    null
  );
  const [versionMismatch, setVersionMismatch] = React.useState(false);
  const { locale, setLocale, localeName } = useLocale();
  const t = useTranslation();
  const [updateInfo, setUpdateInfo] =
    React.useState<VersionCheckResponse | null>(null);
  const [showUpdateBadge, setShowUpdateBadge] = React.useState(false);

  React.useEffect(() => {
    getStatus()
      .then(status => {
        setBackendVersion(status.version);
        if (
          buildBackendVersion !== 'unknown' &&
          status.version !== buildBackendVersion
        ) {
          setVersionMismatch(true);
        } else {
          setVersionMismatch(false);
        }
      })
      .catch(() => setBackendVersion(null));

    // Check for updates
    const checkForUpdates = async () => {
      // 1. Check session storage cache (1 hour TTL)
      const cachedCheck = sessionStorage.getItem('version_check');
      if (cachedCheck) {
        try {
          const { data, timestamp } = JSON.parse(cachedCheck);
          if (Date.now() - timestamp < 3600000) {
            // 1 hour
            setUpdateInfo(data);
            setShowUpdateBadge(data.has_update);
            return;
          }
        } catch (e) {
          console.log(e);
          // Invalid cache, continue to fetch
        }
      }

      // 2. Fetch from API
      try {
        const result = await checkVersion();
        setUpdateInfo(result);

        // Cache in session storage
        sessionStorage.setItem(
          'version_check',
          JSON.stringify({
            data: result,
            timestamp: Date.now(),
          })
        );

        // Show badge if update available
        setShowUpdateBadge(result.has_update);
      } catch (err) {
        console.error('Failed to check for updates:', err);
        // Silently fail - non-critical feature
      }
    };

    checkForUpdates();
  }, [buildBackendVersion]);

  const displayedVersion = backendVersion ?? buildBackendVersion;
  const versionTitle =
    versionMismatch && backendVersion
      ? t.footer.versionMismatchDetail
          .replace('{frontend}', buildBackendVersion)
          .replace('{backend}', backendVersion)
      : t.footer.buildVersion.replace('{version}', buildBackendVersion);

  const toggleLocale = () => {
    setLocale(locale === 'en' ? 'zh' : 'en');
  };

  const handleUpdateClick = () => {
    if (updateInfo?.release_url) {
      // Open release page in new tab
      window.open(updateInfo.release_url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5" title={versionTitle}>
            v{displayedVersion}
            {showUpdateBadge && updateInfo?.latest_version && (
              <Badge
                variant="warning"
                className="cursor-pointer hover:opacity-80 transition-opacity"
                onClick={handleUpdateClick}
                title={t.footer.updateAvailable.replace(
                  '{version}',
                  updateInfo.latest_version
                )}
              >
                {t.footer.newVersion}
              </Badge>
            )}
            {versionMismatch && backendVersion && (
              <Badge variant="warning">{t.footer.versionMismatch}</Badge>
            )}
          </span>
          <Separator
            orientation="vertical"
            className="h-4 bg-slate-200 dark:bg-slate-700"
          />
          <button
            onClick={toggleLocale}
            className="hover:text-[#1d9bf0] transition-colors flex items-center gap-1"
            title="Switch language"
          >
            <Globe className="w-4 h-4" />
            {localeName}
          </button>
          <Separator
            orientation="vertical"
            className="h-4 bg-slate-200 dark:bg-slate-700"
          />
          <ThemeToggle />
          <Separator
            orientation="vertical"
            className="h-4 bg-slate-200 dark:bg-slate-700"
          />
          <a
            href="https://github.com/suyiiyii/AutoGLM-GUI"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#1d9bf0] transition-colors flex items-center gap-1"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
          <Separator
            orientation="vertical"
            className="h-4 bg-slate-200 dark:bg-slate-700"
          />
          <button
            onClick={onOpenConfig}
            className="hover:text-[#1d9bf0] transition-colors flex items-center gap-1"
            title={t.deviceSidebar?.settings || '设置'}
          >
            <Settings className="w-4 h-4" />
            {t.deviceSidebar?.settings || '设置'}
          </button>
        </div>
      </div>
    </footer>
  );
}

function RootComponent() {
  const [showConfig, setShowConfig] = React.useState(false);
  const [toast, setToast] = React.useState<{
    message: string;
    type: ToastType;
    visible: boolean;
  }>({ message: '', type: 'info', visible: false });

  // 注册全局配置对话框控制
  React.useEffect(() => {
    configDialogState.setOpen = setShowConfig;
    return () => {
      configDialogState.setOpen = null;
    };
  }, []);

  const showToastFn = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, visible: true });
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {toast.visible && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(prev => ({ ...prev, visible: false }))}
        />
      )}
      <ConfigDialog
        open={showConfig}
        onOpenChange={setShowConfig}
        onToast={showToastFn}
      />
      <div className="flex-1 flex overflow-hidden">
        <NavigationSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
          <Footer onOpenConfig={() => setShowConfig(true)} />
        </div>
      </div>
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  );
}
