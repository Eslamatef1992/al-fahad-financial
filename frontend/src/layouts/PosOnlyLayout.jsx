import { Outlet, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Store } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import PageErrorBoundary from '@/components/PageErrorBoundary';
import { useAuthStore } from '@/store/authStore';

// Minimal shell for POS-only sign-ins (pos.<domain>): no back-office menu, just the till.
export default function PosOnlyLayout() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-navy-950">
      <header className="bg-navy-900 h-14 px-4 flex items-center justify-between print:hidden">
        <Link to="/pos" className="flex items-center gap-3" title={isAr ? 'شاشة البيع' : 'Sales screen'}>
          <div className="bg-white rounded-lg px-2 py-0.5"><BrandLogo className="h-7" /></div>
          <span className="hidden sm:flex items-center gap-1.5 text-sky-200 hover:text-white text-sm"><Store size={15} />{isAr ? 'نقطة البيع' : 'Point of Sale'}</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-white text-sm font-semibold">{user?.name}</span>
          <LanguageSwitcher />
          <button onClick={() => { logout(); navigate('/pos-login'); }} className="flex items-center gap-1.5 text-sm text-white/90 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10">
            <LogOut size={15} />{isAr ? 'خروج' : 'Sign out'}
          </button>
        </div>
      </header>
      <main className="flex-1 min-w-0 p-4 sm:p-6">
        <PageErrorBoundary><Outlet /></PageErrorBoundary>
      </main>
    </div>
  );
}
