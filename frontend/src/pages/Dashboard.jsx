import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, TrendingUp, TrendingDown, Users, Truck, Receipt } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';

function monthRange(monthsBack) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [pnl, setPnl] = useState(null);
  const [counts, setCounts] = useState({ clients: 0, suppliers: 0, vehicles: 0, vouchers: 0 });
  const [trend, setTrend] = useState([]);

  useEffect(() => {
    if (!activeCompany) return;
    const from = monthRange(6);
    const to = new Date().toISOString().slice(0, 10);

    api.get('/reports/profit-and-loss', { params: { from, to } }).then((r) => setPnl(r.data)).catch(() => {});

    Promise.all([
      api.get('/clients'), api.get('/suppliers'), api.get('/vehicles'), api.get('/vouchers'),
    ]).then(([c, s, v, vo]) => {
      setCounts({ clients: c.data.length, suppliers: s.data.length, vehicles: v.data.length, vouchers: vo.data.length });

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
  }, [activeCompany]);

  return (
    <div>
      <PageHeader title={t('nav.dashboard')} subtitle={activeCompany ? (activeCompany.name_en) : ''} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label={t('nav.profitAndLoss')} value={pnl ? pnl.net_profit.toFixed(3) : '—'} icon={pnl?.net_profit >= 0 ? TrendingUp : TrendingDown} tone={pnl?.net_profit >= 0 ? 'green' : 'red'} delay={0} />
        <StatCard label={t('nav.clients')} value={counts.clients} icon={Users} tone="navy" delay={0.05} />
        <StatCard label={t('nav.vehicles')} value={counts.vehicles} icon={Truck} tone="gold" delay={0.1} />
        <StatCard label={t('nav.vouchers')} value={counts.vouchers} icon={Receipt} tone="navy" delay={0.15} />
      </div>

      <div className="card p-5">
        <h3 className="font-bold text-navy-900 dark:text-white mb-4 flex items-center gap-2">
          <Wallet size={18} className="text-gold-500" /> Voucher Activity (last 6 months)
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={trend}>
            <defs>
              <linearGradient id="debitColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2a3c68" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#2a3c68" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="creditColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c9a227" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#c9a227" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Area type="monotone" dataKey="debit" stroke="#2a3c68" fill="url(#debitColor)" strokeWidth={2} />
            <Area type="monotone" dataKey="credit" stroke="#c9a227" fill="url(#creditColor)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
