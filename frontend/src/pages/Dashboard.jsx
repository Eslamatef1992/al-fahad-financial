import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, TrendingUp, TrendingDown, Users, Truck, Receipt, FileText, ShoppingCart, Briefcase, Layers, ShieldCheck } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import { useAuthStore } from '@/store/authStore';
import StatCard from '@/components/StatCard';

function monthRange(monthsBack) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const user = useAuthStore((s) => s.user);
  const [pnl, setPnl] = useState(null);
  const [counts, setCounts] = useState({
    clients: 0, suppliers: 0, vehicles: 0, vouchers: 0,
    salesInvoices: 0, purchaseInvoices: 0, employees: 0, costCenters: 0, admins: 0,
  });
  const [trend, setTrend] = useState([]);

  useEffect(() => {
    if (!activeCompany) return;
    const from = monthRange(6);
    const to = new Date().toISOString().slice(0, 10);

    api.get('/reports/profit-and-loss', { params: { from, to } }).then((r) => setPnl(r.data)).catch(() => {});

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

      const byMonth = {};
      vo.data.forEach((x) => {
        const m = x.date?.slice(0, 7);
        if (!m) return;
        byMonth[m] = byMonth[m] || { month: m, debit: 0, credit: 0 };
        byMonth[m].debit += Number(x.total_debit);
        byMonth[m].credit += Number(x.total_credit);
      });
      setTrend(Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)));
    }).catch(() => {});

    // Separate call/failure boundary — /users is super-admin only, so a company admin
    // viewing their own dashboard would 403 here; that must not blank out the other cards.
    api.get('/users').then((r) => {
      const adminCount = r.data.filter((u) => u.companies?.some((co) => co.id === activeCompany.id && co.UserCompany?.role === 'admin')).length;
      setCounts((prev) => ({ ...prev, admins: adminCount }));
    }).catch(() => {});
  }, [activeCompany]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">{t('dashboard.welcome', { name: user?.name || '' })}</h1>
        {activeCompany && <p className="text-sm text-slate-500 mt-0.5">{activeCompany.name_en}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label={t('nav.profitAndLoss')} value={typeof pnl?.net_profit === 'number' ? pnl.net_profit.toFixed(3) : '—'} icon={pnl?.net_profit >= 0 ? TrendingUp : TrendingDown} tone={pnl?.net_profit >= 0 ? 'green' : 'red'} delay={0} />
        <StatCard label={t('nav.clients')} value={counts.clients} icon={Users} tone="navy" delay={0.05} />
        <StatCard label={t('nav.vehicles')} value={counts.vehicles} icon={Truck} tone="gold" delay={0.1} />
        <StatCard label={t('nav.vouchers')} value={counts.vouchers} icon={Receipt} tone="blue" delay={0.15} />
        <StatCard label={t('nav.salesInvoices')} value={counts.salesInvoices} icon={FileText} tone="green" delay={0.2} />
        <StatCard label={t('nav.purchaseInvoices')} value={counts.purchaseInvoices} icon={ShoppingCart} tone="pink" delay={0.25} />
        <StatCard label={t('nav.employees')} value={counts.employees} icon={Briefcase} tone="navy" delay={0.3} />
        <StatCard label={t('nav.costCenters')} value={counts.costCenters} icon={Layers} tone="gold" delay={0.35} />
        <StatCard label={t('dashboard.admins')} value={counts.admins} icon={ShieldCheck} tone="blue" delay={0.4} />
      </div>

      <div className="card-lg p-6">
        <h3 className="font-bold text-navy-900 dark:text-white mb-4 flex items-center gap-2">
          <Wallet size={18} className="text-gold-500" /> Voucher Activity (last 6 months)
        </h3>
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="debitColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="creditColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="debit" stroke="#6366f1" fill="url(#debitColor)" strokeWidth={2} />
              <Area type="monotone" dataKey="credit" stroke="#f59e0b" fill="url(#creditColor)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-slate-400 py-16">{t('common.noData')}</p>
        )}
      </div>
    </div>
  );
}
