import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp, TrendingDown, Users, Truck, Receipt, FileText, ShoppingCart, Briefcase, Layers,
  ShieldCheck, LayoutGrid, Building2, CalendarDays, ArrowRightLeft, Check,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import { useAuthStore } from '@/store/authStore';
import StatCard from '@/components/StatCard';

const iso = (d) => d.toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), 1)); };
const today = () => iso(new Date());
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const WIDGETS_KEY = 'dashboard.hiddenWidgets';
const WIDGET_LIST = [
  ['tiles', 'Summary cards'], ['weekly', 'Weekly sales'], ['trend', 'Total sales'],
  ['branches', 'Sales by branch'], ['counts', 'Records overview'],
];

function loadHidden() {
  try { return JSON.parse(localStorage.getItem(WIDGETS_KEY)) || []; } catch { return []; }
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const user = useAuthStore((s) => s.user);
  const currency = activeCompany?.currency || 'KWD';

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [hidden, setHidden] = useState(loadHidden);
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const widgetsRef = useRef(null);

  const [sales, setSales] = useState([]);
  const [pnl, setPnl] = useState(null);
  const [counts, setCounts] = useState({
    clients: 0, suppliers: 0, vehicles: 0, vouchers: 0,
    salesInvoices: 0, purchaseInvoices: 0, employees: 0, costCenters: 0, admins: 0,
  });

  const show = (k) => !hidden.includes(k);
  const toggleWidget = (k) => setHidden((h) => {
    const next = h.includes(k) ? h.filter((x) => x !== k) : [...h, k];
    try { localStorage.setItem(WIDGETS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  useEffect(() => {
    const onDown = (e) => { if (widgetsRef.current && !widgetsRef.current.contains(e.target)) setWidgetsOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Static (not date-filtered) data: branches + record counts.
  useEffect(() => {
    if (!activeCompany) return;
    setBranchId('');
    api.get('/branches').then((r) => setBranches(r.data)).catch(() => setBranches([]));
    Promise.all([
      api.get('/clients'), api.get('/suppliers'), api.get('/vehicles'), api.get('/vouchers'),
      api.get('/invoices', { params: { type: 'sales' } }), api.get('/invoices', { params: { type: 'purchase' } }),
      api.get('/employees'), api.get('/cost-centers'),
    ]).then(([c, s, v, vo, si, pi, emp, cc]) => {
      setCounts((prev) => ({
        ...prev,
        clients: c.data.length, suppliers: s.data.length, vehicles: v.data.length, vouchers: vo.data.length,
        salesInvoices: si.data.length, purchaseInvoices: pi.data.length, employees: emp.data.length, costCenters: cc.data.length,
      }));
    }).catch(() => {});
    // /users is super-admin only; separate boundary so a 403 doesn't blank the other cards.
    api.get('/users').then((r) => {
      const adminCount = r.data.filter((u) => u.companies?.some((co) => co.id === activeCompany.id && co.UserCompany?.role === 'admin')).length;
      setCounts((prev) => ({ ...prev, admins: adminCount }));
    }).catch(() => {});
  }, [activeCompany]);

  // Filtered data: sales invoices + P&L for the chosen range / branch.
  useEffect(() => {
    if (!activeCompany) return;
    const params = { from, to, ...(branchId && { branch_id: branchId }) };
    api.get('/invoices', { params: { ...params, type: 'sales' } }).then((r) => setSales(r.data)).catch(() => setSales([]));
    api.get('/reports/profit-and-loss', { params: { from, to, ...(branchId && { branch_id: branchId }) } })
      .then((r) => setPnl(r.data)).catch(() => setPnl(null));
  }, [activeCompany, from, to, branchId]);

  const valid = useMemo(() => sales.filter((i) => i.status !== 'cancelled'), [sales]);
  const totalSales = useMemo(() => valid.reduce((s, i) => s + Number(i.total || 0), 0), [valid]);
  const totalPaid = useMemo(() => valid.reduce((s, i) => s + Number(i.paid_total || 0), 0), [valid]);
  const customersInRange = useMemo(() => new Set(valid.map((i) => i.client_id).filter(Boolean)).size, [valid]);

  // Weekly buckets (week of month): total invoiced vs collected.
  const weekly = useMemo(() => {
    const map = {};
    valid.forEach((i) => {
      const day = Number(String(i.date).slice(8, 10)) || 1;
      const w = `W${Math.ceil(day / 7)}`;
      map[w] = map[w] || { week: w, total: 0, paid: 0 };
      map[w].total += Number(i.total || 0);
      map[w].paid += Number(i.paid_total || 0);
    });
    return Object.values(map).sort((a, b) => a.week.localeCompare(b.week));
  }, [valid]);

  // Cumulative sales by day.
  const trend = useMemo(() => {
    const byDay = {};
    valid.forEach((i) => { byDay[i.date] = (byDay[i.date] || 0) + Number(i.total || 0); });
    let run = 0;
    return Object.keys(byDay).sort().map((d) => { run += byDay[d]; return { day: d.slice(5), total: Number(run.toFixed(3)) }; });
  }, [valid]);

  const byBranch = useMemo(() => {
    const map = {};
    valid.forEach((i) => {
      const b = i.branch;
      const name = b ? (isAr ? b.name_ar : b.name_en) : (isAr ? 'بدون فرع' : 'No branch');
      map[name] = (map[name] || 0) + Number(i.total || 0);
    });
    return Object.entries(map).map(([name, total]) => ({ name, total: Number(total.toFixed(3)) }));
  }, [valid, isAr]);

  const net = typeof pnl?.net_profit === 'number' ? pnl.net_profit : null;
  const noData = <p className="text-center text-slate-400 py-16">{t('common.noData')}</p>;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-white">{t('dashboard.welcome', { name: user?.name || '' })}</h1>
          {activeCompany && <p className="text-sm text-slate-500 mt-0.5">{activeCompany.name_en}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div ref={widgetsRef} className="relative">
            <button onClick={() => setWidgetsOpen((o) => !o)} className="card flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
              <LayoutGrid size={16} /> Widgets
            </button>
            {widgetsOpen && (
              <div className="absolute end-0 top-full mt-2 w-56 z-20 rounded-2xl border border-slate-100 dark:border-navy-800 bg-white dark:bg-navy-900 shadow-card-hover p-2">
                {WIDGET_LIST.map(([k, label]) => (
                  <button key={k} onClick={() => toggleWidget(k)}
                    className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-navy-800">
                    {label}
                    {show(k) && <Check size={14} className="text-emerald-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card flex items-center gap-2 ps-3 pe-1">
            <Building2 size={16} className="text-slate-400" />
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
              className="bg-transparent text-sm font-medium py-2.5 pe-3 outline-none min-w-[120px]">
              <option value="">{isAr ? 'كل الفروع' : 'All branches'}</option>
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

      {show('tiles') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <StatCard variant="tile" label={isAr ? 'العملاء' : 'Customers'} value={customersInRange} icon={Users} tone="red" delay={0} />
          <StatCard variant="tile" label={isAr ? 'الفواتير' : 'Invoices'} value={valid.length} icon={FileText} tone="blue" delay={0.05} />
          <StatCard variant="tile" label={isAr ? 'إجمالي الفواتير' : 'Total invoices'} value={fmt(totalSales)} unit={currency} icon={ArrowRightLeft} tone="green" delay={0.1} />
          <StatCard variant="tile" label={t('nav.profitAndLoss')} value={net === null ? '—' : fmt(net)} unit={currency}
            icon={net !== null && net < 0 ? TrendingDown : TrendingUp} tone={net !== null && net < 0 ? 'red' : 'purple'} delay={0.15} />
        </div>
      )}

      {show('weekly') && (
        <div className="card-lg p-6 mb-6">
          <h3 className="card-title mb-4">{isAr ? 'المبيعات الأسبوعية' : 'Weekly sales'}</h3>
          {weekly.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={weekly} barGap={6}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend />
                <Bar dataKey="total" name={isAr ? 'الإجمالي' : 'Invoiced'} fill="#6366f1" radius={[8, 8, 0, 0]} maxBarSize={22} />
                <Bar dataKey="paid" name={isAr ? 'المحصّل' : 'Collected'} fill="#f59e0b" radius={[8, 8, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : noData}
        </div>
      )}

      {(show('trend') || show('branches')) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {show('trend') && (
            <div className="card-lg p-6">
              <h3 className="card-title">{isAr ? 'إجمالي المبيعات' : 'Total Sales'}</h3>
              <p className="mt-2 mb-3">
                <span className="text-4xl font-extrabold text-navy-900 dark:text-white">{fmt(totalSales)}</span>
                <span className="text-sm text-slate-500 ms-2">{currency}</span>
              </p>
              <p className="text-xs text-slate-400 mb-2">{isAr ? 'المحصّل' : 'Collected'}: {fmt(totalPaid)} {currency}</p>
              {trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trend}>
                    <defs>
                      <linearGradient id="salesTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => fmt(v)} />
                    <Area type="monotone" dataKey="total" stroke="#6366f1" fill="url(#salesTrend)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : noData}
            </div>
          )}
          {show('branches') && (
            <div className="card-lg p-6">
              <h3 className="card-title mb-4">{isAr ? 'المبيعات حسب الفرع' : 'Sales By Branches'}</h3>
              {byBranch.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={byBranch}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => `${fmt(v)} ${currency}`} />
                    <Bar dataKey="total" fill="#6366f1" radius={[8, 8, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              ) : noData}
            </div>
          )}
        </div>
      )}

      {show('counts') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label={t('nav.clients')} value={counts.clients} icon={Users} tone="navy" delay={0} />
          <StatCard label={t('nav.vehicles')} value={counts.vehicles} icon={Truck} tone="gold" delay={0.05} />
          <StatCard label={t('nav.vouchers')} value={counts.vouchers} icon={Receipt} tone="blue" delay={0.1} />
          <StatCard label={t('nav.salesInvoices')} value={counts.salesInvoices} icon={FileText} tone="green" delay={0.15} />
          <StatCard label={t('nav.purchaseInvoices')} value={counts.purchaseInvoices} icon={ShoppingCart} tone="pink" delay={0.2} />
          <StatCard label={t('nav.employees')} value={counts.employees} icon={Briefcase} tone="navy" delay={0.25} />
          <StatCard label={t('nav.costCenters')} value={counts.costCenters} icon={Layers} tone="gold" delay={0.3} />
          <StatCard label={t('dashboard.admins')} value={counts.admins} icon={ShieldCheck} tone="blue" delay={0.35} />
        </div>
      )}
    </div>
  );
}
