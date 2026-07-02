import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import api, { downloadFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

export default function BalanceSheetPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/reports/balance-sheet', { params: { as_of: asOf } }).then((r) => setData(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const Row = ({ label, amount, bold }) => (
    <div className={`flex items-center justify-between py-2 ${bold ? 'font-bold border-t border-slate-100 dark:border-navy-800 mt-2 pt-3' : ''}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm">{Number(amount).toFixed(3)}</span>
    </div>
  );

  return (
    <div>
      <PageHeader title={t('nav.balanceSheet')} />

      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div><label className="label">As of</label><input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
        <button onClick={load} className="btn-primary">Generate</button>
        <button onClick={() => downloadFile('/reports/balance-sheet/pdf', { as_of: asOf }, 'balance-sheet.pdf')} className="btn-ghost">
          <Download size={16} /> PDF
        </button>
        {data && (
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${data.is_balanced ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            {data.is_balanced ? 'Balanced' : 'Out of Balance — review entries'}
          </span>
        )}
      </div>

      {loading && <p className="text-slate-400">{t('common.loading')}</p>}

      {data && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-2 gap-5">
          <div className="card p-5">
            <h3 className="font-bold text-blue-600 mb-3">Assets</h3>
            {data.assets.map((r) => <Row key={r.account_id} label={r.name_en} amount={r.amount} />)}
            <Row label="Total Assets" amount={data.total_assets} bold />
          </div>
          <div className="space-y-5">
            <div className="card p-5">
              <h3 className="font-bold text-orange-600 mb-3">Liabilities</h3>
              {data.liabilities.map((r) => <Row key={r.account_id} label={r.name_en} amount={r.amount} />)}
              <Row label="Total Liabilities" amount={data.total_liabilities} bold />
            </div>
            <div className="card p-5">
              <h3 className="font-bold text-purple-600 mb-3">Equity</h3>
              {data.equity.map((r) => <Row key={r.account_id} label={r.name_en} amount={r.amount} />)}
              <Row label="Retained Earnings" amount={data.retained_earnings} />
              <Row label="Total Equity" amount={data.total_equity} bold />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
