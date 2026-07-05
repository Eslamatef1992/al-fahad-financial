import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ open, onCancel, onConfirm, message }) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel} className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" />
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 inset-0 flex items-center justify-center p-4"
          >
            <div className="card p-6 max-w-sm w-full text-center">
              <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950 text-red-500 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={22} />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">{message || t('common.confirmDelete')}</p>
              <div className="flex items-center justify-center gap-2">
                <button onClick={onCancel} className="btn-ghost">{t('common.cancel')}</button>
                <button onClick={onConfirm} className="btn-danger">{t('common.delete')}</button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
