import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Download, Printer, ListTree, Scale3D, CheckCircle2, AlertTriangle } from 'lucide-react';
import api, { downloadFile, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import ReportKpiCard from '@/components/ReportKpiCard';

export default function TrialBalancePage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const currency = activeCompany?.base_currency || 'KWD';
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (activeCompany) api.get('/branches').then((r) => setBranches(r.data)); }, [activeCompany]);

  const fmt = (n) => `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

  const load = () => {
    setLoading(true);
    api.get('/ledger/trial-balance', { params: { as_of: asOf, branch_id: branchId } }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div>
      <PageHeader title={t('reports.trialBalance.title')} subtitle={t('reports.trialBalance.desc')} />

      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div><label className="label">{t('reports.asOf')}</label><input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
        <div className="min-w-[180px]">
          <label className="label">{t('common.branch')}</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">{t('common.allBranches')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}
          </select>
        </div>
        <button onClick={load} className="btn-primary">{t('reports.generate')}</button>
        <button onClick={() => printFile('/ledger/trial-balance/pdf', { as_of: asOf, branch_id: branchId })} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
        <button onClick={() => downloadFile('/ledger/trial-balance/pdf', { as_of: asOf, branch_id: branchId }, 'trial-balance.pdf')} className="btn-ghost"><Download size={16} /> PDF</button>
        <button onClick={() => downloadFile('/ledger/trial-balance/excel', { as_of: asOf, branch_id: branchId }, 'trial-balance.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
      </div>

      {loading && <p className="text-slate-400">{t('common.loading')}</p>}

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <ReportKpiCard icon={ListTree} tone="navy" label={t('reports.accountsWithActivity')} value={String(rows.length)} />
          <ReportKpiCard icon={Scale3D} tone="blue" label={t('vouchers.totalDebit')} value={`${fmt(totalDebit)} ${currency}`} delay={0.05} />
          <ReportKpiCard icon={Scale3D} tone="gold" label={t('vouchers.totalCredit')} value={`${fmt(totalCredit)} ${currency}`} delay={0.1} />
          <ReportKpiCard
            icon={isBalanced ? CheckCircle2 : AlertTriangle}
            tone={isBalanced ? 'emerald' : 'red'}
            label={t('common.status')}
            value={isBalanced ? t('reports.balanced') : t('reports.outOfBalance')}
            delay={0.15}
          />
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-navy-800">
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('common.code')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('vouchers.account')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('vouchers.debit')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('vouchers.credit')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">{t('common.noData')}</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.account?.id} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.account?.code}</td>
                <td className="px-4 py-3">{r.account?.name_en}</td>
                <td className="px-4 py-3 text-end">{Number(r.debit) > 0 ? fmt(r.debit) : '—'}</td>
                <td className="px-4 py-3 text-end">{Number(r.credit) > 0 ? fmt(r.credit) : '—'}</td>
              </tr>
            ))}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-navy-700 font-bold">
                <td className="px-4 py-3" colSpan={2}>{t('common.total')}</td>
                <td className="px-4 py-3 text-end">{fmt(totalDebit)}</td>
                <td className="px-4 py-3 text-end">{fmt(totalCredit)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </motion.div>
    </div>
  );
}
