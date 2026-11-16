import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, CreditCard, PackageCheck, PackageX, Undo2, ShieldCheck, RefreshCcw, Lock } from 'lucide-react';
import api from '@/api/client';
import SlideOver from '@/components/SlideOver';

const n3 = (v) => Number(v || 0).toFixed(3);
const KIND = {
  invoice: [FileText, 'bg-indigo-50 text-indigo-600'], payment: [CreditCard, 'bg-emerald-50 text-emerald-600'], delivery: [PackageCheck, 'bg-sky-50 text-sky-600'],
  release: [PackageX, 'bg-slate-100 text-slate-500'], booked: [Lock, 'bg-amber-50 text-amber-600'], return: [Undo2, 'bg-rose-50 text-rose-600'],
  replacement: [ShieldCheck, 'bg-emerald-50 text-emerald-600'], exchange: [RefreshCcw, 'bg-violet-50 text-violet-600'],
};

export function Timeline({ events, showInvoice }) {
  return (
    <ol className="relative border-s border-slate-200 dark:border-navy-700 ms-3 space-y-4">
      {events.map((e, i) => {
        const [Icon, cls] = KIND[e.kind] || KIND.invoice;
        return (
          <li key={i} className="ms-5">
            <span className={`absolute -start-3.5 w-7 h-7 rounded-full flex items-center justify-center ${cls}`}><Icon size={14} /></span>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-navy-900 dark:text-white">{e.title}{showInvoice && e.invoice_no && <a href={`/invoices/${e.invoice_id}`} className="ms-2 text-xs text-indigo-600 font-medium hover:underline">{e.invoice_no}</a>}</p>
              <span className="text-xs text-slate-400">{e.at}</span>
            </div>
            <p className="text-xs text-slate-500">{e.detail}{e.amount ? <b className={`ms-2 ${e.amount < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}>{n3(e.amount)}</b> : null}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function LinesTable({ lines, L, isAr }) {
  return (
    <div className="rounded-xl border border-slate-100 dark:border-navy-800 overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="bg-slate-50 dark:bg-navy-900 text-[10px] uppercase tracking-wide text-slate-500">
          {[L('Item', 'الصنف'), L('Sold', 'مباع'), L('Delivered', 'مُسلَّم'), L('Booked', 'محجوز'), L('Released', 'محرَّر'), L('Returned', 'مرتجع'), L('Replaced', 'مستبدل'), L('Exchanged', 'مبدَّل'), L('With client', 'لدى العميل')].map((h) => <th key={h} className="px-2.5 py-2 text-start whitespace-nowrap">{h}</th>)}
        </tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t border-slate-100 dark:border-navy-800">
              <td className="px-2.5 py-2">{l.code && <span className="text-slate-400 me-1">{l.code}</span>}{isAr ? l.name_ar || l.name_en : l.name_en}{l.is_gift && <span className="ms-1">🎁</span>}</td>
              {['sold', 'delivered', 'booked_pending', 'released', 'returned', 'replaced', 'exchanged'].map((k) => <td key={k} className={`px-2.5 py-2 tabular-nums ${l[k] ? '' : 'text-slate-300'}`}>{l[k]}</td>)}
              <td className="px-2.5 py-2 tabular-nums font-bold">{l.with_client}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InvoiceMovementPanel({ invoiceId, onClose }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const [d, setD] = useState(null);
  useEffect(() => {
    setD(null);
    if (invoiceId) api.get(`/movements/invoice/${invoiceId}`).then((r) => setD(r.data)).catch(() => onClose());
  }, [invoiceId]);
  return (
    <SlideOver wide open={!!invoiceId} onClose={onClose} title={`${L('Invoice movement', 'حركة الفاتورة')}${d ? ` · ${d.invoice.invoice_no}` : ''}`}>
      {!d ? <p className="text-slate-400">…</p> : (
        <>
          <div className="rounded-xl bg-slate-50 dark:bg-navy-800/50 px-4 py-3 text-sm grid grid-cols-2 gap-1">
            <span>{L('Client', 'العميل')}: <b>{d.invoice.client?.name_en || '—'}</b></span>
            <span>{L('Sales person', 'البائع')}: <b>{d.invoice.salesperson?.name_en || '—'}</b></span>
            <span>{L('Total', 'الإجمالي')}: <b>{n3(d.invoice.total)}</b></span>
            <span>{L('Returned value', 'قيمة المرتجع')}: <b>{n3(d.invoice.returned_total)}</b></span>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase">{L('Where the items went', 'أين ذهبت الأصناف')}</p>
          <LinesTable lines={d.lines} L={L} isAr={isAr} />
          <p className="text-xs font-bold text-slate-400 uppercase pt-2">{L('Timeline', 'السجل الزمني')}</p>
          <Timeline events={d.events} />
        </>
      )}
    </SlideOver>
  );
}
