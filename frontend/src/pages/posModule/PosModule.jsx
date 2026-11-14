import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, ReceiptText, Clock, XCircle, GitMerge, Undo2, Repeat, Building2, PackageX,
  ArrowLeftRight, Timer, Users, BarChart3, Settings, CalendarDays, MonitorSmartphone,
} from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';

const iso = (d) => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };

// Sub-navigation of the POS back-office module (mirrors the OSOSS "Sales > POS" side menu).
export const POS_MENU = [
  { to: '', end: true, icon: LayoutDashboard, en: 'Dashboard', ar: 'لوحة التحكم' },
  { to: 'orders', icon: ReceiptText, en: 'Orders', ar: 'الطلبات' },
  { to: 'pending', icon: Clock, en: 'Pending orders', ar: 'الطلبات المعلقة' },
  { to: 'canceled', icon: XCircle, en: 'Canceled orders', ar: 'الطلبات الملغاة' },
  { to: 'consolidated', icon: GitMerge, en: 'Consolidated Invoices', ar: 'الفواتير المجمعة' },
  { to: 'refunded', icon: Undo2, en: 'Refunded orders', ar: 'الطلبات المستردة' },
  { to: 'exchange', icon: Repeat, en: 'Exchange orders', ar: 'طلبات الاستبدال' },
  { to: 'branches', icon: Building2, en: 'Branches', ar: 'الفروع' },
  { to: 'backorder', icon: PackageX, en: 'Backorder items', ar: 'أصناف الطلب المسبق' },
  { to: 'transactions', icon: ArrowLeftRight, en: 'Transactions', ar: 'المعاملات' },
  { to: 'sessions', icon: Timer, en: 'Sessions', ar: 'الجلسات' },
  { to: 'users', icon: Users, en: 'Users', ar: 'المستخدمون' },
  { to: 'reports', icon: BarChart3, en: 'Reports', ar: 'التقارير' },
  { to: 'settings', icon: Settings, en: 'Settings', ar: 'الإعدادات' },
];

export default function PosModule() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const location = useLocation();
  const currency = activeCompany?.currency || 'KWD';

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(iso(new Date()));
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!activeCompany) return;
    setLoading(true);
    api.get('/pos/sales/history', { params: { status: 'all', date_from: from, date_to: to } })
      .then((r) => setSales(r.data)).catch(() => setSales([])).finally(() => setLoading(false));
  }, [activeCompany, from, to]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!activeCompany) return;
    api.get('/branches').then((r) => setBranches(r.data)).catch(() => setBranches([]));
    api.get('/pos/cashiers').then((r) => setCashiers(r.data)).catch(() => setCashiers([]));
  }, [activeCompany]);

  const scoped = useMemo(() => (branchId ? sales.filter((s) => s.branch_id === branchId) : sales), [sales, branchId]);
  const completed = useMemo(() => scoped.filter((s) => s.status !== 'cancelled'), [scoped]);
  const refunded = useMemo(() => scoped.filter((s) => s.status === 'cancelled' && s.refunded_at), [scoped]);
  const canceled = useMemo(() => scoped.filter((s) => s.status === 'cancelled' && !s.refunded_at), [scoped]);
  const cashierName = useCallback((id) => cashiers.find((c) => c.user_id === id)?.name || '—', [cashiers]);
  const branchName = useCallback((id) => {
    const b = branches.find((x) => x.id === id);
    return b ? (isAr ? b.name_ar : b.name_en) : '—';
  }, [branches, isAr]);

  const current = POS_MENU.find((m) => m.to && location.pathname.endsWith(`/${m.to}`)) || POS_MENU[0];
  const ctx = {
    isAr, L, currency, from, to, branches, branchId, loading, reload: load,
    scoped, completed, refunded, canceled, cashierName, branchName, cashiers,
  };

  return (
    <div className="-mx-4 -my-4 sm:-mx-6 sm:-my-6 flex flex-col lg:flex-row min-h-[calc(100vh-3.5rem)]">
      {/* Sub-navigation */}
      <aside className="lg:w-64 shrink-0 bg-sky-50/70 dark:bg-navy-900 border-e border-slate-100 dark:border-navy-800 p-4">
        <p className="flex items-center gap-2 px-2 pb-4 text-lg font-bold text-navy-900 dark:text-white">
          <span className="text-indigo-600">{L('Sales', 'المبيعات')}</span><span className="text-slate-300">›</span>POS
        </p>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {POS_MENU.map((m) => (
            <NavLink
              key={m.to || 'dash'} to={m.to} end={m.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
                  isActive ? 'bg-white dark:bg-navy-800 text-indigo-600 font-semibold shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-navy-800'
                }`
              }
            >
              <m.icon size={17} className="shrink-0" />{isAr ? m.ar : m.en}
            </NavLink>
          ))}
          <NavLink to="/pos" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-navy-900 text-white px-3 py-2.5 text-sm font-semibold hover:bg-navy-800">
            <MonitorSmartphone size={16} />{L('Open POS screen', 'فتح شاشة نقطة البيع')}
          </NavLink>
        </nav>
      </aside>

      {/* Content */}
      <section className="flex-1 min-w-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white">
            {current.to ? (isAr ? current.ar : current.en) : L('POS Dashboard', 'لوحة تحكم نقطة البيع')}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="card flex items-center gap-2 ps-3 pe-1">
              <Building2 size={16} className="text-slate-400" />
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="bg-transparent text-sm font-medium py-2.5 pe-3 outline-none min-w-[120px]">
                <option value="">{L('All branches', 'كل الفروع')}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{isAr ? b.name_ar : b.name_en}</option>)}
              </select>
            </div>
            <div className="card flex items-center gap-2 px-3">
              <CalendarDays size={16} className="text-slate-400" />
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="bg-transparent text-sm py-2.5 outline-none" />
              <span className="text-slate-400">–</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="bg-transparent text-sm py-2.5 outline-none" />
            </div>
          </div>
        </div>
        <Outlet context={ctx} />
      </section>
    </div>
  );
}
