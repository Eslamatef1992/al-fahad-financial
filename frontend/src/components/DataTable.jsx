import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Search, Pencil, Trash2, Power } from 'lucide-react';

export default function DataTable({ columns, data, loading, onEdit, onDelete, onToggleActive, isInactive, onRowClick, searchable = true }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    // `data` can transiently be non-array (e.g. an in-flight request state, or an
    // API error payload that isn't the expected list) — never let that reach .map().
    const safeData = Array.isArray(data) ? data : [];
    if (!query) return safeData;
    const needle = query.toLowerCase();
    return safeData.filter((row) =>
      columns.some((c) => String(c.accessor ? c.accessor(row) : row[c.key] ?? '').toLowerCase().includes(needle))
    );
  }, [data, query, columns]);

  return (
    <div className="card overflow-hidden">
      {searchable && (
        <div className="p-4 border-b border-slate-100 dark:border-navy-800">
          <div className="relative max-w-xs">
            <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('common.search')}
              className="input !ps-9"
            />
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-navy-800 text-start">
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3 text-start font-semibold text-slate-500 text-xs uppercase tracking-wide whitespace-nowrap">
                  {c.label}
                </th>
              ))}
              {(onEdit || onDelete || onToggleActive) && <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('common.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-10 text-center text-slate-400">{t('common.loading')}</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-10 text-center text-slate-400">{t('common.noData')}</td></tr>
            )}
            {!loading && filtered.map((row, i) => (
              <motion.tr
                key={row.id || i}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-slate-50 dark:border-navy-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-navy-800/40 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3 whitespace-nowrap">
                    {c.render ? c.render(row) : (c.accessor ? c.accessor(row) : row[c.key])}
                  </td>
                ))}
                {(onEdit || onDelete || onToggleActive) && (
                  <td className="px-4 py-3 text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      {onEdit && (
                        <button onClick={() => onEdit(row)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 text-slate-500">
                          <Pencil size={15} />
                        </button>
                      )}
                      {onToggleActive && (
                        <button
                          onClick={() => onToggleActive(row)}
                          title={isInactive?.(row) ? t('common.activate') : t('common.deactivate')}
                          className={`p-2 rounded-lg ${isInactive?.(row) ? 'hover:bg-emerald-50 dark:hover:bg-emerald-950 text-emerald-500' : 'hover:bg-red-50 dark:hover:bg-red-950 text-red-500'}`}
                        >
                          <Power size={15} />
                        </button>
                      )}
                      {onDelete && (
                        <button onClick={() => onDelete(row)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-500">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
