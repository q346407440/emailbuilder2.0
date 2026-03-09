import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { CompositeComponent, CompositeMode, BusinessFormConfig } from '@shared/types/composite';
import type { EmailComponent } from '@shared/types/email';
import { deepCloneWithNewIds } from '@shared/utils/cloneComponent';
import { normalizeBusinessForm } from '@shared/utils/businessForm';
import { migrateComponent } from '@features/email-editor/store/useEmailStore';
import { loadComposites as storageLoadComposites, loadMyComposites as storageLoadMyComposites, putCompositeItem as storagePutComposite, softDeleteComposite as storageSoftDeleteComposite } from '@shared/storage/compositeStorage';

/**
 * 复合组件载入时一次性迁移为当前新格式（符合 full-migration 规范）。
 * 含 meta 字段补全 + 组件树 migrateComponent，输出仅为新格式。
 */
function migrateComposite(c: CompositeComponent): CompositeComponent {
  if (!c.component || typeof c.component !== 'object' || !('type' in c.component)) {
    throw new Error(`Composite ${c.id ?? c.name} 缺少有效 component 树，无法迁移`);
  }
  const metaMigrated = {
    ...c,
    mode: c.mode ?? ('native' as CompositeMode),
    sortOrder: c.sortOrder ?? c.createdAt ?? 0,
    /** 缺省视为未删除，避免旧资料无 status 导致左侧不显示 */
    status: c.status ?? 'active',
  };
  return {
    ...metaMigrated,
    component: migrateComponent(c.component),
    businessForm: normalizeBusinessForm(c.businessForm),
  };
}

function needsLayoutDistributionBackfill(root: unknown): boolean {
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false;
    const obj = node as Record<string, unknown>;
    if (obj.type === 'layout') {
      const props = obj.props;
      if (!props || typeof props !== 'object') return true;
      const p = props as Record<string, unknown>;
      if (!('distribution' in p)) return true;
      if ('columns' in p) return true;
    }
    const children = obj.children;
    if (Array.isArray(children)) {
      for (const c of children) {
        if (visit(c)) return true;
      }
    }
    return false;
  };
  return visit(root);
}

function needsCompositeBackfill(c: CompositeComponent): boolean {
  const metaMissing =
    c.mode == null ||
    c.status == null ||
    c.sortOrder == null;
  return metaMissing || needsLayoutDistributionBackfill(c.component);
}

function findCompositeById(
  state: Pick<CompositeState, 'composites' | 'myComposites'>,
  id: string
): CompositeComponent | undefined {
  return state.composites.find((c) => c.id === id) ?? state.myComposites.find((c) => c.id === id);
}

interface CompositeState {
  /** 所有复合组件（含已删除，用于前端过滤） */
  composites: CompositeComponent[];
  /** 是否已从 DB 加载 */
  isLoaded: boolean;
  /** 当前用户创建的复合组件列表（我的复合组件） */
  myComposites: CompositeComponent[];
  isMyCompositesLoaded: boolean;

  /** 从后端载入所有复合组件 */
  loadComposites: () => Promise<void>;
  /** 从后端载入当前用户创建的复合组件 */
  loadMyComposites: () => Promise<void>;
  getMyCompositeById: (id: string) => CompositeComponent | undefined;
  /** 新增复合组件（isPublic 仅管理员可设为 true） */
  addComposite: (
    name: string,
    component: EmailComponent,
    mode?: CompositeMode,
    businessForm?: BusinessFormConfig,
    previewDataUrl?: string,
    isPublic?: boolean
  ) => Promise<void>;
  /** 覆盖已有复合组件：更新组件树与预览；可选更新 mode / businessForm（传入则写入，native 时清空 businessForm） */
  updateComposite: (
    id: string,
    component: EmailComponent,
    previewDataUrl?: string,
    options?: { mode?: CompositeMode; businessForm?: BusinessFormConfig | null }
  ) => Promise<void>;
  /** 更新复合组件预览图 */
  updateCompositePreview: (id: string, previewDataUrl: string) => Promise<void>;
  /** 重命名复合组件 */
  renameComposite: (id: string, newName: string) => Promise<void>;
  /** 软删除复合组件 */
  softDeleteComposite: (id: string) => Promise<void>;
  /** 取得所有未删除的复合组件 */
  getActiveComposites: () => CompositeComponent[];
  /** 根据 ID 取得复合组件 */
  getCompositeById: (id: string) => CompositeComponent | undefined;
  /** 上移复合组件 */
  moveCompositeUp: (id: string) => Promise<void>;
  /** 下移复合组件 */
  moveCompositeDown: (id: string) => Promise<void>;
}

export const useCompositeStore = create<CompositeState>((set, get) => ({
  composites: [],
  isLoaded: false,
  myComposites: [],
  isMyCompositesLoaded: false,

  loadComposites: async () => {
    try {
      const all = await storageLoadComposites();
      const migrated = all
        .map((c) => {
          try {
            return migrateComposite(c);
          } catch (err) {
            console.warn('复合组件载入时迁移失败，已略过', c?.id ?? c?.name, err);
            return null;
          }
        })
        .filter((c): c is CompositeComponent => c != null);
      set({ composites: migrated, isLoaded: true });
    } catch (err) {
      console.error('Failed to load composites:', err);
      set({ isLoaded: true });
    }
  },

  loadMyComposites: async () => {
    try {
      const all = await storageLoadMyComposites();
      const pairs = all
        .map((c) => {
          try {
            return { raw: c, migrated: migrateComposite(c) };
          } catch (err) {
            console.warn('我的复合组件载入时迁移失败，已略过', c?.id ?? c?.name, err);
            return null;
          }
        })
        .filter((c): c is { raw: CompositeComponent; migrated: CompositeComponent } => c != null);
      const migrated = pairs.map((p) => p.migrated);
      set({ myComposites: migrated, isMyCompositesLoaded: true });
      (async () => {
        for (const p of pairs) {
          if (!needsCompositeBackfill(p.raw)) continue;
          try {
            await storagePutComposite(p.migrated);
          } catch (err) {
            console.warn('复合组件迁移回写失败，已略过', p.migrated.id, err);
          }
        }
      })();
    } catch (err) {
      console.error('Failed to load my composites:', err);
      set({ isMyCompositesLoaded: true });
    }
  },

  getMyCompositeById: (id) => get().myComposites.find((c) => c.id === id),

  addComposite: async (name, component, mode = 'native', businessForm, previewDataUrl, isPublic) => {
    const now = Date.now();
    const state = get();
    // 获取当前最大的 sortOrder，新组件放在最后
    const activeComposites = state.composites.filter((c) => c.status === 'active');
    const maxSortOrder = activeComposites.length > 0
      ? Math.max(...activeComposites.map((c) => c.sortOrder))
      : 0;
    
    const composite: CompositeComponent = {
      id: nanoid(),
      name,
      component: migrateComponent(structuredClone(component)),
      mode,
      ...(mode === 'business' && businessForm ? { businessForm: normalizeBusinessForm(businessForm) } : {}),
      ...(previewDataUrl ? { previewDataUrl } : {}),
      createdAt: now,
      updatedAt: now,
      status: 'active',
      sortOrder: maxSortOrder + 1,
    };

    try {
      await storagePutComposite(composite, previewDataUrl, isPublic);
      set((state) => ({
        composites: isPublic ? [...state.composites, composite] : state.composites,
      }));
      get().loadMyComposites();
    } catch (err) {
      console.error('Failed to save composite:', err);
      throw err;
    }
  },

  updateComposite: async (id, component, previewDataUrl, options) => {
    const state = get();
    const target = findCompositeById(state, id);
    if (!target) return;
    const nextMode = options?.mode ?? target.mode;
    const nextBusinessForm =
      nextMode === 'native'
        ? undefined
        : options?.businessForm !== undefined
          ? normalizeBusinessForm(options.businessForm ?? undefined)
          : normalizeBusinessForm(target.businessForm);
    const updated: CompositeComponent = {
      ...target,
      component: migrateComponent(deepCloneWithNewIds(component)),
      mode: nextMode,
      businessForm: nextBusinessForm,
      ...(previewDataUrl !== undefined ? { previewDataUrl } : {}),
      updatedAt: Date.now(),
    };
    try {
      await storagePutComposite(updated, previewDataUrl);
      set((s) => ({
        composites: s.composites.map((c) => (c.id === id ? updated : c)),
        myComposites: s.myComposites.map((c) => (c.id === id ? updated : c)),
      }));
      get().loadMyComposites();
    } catch (err) {
      console.error('Failed to update composite:', err);
      throw err;
    }
  },

  updateCompositePreview: async (id, previewDataUrl) => {
    const state = get();
    const target = findCompositeById(state, id);
    if (!target) return;
    const updated: CompositeComponent = {
      ...target,
      previewDataUrl,
      updatedAt: Date.now(),
    };
    try {
      await storagePutComposite(updated, previewDataUrl);
      set((s) => ({
        composites: s.composites.map((c) => (c.id === id ? updated : c)),
      }));
      set((s) => ({
        myComposites: s.myComposites.map((c) => (c.id === id ? updated : c)),
      }));
    } catch (err) {
      console.error('Failed to update composite preview:', err);
    }
  },

  renameComposite: async (id, newName) => {
    const state = get();
    const target = findCompositeById(state, id);
    if (!target) return;

    const updated: CompositeComponent = {
      ...target,
      name: newName,
      updatedAt: Date.now(),
    };

    try {
      await storagePutComposite(updated);
      set((s) => ({
        composites: s.composites.map((c) => (c.id === id ? updated : c)),
        myComposites: s.myComposites.map((c) => (c.id === id ? updated : c)),
      }));
      get().loadMyComposites();
    } catch (err) {
      console.error('Failed to rename composite:', err);
      throw err;
    }
  },

  softDeleteComposite: async (id) => {
    const state = get();
    const target = findCompositeById(state, id);
    if (!target) return;

    await storageSoftDeleteComposite(id);
    const updated: CompositeComponent = {
      ...target,
      status: 'deleted',
      updatedAt: Date.now(),
    };
    set((s) => ({
      composites: s.composites.map((c) => (c.id === id ? updated : c)),
      myComposites: s.myComposites.map((c) => (c.id === id ? updated : c)),
    }));
    get().loadMyComposites();
  },

  getActiveComposites: () => {
    return get()
      .composites.filter((c) => c.status === 'active')
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  getCompositeById: (id) => {
    return findCompositeById(get(), id);
  },

  moveCompositeUp: async (id) => {
    const state = get();
    const activeComposites = state.composites
      .filter((c) => c.status === 'active')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    
    const currentIndex = activeComposites.findIndex((c) => c.id === id);
    if (currentIndex <= 0) return; // 已经在最前面或找不到

    const current = activeComposites[currentIndex];
    const prev = activeComposites[currentIndex - 1];

    // 交换 sortOrder
    const tempOrder = current.sortOrder;
    const updatedCurrent = { ...current, sortOrder: prev.sortOrder, updatedAt: Date.now() };
    const updatedPrev = { ...prev, sortOrder: tempOrder, updatedAt: Date.now() };

    try {
      await Promise.all([storagePutComposite(updatedCurrent), storagePutComposite(updatedPrev)]);
      set((s) => ({
        composites: s.composites.map((c) => {
          if (c.id === current.id) return updatedCurrent;
          if (c.id === prev.id) return updatedPrev;
          return c;
        }),
      }));
      get().loadMyComposites();
    } catch (err) {
      console.error('Failed to move composite up:', err);
    }
  },

  moveCompositeDown: async (id) => {
    const state = get();
    const activeComposites = state.composites
      .filter((c) => c.status === 'active')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    
    const currentIndex = activeComposites.findIndex((c) => c.id === id);
    if (currentIndex < 0 || currentIndex >= activeComposites.length - 1) return; // 已经在最后或找不到

    const current = activeComposites[currentIndex];
    const next = activeComposites[currentIndex + 1];

    // 交换 sortOrder
    const tempOrder = current.sortOrder;
    const updatedCurrent = { ...current, sortOrder: next.sortOrder, updatedAt: Date.now() };
    const updatedNext = { ...next, sortOrder: tempOrder, updatedAt: Date.now() };

    try {
      await Promise.all([storagePutComposite(updatedCurrent), storagePutComposite(updatedNext)]);
      set((s) => ({
        composites: s.composites.map((c) => {
          if (c.id === current.id) return updatedCurrent;
          if (c.id === next.id) return updatedNext;
          return c;
        }),
      }));
      get().loadMyComposites();
    } catch (err) {
      console.error('Failed to move composite down:', err);
    }
  },
}));
