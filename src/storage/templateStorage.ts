/**
 * 模板库储存层
 * 唯一资料来源：后端 API（与上线部署一致）。
 */

import type { SavedEmailTemplate } from '../types/emailTemplate';
import {
  serverListTemplates,
  serverListMyTemplates,
  serverAddTemplate,
  serverPutTemplate,
  serverDeleteTemplate,
  serverCreateEmptyTemplate,
  serverDuplicateTemplate,
  serverListTemplatesCatalog,
  type TemplateCatalogItem,
} from '@shared/api/serverApi';

export async function loadTemplates(): Promise<SavedEmailTemplate[]> {
  return serverListTemplates();
}

export async function loadMyTemplates(): Promise<SavedEmailTemplate[]> {
  return serverListMyTemplates();
}

export async function addTemplate(
  template: SavedEmailTemplate,
  previewDataUrl?: string,
  isPublic?: boolean
): Promise<void> {
  await serverAddTemplate(template, previewDataUrl, isPublic);
}

export async function putTemplate(
  template: SavedEmailTemplate,
  previewDataUrl?: string,
  isPublic?: boolean,
  requiredVariableKeys?: string[]
): Promise<void> {
  await serverPutTemplate(template, previewDataUrl, isPublic, requiredVariableKeys);
}

export async function deleteTemplate(id: string): Promise<void> {
  await serverDeleteTemplate(id);
}

export async function createEmptyTemplate(name: string): Promise<{ id: string; name: string }> {
  return serverCreateEmptyTemplate(name);
}

export async function duplicateTemplate(id: string): Promise<{ id: string; title: string }> {
  return serverDuplicateTemplate(id);
}

export { serverListTemplatesCatalog as listTemplatesCatalog };
export type { TemplateCatalogItem };
