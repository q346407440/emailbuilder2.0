import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  serverListMyProjects,
  serverCreateEmptyProject,
  serverDeleteProject,
  buildPreviewDataUrl,
  type ProjectListItem,
} from '@shared/api/serverApi';
import { apiGet, apiPost } from '@shared/api/apiClient';
import { toast } from '@shared/store/useToastStore';
import ProjectCard, { ProjectCardSkeleton } from '@features/project-management/components/ProjectCard/ProjectCard';
import styles from './DashboardPage.module.css';

interface DashStats30d { sent: number; openRate: number; clickRate: number; unsubRate: number; }

export default function DashboardPage() {
  const navigate = useNavigate();
  const [recentProjects, setRecentProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingAutomation, setCreatingAutomation] = useState(false);
  const [stats30d, setStats30d] = useState<DashStats30d | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      serverListMyProjects(),
      apiGet<{ stats30d: DashStats30d }>('/api/analytics/dashboard').catch(() => null),
    ]).then(([list, dashRes]) => {
      if (cancelled) return;
      const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
      setRecentProjects(sorted);
      if (dashRes) setStats30d(dashRes.stats30d);
    }).catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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

  const handleNewAutomation = async () => {
    if (creatingAutomation) return;
    setCreatingAutomation(true);
    try {
      const res = await apiPost<{ id: string }>('/api/automations', {
        name: '新自动化流程',
        triggerType: 'customer_created',
        steps: [],
      });
      navigate(`/automations/edit/${res.id}`);
    } catch (err) {
      toast(`创建失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    } finally {
      setCreatingAutomation(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await serverDeleteProject(id);
      setRecentProjects((prev) => prev.filter((p) => p.id !== id));
      toast('已删除', 'success');
    } catch (err) {
      toast(`删除失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>工作台</h1>
          <p className={styles.subtitle}>从这里开始设计、编辑或发送邮件</p>
        </div>
      </header>

      {/* 统计：横向指标 */}
      <div className={styles.statsRow}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats30d ? new Intl.NumberFormat('zh-CN').format(stats30d.sent) : '—'}</span>
          <span className={styles.statLabel}>本月发送</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats30d ? new Intl.NumberFormat('zh-CN', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(stats30d.openRate) : '—'}</span>
          <span className={styles.statLabel}>打开率</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats30d ? new Intl.NumberFormat('zh-CN', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(stats30d.clickRate) : '—'}</span>
          <span className={styles.statLabel}>点击率</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats30d ? new Intl.NumberFormat('zh-CN', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(stats30d.unsubRate) : '—'}</span>
          <span className={styles.statLabel}>退订率</span>
        </div>
        <Link to="/analytics" className={styles.statLink}>
          查看数据
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>

      {/* 主体双栏布局 */}
      <div className={styles.bodyLayout}>
        {/* 左侧主列 */}
        <div className={styles.mainCol}>
          {/* 快捷动线：两列并排 */}
          <div className={styles.actionsGrid}>
            {/* 开始设计 */}
            <div className={styles.actionCard}>
              <div className={styles.actionCardHead}>
                <div className={styles.actionCardIcon} aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="12" x2="12" y2="18" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </div>
                <h2 className={styles.actionCardTitle}>开始设计</h2>
              </div>
              <p className={styles.actionCardDesc}>新建工程或从已有模板复制一份再改</p>
              <div className={styles.actionCardBtns}>
                <button type="button" className={styles.ctaBtn} onClick={handleNew} disabled={creating}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {creating ? '创建中…' : '新建工程'}
                </button>
                <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/templates?tab=mine')}>
                  从模板新建
                </button>
              </div>
            </div>

            {/* 去发送 */}
            <div className={styles.actionCard}>
              <div className={styles.actionCardHead}>
                <div className={styles.actionCardIcon} aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </div>
                <h2 className={styles.actionCardTitle}>去发送</h2>
              </div>
              <p className={styles.actionCardDesc}>创建广播活动或自动化流程，把邮件发出去</p>
              <div className={styles.actionCardBtns}>
                <button type="button" className={styles.ctaBtn} onClick={() => navigate('/broadcasts/new')}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  新建广播活动
                </button>
                <button type="button" className={styles.secondaryBtn} onClick={handleNewAutomation} disabled={creatingAutomation}>
                  {creatingAutomation ? '创建中…' : '新建自动化'}
                </button>
              </div>
            </div>
          </div>

          {/* 最近工程 */}
          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h2 className={styles.blockTitle}>最近编辑</h2>
              <button type="button" className={styles.viewAllBtn} onClick={() => navigate('/templates?tab=projects')}>
                查看全部 →
              </button>
            </div>

            {loading ? (
              <div className={styles.recentGrid}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <ProjectCardSkeleton key={i} />
                ))}
              </div>
            ) : recentProjects.length === 0 ? (
              <div className={styles.emptyState}>
                <svg className={styles.emptyIcon} width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <p>还没有工程，点击「新建工程」开始</p>
                <button type="button" className={styles.ctaBtn} onClick={handleNew} disabled={creating}>
                  新建第一个工程
                </button>
              </div>
            ) : (
              <div className={styles.recentGrid}>
                {recentProjects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={{ ...p, previewUrl: p.previewUrl ? buildPreviewDataUrl(p.previewUrl) : null }}
                    onDelete={handleDeleteProject}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* 右侧侧边栏 */}
        <div className={styles.sideCol}>
          {/* 快捷入口 */}
          <div className={styles.quickCard}>
            <h3 className={styles.quickCardTitle}>快捷入口</h3>
            <div className={styles.quickLinks}>
              <button type="button" className={styles.quickLink} onClick={() => navigate('/audience/contacts')}>
                <span className={styles.quickLinkIcon} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    <path d="M16 3.13a4 4 0 010 7.75" />
                  </svg>
                </span>
                管理受众
                <span className={styles.quickLinkArrow} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>
              <button type="button" className={styles.quickLink} onClick={() => navigate('/templates')}>
                <span className={styles.quickLinkIcon} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </span>
                模板库
                <span className={styles.quickLinkArrow} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>
              <button type="button" className={styles.quickLink} onClick={() => navigate('/broadcasts')}>
                <span className={styles.quickLinkIcon} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.18 2 2 0 014 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                </span>
                广播活动
                <span className={styles.quickLinkArrow} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>
              <button type="button" className={styles.quickLink} onClick={() => navigate('/automations')}>
                <span className={styles.quickLinkIcon} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </span>
                自动化流程
                <span className={styles.quickLinkArrow} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>
              <button type="button" className={styles.quickLink} onClick={() => navigate('/integrations')}>
                <span className={styles.quickLinkIcon} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="5" r="3" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <circle cx="5" cy="19" r="3" />
                    <line x1="7.5" y1="17.5" x2="9.5" y2="16" />
                    <circle cx="19" cy="19" r="3" />
                    <line x1="16.5" y1="17.5" x2="14.5" y2="16" />
                  </svg>
                </span>
                集成配置
                <span className={styles.quickLinkArrow} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>
              <button type="button" className={styles.quickLink} onClick={() => navigate('/analytics')}>
                <span className={styles.quickLinkIcon} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </span>
                数据分析
                <span className={styles.quickLinkArrow} aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>
            </div>
          </div>

          {/* 提示卡片 */}
          <div className={styles.tipCard}>
            <h3 className={styles.tipCardTitle}>开始使用</h3>
            <p className={styles.tipCardDesc}>
              连接 Shoplazza 店铺，自动同步商品、订单和客户数据，让邮件内容更精准。
            </p>
            <button type="button" className={styles.tipCardLink} onClick={() => navigate('/integrations')}>
              前往集成
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
