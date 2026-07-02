import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Building2, Check } from 'lucide-react';
import { useCompanyStore } from '@/store/companyStore';

export default function CompanySwitcher() {
  const { i18n } = useTranslation();
  const { companies, activeCompany, setActiveCompany } = useCompanyStore();
  const [open, setOpen] = useState(false);

  if (!companies?.length) return null;
  const name = (c) => (i18n.language === 'ar' ? c.name_ar : c.name_en);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-900 px-3.5 py-2.5 text-sm font-semibold hover:border-navy-300 transition-colors max-w-[220px]"
      >
        <Building2 size={16} className="text-gold-500 shrink-0" />
        <span className="truncate">{activeCompany ? name(activeCompany) : 'Select company'}</span>
        <ChevronDown size={14} className="shrink-0 opacity-60" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute z-30 mt-2 w-72 rounded-2xl border border-slate-100 dark:border-navy-800 bg-white dark:bg-navy-900 shadow-card-hover p-2 max-h-96 overflow-auto"
          >
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => { setActiveCompany(c); setOpen(false); }}
                className="w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm text-start hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
              >
                <span className="truncate">{name(c)}</span>
                {activeCompany?.id === c.id && <Check size={16} className="text-gold-500 shrink-0" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
