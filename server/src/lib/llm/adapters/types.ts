import type { ThinkingConfig, Vendor } from '../modelConfig.js';

export interface LlmRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | unknown[] }>;
  systemPrompt: string;
  enableTools: boolean;
  enableThinking?: boolean;
  /** 覆盖默认 reasoning_effort（仅部分厂商支持），复杂任务用 'high'，简单聊天用 'medium' */
  reasoningEffortOverride?: 'minimal' | 'low' | 'medium' | 'high';
  temperature?: number;
  maxTokens?: number;
}

export interface LlmStreamCallbacks {
  onThinkDelta: (delta: string) => void;
  onAnswerDelta: (delta: string) => void;
}

export interface AdapterConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  thinkingConfig: ThinkingConfig;
}

export interface VendorAdapter {
  streamCompletion(
    config: AdapterConfig,
    request: LlmRequest,
    callbacks: LlmStreamCallbacks,
    signal?: AbortSignal
  ): Promise<void>;
}

export interface VendorAdapterFactory {
  getVendorAdapter: (vendor: Vendor) => VendorAdapter;
}
