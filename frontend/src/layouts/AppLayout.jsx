import { Outlet, useLocation } from 'react-router-dom';
import TopNav from '@/components/TopNav';
import PageErrorBoundary from '@/components/PageErrorBoundary';

export default function AppLayout() {
  const location = useLocation();
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-navy-950">
      <TopNav />
      <main className="flex-1 min-w-0 p-4 sm:p-6">
        {/* Page transitions were previously wrapped in an outer AnimatePresence, which
            combined with the per-page AnimatePresence instances used by dialogs, dropdowns,
            and the account/cost-center tree views into a known-unstable nested-AnimatePresence
            pattern in framer-motion — that combination was the source of intermittent
            "X is not a function" crashes/blank pages on navigation. Removed in favor of a
            plain, reliable render. The PageErrorBoundary below is a safety net so that any
            future page-level error shows a recoverable message instead of a blank screen. */}
        <PageErrorBoundary key={location.pathname}>
          <Outlet />
        </PageErrorBoundary>
      </main>
    </div>
  );
}
