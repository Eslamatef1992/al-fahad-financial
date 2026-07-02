import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import api, { downloadFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

function monthStart() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function ProfitAndLossPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [range, setRange] = useState({ from: monthStart(), to: new Date().toISOString().slice(0, 10) });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/reports/profit-and-loss', { params: range }).then((r) => setData(r.data)).finally(() => setLoading(false));
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
      <PageHeader title={t('nav.profitAndLoss')} />

      <div className="card p-4 mb-5 flex flex-wrap items-end gap-3">
        <div><label className="label">{t('common.from')}</label><input type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
        <div><label className="label">{t('common.to')}</label><input type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
        <button onClick={load} className="btn-primary">Generate</button>
        <button onClick={() => downloadFile('/reports/profit-and-loss/pdf', range, 'profit-and-loss.pdf')} className="btn-ghost">
          <Download size={16} /> PDF
        </button>
      </div>

      {loading && <p className="text-slate-400">{t('common.loading')}</p>}

      {data && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-2 gap-5">
          <div className="card p-5">
            <h3 className="font-bold text-emerald-600 mb-3">Revenue</h3>
            {data.revenue.map((r) => <Row key={r.account_id} label={r.name_en} amount={r.amount} />)}
            <Row label="Total Revenue" amount={data.total_revenue} bold />
          </div>
          <div className="card p-5">
            <h3 className="font-bold text-red-500 mb-3">Expenses</h3>
            {data.expense.map((r) => <Row key={r.account_id} label={r.name_en} amount={r.amount} />)}
            <Row label="Total Expenses" amount={data.total_expense} bold />
          </div>
          <div className="card p-6 md:col-span-2 flex items-center justify-between">
            <span className="font-bold text-lg">Net Profit</span>
            <span className={`font-extrabold text-2xl ${data.net_profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{data.net_profit.toFixed(3)}</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
