import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { SavedEmailTemplate, CustomVariableDefinition } from '@shared/types/emailTemplate';
import type { EmailComponent, RenderingRules } from '@shared/types/email';
import type { TemplateConfig } from '@shared/types/email';
import { deepCloneWithNewIds } from '@shared/utils/cloneComponent';
import { migrateComponent, migrateTemplateConfig } from '@features/email-editor/store/useEmailStore';
import { createDefaultTemplate, defaultEmailTemplateConfig } from '@shared/constants/templates/defaultTemplate';
import { createPatagoniaTemplate, patagoniaEmailTemplateConfig } from '@shared/constants/templates/patagoniaTemplate';
import { createAloAbandonedCartTemplate, aloAbandonedCartTemplateConfig } from '@shared/constants/templates/aloAbandonedCartTemplate';
import { createJustSayingThanksTemplate, justSayingThanksTemplateConfig } from '@shared/constants/templates/justSayingThanksTemplate';
import { loadTemplates as storageLoadTemplates, loadMyTemplates as storageLoadMyTemplates, addTemplate as storageAddTemplate, putTemplate as storagePutTemplate, deleteTemplate as storageDeleteTemplate } from '@shared/storage/templateStorage';
import { collectVariableKeys } from '@shared/utils/collectVariableKeys';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { serverSetDefaultTemplateId } from '@shared/api/serverApi';
import { toast } from '@shared/store/useToastStore';

const DEFAULT_TEMPLATE_ID_KEY = 'emailEditor_defaultTemplateId';
/** 已种入的内建模板版本，用于追踪是否需要种入新增的内建模板 */
const BUILTIN_SEEDED_KEY = 'emailEditor_builtinSeededTitles';
/** 默认模板预览图：项目内预先放好的资源（与「保存至邮件模板」一样为本地存好的图） */
export const DEFAULT_TEMPLATE_PREVIEW_PATH = '/images/default-email-template-preview.png';

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

function needsTemplateBackfill(t: SavedEmailTemplate): boolean {
  const config = t.config as unknown as Record<string, unknown> | null | undefined;
  if (
    !config ||
    !('outerBackgroundColor' in config) ||
    !('contentAlign' in config) ||
    !('contentDistribution' in config) ||
    !('contentGap' in config)
  ) return true;
  if (Array.isArray(t.components)) {
    for (const root of t.components) {
      if (needsLayoutDistributionBackfill(root)) return true;
    }
  }
  return false;
}

/** 內建模板定義 */
interface BuiltinTemplateDef {
  title: string;
  desc: string;
  createComponents: () => EmailComponent[];
  config: TemplateConfig;
  previewDataUrl: string;
  isPublic?: boolean;
}

/** 所有內建模板列表 */
const BUILTIN_TEMPLATES: BuiltinTemplateDef[] = [
  {
    title: 'Your viewed items',
    desc: '基于 On 品牌「Your viewed items」邮件设计',
    createComponents: createDefaultTemplate,
    config: defaultEmailTemplateConfig,
    previewDataUrl: DEFAULT_TEMPLATE_PREVIEW_PATH,
  },
  {
    title: 'Patagonia Trail Food',
    desc: '基于 Patagonia Provisions「Never Hike on an Empty Stomach」户外食品推广邮件',
    createComponents: createPatagoniaTemplate,
    config: patagoniaEmailTemplateConfig,
    previewDataUrl: '',
  },
  {
    title: '测试模板',
    desc: 'alo 品牌弃购挽留邮件 — Low Stock Alert',
    createComponents: createAloAbandonedCartTemplate,
    config: aloAbandonedCartTemplateConfig,
    previewDataUrl: '',
    isPublic: true,
  },
  {
    title: 'Just Saying Thanks',
    desc: 'Guitar Center 感谢订阅 + 15% OFF 优惠券邮件',
    createComponents: createJustSayingThanksTemplate,
    config: justSayingThanksTemplateConfig,
    previewDataUrl: '',
    isPublic: true,
  },
];

function getSeededTitles(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BUILTIN_SEEDED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function markTitleSeeded(title: string): void {
  if (typeof window === 'undefined') return;
  const titles = getSeededTitles();
  if (!titles.includes(title)) {
    titles.push(title);
    localStorage.setItem(BUILTIN_SEEDED_KEY, JSON.stringify(titles));
  }
}

/** 防止 React 严格模式下 double effect 导致重复种入 */
let _seedingBuiltin = false;

function findTemplateById(state: Pick<EmailTemplateState, 'savedTemplates' | 'myTemplates'>, id: string): SavedEmailTemplate | undefined {
  return state.savedTemplates.find((t) => t.id === id) ?? state.myTemplates.find((t) => t.id === id);
}

function getStoredDefaultTemplateId(userId: string | null | undefined): string | null {
  if (typeof window === 'undefined') return null;
  if (!userId) return null;
  return localStorage.getItem(`${DEFAULT_TEMPLATE_ID_KEY}:${userId}`);
}

function setStoredDefaultTemplateId(id: string | null, userId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (!userId) return;
  const key = `${DEFAULT_TEMPLATE_ID_KEY}:${userId}`;
  if (id == null) localStorage.removeItem(key);
  else localStorage.setItem(key, id);
}

interface EmailTemplateState {
  savedTemplates: SavedEmailTemplate[];
  isLoaded: boolean;
  /** 当前用户创建的模板列表（我的模板） */
  myTemplates: SavedEmailTemplate[];
  isMyTemplatesLoaded: boolean;
  /** 当前设为默认的模板 id，以后端为准，跨设备/端口一致 */
  defaultTemplateId: string | null;

  loadTemplates: () => Promise<void>;
  loadMyTemplates: () => Promise<void>;
  getDefaultTemplateId: () => string | null;
  setDefaultTemplateId: (id: string | null) => Promise<void>;
  getMyTemplateById: (id: string) => SavedEmailTemplate | undefined;
  /** 保存为新模板（会生成 id、previewDataUrl 由调用方传入，可为空字符串；isPublic 仅管理员可设为 true） */
  addTemplate: (payload: {
    title: string;
    desc: string;
    components: EmailComponent[];
    config: TemplateConfig;
    previewDataUrl: string;
    isPublic?: boolean;
    customVariables?: CustomVariableDefinition[];
    renderingRules?: RenderingRules;
  }) => Promise<SavedEmailTemplate>;
  /** 覆盖已有模板（更新 components、config、previewDataUrl、customVariables、renderingRules） */
  updateTemplate: (
    id: string,
    payload: {
      components: EmailComponent[];
      config: TemplateConfig;
      previewDataUrl: string;
      customVariables?: CustomVariableDefinition[];
      renderingRules?: RenderingRules;
    }
  ) => Promise<void>;
  /** 仅更新标题与描述，不更新预览图 */
  updateTemplateMeta: (id: string, payload: { title: string; desc: string }) => Promise<void>;
  /** 仅更新预览图 */
  updateTemplatePreview: (id: string, previewDataUrl: string) => Promise<void>;
  /** 仅更新本地 store 中某模板的预览 URL（不请求 API），用于自动补齐预览后刷新 UI */
  setTemplatePreviewUrl: (id: string, previewUrl: string) => void;
  /** 删除已保存的模板 */
  deleteTemplate: (id: string) => Promise<void>;
  getTemplateById: (id: string) => SavedEmailTemplate | undefined;
  /** 检查并种入所有缺失的内建模板，返回新种入的模板列表 */
  seedBuiltinTemplatesIfNeeded: () => Promise<SavedEmailTemplate[]>;
}

export const useEmailTemplateStore = create<EmailTemplateState>((set, get) => ({
  savedTemplates: [],
  isLoaded: false,
  myTemplates: [],
  isMyTemplatesLoaded: false,
  defaultTemplateId: null,

  loadTemplates: async () => {
    try {
      const all = await storageLoadTemplates();
      const migrated = all.map((t) => ({
        ...t,
        components: Array.isArray(t.components) ? t.components.map(migrateComponent) : [],
        config: migrateTemplateConfig(t.config),
      }));
      const userId = useAuthStore.getState().user?.id ?? null;
      const defaultId = useAuthStore.getState().user?.defaultTemplateId ?? getStoredDefaultTemplateId(userId);
      setStoredDefaultTemplateId(defaultId, userId);
      set({ savedTemplates: migrated, isLoaded: true, defaultTemplateId: defaultId });
    } catch (err) {
      console.error('Failed to load email templates:', err);
      set({ isLoaded: true });
    }
  },

  loadMyTemplates: async () => {
    try {
      const list = await storageLoadMyTemplates();
      const migrated = list.map((t) => ({
        ...t,
        components: Array.isArray(t.components) ? t.components.map(migrateComponent) : [],
        config: migrateTemplateConfig(t.config),
      }));
      set({ myTemplates: migrated, isMyTemplatesLoaded: true });
      (async () => {
        const need = list.filter(needsTemplateBackfill);
        if (need.length === 0) return;
        for (const t of migrated) {
          if (!needsTemplateBackfill(t)) continue;
          try {
            await storagePutTemplate(t);
          } catch (err) {
            console.warn('模板迁移回写失败，已略过', t.id, err);
          }
        }
      })();
    } catch (err) {
      console.error('Failed to load my templates:', err);
      set({ isMyTemplatesLoaded: true });
    }
  },

  getDefaultTemplateId: () => {
    const userId = useAuthStore.getState().user?.id ?? null;
    return get().defaultTemplateId ?? getStoredDefaultTemplateId(userId);
  },

  getMyTemplateById: (id) => get().myTemplates.find((t) => t.id === id),

  setDefaultTemplateId: async (id) => {
    try {
      const user = await serverSetDefaultTemplateId(id);
      useAuthStore.getState().setUser(user);
      const userId = useAuthStore.getState().user?.id ?? null;
      setStoredDefaultTemplateId(id, userId);
      set({ defaultTemplateId: id });
    } catch (err) {
      console.error('Failed to set default template:', err);
      toast('设置默认模板失败', 'error');
    }
  },

  addTemplate: async (payload) => {
    const now = Date.now();
    const id = nanoid();
    const components = payload.components.map((root) => migrateComponent(deepCloneWithNewIds(root)));
    const config = migrateTemplateConfig(payload.config);
    const template: SavedEmailTemplate = {
      id,
      title: payload.title.trim(),
      desc: payload.desc.trim(),
      components,
      config,
      previewDataUrl: payload.previewDataUrl,
      createdAt: now,
      updatedAt: now,
      ...(payload.customVariables && payload.customVariables.length > 0
        ? { customVariables: payload.customVariables }
        : {}),
      ...(payload.renderingRules && Object.keys(payload.renderingRules).length > 0
        ? { renderingRules: payload.renderingRules }
        : {}),
    };
    await storageAddTemplate(template, payload.previewDataUrl, payload.isPublic);
    set((s) => ({
      savedTemplates: payload.isPublic ? [...s.savedTemplates, template] : s.savedTemplates,
    }));
    get().loadMyTemplates();
    return template;
  },

  updateTemplate: async (id, payload) => {
    const state = get();
    const target = findTemplateById(state, id);
    if (!target) return;
    const components = payload.components.map((root) => migrateComponent(deepCloneWithNewIds(root)));
    const config = migrateTemplateConfig(payload.config);
    const updated: SavedEmailTemplate = {
      ...target,
      title: target.title,
      desc: target.desc,
      components,
      config,
      previewDataUrl: payload.previewDataUrl,
      updatedAt: Date.now(),
      customVariables: payload.customVariables && payload.customVariables.length > 0
        ? payload.customVariables
        : undefined,
      renderingRules: payload.renderingRules && Object.keys(payload.renderingRules).length > 0
        ? payload.renderingRules
        : undefined,
    };
    // Collect variable keys from components (合併 Layer 4 規則後再收集)
    const requiredVariableKeys = collectVariableKeys(components, updated.renderingRules);
    await storagePutTemplate(updated, payload.previewDataUrl, undefined, requiredVariableKeys);
    set((s) => ({
      savedTemplates: s.savedTemplates.map((t) => (t.id === id ? updated : t)),
      myTemplates: s.myTemplates.map((t) => (t.id === id ? updated : t)),
    }));
  },

  updateTemplateMeta: async (id, payload) => {
    const state = get();
    const target = findTemplateById(state, id);
    if (!target) return;
    const updated: SavedEmailTemplate = {
      ...target,
      title: payload.title.trim(),
      desc: payload.desc.trim(),
      updatedAt: Date.now(),
    };
    await storagePutTemplate(updated);
    set((s) => ({
      savedTemplates: s.savedTemplates.map((t) => (t.id === id ? updated : t)),
      myTemplates: s.myTemplates.map((t) => (t.id === id ? updated : t)),
    }));
    get().loadMyTemplates();
  },

  updateTemplatePreview: async (id, previewDataUrl) => {
    const state = get();
    const target = findTemplateById(state, id);
    if (!target) return;
    const updated: SavedEmailTemplate = {
      ...target,
      previewDataUrl,
      updatedAt: Date.now(),
    };
    await storagePutTemplate(updated, previewDataUrl);
    set((s) => ({
      savedTemplates: s.savedTemplates.map((t) => (t.id === id ? updated : t)),
      myTemplates: s.myTemplates.map((t) => (t.id === id ? updated : t)),
    }));
  },

  setTemplatePreviewUrl: (id, previewUrl) => {
    const now = Date.now();
    set((s) => ({
      savedTemplates: s.savedTemplates.map((t) =>
        t.id === id ? { ...t, previewDataUrl: previewUrl, updatedAt: now } : t
      ),
      myTemplates: s.myTemplates.map((t) =>
        t.id === id ? { ...t, previewDataUrl: previewUrl, updatedAt: now } : t
      ),
    }));
  },

  deleteTemplate: async (id) => {
    await storageDeleteTemplate(id);
    const userId = useAuthStore.getState().user?.id ?? null;
    const wasDefault = get().defaultTemplateId === id || getStoredDefaultTemplateId(userId) === id;
    if (wasDefault) {
      try {
        const user = await serverSetDefaultTemplateId(null);
        useAuthStore.getState().setUser(user);
      } catch {
        // 后端清除失败时仅清本地
      }
      setStoredDefaultTemplateId(null, userId);
      set((s) => ({ ...s, defaultTemplateId: null }));
    }
    set((s) => ({
      savedTemplates: s.savedTemplates.filter((t) => t.id !== id),
      myTemplates: s.myTemplates.filter((t) => t.id !== id),
    }));
    get().loadMyTemplates();
  },

  getTemplateById: (id) => findTemplateById(get(), id),

  seedBuiltinTemplatesIfNeeded: async () => {
    if (_seedingBuiltin) return [];
    _seedingBuiltin = true;
    try {
      const state = get();
      const existingTitles = new Set(state.savedTemplates.map((t) => t.title));
      const newTemplates: SavedEmailTemplate[] = [];

      for (const def of BUILTIN_TEMPLATES) {
        const seededTitles = getSeededTitles();
        if (seededTitles.includes(def.title) || existingTitles.has(def.title)) {
          markTitleSeeded(def.title);
          continue;
        }
        try {
          const now = Date.now();
          const components = def.createComponents().map((root) =>
            migrateComponent(deepCloneWithNewIds(root))
          );
          const config = migrateTemplateConfig(def.config);
          const template: SavedEmailTemplate = {
            id: nanoid(),
            title: def.title,
            desc: def.desc,
            components,
            config,
            previewDataUrl: def.previewDataUrl,
            createdAt: now,
            updatedAt: now,
          };
          await storageAddTemplate(template, template.previewDataUrl, def.isPublic);
          markTitleSeeded(def.title);
          newTemplates.push(template);
        } catch (err) {
          console.warn(`Failed to seed builtin template "${def.title}":`, err);
        }
      }

      if (newTemplates.length > 0) {
        set((s) => ({
          savedTemplates: [...s.savedTemplates, ...newTemplates],
        }));
      }
      return newTemplates;
    } finally {
      _seedingBuiltin = false;
    }
  },
}));
