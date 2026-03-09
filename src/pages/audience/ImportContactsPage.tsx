import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost, apiGet } from '@shared/api/apiClient';
import { toast } from '@shared/store/useToastStore';
import styles from './ImportContactsPage.module.css';

interface Segment { id: string; name: string; }
interface ParsedRow { [key: string]: string; }
type Step = 1 | 2 | 3 | 4;

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const parse = (line: string) => {
    const result: string[] = [];
    let cur = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  };
  const headers = parse(lines[0]);
  const rows = lines.slice(1).filter((l) => l.trim()).map((l) => {
    const vals = parse(l);
    const obj: ParsedRow = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

export default function ImportContactsPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [dragging, setDragging] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [emailCol, setEmailCol] = useState('');
  const [nameCol, setNameCol] = useState('');
  const [dupStrategy, setDupStrategy] = useState<'update' | 'skip'>('update');
  const [segmentId, setSegmentId] = useState('');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [jobStatus, setJobStatus] = useState<{ status: string; processed: number; skipped: number; errors: number; total: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiGet<Segment[]>('/api/segments').then(setSegments).catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) { toast('请上传 CSV 文件', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows: r } = parseCSV(text);
      if (h.length === 0) { toast('CSV 格式无效，请确认文件包含标题行', 'error'); return; }
      setHeaders(h);
      setRows(r);
      // Auto-detect column mappings
      const emailGuess = h.find((x) => /email/i.test(x)) ?? '';
      const nameGuess = h.find((x) => /name/i.test(x)) ?? '';
      setEmailCol(emailGuess);
      setNameCol(nameGuess);
      setStep(2);
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async () => {
    if (!emailCol) { toast('请选择邮箱列', 'error'); return; }
    const importRows = rows.map((r) => ({ email: r[emailCol] ?? '', name: nameCol ? (r[nameCol] ?? '') : undefined }));
    setSubmitting(true);
    try {
      const { jobId: id } = await apiPost<{ jobId: string }>('/api/contacts/import', {
        rows: importRows,
        duplicateStrategy: dupStrategy,
        segmentId: segmentId || undefined,
      });
      setStep(3);
      // Poll for status
      pollRef.current = setInterval(async () => {
        try {
          const status = await apiGet<typeof jobStatus>(`/api/contacts/import/${id}/status`);
          setJobStatus(status);
          if (status?.status === 'completed' || status?.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            setStep(4);
          }
        } catch { /* ignore */ }
      }, 800);
    } catch (err) {
      toast(`提交失敗：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/audience/contacts')}>← 返回联系人</button>
        <h1 className={styles.title}>导入联系人</h1>
      </div>

      {/* Steps indicator */}
      <div className={styles.stepsRow}>
        {(['上传文件', '栏位映射', '导入中', '导入完成'] as const).map((label, i) => (
          <div key={i} className={`${styles.stepItem}${step > i + 1 ? ` ${styles.stepDone}` : step === i + 1 ? ` ${styles.stepActive}` : ''}`}>
            <span className={styles.stepNum}>{step > i + 1 ? '✓' : i + 1}</span>
            <span className={styles.stepLabel}>{label}</span>
            {i < 3 && <span className={styles.stepArrow}>→</span>}
          </div>
        ))}
      </div>

      <div className={styles.content}>
        {/* Step 1: Upload */}
        {step === 1 && (
          <div
            className={`${styles.dropZone}${dragging ? ` ${styles.dropZoneDragging}` : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p className={styles.dropTitle}>拖拽 CSV 文件到此处，或点击选择</p>
            <p className={styles.dropHint}>仅支持 .csv 格式，首行为列标题，UTF-8 编码</p>
          </div>
        )}

        {/* Step 2: Column mapping */}
        {step === 2 && (
          <div className={styles.mapCard}>
            <p className={styles.mapInfo}>已解析 <b>{rows.length}</b> 行数据，共 <b>{headers.length}</b> 列</p>

            <div className={styles.mapFields}>
              <label className={styles.mapField}>
                <span className={styles.mapLabel}>邮箱列 <span className={styles.required}>*</span></span>
                <select className={styles.mapSelect} value={emailCol} onChange={(e) => setEmailCol(e.target.value)}>
                  <option value="">— 请选择 —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label className={styles.mapField}>
                <span className={styles.mapLabel}>姓名列（选填）</span>
                <select className={styles.mapSelect} value={nameCol} onChange={(e) => setNameCol(e.target.value)}>
                  <option value="">— 不导入姓名 —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label className={styles.mapField}>
                <span className={styles.mapLabel}>重复邮箱处理</span>
                <select className={styles.mapSelect} value={dupStrategy} onChange={(e) => setDupStrategy(e.target.value as 'update' | 'skip')}>
                  <option value="update">更新已有記錄</option>
                  <option value="skip">跳过（保留原有）</option>
                </select>
              </label>
              <label className={styles.mapField}>
                <span className={styles.mapLabel}>加入分组（选填）</span>
                <select className={styles.mapSelect} value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
                  <option value="">— 不加入分组 —</option>
                  {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            </div>

            {/* Preview */}
            <div className={styles.preview}>
              <p className={styles.previewTitle}>数据预览（前 5 行）</p>
              <div className={styles.previewTable}>
                <table>
                  <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>{headers.map((h) => <td key={h}>{r[h] ?? ''}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.mapActions}>
              <button className={styles.backBtn2} onClick={() => setStep(1)}>← 重新选择文件</button>
              <button className={styles.submitBtn} onClick={handleSubmit} disabled={!emailCol || submitting}>
                {submitting ? '提交中…' : `确认导入 ${rows.length} 行`}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: In progress */}
        {step === 3 && (
          <div className={styles.progressCard}>
            <div className={styles.progressSpinner} />
            <p className={styles.progressTitle} aria-live="polite">导入中…</p>
            {jobStatus && (
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${Math.round((jobStatus.processed + jobStatus.skipped + jobStatus.errors) / jobStatus.total * 100)}%` }} />
              </div>
            )}
            <p className={styles.progressHint}>请稍候，正在处理数据</p>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && jobStatus && (
          <div className={styles.resultCard}>
            <div className={styles.resultIcon}>{jobStatus.status === 'completed' ? '✅' : '❌'}</div>
            <h2 className={styles.resultTitle}>{jobStatus.status === 'completed' ? '导入完成' : '导入失败'}</h2>
            <div className={styles.resultStats}>
              <div className={styles.resultStat}><span className={styles.resultStatNum} style={{ color: '#16a34a' }}>{jobStatus.processed}</span><span>成功导入</span></div>
              <div className={styles.resultStat}><span className={styles.resultStatNum} style={{ color: 'var(--text-muted)' }}>{jobStatus.skipped}</span><span>跳过</span></div>
              <div className={styles.resultStat}><span className={styles.resultStatNum} style={{ color: '#DC3545' }}>{jobStatus.errors}</span><span>错误</span></div>
            </div>
            <div className={styles.resultActions}>
              <button className={styles.submitBtn} onClick={() => navigate('/audience/contacts')}>查看联系人列表</button>
              <button className={styles.backBtn2} onClick={() => { setStep(1); setRows([]); setHeaders([]); setJobStatus(null); }}>重新导入</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
