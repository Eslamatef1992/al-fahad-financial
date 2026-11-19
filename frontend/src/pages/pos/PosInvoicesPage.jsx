import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, Printer, HandCoins, RotateCcw, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import ReturnModal from '@/components/ReturnModal';
import { printInvoiceById } from '@/utils/printInvoice';
import { printReceiptVoucher } from '@/utils/printReceiptVoucher';

const m = (n) => Number(n || 0).toFixed(3);
const STATUS = {
  posted: ['Unpaid', 'غير مدفوعة', 'bg-amber-50 text-amber-600'],
  partially_paid: ['Partially paid', 'مدفوعة جزئياً', 'bg-amber-50 text-amber-600'],
  paid: ['Paid', 'مدفوعة', 'bg-emerald-50 text-emerald-600'],
  cancelled: ['Cancelled / Refunded', 'ملغاة / مستردة', 'bg-slate-100 text-slate-500'],
  draft: ['Held', 'معلقة', 'bg-slate-100 text-slate-500'],
};

function Tip({ label, children }) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span className="pointer-events-none absolute bottom-full start-1/2 -translate-x-1/2 mb-1 z-50 whitespace-nowrap rounded-md bg-navy-900 text-white text-[11px] font-semibold px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">{label}</span>
    </span>
  );
}

// Full-screen invoice list for the POS (replaces the small Invoice History popup):
// filters on top, wide table, row actions (view / print / receipt / refund), pagination.
export default function PosInvoicesPage() {
  const { i18n } = useTranslation();
  const ar = i18n.language?.startsWith('ar');
  const L = (en, a) => (ar ? a : en);
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ date_from: '', date_to: '', q: '', branch_id: '', status: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [refundId, setRefundId] = useState(null);

  const load = (flt = f) => {
    setLoading(true);
    api.get('/pos/sales/history', { params: { status: flt.status, ...(flt.date_from ? { date_from: flt.date_from } : {}), ...(flt.date_to ? { date_to: flt.date_to } : {}), ...(flt.q.trim() ? { q: flt.q.trim() } : {}) } })
      .then((r) => { setRows(r.data || []); setPage(1); }).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) { api.get('/branches').then((r) => setBranches(r.data)).catch(() => {}); } }, [activeCompany]);
  useEffect(() => {
    if (!activeCompany) return undefined;
    const h = setTimeout(() => load(f), 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany, f.q, f.date_from, f.date_to, f.status]);

  const shown = useMemo(() => rows.filter((r) => !f.branch_id || r.branch_id === f.branch_id), [rows, f.branch_id]);
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const cur = Math.min(page, pages);
  const slice = shown.slice((cur - 1) * pageSize, cur * pageSize);
  const branchName = (id) => { const b = branches.find((x) => x.id === id); return b ? ((ar ? b.name_ar : null) || b.name_en) : '—'; };
  const hasFilters = !!(f.q || f.date_from || f.date_to || f.branch_id || f.status !== 'all');
  const clear = () => { const e = { date_from: '', date_to: '', q: '', branch_id: '', status: 'all' }; setF(e); };
  const vouchersOf = (r) => [...new Set((r.payments || []).map((p) => p.voucher_id).filter(Boolean))];
  const th = 'px-3 py-2.5 text-start text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap';

  return (
    <div>
      <PageHeader title={L('Invoices', 'الفواتير')} subtitle={L('All POS sales — filter, view, print, receipt and refund', 'جميع مبيعات نقطة البيع — بحث وعرض وطباعة وسند قبض واسترداد')} />

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div><label className="label !text-[11px]">{L('From', 'من')}</label><input type="date" className="input" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} /></div>
        <div><label className="label !text-[11px]">{L('To', 'إلى')}</label><input type="date" className="input" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} /></div>
        <div>
          <label className="label !text-[11px]">{L('Branch', 'الفرع')}</label>
          <select className="input" value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
            <option value="">{L('All branches', 'كل الفروع')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{(ar ? b.name_ar : null) || b.name_en}</option>)}
          </select>
        </div>
        <div>
          <label className="label !text-[11px]">{L('Status', 'الحالة')}</label>
          <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="all">{L('All', 'الكل')}</option>
            <option value="posted">{L('Unpaid', 'غير مدفوعة')}</option>
            <option value="partially_paid">{L('Partially paid', 'مدفوعة جزئياً')}</option>
            <option value="paid">{L('Paid', 'مدفوعة')}</option>
            <option value="cancelled">{L('Cancelled / Refunded', 'ملغاة / مستردة')}</option>
          </select>
        </div>
        <div className="relative flex-1 min-w-[240px]">
          <label className="label !text-[11px]">{L('Search', 'بحث')}</label>
          <div className="relative">
            {!f.q && <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400 pointer-events-none" />}
            <input className={`input ${f.q ? '' : '!ps-9'}`} placeholder={L('Invoice #, client name or phone…', 'رقم الفاتورة أو اسم العميل أو الهاتف…')} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </div>
        </div>
        <button onClick={clear} disabled={!hasFilters} className="flex items-center gap-1.5 rounded-xl border border-red-300 text-red-500 hover:bg-red-50 px-3 py-2.5 text-sm font-semibold disabled:opacity-40">
          <X size={15} />{L('Clear filters', 'إلغاء تصفيات البحث')}
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-navy-900">
                <th className={th}>#</th>
                <th className={th}>{L('Date', 'التاريخ')}</th>
                <th className={th}>{L('Customer', 'العميل')}</th>
                <th className={th}>{L('Branch', 'الفرع')}</th>
                <th className={th}>{L('Delivery date', 'تاريخ التسليم')}</th>
                <th className={`${th} !text-end`}>{L('Total', 'الإجمالي')}</th>
                <th className={`${th} !text-end`}>{L('Paid', 'المدفوع')}</th>
                <th className={`${th} !text-end`}>{L('Due', 'المستحق')}</th>
                <th className={th}>{L('Status', 'الحالة')}</th>
                <th className={`${th} !text-end`}>{L('Actions', 'إجراءات')}</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((r) => {
                const st = STATUS[r.status] || [r.status, r.status, 'bg-slate-100 text-slate-500'];
                const due = Math.max(0, Number(r.total) - Number(r.paid_total || 0));
                const vs = vouchersOf(r);
                const d = r.createdAt ? new Date(r.createdAt) : null;
                const cl = r.client;
                return (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-navy-800 hover:bg-slate-50/70 dark:hover:bg-navy-900/50">
                    <td className="px-3 py-2.5 font-bold text-navy-900 dark:text-white whitespace-nowrap cursor-pointer" onClick={() => navigate(`/invoices/${r.id}`)}>{r.invoice_no}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.date}{d && !Number.isNaN(d.getTime()) ? <span className="text-slate-400"> · {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span> : null}</td>
                    <td className="px-3 py-2.5">{cl ? <>{(ar ? cl.name_ar : null) || cl.name_en}{cl.phone ? <span className="text-slate-400"> · {cl.phone}</span> : null}</> : L('Walk-in', 'عميل نقدي')}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{branchName(r.branch_id)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.delivery_date ? <span className="text-amber-600 font-semibold">{r.delivery_date}</span> : '—'}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums font-bold">{m(r.total)}</td>
                    <td className="px-3 py-2.5 text-end tabular-nums">{m(r.paid_total)}</td>
                    <td className={`px-3 py-2.5 text-end tabular-nums font-semibold ${due > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{m(due)}</td>
                    <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${st[2]}`}>{ar ? st[1] : st[0]}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-0.5">
                        <Tip label={L('View invoice', 'عرض الفاتورة')}><button onClick={() => navigate(`/invoices/${r.id}`)} className="p-2 rounded-lg hover:bg-sky-50 text-sky-500"><Eye size={16} /></button></Tip>
                        <Tip label={L('Print invoice', 'طباعة الفاتورة')}><button onClick={() => printInvoiceById(r.id)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><Printer size={16} /></button></Tip>
                        {vs.length > 0 && (
                          <Tip label={L('Print receipt voucher', 'طباعة سند قبض')}><button onClick={async () => { for (const v of vs) await printReceiptVoucher(v); }} className="p-2 rounded-lg hover:bg-indigo-50 text-indigo-600"><HandCoins size={16} /></button></Tip>
                        )}
                        {['paid', 'partially_paid'].includes(r.status) && (
                          <Tip label={L('Refund / return', 'استرداد / إرجاع')}><button onClick={() => setRefundId(r.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><RotateCcw size={16} /></button></Tip>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!slice.length && (
                <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400">{loading ? L('Loading…', 'جارٍ التحميل…') : L('No invoices', 'لا توجد فواتير')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <div className="card !rounded-xl flex items-center gap-2 px-3 py-1.5 text-sm">
          <button disabled={cur <= 1} onClick={() => setPage(cur - 1)} className="p-1 rounded-full hover:bg-slate-100 disabled:opacity-30"><ChevronLeft size={18} className="rtl:rotate-180" /></button>
          <span>{L('Page', 'الصفحة')} <b>{cur}</b> {L('of', 'من')} <b>{pages}</b></span>
          <button disabled={cur >= pages} onClick={() => setPage(cur + 1)} className="p-1 rounded-full hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={18} className="rtl:rotate-180" /></button>
        </div>
        <div className="card !rounded-xl flex items-center gap-2 px-3 py-1.5 text-sm">
          <span className="text-slate-500">{L('Rows per page', 'عدد العناصر في كل صفحة')}</span>
          <select className="input !py-1 !w-20" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-slate-500">{L('of', 'من')} <b>{shown.length}</b></span>
        </div>
      </div>

      <ReturnModal invoiceId={refundId} onClose={() => setRefundId(null)} onDone={() => load(f)} />
    </div>
  );
}
