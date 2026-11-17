import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Search, Printer, Eye } from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import { printReceiptVoucher } from '@/utils/printReceiptVoucher';

const m = (n) => Number(n || 0).toFixed(3);

function Tip({ label, children }) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span className="pointer-events-none absolute bottom-full start-1/2 -translate-x-1/2 mb-1 z-50 whitespace-nowrap rounded-md bg-navy-900 text-white text-[11px] font-semibold px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">{label}</span>
    </span>
  );
}

// Every receipt voucher issued to clients (POS part-payments, invoice payments, manual receipts), printable.
export default function ReceiptVouchersPage() {
  const { L, isAr, from, to, branchId } = useOutletContext();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    api.get('/vouchers/receipts', { params: { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(branchId ? { branch_id: branchId } : {}) } })
      .then((r) => setRows(r.data || [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, [activeCompany, from, to, branchId]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.voucher_no, r.invoice_no, r.client?.name_en, r.client?.name_ar, r.client?.phone, r.description].some((x) => String(x || '').toLowerCase().includes(s)));
  }, [rows, q]);
  const total = shown.reduce((a, r) => a + r.amount, 0);

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-3 border-b border-slate-100 dark:border-navy-800">
        <div className="relative flex-1 min-w-[220px]">
          {!q && <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400 pointer-events-none" />}
          <input className={`input ${q ? '' : '!ps-9'}`} placeholder={L('Search voucher #, invoice #, client or phone…', 'ابحث برقم السند أو الفاتورة أو العميل أو الهاتف…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="text-sm ms-auto">{L('Receipts', 'السندات')}: <b>{shown.length}</b> · {L('Total', 'الإجمالي')}: <b className="text-emerald-600">{m(total)}</b></p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-navy-900 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="text-start px-3 py-2.5">{L('Voucher #', 'رقم السند')}</th>
              <th className="text-start px-3 py-2.5">{L('Date', 'التاريخ')}</th>
              <th className="text-start px-3 py-2.5">{L('Client', 'العميل')}</th>
              <th className="text-start px-3 py-2.5">{L('Invoice', 'الفاتورة')}</th>
              <th className="text-start px-3 py-2.5">{L('Branch', 'الفرع')}</th>
              <th className="text-end px-3 py-2.5">{L('Amount', 'المبلغ')}</th>
              <th className="text-end px-3 py-2.5">{L('Actions', 'إجراءات')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-navy-800 hover:bg-slate-50/70 dark:hover:bg-navy-900/50">
                <td className="px-3 py-2 font-semibold text-red-600 whitespace-nowrap">{r.voucher_no}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-2">{(isAr ? r.client?.name_ar : null) || r.client?.name_en || '—'}{r.client?.phone ? <span className="text-slate-400"> · {r.client.phone}</span> : null}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.invoice_no || '—'}</td>
                <td className="px-3 py-2">{r.branch ? ((isAr ? r.branch.name_ar : null) || r.branch.name_en) : '—'}</td>
                <td className="px-3 py-2 text-end tabular-nums font-semibold">{m(r.amount)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Tip label={L('View voucher', 'عرض السند')}><Link to={`/vouchers/${r.id}`} className="p-2 rounded-lg hover:bg-sky-50 text-sky-500"><Eye size={15} /></Link></Tip>
                    <Tip label={L('Print receipt voucher', 'طباعة سند قبض')}><button onClick={() => printReceiptVoucher(r.id)} className="p-2 rounded-lg hover:bg-indigo-50 text-indigo-600"><Printer size={15} /></button></Tip>
                  </div>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">{loading ? L('Loading…', 'جارٍ التحميل…') : L('No receipt vouchers', 'لا توجد سندات قبض')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
