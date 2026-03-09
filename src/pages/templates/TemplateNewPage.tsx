/**
 * /templates/new 已重定向到 /projects/new（见 router）。
 * 此组件仅作兼容：若某处仍引用本页，则重定向到新建工程。
 */
import { Navigate } from 'react-router-dom';

export default function TemplateNewPage() {
  return <Navigate to="/projects/new" replace />;
}
