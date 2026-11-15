import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Printer, Undo2, Wallet, Receipt } from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import StatCard from '@/components/StatCard';
import { printCreditNote } from '@/utils/printCreditNote';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

const n3 = (v) => Number(v || 0).toFixed(3);
const iso = (d) => d.toISOString().slice(0, 10);
const METHOD = { cash: ['Cash', 'نقداً'], knet: ['KNET', 'كي نت'], other: ['Other', 'أخرى'], credit: ['Client credit', 'رصيد عميل'] };

export default function SalesReturnsPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const isSuper = useAuthStore((s) => s.user?.role) === 'super_admin';
  const [from, setFrom] = useState(() => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/sales-returns', { params: { from, to } }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, from, to]);
  const confirmStock = async (r) => {
    if (!window.confirm(L(`Confirm that the goods of ${r.return_no} physically came back? They will join available stock.`, `تأكيد استلام بضاعة ${r.return_no} فعلياً؟ ستنضم إلى المخزون المتاح.`))) return;
    await api.post(`/sales-returns/${r.id}/confirm-stock`, {});
    toast.success(L('Stock confirmed', 'تم تأكيد المخزون'));
    load();
  };
  const pending = rows.filter((r) => r.stock_status === 'pending').length;

  const sum = (k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);

  return (
    <div>
      <PageHeader
        title={L('Sales Returns (Credit Notes)', 'مرتجعات المبيعات (إشعارات دائنة)')}
        subtitle={L('Open an invoice and press “Return items” to create one', 'افتح الفاتورة واضغط «إرجاع أصناف» لإنشاء مرتجع')}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label={L('Returns', 'عدد المرتجعات')} value={rows.length} icon={Undo2} tone="pink" />
        <StatCard label={L('Total returned', 'إجمالي المرتجع')} value={n3(sum('total'))} icon={Receipt} tone="red" delay={0.05} />
        <StatCard label={L('Paid back', 'المردود للعملاء')} value={n3(sum('refunded_amount'))} icon={Wallet} tone="gold" delay={0.1} />
        <StatCard label={L('Awaiting stock confirmation', 'بانتظار تأكيد المخزون')} value={pending} icon={Wallet} tone="gold" delay={0.15} />
      </div>
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div><label className="label">{L('From', 'من')}</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">{L('To', 'إلى')}</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-navy-900 text-[11px] uppercase tracking-wide text-slate-500">
              {[L('Return no.', 'رقم المرتجع'), L('Date', 'التاريخ'), L('Invoice', 'الفاتورة'), L('Client', 'العميل'), L('Total', 'الإجمالي'), L('Applied', 'مخصوم'), L('Paid back', 'مردود'), L('Credit', 'رصيد'), L('Method', 'الطريقة'), L('Reason', 'السبب'), L('Stock', 'المخزون'), ''].map((h, i) => <th key={i} className="px-3 py-2.5 text-start whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400">…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400">{L('No returns in this period.', 'لا مرتجعات في هذه الفترة.')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-navy-800">
                <td className="px-3 py-2 font-semibold">{r.return_no}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                <td className="px-3 py-2"><Link className="text-indigo-600 hover:underline" to={`/invoices/${r.invoice_id}`}>{r.invoice?.invoice_no}</Link></td>
                <td className="px-3 py-2">{(isAr ? r.client?.name_ar : r.client?.name_en) || r.client?.name_en || '—'}</td>
                <td className="px-3 py-2 tabular-nums font-semibold">{n3(r.total)}</td>
                <td className="px-3 py-2 tabular-nums">{n3(r.applied_to_invoice)}</td>
                <td className="px-3 py-2 tabular-nums">{n3(r.refunded_amount)}</td>
                <td className="px-3 py-2 tabular-nums">{n3(r.credited_amount)}</td>
                <td className="px-3 py-2">{(METHOD[r.refund_method] || [r.refund_method, r.refund_method])[isAr ? 1 : 0]}</td>
                <td className="px-3 py-2 max-w-[200px] truncate">{r.reason || '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.stock_status === 'pending' ? (
                    isSuper
                      ? <button onClick={() => confirmStock(r)} className="px-2 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100">{L('Confirm stock', 'تأكيد المخزون')}</button>
                      : <span className="text-xs text-amber-600 font-semibold">{L('Awaiting super admin', 'بانتظار المدير العام')}</span>
                  ) : r.stock_status === 'confirmed' ? <span className="text-xs text-emerald-600 font-semibold">{L('In stock', 'في المخزون')}</span> : <span className="text-xs text-slate-400">—</span>}
                </td>
                <td className="px-3 py-2"><button onClick={() => printCreditNote(r.id)} title={L('Print credit note', 'طباعة إشعار دائن')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 text-slate-500"><Printer size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
