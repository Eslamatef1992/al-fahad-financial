import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion } from 'framer-motion';

// Pastel tinted tile (same visual language as the dashboard StatCard).
const TONES = {
  navy: { card: 'bg-indigo-50 dark:bg-indigo-950/40', icon: 'text-indigo-600' },
  emerald: { card: 'bg-emerald-50 dark:bg-emerald-950/40', icon: 'text-emerald-600' },
  red: { card: 'bg-rose-50 dark:bg-rose-950/40', icon: 'text-rose-600' },
  blue: { card: 'bg-sky-50 dark:bg-sky-950/40', icon: 'text-sky-600' },
  gold: { card: 'bg-amber-50 dark:bg-amber-950/40', icon: 'text-amber-600' },
  purple: { card: 'bg-violet-50 dark:bg-violet-950/40', icon: 'text-violet-600' },
  orange: { card: 'bg-orange-50 dark:bg-orange-950/40', icon: 'text-orange-600' },
};

// Standard "financial statement" summary stat card — icon badge, big value,
// and an optional variance pill (green up / red down) for period-over-period
// or as-of comparisons. Used across the Reports section so every report page
// shares the same presentation.
export default function ReportKpiCard({ icon: Icon, label, value, tone = 'navy', variance, invertVariance, delay = 0 }) {
  const hasVariance = variance !== undefined && variance !== null && Number.isFinite(variance);
  // For expense-type metrics, a decrease is "good" (green) — invertVariance flips the color logic.
  const isGood = invertVariance ? variance <= 0 : variance >= 0;
  const c = TONES[tone] || TONES.navy;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      whileHover={{ y: -2 }}
      className={`relative overflow-hidden rounded-3xl p-5 ${c.card}`}
    >
      <div className="pointer-events-none absolute -top-8 -end-8 w-28 h-28 rounded-full bg-white/40 dark:bg-white/5" />
      <div className="relative flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl bg-white/80 dark:bg-white/10 flex items-center justify-center ${c.icon}`}>
          <Icon size={18} />
        </div>
        {hasVariance && (
          <span className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-full bg-white/80 dark:bg-white/10 ${isGood ? 'text-emerald-600' : 'text-rose-600'}`}>
            {variance >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(variance).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="relative text-sm font-semibold text-slate-600 dark:text-slate-300">{label}</p>
      <p className="relative text-2xl font-extrabold text-navy-900 dark:text-white mt-1 truncate">{value}</p>
    </motion.div>
  );
}
