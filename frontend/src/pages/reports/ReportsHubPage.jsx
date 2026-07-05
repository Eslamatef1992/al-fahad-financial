import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { PieChart, Scale, ListTree, ScrollText, Receipt, ArrowRight, FileText, FileMinus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

const REPORTS = [
  { to: '/reports/profit-and-loss', icon: PieChart, key: 'profitAndLoss', tone: 'text-emerald-600 bg-emerald-50' },
  { to: '/reports/balance-sheet', icon: Scale, key: 'balanceSheet', tone: 'text-blue-600 bg-blue-50' },
  { to: '/reports/trial-balance', icon: ListTree, key: 'trialBalance', tone: 'text-purple-600 bg-purple-50' },
  { to: '/ledger', icon: ScrollText, key: 'generalLedger', tone: 'text-navy-700 bg-navy-50' },
  { to: '/vouchers', icon: Receipt, key: 'vouchersRegister', tone: 'text-gold-700 bg-gold-100' },
  { to: '/reports/aging/sales', icon: FileText, key: 'arAging', tone: 'text-emerald-600 bg-emerald-50' },
  { to: '/reports/aging/purchase', icon: FileMinus, key: 'apAging', tone: 'text-orange-600 bg-orange-50' },
];

export default function ReportsHubPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title={t('nav.reports')} subtitle={t('reports.subtitle')} />
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
              <h3 className="font-bold text-navy-900 dark:text-white">{t(`reports.${r.key}.title`)}</h3>
              <p className="text-sm text-slate-500 mt-1">{t(`reports.${r.key}.desc`)}</p>
            </div>
            <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-gold-600">
              {t('reports.openReport')} <ArrowRight size={14} />
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
