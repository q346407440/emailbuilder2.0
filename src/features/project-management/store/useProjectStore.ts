import { create } from 'zustand';
import type { ProjectListItem } from '@shared/api/serverApi';
import type { RenderingRules } from '@shared/types/email';
import {
  loadMyProjects as storageLoadMyProjects,
  putProject as storagePutProject,
  deleteProject as storageDeleteProject,
} from '@shared/storage/projectStorage';

interface ProjectState {
  myProjects: ProjectListItem[];
  isMyProjectsLoaded: boolean;

  loadMyProjects: () => Promise<void>;
  getProjectById: (id: string) => ProjectListItem | undefined;
  putProject: (project: {
    id: string;
    title: string;
    desc?: string;
    components: unknown[];
    config: unknown;
    customVariables?: unknown[];
    renderingRules?: RenderingRules;
    updatedAt: number;
  }) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  /** 仅更新本地 store 中某工程的预览 URL（不请求 API），用于自动补齐预览后刷新 UI */
  setProjectPreviewUrl: (id: string, previewUrl: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  myProjects: [],
  isMyProjectsLoaded: false,

  loadMyProjects: async () => {
    try {
      const list = await storageLoadMyProjects();
      set({ myProjects: list, isMyProjectsLoaded: true });
    } catch (err) {
      console.error('Failed to load projects:', err);
      set({ isMyProjectsLoaded: true });
    }
  },

  getProjectById: (id: string) => {
    return get().myProjects.find((p) => p.id === id);
  },

  putProject: async (project) => {
    await storagePutProject(project);
    set((state) => ({
      myProjects: state.myProjects.map((p) =>
        p.id === project.id
          ? {
              ...p,
              title: project.title,
              desc: project.desc ?? p.desc,
              updatedAt: project.updatedAt,
            }
          : p
      ),
    }));
  },

  deleteProject: async (id: string) => {
    await storageDeleteProject(id);
    set((state) => ({
      myProjects: state.myProjects.filter((p) => p.id !== id),
    }));
  },

  setProjectPreviewUrl: (id: string, previewUrl: string) => {
    set((state) => ({
      myProjects: state.myProjects.map((p) =>
        p.id === id ? { ...p, previewUrl } : p
      ),
    }));
  },
}));
