/**
 * /projects/new — 创建空白工程并重定向到编辑器
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { serverCreateEmptyProject } from '@shared/api/serverApi';
import { toast } from '@shared/store/useToastStore';

export default function ProjectNewPage() {
  const navigate = useNavigate();
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (tried) return;
    setTried(true);
    serverCreateEmptyProject()
      .then(({ id }) => navigate(`/projects/edit/${id}`, { replace: true }))
      .catch((err) => {
        toast(`创建工程失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
        navigate('/templates', { replace: true });
      });
  }, [navigate, tried]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: "'Source Sans 3', sans-serif",
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 28,
            height: 28,
            border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        <p style={{ margin: 0, fontSize: '0.875rem' }} aria-live="polite">创建工程中…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
