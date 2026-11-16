import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, Truck, FileText, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { printInvoiceById } from '@/utils/printInvoice';
import { Link } from 'react-router-dom';
import api, { printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';

export default function DeliverySchedulePage() {
  const { t, i18n } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('all');

  const params = () => ({
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    ...(status !== 'all' ? { status } : {}),
  });

  const load = () => {
    setLoading(true);
    api.get('/invoices/delivery-schedule', { params: params() }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const L = (en, ar) => (i18n.language?.startsWith('ar') ? ar : en);
  // Delivery-note dialog: shows each item's ordered / delivered / still-to-deliver quantity.
  const [dn, setDn] = useState(null); // { row, data, qty }
  const openNote = async (r) => {
    const { data } = await api.get(`/invoices/${r.id}/delivery-lines`);
    const qty = {};
    data.lines.forEach((l) => { qty[l.id] = l.remaining; });
    setDn({ row: r, data, qty, from: '' });
  };
  const chosen = () => Object.fromEntries(Object.entries(dn.qty).map(([k, v]) => [k, Number(v) || 0]));
  // Booked lines are issued from the chosen store: warn (and block) when that store lacks stock.
  const storeName = () => { const st = dn.data.stores?.find((x) => x.id === dn.from); return (i18n.language?.startsWith('ar') ? st?.name_ar : st?.name_en) || L('Main store', 'المخزن الرئيسي'); };
  const shortages = () => {
    const need = {};
    dn.data.lines.forEach((l) => { if (l.is_booked && l.item_id) need[l.item_id] = (need[l.item_id] || 0) + Number(dn.qty[l.id] || 0); });
    const out = [];
    dn.data.lines.forEach((l) => {
      if (!l.is_booked || !l.stock || out.some((m) => m.includes(l.description))) return;
      const have = Number(l.stock[dn.from] || 0); const want = need[l.item_id] || 0;
      if (want > have + 0.0005) out.push(L(`Not enough stock in ${storeName()} for "${l.description}": have ${have}, need ${want}`, `لا يوجد مخزون كافٍ في ${storeName()} للصنف "${l.description}": المتوفر ${have}، المطلوب ${want}`));
    });
    return out;
  };
  const printNote = async () => {
    await api.post(`/invoices/${dn.row.id}/delivery-note`);
    await printInvoiceById(dn.row.id, { deliveryNote: true, quantities: chosen() });
    load();
  };
  const confirmDeliver = async () => {
    const lines = Object.entries(chosen()).map(([line_id, quantity]) => ({ line_id, quantity }));
    if (shortages().length) return toast.error(shortages()[0]);
    if (!lines.some((l) => l.quantity > 0)) return toast.error(L('Enter a quantity to deliver', 'أدخل كمية للتسليم'));
    await api.post(`/invoices/${dn.row.id}/delivery/deliver`, { lines, branch_id: dn.from || null });
    toast.success(L('Delivery recorded', 'تم تسجيل التسليم'));
    setDn(null); load();
  };
  const cancelRest = async () => {
    if (!window.confirm(L('Cancel what is not delivered yet? Booked items return to available stock.', 'إلغاء ما لم يُسلَّم بعد؟ ستعود الأصناف المحجوزة إلى المتاح.'))) return;
    await api.post(`/invoices/${dn.row.id}/delivery/cancel`, {});
    toast.success(L('Remaining cancelled', 'تم إلغاء المتبقي'));
    setDn(null); load();
  };

  const print = () => printFile('/invoices/delivery-schedule/pdf', params());

  const columns = [
    { key: 'delivery_date', label: t('invoices.deliveryDate'), render: (r) => r.delivery_date },
    { key: 'invoice_no', label: t('invoices.invoiceNo'), render: (r) => <Link to={`/invoices/${r.id}`} className="text-blue-500 hover:underline font-medium">{r.invoice_no}</Link> },
    { key: 'client', label: t('common.client'), render: (r) => r.client?.name_en || '—' },
    { key: 'phone', label: t('common.phone'), render: (r) => r.client?.phone || '—' },
    { key: 'address', label: t('invoices.deliveryAddress'), render: (r) => <span className="whitespace-normal">{r.delivery_address || r.client?.address || '—'}</span> },
    { key: 'branch', label: t('common.branch'), render: (r) => r.branch ? `${r.branch.code} - ${r.branch.name_en}` : '—' },
    { key: 'total', label: t('common.total'), render: (r) => Number(r.total).toFixed(3) },
    { key: 'status', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
        r.status === 'cancelled' ? 'bg-slate-100 text-slate-400' : r.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
      }`}>
        {t(`invoices.status.${r.status}`)}
      </span>
    ) },
    { key: 'delivery', label: L('Delivery', 'التسليم'), render: (r) => {
      if (r.delivery_status === 'delivered') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600">{L('Delivered', 'تم التسليم')}</span>;
      if (r.delivery_status === 'cancelled') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">{L('Delivery cancelled', 'ملغي')}</span>;
      if (r.status === 'cancelled' || r.status === 'draft') return <span className="text-slate-300">—</span>;
      return (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          {r.delivery_status === 'partial' && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-600">{L('Partial', 'جزئي')}</span>}
          <button onClick={() => openNote(r)} className="px-2 py-1 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 inline-flex items-center gap-1"><FileText size={13} />{L('Delivery note', 'إذن تسليم')}</button>
        </div>
      );
    } },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.deliverySchedule')}
        actions={<button onClick={print} className="btn-ghost flex items-center gap-1.5"><Printer size={16} />{t('common.print')}</button>}
      />
      <p className="text-sm text-slate-500 mb-3 max-w-2xl flex items-center gap-1.5"><Truck size={14} className="shrink-0" />{t('deliverySchedule.pageHint')}</p>

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label className="label">{t('common.from')}</label>
          <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('common.to')}</label>
          <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('common.status')}</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            <option value="draft">{t('invoices.status.draft')}</option>
            <option value="posted">{t('invoices.status.posted')}</option>
            <option value="partially_paid">{t('invoices.status.partially_paid')}</option>
            <option value="paid">{t('invoices.status.paid')}</option>
            <option value="cancelled">{t('invoices.status.cancelled')}</option>
          </select>
        </div>
        <button onClick={load} className="btn-primary">{t('common.applyFilters')}</button>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} pageSize={25} />
      {dn && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setDn(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="card p-0 w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col pointer-events-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-800">
                <p className="font-bold text-lg flex items-center gap-2"><FileText size={18} className="text-red-600" />{L('Delivery note', 'إذن تسليم')} <span className="text-red-600 font-semibold text-sm">· {dn.data.invoice_no}</span></p>
                <button onClick={() => setDn(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
              </div>
              <div className="overflow-y-auto p-5 space-y-3">
                <div className="rounded-xl border border-slate-100 dark:border-navy-800 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 dark:bg-navy-900 text-[11px] uppercase tracking-wide text-slate-500">
                      {[L('Item', 'الصنف'), L('Ordered', 'المطلوب'), L('Delivered', 'سُلِّم'), L('Not delivered', 'لم يُسلَّم'), L('Deliver now', 'تسليم الآن')].map((h) => <th key={h} className="px-3 py-2 text-start whitespace-nowrap">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {dn.data.lines.map((l) => (
                        <tr key={l.id} className="border-t border-slate-100 dark:border-navy-800">
                          <td className="px-3 py-2">{l.description}{l.is_booked && <span className="ms-2 text-[10px] text-amber-600">{L('booked', 'محجوز')}</span>}</td>
                          <td className="px-3 py-2 tabular-nums">{l.ordered}</td>
                          <td className="px-3 py-2 tabular-nums text-emerald-600">{l.delivered}</td>
                          <td className={`px-3 py-2 tabular-nums font-semibold ${l.remaining > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{l.remaining}</td>
                          <td className="px-3 py-2">
                            <input type="number" min="0" max={l.remaining} step="any" disabled={l.remaining <= 0} className="input !py-1 !w-24" value={dn.qty[l.id] ?? ''}
                              onChange={(e) => setDn({ ...dn, qty: { ...dn.qty, [l.id]: Math.min(l.remaining, Math.max(0, Number(e.target.value))) } })} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-xl border border-slate-100 dark:border-navy-800 p-3">
                  <label className="label">{L('Deliver from (stock is deducted from this store)', 'التسليم من (يُخصم المخزون من هذا المخزن)')}</label>
                  <select className="input" value={dn.from} onChange={(e) => setDn({ ...dn, from: e.target.value })}>
                    {(dn.data.stores || []).map((st) => <option key={st.id} value={st.id}>{i18n.language?.startsWith('ar') ? st.name_ar || st.name_en : st.name_en}</option>)}
                  </select>
                  {shortages().map((m) => <p key={m} className="mt-2 text-sm font-semibold text-rose-600">⚠ {m}</p>)}
                  {dn.data.lines.some((l) => l.is_booked && l.stock) && !shortages().length && <p className="mt-2 text-xs text-emerald-600">{L('Stock is available in this store.', 'المخزون متاح في هذا المخزن.')}</p>}
                </div>
                <p className="text-xs text-slate-400">{L('Print the note with the quantities you are handing over now. Anything not delivered stays booked until you deliver it or cancel it.', 'اطبع الإذن بالكميات التي تسلّمها الآن. ما لم يُسلَّم يبقى محجوزاً حتى تسلّمه أو تلغيه.')}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-navy-800">
                <button onClick={cancelRest} className="btn-ghost !text-rose-600"><X size={15} />{L('Cancel remaining', 'إلغاء المتبقي')}</button>
                <button onClick={printNote} className="btn-ghost"><Printer size={15} />{L('Print note', 'طباعة الإذن')}</button>
                <button onClick={confirmDeliver} disabled={shortages().length > 0} className="btn-primary disabled:opacity-40"><Check size={15} />{L('Confirm delivered', 'تأكيد التسليم')}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
