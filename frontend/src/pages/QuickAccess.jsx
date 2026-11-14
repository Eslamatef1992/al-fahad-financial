import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import usePermissions from '@/hooks/usePermissions';
import { buildGroups, itemLabel } from '@/components/TopNav';

// Every module as a coloured card — one click from anywhere.
const TONES = {
  pos: { bg: 'bg-indigo-50 dark:bg-indigo-950/40', chip: 'text-indigo-600' },
  sales: { bg: 'bg-sky-50 dark:bg-sky-950/40', chip: 'text-sky-600' },
  inventory: { bg: 'bg-amber-50 dark:bg-amber-950/40', chip: 'text-amber-600' },
  accounting: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', chip: 'text-emerald-600' },
  more: { bg: 'bg-violet-50 dark:bg-violet-950/40', chip: 'text-violet-600' },
};

export default function QuickAccessPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const user = useAuthStore((s) => s.user);
  const { canDelete: isCompanyAdmin } = usePermissions();
  const groups = buildGroups({ isSuperAdmin: user?.role === 'super_admin', isCompanyAdmin });
  // Cashiers have no POS group; give them the POS screen card directly.
  const sections = isCompanyAdmin ? groups : [{ key: 'pos', label: 'pos', items: [{ to: '/pos', icon: ShoppingCart, key: 'pos' }] }, ...groups];

  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 dark:text-white mb-6">{t('nav.quickAccess')}</h1>
      <div className="space-y-8">
        {sections.map((g) => {
          const tone = TONES[g.key] || TONES.more;
          return (
            <section key={g.key}>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">{t(`nav.${g.label}`)}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {g.items.map((item, i) => (
                  <motion.div key={item.to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} whileHover={{ y: -3 }}>
                    <Link to={item.to} className={`flex flex-col items-center justify-center gap-3 text-center rounded-3xl p-5 min-h-[130px] ${tone.bg} hover:shadow-card-hover transition-shadow`}>
                      <span className={`w-12 h-12 rounded-2xl bg-white/80 dark:bg-white/10 flex items-center justify-center ${tone.chip}`}><item.icon size={22} /></span>
                      <span className="text-sm font-semibold text-navy-900 dark:text-white leading-tight">{itemLabel(t, isAr, item)}</span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
