import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function SlideOver({ open, onClose, title, children, onSubmit, submitting, wide }) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className={`fixed inset-y-0 end-0 z-50 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} bg-white dark:bg-navy-900 shadow-2xl flex flex-col`}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-navy-800">
              <h2 className="font-bold text-lg text-navy-900 dark:text-white">{title}</h2>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={onSubmit}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
              id="slideover-form"
            >
              {children}
            </form>
            {onSubmit && (
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-navy-800">
                <button type="button" onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
                <button type="submit" form="slideover-form" disabled={submitting} className="btn-primary">
                  {submitting ? t('common.loading') : t('common.save')}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
