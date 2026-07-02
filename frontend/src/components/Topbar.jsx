import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, LogOut } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import CompanySwitcher from './CompanySwitcher';
import LanguageSwitcher from './LanguageSwitcher';

export default function Topbar() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useUiStore();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-100 dark:border-navy-800 bg-white/80 dark:bg-navy-950/80 backdrop-blur px-6 py-3.5">
      <CompanySwitcher />
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <button onClick={toggleTheme} className="btn-ghost !px-2.5" title="Toggle theme">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-navy-800" />
        <div className="hidden sm:flex flex-col items-end leading-tight">
          <span className="text-sm font-semibold">{user?.name}</span>
          <span className="text-[11px] text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</span>
        </div>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="btn-ghost !px-2.5 text-red-500"
          title={t('nav.logout')}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
