/**
 * 复合组件库储存层
 * 唯一资料来源：后端 API（与上线部署一致）。
 */

import type { CompositeComponent } from '../types/composite';
import {
  serverListComposites,
  serverListMyComposites,
  serverGetComposite,
  serverAddComposite,
  serverUpdateComposite,
  serverSoftDeleteComposite,
} from '@shared/api/serverApi';

export async function loadComposites(): Promise<CompositeComponent[]> {
  return serverListComposites();
}

export async function loadMyComposites(): Promise<CompositeComponent[]> {
  return serverListMyComposites();
}

export async function putCompositeItem(
  composite: CompositeComponent,
  previewDataUrl?: string,
  isPublic?: boolean
): Promise<void> {
  const exists = (await serverGetComposite(composite.id)) != null;
  if (exists) {
    await serverUpdateComposite(composite.id, composite, previewDataUrl, isPublic);
  } else {
    await serverAddComposite(composite, previewDataUrl, isPublic);
  }
}

export async function softDeleteComposite(id: string): Promise<void> {
  await serverSoftDeleteComposite(id);
}
