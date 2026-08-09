import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Download, Printer, TrendingUp, TrendingDown, Wallet, Percent } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import api, { downloadFile, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import ReportKpiCard from '@/components/ReportKpiCard';

function monthStart() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// Same-length period immediately preceding [from, to], for period-over-period comparison.
function previousRange(from, to) {
  const fromD = new Date(from), toD = new Date(to);
  const days = Math.round((toD - fromD) / 86400000) + 1;
  const prevTo = new Date(fromD); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

function variancePct(current, prior) {
  if (!prior) return current === 0 ? 0 : 100;
  return ((current - prior) / Math.abs(prior)) * 100;
}

// Merges current-period and prior-period per-account rows into one list,
// keeping accounts that appear in either period (a new revenue line this
// period, or one that dropped off entirely, should still be visible).
function mergeRows(current, prior) {
  const map = new Map();
  current.forEach((r) => map.set(r.account_id, { ...r, prior: 0 }));
  (prior || []).forEach((r) => {
    if (map.has(r.account_id)) map.get(r.account_id).prior = r.amount;
    else map.set(r.account_id, { ...r, amount: 0, prior: r.amount });
  });
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

export default function ProfitAndLossPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const currency = activeCompany?.base_currency || 'KWD';
  const [range, setRange] = useState({ from: monthStart(), to: new Date().toISOString().slice(0, 10), branch_id: '' });
  const [compare, setCompare] = useState(true);
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState([]);

  useEffect(() => { if (activeCompany) api.get('/branches').then((r) => setBranches(r.data)); }, [activeCompany]);

  const fmt = (n) => `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

  const load = () => {
    setLoading(true);
    const prev = previousRange(range.from, range.to);
    Promise.all([
      api.get('/reports/profit-and-loss', { params: range }),
      compare ? api.get('/reports/profit-and-loss', { params: { ...prev, branch_id: range.branch_id } }) : Promise.resolve(null),
    ]).then(([cur, prv]) => {
      setData(cur.data);
      setPrevData(prv?.data || null);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const revenueRows = data ? mergeRows(data.revenue, prevData?.revenue) : [];
  const expenseRows = data ? mergeRows(data.expense, prevData?.expense) : [];
  const netMargin = data && data.total_revenue ? (data.net_profit / data.total_revenue) * 100 : 0;
  const prevNetMargin = prevData && prevData.total_revenue ? (prevData.net_profit / prevData.total_revenue) * 100 : null;

  const chartData = data ? [
    { name: t('reports.revenue'), current: data.total_revenue, prior: prevData?.total_revenue ?? 0 },
    { name: t('reports.expenses'), current: data.total_expense, prior: prevData?.total_expense ?? 0 },
    { name: t('reports.netProfit'), current: data.net_profit, prior: prevData?.net_profit ?? 0 },
  ] : [];

  const Row = ({ r, totalForPct }) => (
    <tr className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
      <td className="px-4 py-2.5 text-sm">{r.name_en}</td>
      <td className="px-4 py-2.5 text-sm text-end font-medium">{fmt(r.amount)}</td>
      <td className="px-4 py-2.5 text-sm text-end text-slate-400">{totalForPct ? `${((r.amount / totalForPct) * 100).toFixed(1)}%` : '—'}</td>
      {compare && <td className="px-4 py-2.5 text-sm text-end text-slate-400">{fmt(r.prior)}</td>}
      {compare && (
        <td className="px-4 py-2.5 text-sm text-end">
          <span className={variancePct(r.amount, r.prior) >= 0 ? 'text-emerald-600' : 'text-red-500'}>
            {variancePct(r.amount, r.prior) >= 0 ? '+' : ''}{variancePct(r.amount, r.prior).toFixed(1)}%
          </span>
        </td>
      )}
    </tr>
  );

  return (
    <div>
      <PageHeader title={t('nav.profitAndLoss')} subtitle={t('reports.profitAndLossSubtitle')} />

      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div><label className="label">{t('common.from')}</label><input type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
        <div><label className="label">{t('common.to')}</label><input type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
        <div className="min-w-[180px]">
          <label className="label">{t('common.branch')}</label>
          <select className="input" value={range.branch_id} onChange={(e) => setRange({ ...range, branch_id: e.target.value })}>
            <option value="">{t('common.allBranches')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-500 pb-2.5 cursor-pointer">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="rounded" />
          {t('reports.compareToPriorPeriod')}
        </label>
        <button onClick={load} className="btn-primary">{t('reports.generate')}</button>
        <button onClick={() => printFile('/reports/profit-and-loss/pdf', range)} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
        <button onClick={() => downloadFile('/reports/profit-and-loss/pdf', range, 'profit-and-loss.pdf')} className="btn-ghost"><Download size={16} /> PDF</button>
      </div>

      {loading && <p className="text-slate-400">{t('common.loading')}</p>}

      {data && !loading && (
        <>
          {compare && prevData && (
            <p className="text-xs text-slate-400 mb-3">{t('reports.comparingTo', { from: previousRange(range.from, range.to).from, to: previousRange(range.from, range.to).to })}</p>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <ReportKpiCard icon={TrendingUp} tone="emerald" label={t('reports.totalRevenue')} value={`${fmt(data.total_revenue)} ${currency}`} variance={compare && prevData ? variancePct(data.total_revenue, prevData.total_revenue) : null} />
            <ReportKpiCard icon={TrendingDown} tone="red" label={t('reports.totalExpenses')} value={`${fmt(data.total_expense)} ${currency}`} variance={compare && prevData ? variancePct(data.total_expense, prevData.total_expense) : null} invertVariance />
            <ReportKpiCard icon={Wallet} tone={data.net_profit >= 0 ? 'navy' : 'red'} label={t('reports.netProfit')} value={`${fmt(data.net_profit)} ${currency}`} variance={compare && prevData ? variancePct(data.net_profit, prevData.net_profit) : null} delay={0.05} />
            <ReportKpiCard icon={Percent} tone="gold" label={t('reports.netMargin')} value={`${netMargin.toFixed(1)}%`} variance={compare && prevNetMargin !== null ? netMargin - prevNetMargin : null} delay={0.1} />
          </div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 mb-5">
            <h3 className="font-bold mb-4">{t('reports.revenueVsExpense')}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(3)} ${currency}`} />
                <Legend />
                <Bar dataKey="current" name={t('reports.currentPeriod')} fill="#1b2a4b" radius={[6, 6, 0, 0]} />
                {compare && <Bar dataKey="prior" name={t('reports.priorPeriod')} fill="#c9a227" radius={[6, 6, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-5">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-navy-800 flex items-center justify-between">
                <h3 className="font-bold text-emerald-600">{t('reports.revenue')}</h3>
                <span className="text-sm font-bold">{fmt(data.total_revenue)} {currency}</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-navy-800">
                    <th className="px-4 py-2 text-start text-xs font-semibold text-slate-400 uppercase">{t('common.description')}</th>
                    <th className="px-4 py-2 text-end text-xs font-semibold text-slate-400 uppercase">{t('common.total')}</th>
                    <th className="px-4 py-2 text-end text-xs font-semibold text-slate-400 uppercase">%</th>
                    {compare && <th className="px-4 py-2 text-end text-xs font-semibold text-slate-400 uppercase">{t('reports.prior')}</th>}
                    {compare && <th className="px-4 py-2 text-end text-xs font-semibold text-slate-400 uppercase">{t('reports.change')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {revenueRows.length === 0 && <tr><td colSpan={compare ? 5 : 3} className="px-4 py-6 text-center text-slate-400 text-sm">{t('common.noData')}</td></tr>}
                  {revenueRows.map((r) => <Row key={r.account_id} r={r} totalForPct={data.total_revenue} />)}
                </tbody>
              </table>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-navy-800 flex items-center justify-between">
                <h3 className="font-bold text-red-500">{t('reports.expenses')}</h3>
                <span className="text-sm font-bold">{fmt(data.total_expense)} {currency}</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-navy-800">
                    <th className="px-4 py-2 text-start text-xs font-semibold text-slate-400 uppercase">{t('common.description')}</th>
                    <th className="px-4 py-2 text-end text-xs font-semibold text-slate-400 uppercase">{t('common.total')}</th>
                    <th className="px-4 py-2 text-end text-xs font-semibold text-slate-400 uppercase">%</th>
                    {compare && <th className="px-4 py-2 text-end text-xs font-semibold text-slate-400 uppercase">{t('reports.prior')}</th>}
                    {compare && <th className="px-4 py-2 text-end text-xs font-semibold text-slate-400 uppercase">{t('reports.change')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.length === 0 && <tr><td colSpan={compare ? 5 : 3} className="px-4 py-6 text-center text-slate-400 text-sm">{t('common.noData')}</td></tr>}
                  {expenseRows.map((r) => <Row key={r.account_id} r={r} totalForPct={data.total_expense} />)}
                </tbody>
              </table>
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-6 mt-5 flex items-center justify-between">
            <span className="font-bold text-lg">{t('reports.netProfit')}</span>
            <span className={`font-extrabold text-2xl ${data.net_profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(data.net_profit)} {currency}</span>
          </motion.div>
        </>
      )}
    </div>
  );
}
