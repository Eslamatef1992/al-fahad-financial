import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion } from 'framer-motion';

const TONES = {
  navy: 'text-navy-700 bg-navy-50 dark:bg-navy-800 dark:text-navy-200',
  emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950',
  red: 'text-red-500 bg-red-50 dark:bg-red-950',
  blue: 'text-blue-600 bg-blue-50 dark:bg-blue-950',
  gold: 'text-gold-700 bg-gold-100 dark:bg-gold-900/30',
  purple: 'text-purple-600 bg-purple-50 dark:bg-purple-950',
  orange: 'text-orange-600 bg-orange-50 dark:bg-orange-950',
};

// Standard "financial statement" summary stat card — icon badge, big value,
// and an optional variance pill (green up / red down) for period-over-period
// or as-of comparisons. Used across the Reports section so every report page
// shares the same professional presentation.
export default function ReportKpiCard({ icon: Icon, label, value, tone = 'navy', variance, invertVariance, delay = 0 }) {
  const hasVariance = variance !== undefined && variance !== null && Number.isFinite(variance);
  // For expense-type metrics, a decrease is "good" (green) — invertVariance flips the color logic.
  const isGood = invertVariance ? variance <= 0 : variance >= 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${TONES[tone]}`}>
          <Icon size={18} />
        </div>
        {hasVariance && (
          <span className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-full ${isGood ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950' : 'bg-red-50 text-red-500 dark:bg-red-950'}`}>
            {variance >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(variance).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 uppercase font-semibold tracking-wide">{label}</p>
      <p className="text-2xl font-extrabold text-navy-900 dark:text-white mt-1 truncate">{value}</p>
    </motion.div>
  );
}
