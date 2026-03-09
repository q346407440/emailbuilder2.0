import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, useParams } from 'react-router-dom';
import { ToastContainer } from '@shared/ui/Toast';
import PageSkeleton from '@shared/ui/PageSkeleton';
import ErrorBoundary from '@shared/ui/ErrorBoundary';
import ProtectedRoute from '@features/auth/components/ProtectedRoute';
import AppShell from './layouts/AppShell';
import AuthLayout from './layouts/AuthLayout';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import GmailOAuthDonePage from '@features/integrations/gmail/GmailOAuthDonePage';

// Lazy load all pages
const LoginPage          = lazy(() => import('./pages/auth/LoginPage'));
const TemplateLibraryPage = lazy(() => import('./pages/templates/TemplateLibraryPage'));
const TemplateEditorPage = lazy(() => import('./pages/templates/TemplateEditorPage'));
const ProjectNewPage     = lazy(() => import('./pages/projects/ProjectNewPage'));
const DashboardPage      = lazy(() => import('./pages/dashboard/DashboardPage'));
const TemplateDetailPage  = lazy(() => import('./pages/templates/TemplateDetailPage'));
const TemplatePreviewPage = lazy(() => import('./pages/templates/TemplatePreviewPage'));
const BroadcastListPage   = lazy(() => import('./pages/broadcasts/BroadcastListPage'));
const BroadcastWizard     = lazy(() => import('./pages/broadcasts/wizard/BroadcastWizard'));
const BroadcastDetailPage = lazy(() => import('./pages/broadcasts/BroadcastDetailPage'));
const BroadcastAnalyticsPage = lazy(() => import('./pages/broadcasts/BroadcastAnalyticsPage'));
const AutomationListPage     = lazy(() => import('./pages/automations/AutomationListPage'));
const AutomationEditorPage   = lazy(() => import('./pages/automations/AutomationEditorPage'));
const AutomationDetailPage   = lazy(() => import('./pages/automations/AutomationDetailPage'));
const AutomationAnalyticsPage = lazy(() => import('./pages/automations/AutomationAnalyticsPage'));
const ContactListPage    = lazy(() => import('./pages/audience/ContactListPage'));
const SegmentListPage    = lazy(() => import('./pages/audience/SegmentListPage'));
const ImportContactsPage = lazy(() => import('./pages/audience/ImportContactsPage'));
const UnsubscribePage    = lazy(() => import('./pages/public/UnsubscribePage'));
const IntegrationLayout        = lazy(() => import('./pages/integrations/IntegrationLayout'));
const IntegrationShoplazzaList  = lazy(() => import('./pages/integrations/IntegrationShoplazzaList'));
const IntegrationGmailList     = lazy(() => import('./pages/integrations/IntegrationGmailList'));
const IntegrationPlaceholder   = lazy(() => import('./pages/integrations/IntegrationPlaceholder'));
const ShoplazzaConfigPage      = lazy(() => import('./pages/integrations/ShoplazzaConfigPage'));
const GmailAccountDetailPage   = lazy(() => import('./pages/integrations/GmailAccountDetailPage'));
const SchemaManagementPage     = lazy(() => import('./pages/integrations/SchemaManagementPage'));
const AnalyticsOverviewPage = lazy(() => import('./pages/analytics/AnalyticsOverviewPage'));

function wrap(element: React.ReactNode) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>{element}</Suspense>
    </ErrorBoundary>
  );
}

function RootLayout() {
  useEffect(() => { useAuthStore.getState().loadUser(); }, []);
  return (<><ToastContainer /><Outlet /></>);
}

/** 舊路徑 /templates/:id 重定向到 /templates/detail/:id，相容書籤與分享連結 */
function RedirectTemplateIdToDetail() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/templates/detail/${id}` : '/templates'} replace />;
}

/** 舊路徑 /broadcasts/:id 重定向到 /broadcasts/detail/:id */
function RedirectBroadcastIdToDetail() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/broadcasts/detail/${id}` : '/broadcasts'} replace />;
}

/** 舊路徑 /automations/:id 重定向到 /automations/detail/:id */
function RedirectAutomationIdToDetail() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/automations/detail/${id}` : '/automations'} replace />;
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // Public routes
      {
        element: <AuthLayout />,
        children: [
          { path: '/login',           element: wrap(<LoginPage />) },
          { path: '/gmail-oauth-done', element: <GmailOAuthDonePage /> },
          { path: '/unsubscribe',     element: wrap(<UnsubscribePage />) },
        ],
      },

      { path: '/', element: <Navigate to="/dashboard" replace /> },

      // Protected routes
      {
        element: <ProtectedRoute />,
        children: [
          // Full-screen (no sidebar)
          { path: '/templates/new',         element: <Navigate to="/projects/new" replace /> },
          { path: '/projects/new',          element: wrap(<ProjectNewPage />) },
          { path: '/projects/edit/:id',     element: wrap(<TemplateEditorPage />) },
          { path: '/templates/edit/:id',    element: wrap(<TemplateEditorPage />) },

          // AppShell pages
          {
            element: <AppShell />,
            children: [
              { path: '/dashboard',             element: wrap(<DashboardPage />) },
              { path: '/templates',             element: wrap(<TemplateLibraryPage />) },
              { path: '/templates/detail/:id',  element: wrap(<TemplateDetailPage />) },
              { path: '/templates/preview/:id', element: wrap(<TemplatePreviewPage />) },
              { path: '/templates/:id',         element: <RedirectTemplateIdToDetail /> },

              { path: '/broadcasts',                 element: wrap(<BroadcastListPage />) },
              { path: '/broadcasts/new',             element: wrap(<BroadcastWizard />) },
              { path: '/broadcasts/detail/:id',      element: wrap(<BroadcastDetailPage />) },
              { path: '/broadcasts/analytics/:id',   element: wrap(<BroadcastAnalyticsPage />) },
              { path: '/broadcasts/:id',             element: <RedirectBroadcastIdToDetail /> },

              { path: '/automations',                   element: wrap(<AutomationListPage />) },
              { path: '/automations/detail/:id',        element: wrap(<AutomationDetailPage />) },
              { path: '/automations/edit/:id',          element: wrap(<AutomationEditorPage />) },
              { path: '/automations/analytics/:id',     element: wrap(<AutomationAnalyticsPage />) },
              { path: '/automations/:id',               element: <RedirectAutomationIdToDetail /> },

              { path: '/audience/contacts',   element: wrap(<ContactListPage />) },
              { path: '/audience/segments',   element: wrap(<SegmentListPage />) },
              { path: '/audience/segments/:id', element: wrap(<SegmentListPage />) },
              { path: '/audience/import',     element: wrap(<ImportContactsPage />) },

              { path: '/integrations', element: <Navigate to="/integrations/store/shoplazza" replace /> },
              {
                path: '/integrations/store',
                element: wrap(<IntegrationLayout />),
                children: [
                  { index: true, element: <Navigate to="shoplazza" replace /> },
                  { path: 'shoplazza', element: wrap(<IntegrationShoplazzaList />) },
                  { path: 'future-a', element: wrap(<IntegrationPlaceholder title="未来平台 A" />) },
                  { path: 'future-b', element: wrap(<IntegrationPlaceholder title="未来平台 B" />) },
                ],
              },
              { path: '/integrations/store/shoplazza/:integrationId', element: wrap(<ShoplazzaConfigPage />) },
              {
                path: '/integrations/email',
                element: wrap(<IntegrationLayout />),
                children: [
                  { index: true, element: <Navigate to="gmail" replace /> },
                  { path: 'gmail', element: wrap(<IntegrationGmailList />) },
                  { path: 'outlook', element: wrap(<IntegrationPlaceholder title="Outlook" />) },
                  { path: 'qq', element: wrap(<IntegrationPlaceholder title="QQ 邮箱" />) },
                ],
              },
              { path: '/integrations/email/gmail/:accountId', element: wrap(<GmailAccountDetailPage />) },
              { path: '/integrations/schema', element: wrap(<SchemaManagementPage />) },

              { path: '/analytics', element: wrap(<AnalyticsOverviewPage />) },

              { path: '/settings', element: <Navigate to="/dashboard" replace /> },
              { path: '/settings/*', element: <Navigate to="/dashboard" replace /> },
            ],
          },
        ],
      },

      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
