import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, ArrowDownToLine, ArrowUpFromLine, CreditCard, Ticket, RefreshCw, BookOpenCheck,
  ListTree, BarChart3, Settings, CalendarDays, Building2, Factory,
} from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';

const iso = (d) => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };

// Accounting module sub-navigation (mirrors the OSOSS "Accounting" menu).
// `filters:false` pages are embedded standalone pages that bring their own filters.
export const ACC_MENU = [
  { to: '', end: true, icon: LayoutDashboard, en: 'Dashboard', ar: 'لوحة التحكم', filters: true },
  { to: 'income', icon: ArrowDownToLine, en: 'Income Transactions', ar: 'معاملات الإيرادات', filters: true },
  { to: 'expense', icon: ArrowUpFromLine, en: 'Expense Transactions', ar: 'معاملات المصروفات', filters: true },
  { to: 'online', icon: CreditCard, en: 'Online PG Transactions', ar: 'معاملات الدفع الإلكتروني', filters: true },
  { to: 'vouchers', icon: Ticket, en: 'Vouchers', ar: 'السندات' },
  { to: 'recurring', icon: RefreshCw, en: 'Recurring Vouchers', ar: 'السندات المتكررة' },
  { to: 'journal', icon: BookOpenCheck, en: 'Journal Entries', ar: 'قيود اليومية', filters: true },
  { to: 'manufacture', icon: Factory, en: 'Manufactured Orders', ar: 'طلبات التصنيع', filters: true },
  { to: 'chart', icon: ListTree, en: 'Chart of Account', ar: 'دليل الحسابات' },
  { to: 'reports', icon: BarChart3, en: 'Reports', ar: 'التقارير' },
  { to: 'settings', icon: Settings, en: 'Settings', ar: 'الإعدادات' },
];

export default function AccountingModule() {
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
  useEffect(() => {
    if (activeCompany) api.get('/branches').then((r) => setBranches(r.data)).catch(() => setBranches([]));
  }, [activeCompany]);

  const current = ACC_MENU.find((m) => m.to && location.pathname.endsWith(`/${m.to}`)) || ACC_MENU[0];
  const ctx = { isAr, L, currency, from, to, branchId, branches };

  return (
    <div className="-mx-4 -my-4 sm:-mx-6 sm:-my-6 flex flex-col lg:flex-row min-h-[calc(100vh-3.5rem)]">
      <aside className="lg:w-64 shrink-0 bg-sky-50/70 dark:bg-navy-900 border-e border-slate-100 dark:border-navy-800 p-4">
        <p className="px-2 pb-4 text-lg font-bold text-navy-900 dark:text-white">{L('Accounting', 'المحاسبة')}</p>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {ACC_MENU.map((m) => (
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
        </nav>
      </aside>

      <section className="flex-1 min-w-0 p-4 sm:p-6">
        {current.filters && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h1 className="text-2xl font-bold text-navy-900 dark:text-white">{isAr ? current.ar : current.en}</h1>
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
        )}
        <Outlet context={ctx} />
      </section>
    </div>
  );
}
