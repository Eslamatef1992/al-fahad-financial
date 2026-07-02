import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default function AppLayout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-navy-950">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
