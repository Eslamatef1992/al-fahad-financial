import { motion } from 'framer-motion';

// Pastel KPI tile: tinted background, white icon chip, large number.
const TONES = {
  navy: { card: 'bg-indigo-50 dark:bg-indigo-950/40', icon: 'text-indigo-600' },
  gold: { card: 'bg-amber-50 dark:bg-amber-950/40', icon: 'text-amber-600' },
  green: { card: 'bg-emerald-50 dark:bg-emerald-950/40', icon: 'text-emerald-600' },
  red: { card: 'bg-rose-50 dark:bg-rose-950/40', icon: 'text-rose-600' },
  blue: { card: 'bg-sky-50 dark:bg-sky-950/40', icon: 'text-sky-600' },
  pink: { card: 'bg-pink-50 dark:bg-pink-950/40', icon: 'text-pink-600' },
};

export default function StatCard({ label, value, icon: Icon, tone = 'navy', delay = 0 }) {
  const c = TONES[tone] || TONES.navy;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      whileHover={{ y: -3 }}
      className={`relative overflow-hidden rounded-3xl p-5 flex flex-col gap-3 min-h-[120px] ${c.card}`}
    >
      <div className="pointer-events-none absolute -top-8 -end-8 w-28 h-28 rounded-full bg-white/40 dark:bg-white/5" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 truncate">{label}</p>
        <div className={`w-9 h-9 rounded-xl bg-white/80 dark:bg-white/10 flex items-center justify-center shrink-0 ${c.icon}`}>
          {Icon && <Icon size={18} />}
        </div>
      </div>
      <p className="text-3xl font-extrabold text-navy-900 dark:text-white truncate">{value}</p>
    </motion.div>
  );
}
