import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import api, { downloadFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

export default function TrialBalancePage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/ledger/trial-balance', { params: { as_of: asOf } }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);

  return (
    <div>
      <PageHeader title="Trial Balance" subtitle="Net debit/credit balance per account as of a date" />

      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div><label className="label">As of</label><input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
        <button onClick={load} className="btn-primary">Generate</button>
        <button onClick={() => downloadFile('/ledger/trial-balance/pdf', { as_of: asOf }, 'trial-balance.pdf')} className="btn-ghost"><Download size={16} /> PDF</button>
        <button onClick={() => downloadFile('/ledger/trial-balance/excel', { as_of: asOf }, 'trial-balance.xlsx')} className="btn-ghost"><Download size={16} /> Excel</button>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-navy-800">
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">Code</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">Account</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">Debit</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">Credit</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">{t('common.loading')}</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">{t('common.noData')}</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.account?.id} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.account?.code}</td>
                <td className="px-4 py-3">{r.account?.name_en}</td>
                <td className="px-4 py-3 text-end">{Number(r.debit).toFixed(3)}</td>
                <td className="px-4 py-3 text-end">{Number(r.credit).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-navy-700 font-bold">
                <td className="px-4 py-3" colSpan={2}>{t('common.total')}</td>
                <td className="px-4 py-3 text-end">{totalDebit.toFixed(3)}</td>
                <td className="px-4 py-3 text-end">{totalCredit.toFixed(3)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </motion.div>
    </div>
  );
}
