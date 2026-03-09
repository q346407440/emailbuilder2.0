import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  serverListTemplatesCatalog,
  serverCreateEmptyProject,
  serverGetTemplate,
  serverPutProject,
  serverDuplicateTemplate,
  serverDeleteTemplate,
  serverListMyProjects,
  serverDeleteProject,
  serverPublishProjectToTemplate,
  buildPreviewDataUrl,
  type TemplateCatalogItem,
  type ProjectListItem,
} from '@shared/api/serverApi';
import type { SaveTemplatePayload } from '@features/template-management/components/SaveTemplateModal/SaveTemplateModal';
import TemplateCard, { TemplateCardSkeleton } from '@features/template-management/components/TemplateCard/TemplateCard';
import ProjectCard, { ProjectCardSkeleton } from '@features/project-management/components/ProjectCard/ProjectCard';
import SaveTemplateModal from '@features/template-management/components/SaveTemplateModal/SaveTemplateModal';
import { useEmailTemplateStore } from '@features/template-management/store/useEmailTemplateStore';
import Select from '@features/email-editor/components/RightPanel/editors/Select';
import { toast, toastLoadError } from '@shared/store/useToastStore';
import styles from './TemplateLibraryPage.module.css';

type Tab = 'mine' | 'public' | 'projects';
type SortBy = 'created_at' | 'updated_at';
type SortOrder = 'asc' | 'desc';
const PAGE_SIZE = 20;

interface TabData {
  templates: TemplateCatalogItem[];
  total: number;
}

export default function TemplateLibraryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as Tab) ?? 'projects';

  const [tabData, setTabData] = useState<Partial<Record<Tab, TabData>>>({});
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [projectIdToPublish, setProjectIdToPublish] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortBy>('updated_at');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [loadingTab, setLoadingTab] = useState<Tab | null>(() => (searchParams.get('tab') as Tab) ?? 'projects');
  const [creating, setCreating] = useState(false);
  const [forkingId, setForkingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const current = tabData[activeTab];
  const templates = current?.templates ?? [];
  const total = current?.total ?? 0;
  const loading = activeTab === 'projects' ? projectsLoading : loadingTab === activeTab;

  const loadTemplates = useCallback(async (tab: Tab, pg: number, options?: { background?: boolean; sortBy?: SortBy; order?: SortOrder }) => {
    if (tab === 'projects') return;
    const isBackground = options?.background === true;
    const useSortBy = options?.sortBy ?? sortBy;
    const useOrder = options?.order ?? order;
    if (!isBackground) setLoadingTab(tab);
    try {
      const res = await serverListTemplatesCatalog({ tab, page: pg, pageSize: PAGE_SIZE, sortBy: useSortBy, order: useOrder });
      if (activeTabRef.current !== tab) return;
      setTabData((prev) => ({ ...prev, [tab]: { templates: res.data, total: res.total } }));
    } catch (err) {
      if (activeTabRef.current === tab && !isBackground) toastLoadError(err, '加载失败');
    } finally {
      if (activeTabRef.current === tab && !isBackground) setLoadingTab(null);
    }
  }, [sortBy, order]);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const list = await serverListMyProjects();
      if (activeTabRef.current === 'projects') setProjects(list);
    } catch (err) {
      if (activeTabRef.current === 'projects') toastLoadError(err, '加载失败');
    } finally {
      if (activeTabRef.current === 'projects') setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    if (activeTab === 'projects') {
      void loadProjects();
      return;
    }
    if (current) {
      setLoadingTab(null);
      return;
    }
    void loadTemplates(activeTab, 1);
  }, [activeTab, current, loadTemplates, loadProjects]);

  const switchTab = (tab: Tab) => {
    setSearchParams({ tab }, { replace: true });
    setSearch('');
  };

  const handleNew = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const { id } = await serverCreateEmptyProject('未命名工程');
      navigate(`/projects/edit/${id}`);
    } catch (err) {
      toast(`创建失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleForkToProject = async (templateId: string) => {
    if (forkingId) return;
    setForkingId(templateId);
    try {
      const tmpl = await serverGetTemplate(templateId);
      if (!tmpl) {
        toast('模板不存在', 'error');
        return;
      }
      const title = `${tmpl.title}（副本）`;
      const { id: newId } = await serverCreateEmptyProject(title);
      await serverPutProject({
        id: newId,
        title,
        desc: '',
        components: tmpl.components as unknown[],
        config: tmpl.config,
        customVariables: tmpl.customVariables as unknown[] | undefined,
        updatedAt: Date.now(),
      });
      toast('已创建工程', 'success');
      navigate(`/projects/edit/${newId}`);
    } catch (err) {
      toast(`创建失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    } finally {
      setForkingId(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await serverDuplicateTemplate(id);
      toast(`已复制为「${res.title}」`, 'success');
      void loadTemplates(activeTab, page, { background: true });
    } catch (err) {
      toast(`复制失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const template = templates.find((t) => t.id === id);
    if (!window.confirm(`确定要删除模板「${template?.title ?? id}」吗？此操作可撤销。`)) return;
    try {
      await serverDeleteTemplate(id);
      toast('已删除', 'success');
      void loadTemplates(activeTab, page, { background: true });
    } catch (err) {
      toast(`删除失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    }
  };

  const handleDeleteProject = async (id: string) => {
    const project = projects.find((p) => p.id === id);
    if (!window.confirm(`确定要删除工程「${project?.title ?? id}」吗？此操作不可恢复。`)) return;
    try {
      await serverDeleteProject(id);
      toast('已删除', 'success');
      void loadProjects();
    } catch (err) {
      toast(`删除失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    }
  };

  const handlePublishOpen = (projectId: string) => {
    setProjectIdToPublish(projectId);
    setPublishModalOpen(true);
  };

  const setDefaultTemplateId = useEmailTemplateStore((s) => s.setDefaultTemplateId);
  const handlePublishConfirm = async (payload: SaveTemplatePayload) => {
    if (!projectIdToPublish) return;
    try {
      const { templateId: newTemplateId, setAsDefault } = await serverPublishProjectToTemplate(projectIdToPublish, payload);
      if (setAsDefault) setDefaultTemplateId(newTemplateId);
      toast('已发布为模板', 'success');
      setProjectIdToPublish(null);
      setPublishModalOpen(false);
      void loadProjects();
    } catch (err) {
      toast(`发布失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    }
  };

  const filtered = search.trim()
    ? templates.filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase()))
    : templates;

  const filteredProjects =
    activeTab === 'projects'
      ? search.trim()
        ? projects.filter((p) => p.title.toLowerCase().includes(search.trim().toLowerCase()))
        : [...projects].sort((a, b) => b.updatedAt - a.updatedAt)
      : [];

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>模板</h1>
          <p className={styles.subtitle}>管理你的邮件模板</p>
        </div>
        <button
          type="button"
          className={styles.newBtn}
          onClick={handleNew}
          disabled={creating}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {creating ? '创建中…' : '新建'}
        </button>
      </div>

      {/* Tabs + Sort + Search */}
      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab}${activeTab === 'projects' ? ` ${styles.tabActive}` : ''}`}
            onClick={() => switchTab('projects')}
          >
            我的工程
          </button>
          <button
            type="button"
            className={`${styles.tab}${activeTab === 'mine' ? ` ${styles.tabActive}` : ''}`}
            onClick={() => switchTab('mine')}
          >
            我的模板
          </button>
          <button
            type="button"
            className={`${styles.tab}${activeTab === 'public' ? ` ${styles.tabActive}` : ''}`}
            onClick={() => switchTab('public')}
          >
            公共模板
          </button>
        </div>
        <div className={styles.toolbarRight}>
          {activeTab !== 'projects' && (
            <Select
              value={`${sortBy}-${order}`}
              onChange={(v) => {
                const [sb, ord] = v.split('-') as [SortBy, SortOrder];
                setSortBy(sb);
                setOrder(ord);
                setPage(1);
                void loadTemplates(activeTab, 1, { sortBy: sb, order: ord });
              }}
              options={[
                { value: 'updated_at-desc', label: '更新时间倒序' },
                { value: 'updated_at-asc', label: '更新时间正序' },
                { value: 'created_at-desc', label: '创建时间倒序' },
                { value: 'created_at-asc', label: '创建时间正序' },
              ]}
              aria-label="排序方式"
              fullWidth={false}
              className={styles.sortSelect}
            />
          )}
          <input
            type="text"
            className={styles.search}
            placeholder={activeTab === 'projects' ? '搜索工程名称…' : '搜索模板名称…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={activeTab === 'projects' ? '搜索工程名称' : '搜索模板名称'}
          />
        </div>
      </div>

      {activeTab === 'projects' && (
        <p className={styles.projectsHint}>工程是你的草稿，发布后才能用于广播和自动化</p>
      )}

      {/* Grid */}
      {loading ? (
        <div className={styles.grid}>
          {Array.from({ length: 8 }).map((_, i) =>
            activeTab === 'projects' ? <ProjectCardSkeleton key={i} /> : <TemplateCardSkeleton key={i} />
          )}
        </div>
      ) : activeTab === 'projects' ? (
        filteredProjects.length === 0 ? (
          <div className={styles.empty}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <p>
              {search ? `没有符合「${search}」的工程` : '还没有工程，点击「新建」开始'}
            </p>
            {!search && (
              <button type="button" className={styles.newBtn} onClick={handleNew} disabled={creating}>
                新建第一个工程
              </button>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
            {filteredProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={{ ...p, previewUrl: p.previewUrl ? buildPreviewDataUrl(p.previewUrl) : null }}
                onDelete={handleDeleteProject}
                onPublish={handlePublishOpen}
              />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <p>
            {search
              ? `没有符合「${search}」的模板`
              : activeTab === 'mine'
                ? '还没有模板。先新建工程，编辑完成后发布为模板即可。'
                : '暂无公共模板'}
          </p>
          {!search && activeTab === 'mine' && (
            <button type="button" className={styles.newBtn} onClick={handleNew} disabled={creating}>
              新建工程
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onForkToProject={handleForkToProject}
            />
          ))}
        </div>
      )}

      {/* Pagination (templates only) */}
      {!loading && activeTab !== 'projects' && totalPages > 1 && !search && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={page <= 1}
            onClick={() => { setPage(page - 1); void loadTemplates(activeTab, page - 1, { background: true }); }}
            aria-label="上一页"
          >
            ← 上一页
          </button>
          <span className={styles.pageInfo} aria-live="polite">{page} / {totalPages}</span>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={page >= totalPages}
            onClick={() => { setPage(page + 1); void loadTemplates(activeTab, page + 1, { background: true }); }}
            aria-label="下一页"
          >
            下一页 →
          </button>
        </div>
      )}

      <SaveTemplateModal
        open={publishModalOpen}
        onClose={() => {
          setPublishModalOpen(false);
          setProjectIdToPublish(null);
        }}
        onConfirm={handlePublishConfirm}
        currentProjectId={projectIdToPublish}
      />
    </div>
  );
}
