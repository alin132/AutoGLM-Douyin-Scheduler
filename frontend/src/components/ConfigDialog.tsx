import * as React from 'react';
import { useState, useEffect } from 'react';
import {
  getConfig,
  saveConfig,
  getErrorMessage,
  type ConfigSaveRequest,
} from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Settings,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Server,
  ExternalLink,
  Brain,
  Cpu,
  Info,
  MessageSquare,
} from 'lucide-react';
import { useTranslation } from '../lib/i18n-context';

// 视觉模型预设配置
const VISION_PRESETS = [
  {
    name: 'bigmodel',
    config: {
      base_url: 'https://open.bigmodel.cn/api/paas/v4',
      model_name: 'autoglm-phone',
    },
    apiKeyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
  },
  {
    name: 'modelscope',
    config: {
      base_url: 'https://api-inference.modelscope.cn/v1',
      model_name: 'ZhipuAI/AutoGLM-Phone-9B',
    },
    apiKeyUrl: 'https://www.modelscope.cn/my/myaccesstoken',
  },
  {
    name: 'custom',
    config: {
      base_url: '',
      model_name: 'autoglm-phone-9b',
    },
  },
] as const;

// Agent 类型预设配置
const AGENT_PRESETS = [
  {
    name: 'glm',
    displayName: 'GLM Agent',
    description: '基于 GLM 模型优化，成熟稳定，适合大多数任务',
    icon: Cpu,
    defaultConfig: {},
  },
  {
    name: 'mai',
    displayName: 'MAI Agent',
    description: '阿里通义团队开发，支持多张历史截图上下文',
    icon: Brain,
    defaultConfig: {
      history_n: 3,
    },
  },
] as const;

// 决策模型预设配置
const DECISION_PRESETS = [
  {
    name: 'bigmodel',
    config: {
      decision_base_url: 'https://open.bigmodel.cn/api/paas/v4',
      decision_model_name: 'glm-4.7',
    },
    apiKeyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
  },
  {
    name: 'modelscope',
    config: {
      decision_base_url: 'https://api-inference.modelscope.cn/v1',
      decision_model_name: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
    },
    apiKeyUrl: 'https://www.modelscope.cn/my/myaccesstoken',
  },
  {
    name: 'custom',
    config: {
      decision_base_url: '',
      decision_model_name: '',
    },
  },
] as const;

// 回复模型预设配置
const REPLY_PRESETS = [
  {
    name: 'bigmodel',
    config: {
      reply_base_url: 'https://open.bigmodel.cn/api/paas/v4',
      reply_model_name: 'glm-4-flash',
    },
    apiKeyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
  },
  {
    name: 'modelscope',
    config: {
      reply_base_url: 'https://api-inference.modelscope.cn/v1',
      reply_model_name: 'Qwen/Qwen2.5-7B-Instruct',
    },
    apiKeyUrl: 'https://www.modelscope.cn/my/myaccesstoken',
  },
  {
    name: 'custom',
    config: {
      reply_base_url: '',
      reply_model_name: '',
    },
  },
] as const;

interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToast?: (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info'
  ) => void;
}

export function ConfigDialog({
  open,
  onOpenChange,
  onToast,
}: ConfigDialogProps) {
  const t = useTranslation();
  const [config, setConfig] = useState<ConfigSaveRequest | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [tempConfig, setTempConfig] = useState({
    base_url: VISION_PRESETS[0].config.base_url as string,
    model_name: VISION_PRESETS[0].config.model_name as string,
    api_key: '',
    agent_type: 'glm',
    agent_config_params: {} as Record<string, unknown>,
    default_max_steps: 100,
    decision_base_url: '',
    decision_model_name: '',
    decision_api_key: '',
    reply_base_url: '',
    reply_model_name: '',
    reply_api_key: '',
  });

  const showToast = onToast || ((msg: string) => console.log(msg));

  useEffect(() => {
    if (!open) return;

    const loadConfiguration = async () => {
      try {
        const data = await getConfig();
        setConfig({
          base_url: data.base_url,
          model_name: data.model_name,
          api_key: data.api_key || undefined,
          agent_type: data.agent_type || 'glm',
          agent_config_params: data.agent_config_params || undefined,
          default_max_steps: data.default_max_steps || 100,
          decision_base_url: data.decision_base_url || undefined,
          decision_model_name: data.decision_model_name || undefined,
          decision_api_key: data.decision_api_key || undefined,
          reply_base_url: data.reply_base_url || undefined,
          reply_model_name: data.reply_model_name || undefined,
          reply_api_key: data.reply_api_key || undefined,
        });
        const useDefault = !data.base_url;
        setTempConfig({
          base_url: useDefault
            ? VISION_PRESETS[0].config.base_url
            : data.base_url,
          model_name: useDefault
            ? VISION_PRESETS[0].config.model_name
            : data.model_name,
          api_key: data.api_key || '',
          agent_type: data.agent_type || 'glm',
          agent_config_params: data.agent_config_params || {},
          default_max_steps: data.default_max_steps || 100,
          decision_base_url: data.decision_base_url || '',
          decision_model_name: data.decision_model_name || 'glm-4.7',
          decision_api_key: data.decision_api_key || '',
          reply_base_url: data.reply_base_url || '',
          reply_model_name: data.reply_model_name || '',
          reply_api_key: data.reply_api_key || '',
        });
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    };

    loadConfiguration();
  }, [open]);

  const handleSaveConfig = async () => {
    if (!tempConfig.base_url) {
      showToast(t.chat.baseUrlRequired, 'error');
      return;
    }

    try {
      await saveConfig({
        base_url: tempConfig.base_url,
        model_name: tempConfig.model_name || 'autoglm-phone-9b',
        api_key: tempConfig.api_key || undefined,
        agent_type: tempConfig.agent_type,
        agent_config_params:
          Object.keys(tempConfig.agent_config_params).length > 0
            ? tempConfig.agent_config_params
            : undefined,
        default_max_steps: tempConfig.default_max_steps,
        decision_base_url: tempConfig.decision_base_url || undefined,
        decision_model_name: tempConfig.decision_model_name || undefined,
        decision_api_key: tempConfig.decision_api_key || undefined,
        reply_base_url: tempConfig.reply_base_url || undefined,
        reply_model_name: tempConfig.reply_model_name || undefined,
        reply_api_key: tempConfig.reply_api_key || undefined,
      });

      setConfig({
        base_url: tempConfig.base_url,
        model_name: tempConfig.model_name,
        api_key: tempConfig.api_key || undefined,
        agent_type: tempConfig.agent_type,
        agent_config_params:
          Object.keys(tempConfig.agent_config_params).length > 0
            ? tempConfig.agent_config_params
            : undefined,
        default_max_steps: tempConfig.default_max_steps,
        decision_base_url: tempConfig.decision_base_url || undefined,
        decision_model_name: tempConfig.decision_model_name || undefined,
        decision_api_key: tempConfig.decision_api_key || undefined,
        reply_base_url: tempConfig.reply_base_url || undefined,
        reply_model_name: tempConfig.reply_model_name || undefined,
        reply_api_key: tempConfig.reply_api_key || undefined,
      });

      showToast(t.toasts.configSaved, 'success');

      // 配置保存时后端会自动销毁所有 Agent，下次使用时会用新配置重新初始化
      // 不再需要调用 reinitAllAgents

      onOpenChange(false);
    } catch (err) {
      console.error('Failed to save config:', err);
      showToast(`Failed to save: ${getErrorMessage(err)}`, 'error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md h-[75vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#1d9bf0]" />
            {t.chat.configuration}
          </DialogTitle>
          <DialogDescription>{t.chat.configureApi}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="vision" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
            <TabsTrigger value="vision">
              <Eye className="w-4 h-4 mr-2" />
              {t.chat.visionModelTab}
            </TabsTrigger>
            <TabsTrigger value="decision">
              <Brain className="w-4 h-4 mr-2" />
              {t.chat.decisionModelTab}
            </TabsTrigger>
            <TabsTrigger value="reply">
              <MessageSquare className="w-4 h-4 mr-2" />
              {t.chat.replyModelTab || '回复模型'}
            </TabsTrigger>
          </TabsList>

          {/* 视觉模型 Tab */}
          <TabsContent
            value="vision"
            className="space-y-4 mt-4 overflow-y-auto flex-1 min-h-0"
          >
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t.chat.selectPreset}
              </Label>
              <div className="grid grid-cols-1 gap-2">
                {VISION_PRESETS.map(preset => (
                  <div key={preset.name} className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setTempConfig(prev => ({
                          ...prev,
                          base_url: preset.config.base_url,
                          model_name: preset.config.model_name,
                        }))
                      }
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        tempConfig.base_url === preset.config.base_url &&
                        (preset.name !== 'custom' || tempConfig.base_url === '')
                          ? 'border-[#1d9bf0] bg-[#1d9bf0]/5'
                          : 'border-slate-200 dark:border-slate-700 hover:border-[#1d9bf0]/50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Server
                          className={`w-4 h-4 ${
                            tempConfig.base_url === preset.config.base_url &&
                            (preset.name !== 'custom' ||
                              tempConfig.base_url === '')
                              ? 'text-[#1d9bf0]'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        <span className="font-medium text-sm text-slate-900 dark:text-slate-100">
                          {
                            t.presetConfigs[
                              preset.name as keyof typeof t.presetConfigs
                            ].name
                          }
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-6">
                        {
                          t.presetConfigs[
                            preset.name as keyof typeof t.presetConfigs
                          ].description
                        }
                      </p>
                    </button>
                    {'apiKeyUrl' in preset && (
                      <a
                        href={preset.apiKeyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors group"
                        title={t.chat.getApiKey || '获取 API Key'}
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#1d9bf0] transition-colors" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base_url">{t.chat.baseUrl} *</Label>
              <Input
                id="base_url"
                value={tempConfig.base_url}
                onChange={e =>
                  setTempConfig({ ...tempConfig, base_url: e.target.value })
                }
                placeholder="http://localhost:8080/v1"
              />
              {!tempConfig.base_url && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {t.chat.baseUrlRequired}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="api_key">{t.chat.apiKey}</Label>
              <div className="relative">
                <Input
                  id="api_key"
                  type={showApiKey ? 'text' : 'password'}
                  value={tempConfig.api_key}
                  onChange={e =>
                    setTempConfig({ ...tempConfig, api_key: e.target.value })
                  }
                  placeholder="Leave empty if not required"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                >
                  {showApiKey ? (
                    <EyeOff className="w-4 h-4 text-slate-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-400" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model_name">{t.chat.modelName}</Label>
              <Input
                id="model_name"
                value={tempConfig.model_name}
                onChange={e =>
                  setTempConfig({ ...tempConfig, model_name: e.target.value })
                }
                placeholder="autoglm-phone-9b"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t.chat.agentType || 'Agent 类型'}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {AGENT_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      setTempConfig(prev => ({
                        ...prev,
                        agent_type: preset.name,
                        agent_config_params: preset.defaultConfig,
                      }))
                    }
                    className={`text-left p-3 rounded-lg border transition-all ${
                      tempConfig.agent_type === preset.name
                        ? 'border-[#1d9bf0] bg-[#1d9bf0]/5'
                        : 'border-slate-200 dark:border-slate-700 hover:border-[#1d9bf0]/50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <preset.icon
                        className={`w-4 h-4 ${
                          tempConfig.agent_type === preset.name
                            ? 'text-[#1d9bf0]'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span
                        className={`font-medium text-sm ${
                          tempConfig.agent_type === preset.name
                            ? 'text-[#1d9bf0]'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {preset.displayName}
                      </span>
                    </div>
                    <p
                      className={`text-xs mt-1 ml-6 ${
                        tempConfig.agent_type === preset.name
                          ? 'text-[#1d9bf0]/70'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {tempConfig.agent_type === 'mai' && (
              <div className="space-y-2">
                <Label htmlFor="history_n">
                  {t.chat.history_n || '历史记录数量'}
                </Label>
                <Input
                  id="history_n"
                  type="number"
                  min={1}
                  max={10}
                  value={
                    (tempConfig.agent_config_params?.history_n as
                      | number
                      | undefined) || 3
                  }
                  onChange={e => {
                    const value = parseInt(e.target.value) || 3;
                    setTempConfig(prev => ({
                      ...prev,
                      agent_config_params: {
                        ...prev.agent_config_params,
                        history_n: value,
                      },
                    }));
                  }}
                  className="w-full"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.chat.history_n_hint || '包含的历史截图数量（1-10）'}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="default_max_steps">
                {t.chat.maxSteps || '最大执行步数'}
              </Label>
              <Input
                id="default_max_steps"
                type="number"
                min={1}
                max={1000}
                value={tempConfig.default_max_steps}
                onChange={e => {
                  const value = parseInt(e.target.value) || 100;
                  setTempConfig(prev => ({
                    ...prev,
                    default_max_steps: Math.min(1000, Math.max(1, value)),
                  }));
                }}
                className="w-full"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.chat.maxStepsHint || '单次任务最大执行步数（1-1000）'}
              </p>
            </div>
          </TabsContent>

          {/* 决策模型 Tab */}
          <TabsContent
            value="decision"
            className="space-y-4 mt-4 overflow-y-auto flex-1 min-h-0"
          >
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/30 p-3 text-sm text-indigo-900 dark:text-indigo-100">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>{t.chat.decisionModelHint}</div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t.chat.selectDecisionPreset}
              </Label>
              <div className="grid grid-cols-1 gap-2">
                {DECISION_PRESETS.map(preset => (
                  <div key={preset.name} className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setTempConfig(prev => ({
                          ...prev,
                          decision_base_url: preset.config.decision_base_url,
                          decision_model_name:
                            preset.config.decision_model_name,
                        }))
                      }
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        tempConfig.decision_base_url ===
                          preset.config.decision_base_url &&
                        (preset.name !== 'custom' ||
                          tempConfig.decision_base_url === '')
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50'
                          : 'border-slate-200 dark:border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Server
                          className={`w-4 h-4 ${
                            tempConfig.decision_base_url ===
                              preset.config.decision_base_url &&
                            (preset.name !== 'custom' ||
                              tempConfig.decision_base_url === '')
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        <span className="font-medium text-sm text-slate-900 dark:text-slate-100">
                          {
                            t.presetConfigs[
                              preset.name as keyof typeof t.presetConfigs
                            ].name
                          }
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-6">
                        {
                          t.presetConfigs[
                            preset.name as keyof typeof t.presetConfigs
                          ].description
                        }
                      </p>
                    </button>
                    {'apiKeyUrl' in preset && (
                      <a
                        href={preset.apiKeyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors group"
                        title={t.chat.getApiKey || '获取 API Key'}
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="decision_base_url">
                {t.chat.decisionBaseUrl} *
              </Label>
              <Input
                id="decision_base_url"
                value={tempConfig.decision_base_url}
                onChange={e =>
                  setTempConfig({
                    ...tempConfig,
                    decision_base_url: e.target.value,
                  })
                }
                placeholder="http://localhost:8080/v1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="decision_api_key">{t.chat.decisionApiKey}</Label>
              <div className="relative">
                <Input
                  id="decision_api_key"
                  type={showApiKey ? 'text' : 'password'}
                  value={tempConfig.decision_api_key}
                  onChange={e =>
                    setTempConfig({
                      ...tempConfig,
                      decision_api_key: e.target.value,
                    })
                  }
                  placeholder="sk-..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                >
                  {showApiKey ? (
                    <EyeOff className="w-4 h-4 text-slate-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-400" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="decision_model_name">
                {t.chat.decisionModelName} *
              </Label>
              <Input
                id="decision_model_name"
                value={tempConfig.decision_model_name}
                onChange={e =>
                  setTempConfig({
                    ...tempConfig,
                    decision_model_name: e.target.value,
                  })
                }
                placeholder=""
              />
            </div>
          </TabsContent>

          {/* 回复模型配置 */}
          <TabsContent
            value="reply"
            className="flex-1 overflow-y-auto space-y-4 pr-2"
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t.chat.replyModelDesc || '用于生成抖音评论回复内容的模型'}
            </p>

            {/* 预设选择 */}
            <div className="grid grid-cols-3 gap-2">
              {REPLY_PRESETS.map(preset => (
                <button
                  key={preset.name}
                  onClick={() =>
                    setTempConfig(prev => ({
                      ...prev,
                      reply_base_url: preset.config.reply_base_url,
                      reply_model_name: preset.config.reply_model_name,
                    }))
                  }
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    tempConfig.reply_base_url ===
                      preset.config.reply_base_url &&
                    (preset.name !== 'custom' ||
                      tempConfig.reply_base_url === '')
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50'
                      : 'border-slate-200 dark:border-slate-700 hover:border-indigo-500/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Server
                      className={`w-4 h-4 ${
                        tempConfig.reply_base_url ===
                          preset.config.reply_base_url &&
                        (preset.name !== 'custom' ||
                          tempConfig.reply_base_url === '')
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    />
                    <span className="font-medium text-sm">
                      {t.chat[`preset_${preset.name}` as keyof typeof t.chat] ||
                        preset.name}
                    </span>
                  </div>
                  {preset.name !== 'custom' && (
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {preset.config.reply_model_name}
                    </p>
                  )}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="reply_base_url">
                {t.chat.replyBaseUrl || '回复模型 Base URL'} *
              </Label>
              <Input
                id="reply_base_url"
                value={tempConfig.reply_base_url}
                onChange={e =>
                  setTempConfig({
                    ...tempConfig,
                    reply_base_url: e.target.value,
                  })
                }
                placeholder="http://localhost:8080/v1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reply_api_key">
                {t.chat.replyApiKey || '回复模型 API Key'}
              </Label>
              <div className="relative">
                <Input
                  id="reply_api_key"
                  type={showApiKey ? 'text' : 'password'}
                  value={tempConfig.reply_api_key}
                  onChange={e =>
                    setTempConfig({
                      ...tempConfig,
                      reply_api_key: e.target.value,
                    })
                  }
                  placeholder="sk-..."
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                >
                  {showApiKey ? (
                    <EyeOff className="w-4 h-4 text-slate-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-400" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reply_model_name">
                {t.chat.replyModelName || '回复模型名称'} *
              </Label>
              <Input
                id="reply_model_name"
                value={tempConfig.reply_model_name}
                onChange={e =>
                  setTempConfig({
                    ...tempConfig,
                    reply_model_name: e.target.value,
                  })
                }
                placeholder="glm-4-flash"
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="sm:justify-between gap-2 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              if (config) {
                setTempConfig({
                  base_url: config.base_url,
                  model_name: config.model_name,
                  api_key: config.api_key || '',
                  agent_type: config.agent_type || 'glm',
                  agent_config_params: config.agent_config_params || {},
                  default_max_steps: config.default_max_steps || 100,
                  decision_base_url: config.decision_base_url || '',
                  decision_model_name:
                    config.decision_model_name || 'glm-4v-plus',
                  decision_api_key: config.decision_api_key || '',
                  reply_base_url: config.reply_base_url || '',
                  reply_model_name: config.reply_model_name || '',
                  reply_api_key: config.reply_api_key || '',
                });
              }
            }}
          >
            {t.chat.cancel}
          </Button>
          <Button onClick={handleSaveConfig} variant="twitter">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            {t.chat.saveConfig}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
