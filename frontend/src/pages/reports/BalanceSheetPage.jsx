import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Download, Printer, Landmark, ScaleIcon, PiggyBank, CheckCircle2, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import api, { downloadFile, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import ReportKpiCard from '@/components/ReportKpiCard';

function oneYearBefore(dateStr) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function variancePct(current, prior) {
  if (!prior) return current === 0 ? 0 : 100;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function mergeRows(current, prior) {
  const map = new Map();
  current.forEach((r) => map.set(r.account_id, { ...r, prior: 0 }));
  (prior || []).forEach((r) => {
    if (map.has(r.account_id)) map.get(r.account_id).prior = r.amount;
    else map.set(r.account_id, { ...r, amount: 0, prior: r.amount });
  });
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

export default function BalanceSheetPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const currency = activeCompany?.base_currency || 'KWD';
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [compare, setCompare] = useState(false);
  const [compareAsOf, setCompareAsOf] = useState(oneYearBefore(new Date().toISOString().slice(0, 10)));
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);

  useEffect(() => { if (activeCompany) api.get('/branches').then((r) => setBranches(r.data)); }, [activeCompany]);

  const fmt = (n) => `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/reports/balance-sheet', { params: { as_of: asOf, branch_id: branchId } }),
      compare ? api.get('/reports/balance-sheet', { params: { as_of: compareAsOf, branch_id: branchId } }) : Promise.resolve(null),
    ]).then(([cur, prv]) => {
      setData(cur.data);
      setPrevData(prv?.data || null);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const assetRows = data ? mergeRows(data.assets, prevData?.assets) : [];
  const liabilityRows = data ? mergeRows(data.liabilities, prevData?.liabilities) : [];
  const equityRows = data ? mergeRows(data.equity, prevData?.equity) : [];

  const chartData = data ? [
    { name: t('reports.assets'), current: data.total_assets, prior: prevData?.total_assets ?? 0 },
    { name: t('reports.liabilities'), current: data.total_liabilities, prior: prevData?.total_liabilities ?? 0 },
    { name: t('reports.equity'), current: data.total_equity, prior: prevData?.total_equity ?? 0 },
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

  const Section = ({ title, tone, rows, total, totalLabel, extra }) => (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-navy-800 flex items-center justify-between">
        <h3 className={`font-bold ${tone}`}>{title}</h3>
        <span className="text-sm font-bold">{fmt(total)} {currency}</span>
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
          {rows.length === 0 && <tr><td colSpan={compare ? 5 : 3} className="px-4 py-6 text-center text-slate-400 text-sm">{t('common.noData')}</td></tr>}
          {rows.map((r) => <Row key={r.account_id} r={r} totalForPct={data?.total_assets} />)}
          {extra}
        </tbody>
      </table>
    </motion.div>
  );

  return (
    <div>
      <PageHeader title={t('nav.balanceSheet')} subtitle={t('reports.balanceSheetSubtitle')} />

      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div><label className="label">{t('reports.asOf')}</label><input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm text-slate-500 pb-2.5 cursor-pointer">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="rounded" />
          {t('reports.compareToDate')}
        </label>
        {compare && (
          <div><label className="label">{t('reports.compareAsOf')}</label><input type="date" className="input" value={compareAsOf} onChange={(e) => setCompareAsOf(e.target.value)} /></div>
        )}
        <div className="min-w-[180px]">
          <label className="label">{t('common.branch')}</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">{t('common.allBranches')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}
          </select>
        </div>
        <button onClick={load} className="btn-primary">{t('reports.generate')}</button>
        <button onClick={() => printFile('/reports/balance-sheet/pdf', { as_of: asOf, branch_id: branchId })} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
        <button onClick={() => downloadFile('/reports/balance-sheet/pdf', { as_of: asOf, branch_id: branchId }, 'balance-sheet.pdf')} className="btn-ghost"><Download size={16} /> PDF</button>
      </div>

      {loading && <p className="text-slate-400">{t('common.loading')}</p>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <ReportKpiCard icon={Landmark} tone="blue" label={t('reports.totalAssets')} value={`${fmt(data.total_assets)} ${currency}`} variance={compare && prevData ? variancePct(data.total_assets, prevData.total_assets) : null} />
            <ReportKpiCard icon={ScaleIcon} tone="orange" label={t('reports.totalLiabilities')} value={`${fmt(data.total_liabilities)} ${currency}`} variance={compare && prevData ? variancePct(data.total_liabilities, prevData.total_liabilities) : null} invertVariance />
            <ReportKpiCard icon={PiggyBank} tone="purple" label={t('reports.totalEquity')} value={`${fmt(data.total_equity)} ${currency}`} variance={compare && prevData ? variancePct(data.total_equity, prevData.total_equity) : null} delay={0.05} />
            <ReportKpiCard
              icon={data.is_balanced ? CheckCircle2 : AlertTriangle}
              tone={data.is_balanced ? 'emerald' : 'red'}
              label={t('common.status')}
              value={data.is_balanced ? t('reports.balanced') : t('reports.outOfBalance')}
              delay={0.1}
            />
          </div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5 mb-5">
            <h3 className="font-bold mb-4">{t('reports.compositionOverview')}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(3)} ${currency}`} />
                <Legend />
                <Bar dataKey="current" name={compare ? asOf : t('reports.currentPeriod')} fill="#1b2a4b" radius={[6, 6, 0, 0]} />
                {compare && <Bar dataKey="prior" name={compareAsOf} fill="#c9a227" radius={[6, 6, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-5">
            <Section title={t('reports.assets')} tone="text-blue-600" rows={assetRows} total={data.total_assets} />
            <div className="space-y-5">
              <Section title={t('reports.liabilities')} tone="text-orange-600" rows={liabilityRows} total={data.total_liabilities} />
              <Section
                title={t('reports.equity')}
                tone="text-purple-600"
                rows={equityRows}
                total={data.total_equity}
                extra={
                  <tr className="border-t border-slate-100 dark:border-navy-800 font-semibold">
                    <td className="px-4 py-2.5 text-sm">{t('reports.retainedEarnings')}</td>
                    <td className="px-4 py-2.5 text-sm text-end">{fmt(data.retained_earnings)}</td>
                    <td colSpan={compare ? 3 : 1}></td>
                  </tr>
                }
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
