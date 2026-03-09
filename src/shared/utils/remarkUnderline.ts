import type { Root, Text } from 'mdast';
import { visit } from 'unist-util-visit';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 将 ++text++ 解析为 raw HTML <u> 节点，配合 rehype-raw 渲染下划线 */
export function remarkUnderline() {
  return (tree: Root) => {
    const replacements: { parent: { children: unknown[] }; index: number; nodes: unknown[] }[] = [];

    visit(tree, 'text', (node: Text, index, parent) => {
      if (typeof index !== 'number' || !parent || !parent.children) return;
      const value = node.value;
      if (!value.includes('++')) return;

      const parts = value.split(/(\+\+)/);
      const nodes: unknown[] = [];
      let i = 0;
      while (i < parts.length) {
        if (parts[i] === '++') {
          i += 1;
          const content = parts[i] ?? '';
          i += 1;
          if (content) {
            nodes.push({
              type: 'html',
              value: `<u>${escapeHtml(content)}</u>`,
            });
          }
        } else if (parts[i] !== '') {
          nodes.push({ type: 'text', value: parts[i] });
          i += 1;
        } else {
          i += 1;
        }
      }

      if (nodes.length > 0) {
        replacements.push({ parent: parent as { children: unknown[] }, index, nodes });
      }
    });

    replacements
      .sort((a, b) => b.index - a.index)
      .forEach(({ parent, index, nodes: newNodes }) => {
        parent.children.splice(index, 1, ...newNodes);
      });
  };
}
