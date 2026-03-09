import { Outlet } from 'react-router-dom';

/** 不再强制跳转登录页，未登录时仍可访问页面，由各页/AppShell 做登录引导提示。 */
export default function ProtectedRoute() {
  return <Outlet />;
}
