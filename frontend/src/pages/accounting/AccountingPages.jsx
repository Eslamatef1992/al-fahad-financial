import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Wallet, ArrowDownToLine, ArrowUpFromLine, Ticket, CreditCard, Settings2, Landmark, Building2, Plus,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import api from '@/api/client';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';
import usePermissions from '@/hooks/usePermissions';
import { useCompanyStore } from '@/store/companyStore';

const n3 = (v) => Number(v || 0).toFixed(3);
const sum = (rows, k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
const STATUS = { draft: 'bg-slate-100 text-slate-500', posted: 'bg-emerald-50 text-emerald-600', cancelled: 'bg-rose-50 text-rose-600' };

function useVouchers(type) {
  const { from, to, branchId } = useOutletContext();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    api.get('/vouchers', { params: { ...(type ? { type } : {}), from, to, ...(branchId ? { branch_id: branchId } : {}) } })
      .then((r) => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }, [activeCompany, type, from, to, branchId]);
  return { rows, loading };
}

function VoucherList({ type, newType, summaryLabel }) {
  const { L, currency } = useOutletContext();
  const navigate = useNavigate();
  const { canCreateEdit } = usePermissions();
  const { rows, loading } = useVouchers(type);
  const valid = rows.filter((r) => r.status !== 'cancelled');
  const columns = [
    { key: 'voucher_no', label: L('Voucher #', 'رقم السند') },
    { key: 'date', label: L('Date', 'التاريخ') },
    { key: 'description', label: L('Description', 'الوصف'), render: (r) => <span className="line-clamp-1 max-w-xs">{r.description || '—'}</span> },
    { key: 'branch', label: L('Branch', 'الفرع'), accessor: (r) => r.branch?.name_en, render: (r) => r.branch?.name_en || '—' },
    { key: 'total_debit', label: L('Amount', 'المبلغ'), render: (r) => <span className="font-semibold">{n3(r.total_debit)}</span> },
    { key: 'status', label: L('Status', 'الحالة'), accessor: (r) => r.status, render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS[r.status]}`}>{r.status}</span>
    ) },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="card px-4 py-3 text-sm">
          {summaryLabel}: <span className="font-extrabold text-indigo-600 text-lg ms-1">{n3(sum(valid, 'total_debit'))}</span> <span className="text-slate-400">{currency}</span>
          <span className="text-slate-400 ms-3">({valid.length})</span>
        </div>
        {canCreateEdit && (
          <button className="btn-primary" onClick={() => navigate(`/vouchers/new?type=${newType}`)}><Plus size={16} />{L('New voucher', 'سند جديد')}</button>
        )}
      </div>
      <DataTable columns={columns} data={rows} loading={loading} pageSize={25} onRowClick={(r) => navigate(`/vouchers/${r.id}`)} />
    </div>
  );
}

export function AccIncome() { const { L } = useOutletContext(); return <VoucherList type="receipt" newType="receipt" summaryLabel={L('Total income received', 'إجمالي الإيرادات المستلمة')} />; }
export function AccExpense() { const { L } = useOutletContext(); return <VoucherList type="payment" newType="payment" summaryLabel={L('Total expenses paid', 'إجمالي المصروفات المدفوعة')} />; }
export function AccJournal() { const { L } = useOutletContext(); return <VoucherList type="journal" newType="journal" summaryLabel={L('Total journal entries', 'إجمالي قيود اليومية')} />; }

export function AccOnline() {
  const { L, from, to, currency } = useOutletContext();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    api.get('/invoices/payments', { params: { from, to, online: 'true' } })
      .then((r) => setRows(r.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }, [activeCompany, from, to]);
  const columns = [
    { key: 'date', label: L('Date', 'التاريخ') },
    { key: 'invoice', label: L('Invoice #', 'رقم الفاتورة'), accessor: (r) => r.Invoice?.invoice_no, render: (r) => r.Invoice ? <Link className="text-indigo-600 hover:underline" to={`/invoices/${r.Invoice.id}`}>{r.Invoice.invoice_no}</Link> : '—' },
    { key: 'type', label: L('Type', 'النوع'), accessor: (r) => r.Invoice?.type, render: (r) => <span className="capitalize">{r.Invoice?.type === 'purchase' ? L('Purchase', 'مشتريات') : L('Sales', 'مبيعات')}</span> },
    { key: 'payment_method', label: L('Method', 'الطريقة'), render: (r) => <span className="capitalize">{r.payment_method}</span> },
    { key: 'reference', label: L('Reference', 'المرجع'), render: (r) => r.reference || '—' },
    { key: 'amount', label: L('Amount', 'المبلغ'), render: (r) => <span className="font-semibold">{n3(r.amount)}</span> },
  ];
  return (
    <div className="space-y-4">
      <div className="card px-4 py-3 text-sm w-fit">
        {L('Total electronic payments', 'إجمالي المدفوعات الإلكترونية')}: <span className="font-extrabold text-indigo-600 text-lg ms-1">{n3(sum(rows, 'amount'))}</span> <span className="text-slate-400">{currency}</span>
      </div>
      <p className="text-xs text-slate-400">{L('Every payment that was not cash or on-account credit (Knet, cards, bank transfer, …).', 'كل دفعة لم تكن نقداً أو آجلة (كي نت، بطاقات، تحويل بنكي، …).')}</p>
      <DataTable columns={columns} data={rows} loading={loading} pageSize={25} />
    </div>
  );
}

export function AccDashboard() {
  const { L, from, to, branchId, currency } = useOutletContext();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { rows: vouchers } = useVouchers('');
  const [pnl, setPnl] = useState(null);
  useEffect(() => {
    if (!activeCompany) return;
    api.get('/reports/profit-and-loss', { params: { from, to, ...(branchId ? { branch_id: branchId } : {}) } })
      .then((r) => setPnl(r.data)).catch(() => setPnl(null));
  }, [activeCompany, from, to, branchId]);

  const posted = vouchers.filter((v) => v.status === 'posted');
  const receipts = posted.filter((v) => v.voucher_type === 'receipt');
  const payments = posted.filter((v) => v.voucher_type === 'payment');
  const byMonth = useMemo(() => {
    const m = {};
    posted.forEach((v) => {
      const k = String(v.date).slice(0, 7);
      m[k] = m[k] || { month: k, receipts: 0, payments: 0 };
      if (v.voucher_type === 'receipt') m[k].receipts += Number(v.total_debit);
      if (v.voucher_type === 'payment') m[k].payments += Number(v.total_debit);
    });
    return Object.values(m).sort((a, b) => a.month.localeCompare(b.month));
  }, [posted]);
  const net = pnl?.net_profit;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard variant="tile" tone="green" icon={TrendingUp} label={L('Total revenue', 'إجمالي الإيرادات')} value={n3(pnl?.total_revenue)} unit={currency} />
        <StatCard variant="tile" tone="red" icon={TrendingDown} label={L('Total expenses', 'إجمالي المصروفات')} value={n3(pnl?.total_expense)} unit={currency} />
        <StatCard variant="tile" tone={net < 0 ? 'red' : 'purple'} icon={Wallet} label={L('Net profit', 'صافي الربح')} value={net == null ? '—' : n3(net)} unit={currency} />
        <StatCard variant="tile" tone="blue" icon={Ticket} label={L('Posted vouchers', 'السندات المرحلة')} value={posted.length} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard tone="green" icon={ArrowDownToLine} label={L('Receipts', 'المقبوضات')} value={n3(sum(receipts, 'total_debit'))} />
        <StatCard tone="gold" icon={ArrowUpFromLine} label={L('Payments', 'المدفوعات')} value={n3(sum(payments, 'total_debit'))} />
        <StatCard tone="navy" icon={Ticket} label={L('Draft vouchers', 'سندات مسودة')} value={vouchers.filter((v) => v.status === 'draft').length} />
        <StatCard tone="pink" icon={CreditCard} label={L('Cancelled', 'ملغاة')} value={vouchers.filter((v) => v.status === 'cancelled').length} />
      </div>
      <div className="card-lg p-6">
        <h3 className="card-title mb-4">{L('Receipts vs payments by month', 'المقبوضات مقابل المدفوعات شهرياً')}</h3>
        {byMonth.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byMonth} barGap={6}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} /><Tooltip formatter={(v) => n3(v)} /><Legend />
              <Bar dataKey="receipts" name={L('Receipts', 'المقبوضات')} fill="#10b981" radius={[8, 8, 0, 0]} maxBarSize={24} />
              <Bar dataKey="payments" name={L('Payments', 'المدفوعات')} fill="#f59e0b" radius={[8, 8, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-center text-slate-400 py-12">{L('No data', 'لا توجد بيانات')}</p>}
      </div>
    </div>
  );
}

export function AccSettings() {
  const { L } = useOutletContext();
  const cards = [
    { to: '/financial-settings', icon: Settings2, tone: 'bg-indigo-50 text-indigo-600', en: 'Financial settings', ar: 'الإعدادات المالية' },
    { to: '/payment-methods', icon: CreditCard, tone: 'bg-sky-50 text-sky-600', en: 'Payment methods', ar: 'طرق الدفع' },
    { to: '/cost-centers', icon: Landmark, tone: 'bg-amber-50 text-amber-600', en: 'Cost centers', ar: 'مراكز التكلفة' },
    { to: '/cash-control', icon: Wallet, tone: 'bg-emerald-50 text-emerald-600', en: 'Cash control', ar: 'الرقابة على النقدية' },
    { to: '/ledger', icon: Ticket, tone: 'bg-violet-50 text-violet-600', en: 'General ledger', ar: 'دفتر الأستاذ' },
    { to: '/branches', icon: Building2, tone: 'bg-pink-50 text-pink-600', en: 'Branches', ar: 'الفروع' },
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
