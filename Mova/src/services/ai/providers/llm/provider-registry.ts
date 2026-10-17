import type { LLMConfig, LLMProvider, LLMProviderId } from "../../../../types/ai"
import { AnthropicProvider } from "./anthropic-provider"
import { OllamaProvider } from "./ollama-provider"
import { OpenAIProvider } from "./openai-provider"

export interface LLMProviderPreset {
  id: LLMProviderId
  name: string
  region: "Global" | "China" | "Local"
  defaultModel: string
  defaultBaseUrl: string | null
  apiKeyLabel: string
  homepage: string
  description: string
  openAICompatible: boolean
}

export const LLM_PROVIDER_PRESETS: LLMProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    region: "Global",
    defaultModel: "gpt-4o",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyLabel: "OpenAI API Key",
    homepage: "https://platform.openai.com",
    description: "GPT 系列，通用推理、多模态与工具调用能力强。",
    openAICompatible: true,
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    region: "Global",
    defaultModel: "claude-3-5-sonnet-latest",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    apiKeyLabel: "Anthropic API Key",
    homepage: "https://console.anthropic.com",
    description: "Claude 系列，长上下文、代码与写作场景表现稳定。",
    openAICompatible: false,
  },
  {
    id: "google",
    name: "Google Gemini",
    region: "Global",
    defaultModel: "gemini-2.5-flash",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyLabel: "Gemini API Key",
    homepage: "https://aistudio.google.com",
    description: "Gemini 系列，通过 OpenAI 兼容端点接入。",
    openAICompatible: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek 深度求索",
    region: "China",
    defaultModel: "deepseek-chat",
    defaultBaseUrl: "https://api.deepseek.com",
    apiKeyLabel: "DeepSeek API Key",
    homepage: "https://platform.deepseek.com",
    description: "国产主流模型，代码与推理性价比高。",
    openAICompatible: true,
  },
  {
    id: "qwen",
    name: "阿里云 Qwen / 通义千问",
    region: "China",
    defaultModel: "qwen-plus",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyLabel: "DashScope API Key",
    homepage: "https://dashscope.console.aliyun.com",
    description: "通义千问系列，DashScope OpenAI 兼容模式。",
    openAICompatible: true,
  },
  {
    id: "moonshot",
    name: "Moonshot Kimi",
    region: "China",
    defaultModel: "moonshot-v1-8k",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    apiKeyLabel: "Moonshot API Key",
    homepage: "https://platform.moonshot.cn",
    description: "Kimi 系列，长文本与中文能力突出。",
    openAICompatible: true,
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    region: "China",
    defaultModel: "glm-4-plus",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyLabel: "智谱 API Key",
    homepage: "https://open.bigmodel.cn",
    description: "GLM 系列国产模型，支持 OpenAI 兼容调用。",
    openAICompatible: true,
  },
  {
    id: "baidu",
    name: "百度千帆 ERNIE",
    region: "China",
    defaultModel: "ernie-4.5-turbo-128k",
    defaultBaseUrl: "https://qianfan.baidubce.com/v2",
    apiKeyLabel: "千帆 API Key",
    homepage: "https://console.bce.baidu.com/qianfan",
    description: "文心/ERNIE 系列，千帆 OpenAI 兼容 v2 端点。",
    openAICompatible: true,
  },
  {
    id: "minimax",
    name: "MiniMax",
    region: "China",
    defaultModel: "MiniMax-Text-01",
    defaultBaseUrl: "https://api.minimax.chat/v1",
    apiKeyLabel: "MiniMax API Key",
    homepage: "https://platform.minimaxi.com",
    description: "国产文本与多模态模型，适合创作和对话。",
    openAICompatible: true,
  },
  {
    id: "doubao",
    name: "火山引擎 Doubao",
    region: "China",
    defaultModel: "doubao-1-5-pro-32k-250115",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiKeyLabel: "Volcengine Ark API Key",
    homepage: "https://console.volcengine.com/ark",
    description: "豆包大模型，通过火山方舟 OpenAI 兼容端点接入。",
    openAICompatible: true,
  },
  {
    id: "ollama",
    name: "Ollama 本地模型",
    region: "Local",
    defaultModel: "llama3.1",
    defaultBaseUrl: "http://localhost:11434",
    apiKeyLabel: "Not required",
    homepage: "https://ollama.com",
    description: "本地运行开源模型，无需 API Key。",
    openAICompatible: false,
  },
]

export const LLM_PROVIDER_PRESET_BY_ID = Object.fromEntries(
  LLM_PROVIDER_PRESETS.map((preset) => [preset.id, preset])
) as Record<LLMProviderId, LLMProviderPreset>

export function createDefaultLlmConfig(provider: LLMProviderId): LLMConfig {
  const preset = LLM_PROVIDER_PRESET_BY_ID[provider]
  return {
    provider,
    model: preset.defaultModel,
    apiKey: null,
    baseUrl: preset.defaultBaseUrl,
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 2048,
    frequencyPenalty: 0,
    systemPrompt: null,
  }
}

export function getProviderDisplayName(provider: LLMProviderId): string {
  return LLM_PROVIDER_PRESET_BY_ID[provider]?.name ?? provider
}

export function createLlmProvider(config: LLMConfig): { provider: LLMProvider | null; error: string | null } {
  const preset = LLM_PROVIDER_PRESET_BY_ID[config.provider]
  if (!preset) return { provider: null, error: `Unsupported AI provider: ${config.provider}` }

  if (config.provider === "ollama") {
    return {
      provider: new OllamaProvider({
        model: config.model || preset.defaultModel,
        baseUrl: config.baseUrl || preset.defaultBaseUrl || undefined,
        temperature: config.temperature,
      }),
      error: null,
    }
  }

  if (!config.apiKey) {
    return { provider: null, error: `${preset.name} API key is required. Please add it in Settings.` }
  }

  if (config.provider === "anthropic") {
    return {
      provider: new AnthropicProvider({
        apiKey: config.apiKey,
        model: config.model || preset.defaultModel,
        baseUrl: config.baseUrl || preset.defaultBaseUrl || undefined,
        temperature: config.temperature,
        topP: config.topP,
        maxTokens: config.maxTokens,
      }),
      error: null,
    }
  }

  return {
    provider: new OpenAIProvider({
      apiKey: config.apiKey,
      model: config.model || preset.defaultModel,
      baseUrl: config.baseUrl || preset.defaultBaseUrl || undefined,
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: config.maxTokens,
      frequencyPenalty: config.frequencyPenalty,
      providerName: preset.name,
    }),
    error: null,
  }
}
