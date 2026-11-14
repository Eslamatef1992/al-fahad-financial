import { useCallback, useEffect, useMemo, useState } from 'react';
import { printInvoiceById } from '@/utils/printInvoice';
import { mfgDetailParts } from '@/utils/mfgDetails';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { Factory, Wallet, Hammer, TrendingUp, Paperclip, FileText, ExternalLink, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fileUrl, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import usePermissions from '@/hooks/usePermissions';
import StatCard from '@/components/StatCard';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';

const n3 = (v) => Number(v || 0).toFixed(3);
export const MFG_STATUSES = ['ordered', 'in_production', 'ready', 'delivered'];
const STATUS_STYLE = {
  ordered: 'bg-slate-100 text-slate-600', in_production: 'bg-amber-50 text-amber-600',
  ready: 'bg-sky-50 text-sky-600', delivered: 'bg-emerald-50 text-emerald-600',
};

// Shared by the POS back-office and the Accounting module (both provide the same
// outlet context: from / to / branchId / L / isAr / currency).
export default function ManufactureOrdersPage() {
  const { L, isAr, currency, from, to, branchId } = useOutletContext();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manufacturers, setManufacturers] = useState([]);
  const [filterMfr, setFilterMfr] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ manufacture_cost: '', manufacture_status: 'ordered', manufacture_notes: '', manufacturer_id: '' });
  const [saving, setSaving] = useState(false);

  const statusLabel = {
    ordered: L('Ordered', 'تم الطلب'), in_production: L('In production', 'قيد التصنيع'),
    ready: L('Ready', 'جاهز'), delivered: L('Delivered', 'تم التسليم'),
  };

  const load = useCallback(() => {
    if (!activeCompany) return;
    setLoading(true);
    api.get('/manufacture-orders', {
      params: { from, to, ...(branchId ? { branch_id: branchId } : {}), ...(filterMfr ? { manufacturer_id: filterMfr } : {}), ...(filterStatus ? { status: filterStatus } : {}) },
    }).then((r) => { setRows(r.data.rows); setTotals(r.data.totals); })
      .catch(() => { setRows([]); setTotals(null); })
      .finally(() => setLoading(false));
  }, [activeCompany, from, to, branchId, filterMfr, filterStatus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (activeCompany) api.get('/manufacturers').then((r) => setManufacturers(r.data)).catch(() => setManufacturers([]));
  }, [activeCompany]);

  // Deep link from an invoice: ?open=<invoiceId>
  useEffect(() => { const id = params.get('open'); if (id) setOpenId(id); }, [params]);

  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    api.get(`/manufacture-orders/${openId}`).then((r) => {
      setDetail(r.data);
      const o = r.data.order;
      setForm({ manufacture_cost: o.manufacture_cost || '', manufacture_status: o.manufacture_status, manufacture_notes: o.manufacture_notes || '', manufacturer_id: o.manufacturer_id || '' });
    }).catch(() => setOpenId(null));
  }, [openId]);

  const closeDetail = () => { setOpenId(null); if (params.get('open')) { params.delete('open'); setParams(params, { replace: true }); } };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/manufacture-orders/${openId}`, { ...form, manufacture_cost: Number(form.manufacture_cost || 0) });
      toast.success(L('Saved', 'تم الحفظ'));
      load();
      const r = await api.get(`/manufacture-orders/${openId}`);
      setDetail(r.data);
    } finally { setSaving(false); }
  };

  const mfrName = (m) => (m ? (isAr ? m.name_ar || m.name_en : m.name_en) : '—');
  const profitCls = (v) => (Number(v) < 0 ? 'text-rose-600' : 'text-emerald-600');

  const columns = useMemo(() => [
    { key: 'invoice_no', label: L('Invoice #', 'رقم الفاتورة'), render: (r) => <span className="font-semibold text-indigo-600">{r.invoice_no}</span> },
    { key: 'date', label: L('Date', 'التاريخ') },
    { key: 'branch', label: L('Branch', 'الفرع'), accessor: (r) => r.branch?.name_en, render: (r) => (r.branch ? (isAr ? r.branch.name_ar : r.branch.name_en) : '—') },
    { key: 'client', label: L('Customer', 'العميل'), accessor: (r) => r.client?.name_en, render: (r) => (r.client ? (isAr ? r.client.name_ar || r.client.name_en : r.client.name_en) : '—') },
    { key: 'manufacturer', label: L('Manufacturer', 'المصنّع'), accessor: (r) => r.manufacturer?.name_en, render: (r) => mfrName(r.manufacturer) },
    { key: 'manufacture_status', label: L('Status', 'الحالة'), accessor: (r) => r.manufacture_status, render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[r.manufacture_status]}`}>{statusLabel[r.manufacture_status]}</span>
    ) },
    { key: 'revenue', label: L('Sales', 'المبيعات'), render: (r) => n3(r.revenue) },
    { key: 'stock_cost', label: L('Stock cost', 'تكلفة المخزون'), render: (r) => n3(r.stock_cost) },
    { key: 'manufacture_cost', label: L('Mfr cost', 'تكلفة التصنيع'), render: (r) => n3(r.manufacture_cost) },
    { key: 'profit', label: L('Profit', 'الربح'), render: (r) => <span className={`font-bold ${profitCls(r.profit)}`}>{n3(r.profit)}</span> },
    { key: 'margin_pct', label: '%', render: (r) => (r.margin_pct == null ? '—' : `${r.margin_pct.toFixed(1)}%`) },
    { key: 'attachments', label: '', render: (r) => (r.attachments?.length ? <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Paperclip size={12} />{r.attachments.length}</span> : null) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [isAr, L]);

  const o = detail?.order;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard variant="tile" tone="purple" icon={Factory} label={L('Manufacture orders', 'طلبات التصنيع')} value={totals?.count ?? 0} />
        <StatCard variant="tile" tone="blue" icon={Wallet} label={L('Sales', 'المبيعات')} value={n3(totals?.revenue)} unit={currency} />
        <StatCard variant="tile" tone="gold" icon={Hammer} label={L('Total cost', 'إجمالي التكلفة')} value={n3(totals?.total_cost)} unit={`${currency} · ${L('stock', 'مخزون')} ${n3(totals?.stock_cost)} + ${L('mfr', 'تصنيع')} ${n3(totals?.manufacture_cost)}`} />
        <StatCard variant="tile" tone={Number(totals?.profit) < 0 ? 'red' : 'green'} icon={TrendingUp} label={L('Profit', 'الربح')} value={n3(totals?.profit)} unit={`${currency}${totals?.margin_pct != null ? ` · ${totals.margin_pct.toFixed(1)}%` : ''}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input !py-2 !w-auto text-sm" value={filterMfr} onChange={(e) => setFilterMfr(e.target.value)}>
          <option value="">{L('All manufacturers', 'كل المصنّعين')}</option>
          {manufacturers.map((m) => <option key={m.id} value={m.id}>{mfrName(m)}</option>)}
        </select>
        <select className="input !py-2 !w-auto text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">{L('All statuses', 'كل الحالات')}</option>
          {MFG_STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
        </select>
        <p className="text-xs text-slate-400">{L('Profit = sales (after discounts) − stock cost − manufacturer cost. Click a row for the full breakdown.', 'الربح = المبيعات (بعد الخصم) − تكلفة المخزون − تكلفة المصنّع. اضغط على صف لعرض التفاصيل.')}</p>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} pageSize={25} onRowClick={(r) => setOpenId(r.id)} />

      <SlideOver wide open={!!openId} onClose={closeDetail} title={o ? `${L('Manufacture order', 'طلب تصنيع')} ${o.invoice_no}` : '…'} onSubmit={canCreateEdit ? save : undefined} submitting={saving}>
        {o && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link to={`/invoices/${o.id}`} className="btn-ghost !py-1.5"><ExternalLink size={14} />{L('Open invoice', 'فتح الفاتورة')}</Link>
              <button type="button" onClick={() => printInvoiceById(o.id)} className="btn-ghost !py-1.5"><Printer size={14} />{L('Print', 'طباعة')}</button>
              {o.client && <Link to="/clients" className="text-xs text-slate-400 hover:underline">{L('Customer', 'العميل')}: {isAr ? o.client.name_ar || o.client.name_en : o.client.name_en}{o.client.phone ? ` · ${o.client.phone}` : ''}</Link>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                [L('Sales', 'المبيعات'), n3(o.revenue), ''],
                [L('Stock cost', 'تكلفة المخزون'), n3(o.stock_cost), ''],
                [L('Mfr cost', 'تكلفة المصنّع'), n3(o.manufacture_cost), ''],
                [L('Profit', 'الربح'), n3(o.profit), profitCls(o.profit)],
              ].map(([label, val, cls]) => (
                <div key={label} className="rounded-2xl bg-slate-50 dark:bg-navy-800/50 p-3">
                  <p className="text-[11px] font-semibold text-slate-500">{label}</p>
                  <p className={`text-lg font-extrabold ${cls || 'text-navy-900 dark:text-white'}`}>{val}</p>
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-400">{L('Branch', 'الفرع')}: </span>{o.branch ? (isAr ? o.branch.name_ar : o.branch.name_en) : '—'}</div>
              <div><span className="text-slate-400">{L('Cashier', 'الكاشير')}: </span>{o.cashier || '—'}</div>
              <div><span className="text-slate-400">{L('Date', 'التاريخ')}: </span>{o.date}</div>
              <div><span className="text-slate-400">{L('Delivery', 'التسليم')}: </span>{o.delivery_date || '—'}</div>
              <div><span className="text-slate-400">{L('Paid', 'المدفوع')}: </span>{n3(o.paid_total)} / {n3(o.total)}</div>
              <div><span className="text-slate-400">{L('Margin', 'الهامش')}: </span>{o.margin_pct == null ? '—' : `${o.margin_pct.toFixed(1)}%`}</div>
              {detail.delivery_address && <div className="sm:col-span-2"><span className="text-slate-400">{L('Address', 'العنوان')}: </span>{detail.delivery_address}</div>}
              {detail.notes && <div className="sm:col-span-2"><span className="text-slate-400">{L('Invoice notes', 'ملاحظات الفاتورة')}: </span>{detail.notes}</div>}
            </div>

            <div className="rounded-2xl border border-slate-100 dark:border-navy-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 dark:bg-navy-800/50 text-xs text-slate-500">
                  {[L('Item', 'الصنف'), L('Qty', 'الكمية'), L('Price', 'السعر'), L('Sales', 'المبيعات'), L('Stock cost', 'التكلفة'), L('Profit', 'الربح')].map((h) => <th key={h} className="px-3 py-2 text-start font-semibold whitespace-nowrap">{h}</th>)}
                </tr></thead>
                <tbody>
                  {detail.lines.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100 dark:border-navy-800">
                      <td className="px-3 py-2">{l.description}{mfgDetailParts(l.mfg_details, isAr).length > 0 && <div className="text-[11px] text-amber-600">{mfgDetailParts(l.mfg_details, isAr).join(' · ')}</div>}{l.is_booked && <span className="ms-2 text-[10px] text-amber-600">({L('booked', 'محجوز')} {l.delivery_date || ''})</span>}</td>
                      <td className="px-3 py-2">{l.quantity}</td><td className="px-3 py-2">{n3(l.unit_price)}</td>
                      <td className="px-3 py-2">{n3(l.revenue)}</td><td className="px-3 py-2">{n3(l.cost)}</td>
                      <td className={`px-3 py-2 font-semibold ${profitCls(l.profit)}`}>{n3(l.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detail.payments.length > 0 && (
              <div>
                <p className="label">{L('Payments', 'المدفوعات')}</p>
                <div className="rounded-2xl border border-slate-100 dark:border-navy-800 divide-y divide-slate-100 dark:divide-navy-800">
                  {detail.payments.map((p) => (
                    <div key={p.id} className="flex justify-between px-4 py-2 text-sm"><span className="text-slate-500">{p.date} · <span className="capitalize">{p.payment_method}</span>{p.reference ? ` · ${p.reference}` : ''}</span><span className="font-semibold">{n3(p.amount)}</span></div>
                  ))}
                </div>
              </div>
            )}

            {o.attachments.length > 0 && (
              <div>
                <p className="label flex items-center gap-1.5"><Paperclip size={12} />{L('Attachments', 'المرفقات')}</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {o.attachments.map((a) => (
                    <a key={a.url} href={fileUrl(a.url)} target="_blank" rel="noreferrer" className="aspect-square rounded-xl overflow-hidden border border-slate-100 dark:border-navy-800 flex items-center justify-center bg-slate-50">
                      {/\.pdf$/i.test(a.url) ? <FileText size={22} className="text-slate-400" /> : <img src={fileUrl(a.url)} alt="" className="w-full h-full object-cover" />}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-navy-800 pt-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{L('Manufacturing details', 'بيانات التصنيع')}</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">{L('Manufacturer', 'المصنّع')}</label>
                  <select className="input" disabled={!canCreateEdit} value={form.manufacturer_id} onChange={(e) => setForm({ ...form, manufacturer_id: e.target.value })}>
                    <option value="">—</option>{manufacturers.map((m) => <option key={m.id} value={m.id}>{mfrName(m)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">{L('Status', 'الحالة')}</label>
                  <select className="input" disabled={!canCreateEdit} value={form.manufacture_status} onChange={(e) => setForm({ ...form, manufacture_status: e.target.value })}>
                    {MFG_STATUSES.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">{L('Manufacturer cost', 'تكلفة المصنّع')} ({currency})</label>
                  <input type="number" step="0.001" min="0" className="input" disabled={!canCreateEdit} value={form.manufacture_cost} onChange={(e) => setForm({ ...form, manufacture_cost: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">{L('Notes', 'ملاحظات')}</label>
                  <textarea rows={2} className="input" disabled={!canCreateEdit} value={form.manufacture_notes} onChange={(e) => setForm({ ...form, manufacture_notes: e.target.value })} />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">{L('Manufacturer cost is a management figure used for profit analysis; it is not posted to the ledger.', 'تكلفة المصنّع رقم إداري لتحليل الربح ولا تُرحّل إلى دفتر الأستاذ.')}</p>
            </div>
          </>
        )}
      </SlideOver>
    </div>
  );
}
