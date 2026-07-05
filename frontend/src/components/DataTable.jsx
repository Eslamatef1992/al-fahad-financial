import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Search, Pencil, Trash2, Power, ChevronLeft, ChevronRight } from 'lucide-react';

export default function DataTable({ columns, data, loading, onEdit, onDelete, onToggleActive, isInactive, onRowClick, searchable = true, extraActions, pageSize }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

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

  // Re-land on page 1 whenever the filtered set changes shape (new search term, reloaded
  // data, switched company, etc.) so the user never lands on a now-empty trailing page.
  useEffect(() => { setPage(1); }, [query, data]);

  const pageCount = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount);
  const paged = pageSize ? filtered.slice((safePage - 1) * pageSize, safePage * pageSize) : filtered;
  const rangeFrom = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeTo = Math.min(safePage * pageSize, filtered.length);

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
              {(onEdit || onDelete || onToggleActive || extraActions) && <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('common.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-10 text-center text-slate-400">{t('common.loading')}</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-10 text-center text-slate-400">{t('common.noData')}</td></tr>
            )}
            {!loading && paged.map((row, i) => (
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
                {(onEdit || onDelete || onToggleActive || extraActions) && (
                  <td className="px-4 py-3 text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      {extraActions?.(row)}
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
      {pageSize && filtered.length > 0 && (
        <div className="flex items-center justify-between p-3 border-t border-slate-100 dark:border-navy-800 text-sm text-slate-500">
          <span>{t('common.showingRange', { from: rangeFrom, to: rangeTo, total: filtered.length })}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-medium">{t('common.pageOf', { page: safePage, count: pageCount })}</span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={safePage >= pageCount}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
