export type Scenario = 'chat' | 'vision' | 'title' | 'check' | 'plan' | 'pipeline';
export type Vendor = 'qwen' | 'doubao';
/** 推理强度（部分厂商支持，如豆包）；minimal 最快，high 最慢但更深入 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export type ThinkingConfig =
  | { vendor: 'qwen'; enableThinking: boolean }
  | { vendor: 'doubao'; reasoningEffort: ReasoningEffort };

export interface ScenarioConfig {
  vendor: Vendor;
  model: string;
  apiKey: string;
  baseUrl: string;
  thinkingConfig: ThinkingConfig;
}

function normalizeVendor(raw: string | undefined): Vendor | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'qwen' || value === 'doubao') return value;
  return null;
}

function getVendorCredentials(vendor: Vendor): { apiKey: string; baseUrl: string; thinkingConfig: ThinkingConfig } {
  if (vendor === 'qwen') {
    const apiKey = (process.env.QWEN_API_KEY ?? process.env.OPENAI_API_KEY ?? '').trim();
    const baseUrl = (process.env.QWEN_BASE_URL ?? process.env.OPENAI_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1')
      .trim()
      .replace(/\/$/, '');
    const enableThinking = process.env.QWEN_ENABLE_THINKING !== 'false';
    if (!apiKey) {
      throw new Error('缺少 QWEN_API_KEY（或 OPENAI_API_KEY）');
    }
    return {
      apiKey,
      baseUrl,
      thinkingConfig: { vendor: 'qwen', enableThinking },
    };
  }

  const apiKey = (process.env.DOUBAO_API_KEY ?? '').trim();
  const baseUrl = (process.env.DOUBAO_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3')
    .trim()
    .replace(/\/$/, '');
  const reasoningEffortRaw = (process.env.DOUBAO_REASONING_EFFORT ?? 'medium').trim().toLowerCase();
  const reasoningEffort: ReasoningEffort =
    reasoningEffortRaw === 'minimal' || reasoningEffortRaw === 'low' || reasoningEffortRaw === 'high'
      ? reasoningEffortRaw
      : 'medium';
  if (!apiKey) {
    throw new Error('缺少 DOUBAO_API_KEY');
  }
  return {
    apiKey,
    baseUrl,
    thinkingConfig: { vendor: 'doubao', reasoningEffort },
  };
}

/** 从默认厂商（QWEN_*）环境变量解析场景对应模型名，用于未配置多厂商时的回退 */
function getLegacyDefaultModel(scenario: Scenario): string {
  if (scenario === 'vision') return (process.env.QWEN_VISION_MODEL ?? 'qwen-vl-max').trim();
  if (scenario === 'title') return (process.env.QWEN_TITLE_MODEL ?? 'qwen3.5-plus').trim();
  return (process.env.QWEN_MODEL ?? 'qwen3-max').trim();
}

export function getScenarioConfig(scenario: Scenario): ScenarioConfig {
  if (scenario === 'pipeline') {
    const vendor = normalizeVendor(process.env.LLM_PIPELINE_VENDOR);
    const model = (process.env.LLM_PIPELINE_MODEL ?? '').trim();
    if (vendor && model) {
      const creds = getVendorCredentials(vendor);
      return { vendor, model, apiKey: creds.apiKey, baseUrl: creds.baseUrl, thinkingConfig: creds.thinkingConfig };
    }
    return getScenarioConfig('vision');
  }

  if (scenario === 'check' || scenario === 'plan') {
    const envPrefix = scenario.toUpperCase();
    const vendor = normalizeVendor(process.env[`LLM_${envPrefix}_VENDOR`]);
    const model = (process.env[`LLM_${envPrefix}_MODEL`] ?? '').trim();
    if (!vendor || !model) {
      return getScenarioConfig('chat');
    }
    const creds = getVendorCredentials(vendor);
    return {
      vendor,
      model,
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl,
      thinkingConfig: creds.thinkingConfig,
    };
  }

  const upper = scenario.toUpperCase();
  const scenarioVendor = normalizeVendor(process.env[`LLM_${upper}_VENDOR`]);
  const scenarioModel = (process.env[`LLM_${upper}_MODEL`] ?? '').trim();
  if (scenarioVendor && scenarioModel) {
    const creds = getVendorCredentials(scenarioVendor);
    return {
      vendor: scenarioVendor,
      model: scenarioModel,
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl,
      thinkingConfig: creds.thinkingConfig,
    };
  }

  const legacyModel = getLegacyDefaultModel(scenario);
  const defaultCreds = getVendorCredentials('qwen');
  return {
    vendor: 'qwen',
    model: legacyModel,
    apiKey: defaultCreds.apiKey,
    baseUrl: defaultCreds.baseUrl,
    thinkingConfig: defaultCreds.thinkingConfig,
  };
}
