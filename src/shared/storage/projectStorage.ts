/**
 * 工程储存层
 * 唯一资料来源：后端 API（与 data-persistence 一致）。
 */

import type { SavedEmailProject } from '../types/emailTemplate';
import {
  serverListMyProjects,
  serverGetProject,
  serverCreateEmptyProject,
  serverPutProject,
  serverUpdateProjectPreview,
  serverDeleteProject,
  serverPublishProjectToTemplate,
  type ProjectListItem,
  type SaveTemplatePayload,
} from '@shared/api/serverApi';

export async function loadMyProjects(): Promise<ProjectListItem[]> {
  return serverListMyProjects();
}

export async function getProject(id: string): Promise<SavedEmailProject | null> {
  return serverGetProject(id);
}

export async function createEmptyProject(title?: string): Promise<{ id: string; title: string }> {
  return serverCreateEmptyProject(title);
}

export async function putProject(project: {
  id: string;
  title: string;
  desc?: string;
  components: unknown[];
  config: unknown;
  customVariables?: unknown[];
  updatedAt: number;
}): Promise<void> {
  await serverPutProject(project);
}

export async function updateProjectPreview(id: string, previewDataUrl: string): Promise<{ previewUrl: string }> {
  return serverUpdateProjectPreview(id, previewDataUrl);
}

export async function deleteProject(id: string): Promise<void> {
  await serverDeleteProject(id);
}

export async function publishProjectToTemplate(
  projectId: string,
  payload: SaveTemplatePayload,
  deleteProjectAfter?: boolean
): Promise<{ templateId: string; setAsDefault?: boolean }> {
  return serverPublishProjectToTemplate(projectId, payload, deleteProjectAfter);
}

export type { ProjectListItem, SaveTemplatePayload };
