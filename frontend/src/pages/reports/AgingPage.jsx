import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Download, Printer } from 'lucide-react';
import api, { downloadFile, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

const BUCKET_COLOR = { current: 'text-emerald-600', '1-30': 'text-blue-600', '31-60': 'text-amber-600', '61-90': 'text-orange-600', '90+': 'text-red-600' };

export default function AgingPage() {
  const { type } = useParams(); // 'sales' (AR) | 'purchase' (AP)
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const label = type === 'purchase' ? 'Accounts Payable Aging' : 'Accounts Receivable Aging';

  const load = () => {
    setLoading(true);
    api.get('/invoices/aging', { params: { type } }).then((r) => setData(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, type]);

  return (
    <div>
      <PageHeader title={label} subtitle="Outstanding balances bucketed by days overdue" actions={
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-primary">Refresh</button>
          <button onClick={() => printFile('/invoices/aging/pdf', { type })} className="btn-ghost"><Printer size={16} /> Print</button>
          <button onClick={() => downloadFile('/invoices/aging/pdf', { type }, `${type}-aging.pdf`)} className="btn-ghost"><Download size={16} /> PDF</button>
        </div>
      } />

      {loading && <p className="text-slate-400">Loading...</p>}

      {data && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            {Object.entries(data.buckets).map(([bucket, amount]) => (
              <div key={bucket} className="card p-4 text-center">
                <p className="text-xs uppercase font-semibold text-slate-400">{bucket}</p>
                <p className={`text-lg font-bold mt-1 ${BUCKET_COLOR[bucket]}`}>{amount.toFixed(3)}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-800">
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">Invoice</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{type === 'purchase' ? 'Supplier' : 'Client'}</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">Outstanding</th>
                  <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">Days Overdue</th>
                  <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">Bucket</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Nothing outstanding</td></tr>}
                {data.rows.map((r) => (
                  <tr key={r.invoice_no} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                    <td className="px-4 py-3">{r.invoice_no}</td>
                    <td className="px-4 py-3">{r.party || '—'}</td>
                    <td className="px-4 py-3">{r.due_date || '—'}</td>
                    <td className="px-4 py-3 text-end font-medium">{r.outstanding.toFixed(3)}</td>
                    <td className="px-4 py-3 text-end">{r.days_overdue}</td>
                    <td className="px-4 py-3"><span className={`font-semibold ${BUCKET_COLOR[r.bucket]}`}>{r.bucket}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}
