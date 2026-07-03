import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, BookText, Receipt, ScrollText, Users, Truck, UsersRound,
  Landmark, Wallet, PieChart, Building2, ChevronsLeft, UserCog, ShieldCheck,
  FileText, FileMinus, RefreshCw,
} from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import usePermissions from '@/hooks/usePermissions';

const NAV = [
  { to: '/', icon: LayoutDashboard, key: 'dashboard', end: true },
  { to: '/chart-of-accounts', icon: BookText, key: 'chartOfAccounts' },
  { to: '/invoices/sales', icon: FileText, key: 'salesInvoices' },
  { to: '/invoices/purchase', icon: FileMinus, key: 'purchaseInvoices' },
  { to: '/recurring-invoices', icon: RefreshCw, key: 'recurringInvoices' },
  { to: '/vouchers', icon: Receipt, key: 'vouchers' },
  { to: '/ledger', icon: ScrollText, key: 'ledger' },
  { to: '/clients', icon: Users, key: 'clients' },
  { to: '/suppliers', icon: Truck, key: 'suppliers' },
  { to: '/employees', icon: UsersRound, key: 'employees' },
  { to: '/vehicles', icon: Truck, key: 'vehicles' },
  { to: '/cost-centers', icon: Landmark, key: 'costCenters' },
  { to: '/cash-control', icon: Wallet, key: 'cashControl' },
  { to: '/reports', icon: PieChart, key: 'reports' },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const user = useAuthStore((s) => s.user);
  const { canDelete: isCompanyAdmin } = usePermissions();

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 84 : 264 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="h-screen sticky top-0 flex flex-col bg-navy-900 text-slate-200 shrink-0 overflow-hidden"
    >
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-gold-500 flex items-center justify-center font-extrabold text-navy-950 shrink-0">AF</div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="font-bold text-white text-sm truncate">{t('app.name')}</p>
            <p className="text-[11px] text-slate-400 truncate">{t('app.tagline')}</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="sidebar-active" className="absolute inset-y-1 start-0 w-1 rounded-full bg-gold-500" />
                )}
                <item.icon size={18} className="shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{t(`nav.${item.key}`)}</span>}
              </>
            )}
          </NavLink>
        ))}
        {user?.role === 'super_admin' && (
          <>
            <NavLink
              to="/companies"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Building2 size={18} className="shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{t('nav.companies')}</span>}
            </NavLink>
            <NavLink
              to="/users"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <UserCog size={18} className="shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{t('nav.users')}</span>}
            </NavLink>
          </>
        )}
        {isCompanyAdmin && (
          <NavLink
            to="/audit-log"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <ShieldCheck size={18} className="shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{t('nav.auditLog')}</span>}
          </NavLink>
        )}
      </nav>

      <button
        onClick={toggleSidebar}
        className="flex items-center gap-2 px-5 py-4 text-xs text-slate-400 hover:text-white border-t border-white/10 transition-colors"
      >
        <motion.span animate={{ rotate: sidebarCollapsed ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronsLeft size={16} />
        </motion.span>
        {!sidebarCollapsed && 'Collapse'}
      </button>
      {!sidebarCollapsed && (
        <p className="px-5 pb-3 text-[10px] text-slate-500 text-center">
          Powered by <a href="https://teknulugy.com" target="_blank" rel="noreferrer" className="text-gold-500/80 hover:text-gold-400">Teknulugy</a>
        </p>
      )}
    </motion.aside>
  );
}
