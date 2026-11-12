import { motion } from 'framer-motion';

// Pastel KPI tile: tinted background, white icon chip, large number.
const TONES = {
  navy: { card: 'bg-indigo-50 dark:bg-indigo-950/40', icon: 'text-indigo-600', num: 'text-indigo-600' },
  gold: { card: 'bg-amber-50 dark:bg-amber-950/40', icon: 'text-amber-600', num: 'text-amber-600' },
  green: { card: 'bg-emerald-50 dark:bg-emerald-950/40', icon: 'text-emerald-600', num: 'text-emerald-600' },
  red: { card: 'bg-rose-50 dark:bg-rose-950/40', icon: 'text-rose-600', num: 'text-rose-600' },
  blue: { card: 'bg-sky-50 dark:bg-sky-950/40', icon: 'text-sky-600', num: 'text-sky-600' },
  pink: { card: 'bg-pink-50 dark:bg-pink-950/40', icon: 'text-pink-600', num: 'text-pink-600' },
  purple: { card: 'bg-violet-50 dark:bg-violet-950/40', icon: 'text-violet-600', num: 'text-violet-600' },
};

// variant="tile": icon top, big colored number, optional unit line, label at the bottom.
export default function StatCard({ label, value, icon: Icon, tone = 'navy', delay = 0, variant = 'default', unit }) {
  const c = TONES[tone] || TONES.navy;
  const motionProps = {
    initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.25 }, whileHover: { y: -3 },
  };
  const deco = <div className="pointer-events-none absolute -top-8 -end-8 w-28 h-28 rounded-full bg-white/40 dark:bg-white/5" />;

  if (variant === 'tile') {
    return (
      <motion.div {...motionProps} className={`relative overflow-hidden rounded-3xl p-5 min-h-[170px] flex flex-col justify-between ${c.card}`}>
        {deco}
        <div className={`relative w-10 h-10 rounded-xl bg-white/80 dark:bg-white/10 flex items-center justify-center ${c.icon}`}>
          {Icon && <Icon size={20} />}
        </div>
        <div className="relative">
          <p className={`text-4xl font-extrabold truncate ${c.num}`}>{value}</p>
          {unit && <p className={`text-xs font-semibold ${c.num} opacity-80`}>{unit}</p>}
          <p className="text-sm font-bold text-navy-900 dark:text-white mt-2 truncate">{label}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...motionProps} className={`relative overflow-hidden rounded-3xl p-5 flex flex-col gap-3 min-h-[120px] ${c.card}`}>
      {deco}
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
