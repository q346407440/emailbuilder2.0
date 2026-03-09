import type { EmailComponent } from './email';
import type { TemplateConfig } from './email';

/** 入库的邮件模板（常驻项目内） */
export interface SavedEmailTemplate {
  id: string;
  title: string;
  desc: string;
  components: EmailComponent[];
  config: TemplateConfig;
  /** 预览图 data URL，保存时用当前画布截图 */
  previewDataUrl: string;
  createdAt: number;
  updatedAt: number;
}
