import { useEffect, useMemo, useState } from 'react';
import { printInvoiceById } from '@/utils/printInvoice';
import { Link, useOutletContext } from 'react-router-dom';
import {
  ReceiptText, Wallet, Percent, Banknote, Clock, XCircle, Undo2, Timer, Printer, Eye, CreditCard, Tag, Boxes, Users, Building2,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import api, { printFile } from '@/api/client';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';
import PosCashiersPage from '@/pages/pos/PosCashiersPage';
import { useCompanyStore } from '@/store/companyStore';

const n3 = (v) => Number(v || 0).toFixed(3);
const sum = (rows, k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
const clientName = (r, isAr) => (r.client ? (isAr ? r.client.name_ar || r.client.name_en : r.client.name_en) : '—');

const STATUS_STYLE = {
  posted: 'bg-sky-50 text-sky-600', partially_paid: 'bg-amber-50 text-amber-600', paid: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-rose-50 text-rose-600', draft: 'bg-slate-100 text-slate-500',
};
function StatusPill({ r, L }) {
  const key = r.status === 'cancelled' && r.refunded_at ? 'refunded' : r.status;
  const label = {
    posted: L('Unpaid', 'غير مدفوع'), partially_paid: L('Partial', 'مدفوع جزئياً'), paid: L('Paid', 'مدفوع'),
    cancelled: L('Canceled', 'ملغى'), refunded: L('Refunded', 'مسترد'), draft: L('Pending', 'معلق'),
  }[key];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[key] || STATUS_STYLE.cancelled}`}>{label}</span>;
}

// Shared order-list builder used by Orders / Pending / Canceled / Refunded.
function OrdersTable({ rows, loading, extraCols = [] }) {
  const { L, isAr, branchName, cashierName } = useOutletContext();
  const columns = [
    { key: 'invoice_no', label: L('Invoice #', 'رقم الفاتورة') },
    { key: 'date', label: L('Date', 'التاريخ') },
    { key: 'client', label: L('Customer', 'العميل'), accessor: (r) => clientName(r, isAr), render: (r) => clientName(r, isAr) },
    { key: 'branch', label: L('Branch', 'الفرع'), accessor: (r) => branchName(r.branch_id), render: (r) => branchName(r.branch_id) },
    { key: 'cashier', label: L('Cashier', 'الكاشير'), accessor: (r) => cashierName(r.created_by), render: (r) => cashierName(r.created_by) },
    { key: 'total', label: L('Total', 'الإجمالي'), render: (r) => <span className="font-semibold">{n3(r.total)}</span> },
    { key: 'paid_total', label: L('Paid', 'المدفوع'), render: (r) => n3(r.paid_total) },
    { key: 'status', label: L('Status', 'الحالة'), accessor: (r) => r.status, render: (r) => <StatusPill r={r} L={L} /> },
    ...extraCols,
  ];
  return (
    <DataTable
      columns={columns} data={rows} loading={loading} pageSize={25}
      extraActions={(r) => (
        <>
          {r.status !== 'draft' && (
            <Link to={`/invoices/${r.id}`} title={L('View', 'عرض')} className="p-2 rounded-lg hover:bg-sky-50 text-sky-500"><Eye size={15} /></Link>
          )}
          {r.status !== 'draft' && (
            <button onClick={() => printInvoiceById(r.id)} title={L('Print', 'طباعة')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><Printer size={15} /></button>
          )}
        </>
      )}
    />
  );
}

export function PosDashboard() {
  const { L, isAr, currency, completed, refunded, canceled, loading } = useOutletContext();
  const [pending, setPending] = useState([]);
  const [shifts, setShifts] = useState([]);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  useEffect(() => {
    if (!activeCompany) return;
    api.get('/pos/sales/pending').then((r) => setPending(r.data)).catch(() => setPending([]));
    api.get('/pos/shifts', { params: { status: 'open' } }).then((r) => setShifts(r.data)).catch(() => setShifts([]));
  }, [activeCompany]);

  const byDay = useMemo(() => {
    const m = {};
    completed.forEach((i) => { m[i.date] = (m[i.date] || 0) + Number(i.total || 0); });
    return Object.keys(m).sort().map((d) => ({ day: d.slice(5), total: Number(m[d].toFixed(3)) }));
  }, [completed]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard variant="tile" tone="purple" icon={ReceiptText} label={L('Invoices', 'الفواتير')} value={completed.length} />
        <StatCard variant="tile" tone="blue" icon={Wallet} label={L('Total', 'الإجمالي')} value={n3(sum(completed, 'total'))} unit={currency} />
        <StatCard variant="tile" tone="red" icon={Percent} label={L('Discounts', 'الخصومات')} value={n3(sum(completed, 'discount_amount'))} unit={currency} />
        <StatCard variant="tile" tone="gold" icon={Banknote} label={L('Paid', 'المدفوع')} value={n3(sum(completed, 'paid_total'))} unit={currency} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard tone="gold" icon={Clock} label={L('Pending orders', 'طلبات معلقة')} value={pending.length} />
        <StatCard tone="red" icon={XCircle} label={L('Canceled orders', 'طلبات ملغاة')} value={canceled.length} />
        <StatCard tone="pink" icon={Undo2} label={L('Refunded orders', 'طلبات مستردة')} value={`${refunded.length} · ${n3(sum(refunded, 'total'))}`} />
        <StatCard tone="green" icon={Timer} label={L('Open sessions', 'جلسات مفتوحة')} value={shifts.length} />
      </div>
      <div className="card-lg p-6">
        <h3 className="card-title mb-4">{L('Sales by day', 'المبيعات اليومية')}</h3>
        {byDay.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={byDay}>
              <defs><linearGradient id="posDay" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => n3(v)} />
              <Area type="monotone" dataKey="total" stroke="#6366f1" fill="url(#posDay)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <p className="text-center text-slate-400 py-12">{loading ? '…' : L('No data', 'لا توجد بيانات')}</p>}
      </div>
    </div>
  );
}

export const PosOrders = () => { const c = useOutletContext(); return <OrdersTable rows={c.completed} loading={c.loading} />; };
export const PosCanceled = () => { const c = useOutletContext(); return <OrdersTable rows={c.canceled} loading={c.loading} />; };
export const PosRefunded = () => {
  const c = useOutletContext();
  return <OrdersTable rows={c.refunded} loading={c.loading} extraCols={[
    { key: 'refund_reason', label: c.L('Reason', 'السبب'), render: (r) => r.refund_reason || '—' },
  ]} />;
};

export function PosPending() {
  const { branchId, loading: l0, L } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    api.get('/pos/sales/pending').then((r) => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }, [activeCompany]);
  const shown = branchId ? rows.filter((r) => r.branch_id === branchId) : rows;
  return (
    <>
      <p className="text-xs text-slate-400 mb-3">{L('Held (unpaid, unposted) sales from all cashiers. Resume them from the POS screen by the cashier who held them.', 'الطلبات المعلقة من جميع الكاشير. يمكن استكمالها من شاشة نقطة البيع بواسطة الكاشير الذي علقها.')}</p>
      <OrdersTable rows={shown} loading={loading || l0} />
    </>
  );
}

export function PosConsolidated() {
  const { L, completed, branchName, loading } = useOutletContext();
  const rows = useMemo(() => {
    const m = {};
    completed.forEach((i) => {
      const key = `${i.date}|${i.branch_id || ''}`;
      m[key] = m[key] || { id: key, date: i.date, branch_id: i.branch_id, count: 0, subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0 };
      const r = m[key];
      r.count += 1; r.subtotal += Number(i.subtotal || 0); r.discount += Number(i.discount_amount || 0);
      r.tax += Number(i.tax_total || 0); r.total += Number(i.total || 0); r.paid += Number(i.paid_total || 0);
    });
    return Object.values(m).sort((a, b) => b.date.localeCompare(a.date));
  }, [completed]);
  const columns = [
    { key: 'date', label: L('Date', 'التاريخ') },
    { key: 'branch', label: L('Branch', 'الفرع'), accessor: (r) => branchName(r.branch_id), render: (r) => branchName(r.branch_id) },
    { key: 'count', label: L('Invoices', 'الفواتير') },
    { key: 'subtotal', label: L('Subtotal', 'المجموع الفرعي'), render: (r) => n3(r.subtotal) },
    { key: 'discount', label: L('Discounts', 'الخصومات'), render: (r) => n3(r.discount) },
    { key: 'tax', label: L('Tax', 'الضريبة'), render: (r) => n3(r.tax) },
    { key: 'total', label: L('Total', 'الإجمالي'), render: (r) => <span className="font-semibold">{n3(r.total)}</span> },
    { key: 'paid', label: L('Paid', 'المدفوع'), render: (r) => n3(r.paid) },
  ];
  return <DataTable columns={columns} data={rows} loading={loading} pageSize={25} />;
}

export function PosExchange() {
  const { L } = useOutletContext();
  return (
    <div className="card-lg p-10 text-center">
      <Undo2 size={36} className="mx-auto text-slate-300 mb-3" />
      <p className="font-semibold text-navy-900 dark:text-white">{L('Exchange orders are not enabled yet', 'طلبات الاستبدال غير مفعلة بعد')}</p>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        {L('For now, process an exchange as a refund of the original sale followed by a new sale from the POS screen.', 'حالياً، نفذ الاستبدال كاسترداد للفاتورة الأصلية ثم فاتورة بيع جديدة من شاشة نقطة البيع.')}
      </p>
    </div>
  );
}

export function PosBranches() {
  const { L, isAr, branches, completed, loading } = useOutletContext();
  const rows = useMemo(() => branches.map((b) => {
    const inv = completed.filter((i) => i.branch_id === b.id);
    return { id: b.id, name: isAr ? b.name_ar : b.name_en, code: b.code, count: inv.length, total: sum(inv, 'total'), paid: sum(inv, 'paid_total') };
  }), [branches, completed, isAr]);
  const columns = [
    { key: 'code', label: L('Code', 'الكود') }, { key: 'name', label: L('Branch', 'الفرع') },
    { key: 'count', label: L('Invoices', 'الفواتير') },
    { key: 'total', label: L('Total', 'الإجمالي'), render: (r) => <span className="font-semibold">{n3(r.total)}</span> },
    { key: 'paid', label: L('Paid', 'المدفوع'), render: (r) => n3(r.paid) },
  ];
  return <DataTable columns={columns} data={rows} loading={loading} pageSize={25} />;
}

export function PosBackorder() {
  const { L, isAr, branchId } = useOutletContext();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    api.get('/items', { params: branchId ? { branch_id: branchId } : {} })
      .then((r) => setItems(r.data.filter((i) => Number(i.booked_quantity) > 0 && Number(i.booked_quantity) > Number(i.total_quantity_on_hand))))
      .catch(() => setItems([])).finally(() => setLoading(false));
  }, [activeCompany, branchId]);
  const columns = [
    { key: 'code', label: L('Code', 'الكود') },
    { key: 'name', label: L('Item', 'الصنف'), accessor: (r) => r.name_en, render: (r) => (isAr ? r.name_ar : r.name_en) },
    { key: 'onhand', label: L('On hand', 'الرصيد'), render: (r) => Number(r.total_quantity_on_hand).toFixed(2) },
    { key: 'booked', label: L('Booked', 'المحجوز'), render: (r) => Number(r.booked_quantity).toFixed(2) },
    { key: 'short', label: L('Shortage', 'العجز'), render: (r) => <span className="text-rose-600 font-semibold">{(Number(r.booked_quantity) - Number(r.total_quantity_on_hand)).toFixed(2)}</span> },
  ];
  return (
    <>
      <p className="text-xs text-slate-400 mb-3">{L('Items whose booked quantity is higher than the stock on hand.', 'الأصناف التي كمية حجزها أكبر من الرصيد المتوفر.')}</p>
      <DataTable columns={columns} data={items} loading={loading} pageSize={25} />
    </>
  );
}

export function PosTransactions() {
  const { L, completed, loading, cashierName } = useOutletContext();
  const rows = useMemo(() => completed.flatMap((i) => (i.payments || []).map((p) => ({
    id: p.id, date: p.date, invoice_no: i.invoice_no, invoice_id: i.id, method: p.payment_method, reference: p.reference, amount: p.amount, cashier: cashierName(i.created_by),
  }))).sort((a, b) => String(b.date).localeCompare(String(a.date))), [completed, cashierName]);
  const columns = [
    { key: 'date', label: L('Date', 'التاريخ') },
    { key: 'invoice_no', label: L('Invoice #', 'رقم الفاتورة'), render: (r) => <Link className="text-indigo-600 hover:underline" to={`/invoices/${r.invoice_id}`}>{r.invoice_no}</Link> },
    { key: 'method', label: L('Method', 'طريقة الدفع'), render: (r) => <span className="capitalize">{r.method}</span> },
    { key: 'reference', label: L('Reference', 'المرجع'), render: (r) => r.reference || '—' },
    { key: 'cashier', label: L('Cashier', 'الكاشير') },
    { key: 'amount', label: L('Amount', 'المبلغ'), render: (r) => <span className="font-semibold">{n3(r.amount)}</span> },
  ];
  return <DataTable columns={columns} data={rows} loading={loading} pageSize={25} />;
}

export function PosSessions() {
  const { L, isAr, scoped, branchId } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    api.get('/pos/shifts', { params: { status: 'all', ...(branchId ? { branchId } : {}) } })
      .then((r) => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }, [activeCompany, branchId]);
  const fmtDt = (d) => (d ? new Date(d).toLocaleString() : '—');
  const columns = [
    { key: 'cashier', label: L('Cashier', 'الكاشير'), accessor: (r) => r.cashier?.name, render: (r) => r.cashier?.name || '—' },
    { key: 'branch', label: L('Branch', 'الفرع'), accessor: (r) => r.branch?.name_en, render: (r) => (r.branch ? (isAr ? r.branch.name_ar : r.branch.name_en) : '—') },
    { key: 'opened_at', label: L('Opened', 'فُتحت'), render: (r) => fmtDt(r.opened_at) },
    { key: 'closed_at', label: L('Closed', 'أُغلقت'), render: (r) => fmtDt(r.closed_at) },
    { key: 'opening_float', label: L('Float', 'العهدة'), render: (r) => n3(r.opening_float) },
    { key: 'sales', label: L('Sales', 'المبيعات'), render: (r) => n3(sum(scoped.filter((i) => i.pos_shift_id === r.id && i.status !== 'cancelled'), 'total')) },
    { key: 'expected_cash', label: L('Expected cash', 'المتوقع'), render: (r) => (r.expected_cash == null ? '—' : n3(r.expected_cash)) },
    { key: 'counted_cash', label: L('Counted', 'المعدود'), render: (r) => (r.counted_cash == null ? '—' : n3(r.counted_cash)) },
    { key: 'variance', label: L('Variance', 'الفرق'), render: (r) => (r.variance == null ? '—' : <span className={Number(r.variance) === 0 ? '' : 'text-rose-600 font-semibold'}>{n3(r.variance)}</span>) },
    { key: 'status', label: L('Status', 'الحالة'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.status === 'open' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{r.status === 'open' ? L('Open', 'مفتوحة') : L('Closed', 'مغلقة')}</span>
    ) },
  ];
  return <DataTable columns={columns} data={rows} loading={loading} pageSize={25} />;
}

export const PosUsers = () => <PosCashiersPage />;

export function PosReports() {
  const { L, completed, cashierName, currency } = useOutletContext();
  const byMethod = useMemo(() => {
    const m = {};
    completed.forEach((i) => (i.payments || []).forEach((p) => { m[p.payment_method] = (m[p.payment_method] || 0) + Number(p.amount || 0); }));
    return Object.entries(m).map(([name, total]) => ({ name, total: Number(total.toFixed(3)) }));
  }, [completed]);
  const byCashier = useMemo(() => {
    const m = {};
    completed.forEach((i) => { const k = cashierName(i.created_by); m[k] = (m[k] || 0) + Number(i.total || 0); });
    return Object.entries(m).map(([name, total]) => ({ name, total: Number(total.toFixed(3)) }));
  }, [completed, cashierName]);
  const topItems = useMemo(() => {
    const m = {};
    completed.forEach((i) => (i.lines || []).forEach((l) => {
      const k = l.description || l.item_id || '—';
      m[k] = m[k] || { name: k, qty: 0, total: 0 };
      m[k].qty += Number(l.quantity || 0); m[k].total += Number(l.line_total ?? l.amount ?? 0);
    }));
    return Object.values(m).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [completed]);
  const chart = (title, data) => (
    <div className="card-lg p-6">
      <h3 className="card-title mb-4">{title}</h3>
      {data.length ? (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => `${n3(v)} ${currency}`} /><Bar dataKey="total" fill="#6366f1" radius={[8, 8, 0, 0]} maxBarSize={40} /></BarChart>
        </ResponsiveContainer>
      ) : <p className="text-center text-slate-400 py-12">{L('No data', 'لا توجد بيانات')}</p>}
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        {chart(L('Sales by payment method', 'المبيعات حسب طريقة الدفع'), byMethod)}
        {chart(L('Sales by cashier', 'المبيعات حسب الكاشير'), byCashier)}
      </div>
      <div className="card-lg p-6">
        <h3 className="card-title mb-3">{L('Top selling items (by quantity)', 'الأصناف الأكثر مبيعاً (بالكمية)')}</h3>
        {topItems.length ? (
          <table className="w-full text-sm"><tbody>
            {topItems.map((r) => (
              <tr key={r.name} className="border-t border-slate-100 dark:border-navy-800">
                <td className="py-2">{r.name}</td><td className="py-2 text-end font-semibold">{r.qty.toFixed(2)}</td>
              </tr>
            ))}
          </tbody></table>
        ) : <p className="text-slate-400 text-sm">{L('No data', 'لا توجد بيانات')}</p>}
      </div>
    </div>
  );
}

export function PosSettings() {
  const { L } = useOutletContext();
  const cards = [
    { to: '/payment-methods', icon: CreditCard, tone: 'bg-sky-50 text-sky-600', en: 'Payment methods', ar: 'طرق الدفع' },
    { to: '/discount-codes', icon: Tag, tone: 'bg-pink-50 text-pink-600', en: 'Discount codes / coupons', ar: 'أكواد الخصم / الكوبونات' },
    { to: '/pos-cashiers', icon: Users, tone: 'bg-violet-50 text-violet-600', en: 'Cashiers & permissions', ar: 'الكاشير والصلاحيات' },
    { to: '/branches', icon: Building2, tone: 'bg-emerald-50 text-emerald-600', en: 'Branches', ar: 'الفروع' },
    { to: '/items', icon: Boxes, tone: 'bg-amber-50 text-amber-600', en: 'Items & prices', ar: 'الأصناف والأسعار' },
    { to: '/financial-settings', icon: Wallet, tone: 'bg-indigo-50 text-indigo-600', en: 'Financial settings', ar: 'الإعدادات المالية' },
  ];
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {cards.map((c) => (
        <Link key={c.to} to={c.to} className="card-hover p-5 flex items-center gap-4">
          <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${c.tone}`}><c.icon size={22} /></span>
          <span className="font-semibold text-navy-900 dark:text-white">{L(c.en, c.ar)}</span>
        </Link>
      ))}
    </div>
  );
}
