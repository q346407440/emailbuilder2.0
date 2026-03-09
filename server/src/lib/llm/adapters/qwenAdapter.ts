import type { VendorAdapter } from './types.js';

export const qwenAdapter: VendorAdapter = {
  async streamCompletion(config, request, callbacks, signal) {
    const enableThinkingDefault =
      config.thinkingConfig.vendor === 'qwen' ? config.thinkingConfig.enableThinking : true;
    const enableThinking =
      typeof request.enableThinking === 'boolean' ? request.enableThinking : enableThinkingDefault;

    const body = {
      model: config.model,
      stream: true,
      enable_thinking: enableThinking,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      messages: request.messages,
    };
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(`LLM stream request failed (${response.status}): ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const events = sseBuffer.split('\n\n');
      sseBuffer = events.pop() ?? '';

      for (const eventBlock of events) {
        const lines = eventBlock.split('\n').filter((line) => line.startsWith('data: '));
        for (const line of lines) {
          const payload = line.slice(6).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{
                delta?: {
                  reasoning_content?: string;
                  content?: string;
                };
              }>;
            };
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;
            if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
              callbacks.onThinkDelta(delta.reasoning_content);
            }
            if (typeof delta.content === 'string' && delta.content.length > 0) {
              callbacks.onAnswerDelta(delta.content);
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }
    }
  },
};
