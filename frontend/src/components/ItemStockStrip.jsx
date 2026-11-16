import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/api/client';

const q = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
const m = (v) => Number(v || 0).toFixed(3);

// ERP-style stock line for the item being worked on: per store — cost, balance, booked,
// available (balance − booked), the quantity on THIS invoice and what would be left.
//   Balance   = physically in the store
//   Booked    = promised to clients on booked invoices, not yet delivered
//   Available = Balance − Booked   (what is genuinely free to sell)
export default function ItemStockStrip({ itemId, name, branchId, qtyInCart = 0, sellingPrice, hideCost = false }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const [d, setD] = useState(null);

  useEffect(() => {
    setD(null);
    if (itemId && !String(itemId).startsWith('mfg:')) api.get(`/items/${itemId}/balance`).then((r) => setD(r.data)).catch(() => setD(null));
  }, [itemId]);

  if (!itemId || String(itemId).startsWith('mfg:')) return null;
  const rows = (d?.rows || []).filter((r) => r.on_hand !== 0 || r.booked !== 0 || r.required !== 0 || r.branch_id === branchId);
  const th = 'px-2 py-1 text-start text-[10px] uppercase tracking-wide text-slate-500 font-semibold whitespace-nowrap';
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20 overflow-x-auto">
      <div className="px-2.5 py-1 text-xs font-bold text-amber-800 dark:text-amber-300 border-b border-amber-200 dark:border-amber-900/50 bg-amber-100/60 dark:bg-amber-950/30 flex items-center justify-between gap-2">
        <span className="truncate">{L('Stock', 'المخزون')}: {name}</span>
        {d && <span className="font-medium text-slate-500">{L('Total available', 'إجمالي المتاح')}: <b className={d.totals.available - qtyInCart < 0 ? 'text-rose-600' : 'text-emerald-600'}>{q(d.totals.available)}</b></span>}
      </div>
      <table className="w-full text-xs">
        <thead><tr>
          {[L('Store', 'المخزن'), L('Available', 'المتاح'), L('Booked', 'المحجوز'), L('Balance', 'الرصيد'), L('Ordered (PO)', 'المطلوب (أوامر الشراء)')].map((h) => <th key={h} className={th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {!d && <tr><td colSpan={5} className="px-2 py-2 text-slate-400">…</td></tr>}
          {rows.map((r) => {
            const mine = r.branch_id === branchId || (!branchId && !r.branch_id);
            return (
              <tr key={r.branch_id || 'pool'} className={`border-t border-amber-200/60 dark:border-amber-900/30 ${mine ? 'bg-white dark:bg-navy-800 font-semibold' : ''}`}>
                <td className="px-2 py-1 whitespace-nowrap">{isAr ? r.name_ar || r.name_en : r.name_en}</td>
                <td className={`px-2 py-1 tabular-nums ${r.available <= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{q(r.available)}</td>
                <td className="px-2 py-1 tabular-nums text-amber-600">{q(r.booked)}</td>
                <td className="px-2 py-1 tabular-nums">{q(r.on_hand)}</td>
                <td className="px-2 py-1 tabular-nums text-sky-700">{q(r.required)}</td>
              </tr>
            );
          })}
          {d && !rows.length && <tr><td colSpan={5} className="px-2 py-2 text-slate-400">{L('No stock in any store.', 'لا مخزون في أي مخزن.')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
