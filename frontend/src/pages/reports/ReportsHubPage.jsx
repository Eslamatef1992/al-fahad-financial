import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PieChart, Scale, ListTree, ScrollText, Receipt, ArrowRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

const REPORTS = [
  { to: '/reports/profit-and-loss', icon: PieChart, title: 'Profit & Loss', desc: 'Revenue vs. expenses over a date range, with net profit. Export to PDF.', tone: 'text-emerald-600 bg-emerald-50' },
  { to: '/reports/balance-sheet', icon: Scale, title: 'Balance Sheet', desc: 'Assets, liabilities and equity as of a date, with a balance check. Export to PDF.', tone: 'text-blue-600 bg-blue-50' },
  { to: '/reports/trial-balance', icon: ListTree, title: 'Trial Balance', desc: 'Net debit/credit balance per account as of a date. Export to PDF or Excel.', tone: 'text-purple-600 bg-purple-50' },
  { to: '/ledger', icon: ScrollText, title: 'General Ledger', desc: 'Full transaction history per account with running balance. Export to Excel.', tone: 'text-navy-700 bg-navy-50' },
  { to: '/vouchers', icon: Receipt, title: 'Vouchers Register', desc: 'All receipt, payment and journal vouchers with status. Export to Excel; each voucher exports to PDF.', tone: 'text-gold-700 bg-gold-100' },
];

export default function ReportsHubPage() {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title="Reports" subtitle="Every report in the system, each with PDF or Excel export" />
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {REPORTS.map((r, i) => (
          <motion.button
            key={r.to}
            onClick={() => navigate(r.to)}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            whileHover={{ y: -3 }}
            className="card p-5 text-start flex flex-col gap-3"
          >
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${r.tone}`}>
              <r.icon size={20} />
            </div>
            <div>
              <h3 className="font-bold text-navy-900 dark:text-white">{r.title}</h3>
              <p className="text-sm text-slate-500 mt-1">{r.desc}</p>
            </div>
            <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-gold-600">
              Open report <ArrowRight size={14} />
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
