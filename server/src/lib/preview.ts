import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharpInstance: any = null;
import('sharp')
  .then((m) => { sharpInstance = m.default ?? m; })
  .catch(() => {});

const UPLOADS = path.join(__dirname, '../../uploads');

function base64ToBuffer(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  const raw = match ? match[1] : dataUrl;
  return Buffer.from(raw, 'base64');
}

export type PreviewKind = 'templates' | 'composites' | 'projects';

export function getPreviewPath(kind: PreviewKind, id: string): string {
  return path.join(UPLOADS, kind, `${id}.png`);
}

export async function savePreview(
  kind: PreviewKind,
  id: string,
  dataUrl: string
): Promise<void> {
  const dir = path.join(UPLOADS, kind);
  fs.mkdirSync(dir, { recursive: true });
  const raw = base64ToBuffer(dataUrl);
  let buf = raw;
  // 列表缩略图用：不需放大查看，宽度 480 足够区分模板且体积小、列表加载快
  if (sharpInstance) {
    buf = await sharpInstance(raw)
      .resize({ width: 480, withoutEnlargement: true })
      .png({ quality: 75, compressionLevel: 9 })
      .toBuffer();
  }
  fs.writeFileSync(path.join(dir, `${id}.png`), buf);
}

export function getPreviewUrl(kind: PreviewKind, id: string): string {
  return `/api/previews/${kind}/${id}`;
}

export function previewExists(kind: PreviewKind, id: string): boolean {
  return fs.existsSync(getPreviewPath(kind, id));
}

/** 複製預覽圖文件（用於工程發布為模板時沿用預覽圖） */
export function copyPreviewFile(
  fromKind: PreviewKind,
  fromId: string,
  toKind: PreviewKind,
  toId: string
): void {
  const src = getPreviewPath(fromKind, fromId);
  if (!fs.existsSync(src)) return;
  const destDir = path.join(UPLOADS, toKind);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, `${toId}.png`));
}
