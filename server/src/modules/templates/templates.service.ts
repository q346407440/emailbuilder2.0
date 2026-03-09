import { templatesRepository } from './templates.repository.js';
import { savePreview, getPreviewUrl } from '../../lib/preview.js';
import type { TemplateRow } from '../../db/index.js';

export interface TemplateBody {
  id: string;
  title: string;
  desc?: string;
  components: unknown[];
  config: unknown;
  previewDataUrl?: string;
  createdAt: number;
  updatedAt: number;
  isPublic?: boolean;
  requiredVariableKeys?: string[];
}

export function toTemplateRow(body: TemplateBody, userId: string, isPublic: boolean): TemplateRow {
  let preview_url: string | null = null;
  if (body.previewDataUrl && body.previewDataUrl.startsWith('data:')) {
    preview_url = getPreviewUrl('templates', body.id);
  }
  return {
    id: body.id,
    user_id: userId,
    title: body.title,
    desc: body.desc ?? '',
    components: body.components,
    config: body.config,
    preview_url,
    is_public: isPublic,
    created_at: body.createdAt,
    updated_at: body.updatedAt,
    required_variable_keys: Array.isArray(body.requiredVariableKeys) ? body.requiredVariableKeys : [],
  };
}

export function toListItem(r: TemplateRow, baseUrl: string) {
  return {
    id: r.id,
    title: r.title,
    desc: r.desc,
    previewUrl: r.preview_url ? `${baseUrl}${r.preview_url}` : null,
    isPublic: r.is_public,
    userId: r.user_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    requiredVariableKeys: r.required_variable_keys ?? [],
  };
}

export const templatesService = {
  async assertAdminForPublic(userId: string, isPublic: boolean): Promise<void> {
    if (!isPublic) return;
    const user = await templatesRepository.getUserById(userId);
    if (!user?.is_admin) {
      throw Object.assign(new Error('只有管理员可以保存到公共'), { statusCode: 403 });
    }
  },

  async assertOwner(templateId: string, userId: string): Promise<TemplateRow> {
    const template = await templatesRepository.getById(templateId);
    if (!template) {
      throw Object.assign(new Error('模板不存在'), { statusCode: 404 });
    }
    if (template.user_id !== userId) {
      throw Object.assign(new Error('无权限'), { statusCode: 403 });
    }
    return template as TemplateRow;
  },

  async savePreviewIfNeeded(id: string, previewDataUrl?: string): Promise<void> {
    if (previewDataUrl && previewDataUrl.startsWith('data:')) {
      await savePreview('templates', id, previewDataUrl);
    }
  },
};
