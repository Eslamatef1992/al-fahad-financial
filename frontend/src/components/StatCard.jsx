import { motion } from 'framer-motion';

export default function StatCard({ label, value, icon: Icon, tone = 'navy', delay = 0 }) {
  const tones = {
    navy: 'bg-navy-700 text-white',
    gold: 'bg-gold-500 text-navy-950',
    green: 'bg-emerald-500 text-white',
    red: 'bg-red-500 text-white',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      whileHover={{ y: -3 }}
      className="card p-5 flex items-center gap-4"
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
        {Icon && <Icon size={22} />}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate">{label}</p>
        <p className="text-xl font-bold text-navy-900 dark:text-white truncate">{value}</p>
      </div>
    </motion.div>
  );
}
