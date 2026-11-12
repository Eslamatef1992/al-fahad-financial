import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, BookText, Receipt, ScrollText, Users, Truck, UsersRound,
  Landmark, Wallet, PieChart, Building2, UserCog, ShieldCheck, FileText, FileMinus,
  RefreshCw, Boxes, ClipboardList, ArrowRightLeft, Percent, Ruler, Settings2, CalendarClock,
  ShoppingCart, UserCheck, AlertTriangle, Factory, CreditCard, ChevronDown, LayoutGrid,
  Sun, Moon, LogOut, KeyRound, X,
} from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import usePermissions from '@/hooks/usePermissions';
import CompanySwitcher from './CompanySwitcher';
import LanguageSwitcher from './LanguageSwitcher';
import ChangePasswordModal from './ChangePasswordModal';

// Navigation is grouped like a typical SaaS top bar: a couple of always-visible
// links (Dashboard, POS) plus dropdown groups. The "app launcher" grid button
// opens the same groups as a full-width panel of icon tiles.
function buildGroups({ isSuperAdmin, isCompanyAdmin }) {
  const groups = [
    {
      key: 'sales', label: 'groupSales',
      items: [
        { to: '/invoices/sales', icon: FileText, key: 'salesInvoices' },
        { to: '/recurring-invoices', icon: RefreshCw, key: 'recurringInvoices' },
        { to: '/clients', icon: Users, key: 'clients' },
        { to: '/bookings', icon: CalendarClock, key: 'bookings' },
        { to: '/delivery-schedule', icon: Truck, key: 'deliverySchedule' },
        { to: '/discount-codes', icon: Percent, key: 'discountCodes' },
      ],
    },
    {
      key: 'inventory', label: 'groupInventory',
      items: [
        { to: '/items', icon: Boxes, key: 'items' },
        { to: '/units', icon: Ruler, key: 'units' },
        { to: '/stock-transfers', icon: ArrowRightLeft, key: 'stockTransfers' },
        { to: '/purchase-orders', icon: ClipboardList, key: 'purchaseOrders' },
        { to: '/invoices/purchase', icon: FileMinus, key: 'purchaseInvoices' },
        { to: '/suppliers', icon: Truck, key: 'suppliers' },
        { to: '/manufacturers', icon: Factory, key: 'manufacturers' },
        ...(isCompanyAdmin ? [{ to: '/damages', icon: AlertTriangle, key: 'damages' }] : []),
      ],
    },
    {
      key: 'accounting', label: 'groupAccounting',
      items: [
        { to: '/chart-of-accounts', icon: BookText, key: 'chartOfAccounts' },
        { to: '/vouchers', icon: Receipt, key: 'vouchers' },
        { to: '/ledger', icon: ScrollText, key: 'ledger' },
        { to: '/cash-control', icon: Wallet, key: 'cashControl' },
        { to: '/cost-centers', icon: Landmark, key: 'costCenters' },
        { to: '/reports', icon: PieChart, key: 'reports' },
      ],
    },
    {
      key: 'more', label: 'groupMore',
      items: [
        { to: '/employees', icon: UsersRound, key: 'employees' },
        { to: '/vehicles', icon: Truck, key: 'vehicles' },
        { to: '/branches', icon: Building2, key: 'branches' },
        ...(isCompanyAdmin ? [
          { to: '/financial-settings', icon: Settings2, key: 'financialSettings' },
          { to: '/pos-cashiers', icon: UserCheck, key: 'posCashiers' },
          { to: '/audit-log', icon: ShieldCheck, key: 'auditLog' },
        ] : []),
        ...(isSuperAdmin ? [
          { to: '/companies', icon: Building2, key: 'companies' },
          { to: '/users', icon: UserCog, key: 'users' },
          { to: '/payment-methods', icon: CreditCard, key: 'paymentMethods' },
        ] : []),
      ],
    },
  ];
  return groups;
}

const isUnder = (pathname, to) => pathname === to || pathname.startsWith(`${to}/`);

export default function TopNav() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useUiStore();
  const { user, logout } = useAuthStore();
  const { canDelete: isCompanyAdmin } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(null); // 'launcher' | group key | 'user' | null
  const [pwOpen, setPwOpen] = useState(false);
  const rootRef = useRef(null);

  const groups = useMemo(
    () => buildGroups({ isSuperAdmin: user?.role === 'super_admin', isCompanyAdmin }),
    [user?.role, isCompanyAdmin],
  );

  // Close any open menu on navigation or when clicking outside the header.
  useEffect(() => { setOpen(null); }, [location.pathname]);
  useEffect(() => {
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(null); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const toggle = (k) => setOpen((cur) => (cur === k ? null : k));
  const linkCls = ({ isActive }) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      isActive ? 'text-navy-900 dark:text-white bg-slate-100 dark:bg-navy-800' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800'
    }`;
  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <header ref={rootRef} className="sticky top-0 z-30 border-b border-slate-100 dark:border-navy-800 bg-white dark:bg-navy-950">
      <div className="flex items-center justify-between gap-3 px-4 h-14">
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={() => toggle('launcher')}
            className={`p-2 rounded-lg transition-colors ${open === 'launcher' ? 'bg-slate-100 dark:bg-navy-800' : 'hover:bg-slate-50 dark:hover:bg-navy-800'}`}
            title={t('nav.allApps')}
          >
            {open === 'launcher' ? <X size={20} /> : <LayoutGrid size={20} />}
          </button>
          <NavLink to="/" className="flex items-center gap-2 px-2 shrink-0">
            <img src="/Logo.jpeg" alt={t('app.name')} className="w-8 h-8 rounded-lg object-cover" />
          </NavLink>

          <nav className="hidden lg:flex items-center gap-0.5 ms-1">
            <NavLink to="/" end className={linkCls}>{t('nav.dashboard')}</NavLink>
            <NavLink to="/pos" className={linkCls}>{t('nav.pos')}</NavLink>
            {groups.map((g) => {
              const active = g.items.some((i) => isUnder(location.pathname, i.to));
              return (
                <div key={g.key} className="relative">
                  <button
                    onClick={() => toggle(g.key)}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      open === g.key || active
                        ? 'text-navy-900 dark:text-white bg-slate-100 dark:bg-navy-800'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800'
                    }`}
                  >
                    {t(`nav.${g.label}`)}
                    <ChevronDown size={14} className={`transition-transform ${open === g.key ? 'rotate-180' : ''}`} />
                  </button>
                  {open === g.key && (
                    <div className="absolute start-0 top-full mt-2 w-60 rounded-2xl border border-slate-100 dark:border-navy-800 bg-white dark:bg-navy-900 shadow-card-hover p-2 max-h-[70vh] overflow-auto">
                      {g.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          className={({ isActive }) =>
                            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                              isActive ? 'bg-slate-100 dark:bg-navy-800 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-navy-800'
                            }`
                          }
                        >
                          <item.icon size={16} className="text-slate-400 shrink-0" />
                          <span className="truncate">{t(`nav.${item.key}`)}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <CompanySwitcher />
          <LanguageSwitcher />
          <button onClick={toggleTheme} className="btn-ghost !px-2.5" title="Toggle theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <div className="relative">
            <button
              onClick={() => toggle('user')}
              className="w-9 h-9 rounded-full bg-navy-900 text-white dark:bg-white dark:text-navy-900 text-sm font-bold flex items-center justify-center"
              title={user?.name}
            >
              {initial}
            </button>
            {open === 'user' && (
              <div className="absolute end-0 top-full mt-2 w-60 rounded-2xl border border-slate-100 dark:border-navy-800 bg-white dark:bg-navy-900 shadow-card-hover p-2">
                <div className="px-3 py-2.5 border-b border-slate-100 dark:border-navy-800 mb-1">
                  <p className="text-sm font-semibold truncate">{user?.name}</p>
                  <p className="text-[11px] text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</p>
                </div>
                <button
                  onClick={() => { setPwOpen(true); setOpen(null); }}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-start hover:bg-slate-50 dark:hover:bg-navy-800"
                >
                  <KeyRound size={16} className="text-slate-400" />Change password
                </button>
                <button
                  onClick={() => { logout(); navigate('/login'); }}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-start text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <LogOut size={16} />{t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* App launcher: every page as an icon tile, grouped */}
      {open === 'launcher' && (
        <div className="absolute inset-x-0 top-full border-b border-slate-100 dark:border-navy-800 bg-white dark:bg-navy-950 shadow-card-hover max-h-[75vh] overflow-auto">
          <div className="max-w-6xl mx-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <NavLink to="/" end className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-navy-900 px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-navy-800">
                <LayoutDashboard size={16} />{t('nav.dashboard')}
              </NavLink>
              <NavLink to="/pos" className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-navy-900 px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-navy-800">
                <ShoppingCart size={16} />{t('nav.pos')}
              </NavLink>
            </div>
            {groups.map((g) => (
              <div key={g.key}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">{t(`nav.${g.label}`)}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {g.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className="flex items-center gap-2.5 rounded-xl border border-slate-100 dark:border-navy-800 px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-navy-900 hover:shadow-sm transition-all"
                    >
                      <item.icon size={16} className="text-slate-400 shrink-0" />
                      <span className="truncate">{t(`nav.${item.key}`)}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </header>
  );
}
