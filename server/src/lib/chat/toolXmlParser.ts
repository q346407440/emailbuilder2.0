export interface ParsedToolCall {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  dependsOn: string[];
}

export interface ParsedToolStart {
  index: number;
  name: string;
}

function parseArgs(raw: string): Record<string, unknown> {
  // 剥离 LLM 偶尔输出的 CDATA 包装：<![CDATA[...]]>
  const cleaned = raw.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { raw: cleaned };
  }
}

export function extractThinkAndAnswer(content: string): { think: string; answer: string } {
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
  const answerMatch = content.match(/<answer>([\s\S]*?)<\/answer>/i);
  const think = thinkMatch ? thinkMatch[1].trim() : '';
  let answer = answerMatch ? answerMatch[1].trim() : content.trim();
  answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return { think, answer };
}

export function extractToolStarts(answer: string): ParsedToolStart[] {
  const regex = /<tool\s+name="([^"]+)">/gi;
  const starts: ParsedToolStart[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(answer)) !== null) {
    const name = match[1]?.trim();
    if (!name) continue;
    starts.push({ index: idx, name });
    idx += 1;
  }
  return starts;
}

/**
 * 在正式提取前，将 LLM 错误写成的 `<tool>` 闭合标签（应为 `</tool>`）修正为合法格式。
 * 例如：`<tool name="foo">{}<tool>` → `<tool name="foo">{}</tool>`
 * 仅当后面跟着的 `<tool>` 不带 `name=` 属性时才视为错误闭合标签（避免误改嵌套开合）。
 */
function fixMalformedClosingTags(content: string): string {
  // 匹配 `<tool name="xxx">...内容...<tool>` 模式（非贪婪匹配内容部分）
  return content.replace(/(<tool\s+name="[^"]+">)([\s\S]*?)(<tool>)/gi, '$1$2</tool>');
}

export function extractToolCalls(answer: string, idPrefix = `tool-${Date.now()}`): ParsedToolCall[] {
  const fixed = fixMalformedClosingTags(answer);
  const regex = /<tool\s+name="([^"]+)">([\s\S]*?)<\/tool>/gi;
  const result: ParsedToolCall[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(fixed)) !== null) {
    const name = match[1]?.trim();
    const body = match[2]?.trim() ?? '';
    if (!name) continue;
    const args = parseArgs(body);
    const dependsOnRaw = args.dependsOn;
    const dependsOn = Array.isArray(dependsOnRaw)
      ? dependsOnRaw.filter((v): v is string => typeof v === 'string')
      : [];
    result.push({
      toolCallId: `${idPrefix}-${idx}`,
      name,
      args,
      dependsOn,
    });
    idx += 1;
  }
  return result;
}

export function removeToolTags(answer: string): string {
  const fixed = fixMalformedClosingTags(answer);
  return fixed.replace(/<tool\s+name="[^"]+">[\s\S]*?<\/tool>/gi, '').trim();
}

