import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, RefreshCcw, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import { useAuthStore } from '@/store/authStore';
import PageHeader from '@/components/PageHeader';
import SlideOver from '@/components/SlideOver';

const n3 = (v) => Number(v || 0).toFixed(3);
const iso = (d) => d.toISOString().slice(0, 10);

// Warranty replacement (same item, in warranty) and exchange (another item, pay/receive the difference).
export function WarrantyClaimPanel({ open, onClose, presetInvoiceNo, onDone }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const isSuper = useAuthStore((s) => s.user?.role) === 'super_admin';
  const [invNo, setInvNo] = useState('');
  const [info, setInfo] = useState(null);
  const [lineId, setLineId] = useState('');
  const [type, setType] = useState('replacement');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [items, setItems] = useState([]);
  const [newItemId, setNewItemId] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [method, setMethod] = useState('cash');
  const [override, setOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const find = async (no) => {
    try {
      const { data } = await api.get('/warranty/lookup', { params: { invoice_no: no } });
      setInfo(data); setLineId(data.lines.find((l) => l.claimable_quantity > 0)?.id || ''); setResult(null);
    } catch { setInfo(null); }
  };
  useEffect(() => {
    if (!open) return;
    setInfo(null); setResult(null); setReason(''); setQty(1); setNewItemId(''); setNewPrice(''); setOverride(false); setType('replacement');
    api.get('/items').then((r) => setItems(r.data)).catch(() => {});
    setInvNo(presetInvoiceNo || '');
    if (presetInvoiceNo) find(presetInvoiceNo);
  }, [open, presetInvoiceNo]);

  const line = info?.lines.find((l) => l.id === lineId);
  const newItem = items.find((i) => i.id === newItemId);
  const unit = newPrice !== '' ? Number(newPrice) : Number(newItem?.selling_price || 0);
  const credit = line ? line.unit_paid * Number(qty || 0) : 0;
  const diff = type === 'exchange' ? unit * Number(qty || 0) - credit : 0;
  const outOfWarranty = line && !line.in_warranty;

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const { data } = await api.post('/warranty/claims', {
        type, invoice_line_id: lineId, quantity: Number(qty), reason: reason || undefined, override: override || undefined,
        new_item_id: type === 'exchange' ? newItemId : undefined, new_unit_price: type === 'exchange' && newPrice !== '' ? Number(newPrice) : undefined,
        settlement_method: type === 'exchange' ? method : undefined,
      });
      setResult(data); toast.success(data.claim_no); onDone?.(data);
    } finally { setSaving(false); }
  };

  return (
    <SlideOver wide open={open} onClose={onClose} title={L('Warranty replacement / exchange', 'استبدال بالضمان / تبديل صنف')} onSubmit={result ? undefined : submit} submitting={saving}>
      {result ? (
        <div className="text-center space-y-2 py-10">
          <p className="text-lg font-bold text-emerald-600">{result.claim_no}</p>
          {result.type === 'exchange' && <p className="text-sm text-slate-500">{L('Price difference', 'فرق السعر')}: <b>{n3(result.price_difference)}</b> ({Number(result.price_difference) >= 0 ? L('client paid', 'دفع العميل') : L('returned to client', 'مردود للعميل')})</p>}
          {result.type === 'replacement' && <p className="text-sm text-slate-500">{L('New unit issued from stock; the defective unit is logged as damaged.', 'صُرفت وحدة جديدة من المخزون وسُجلت المعيبة كتالفة.')}</p>}
          <button type="button" onClick={onClose} className="btn-primary mt-3">{L('Close', 'إغلاق')}</button>
        </div>
      ) : (
        <>
          <div>
            <label className="label">{L('Sales invoice no.', 'رقم فاتورة المبيعات')}</label>
            <div className="flex gap-2">
              <input className="input font-mono" placeholder="INV-000123" value={invNo} onChange={(e) => setInvNo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); find(invNo); } }} />
              <button type="button" onClick={() => find(invNo)} className="btn-ghost"><Search size={16} />{L('Find', 'بحث')}</button>
            </div>
          </div>

          {info && (
            <>
              <p className="text-sm text-slate-500">{info.invoice.invoice_no} · {info.invoice.date} · {info.invoice.client_name || '—'}</p>
              <div className="rounded-xl border border-slate-100 dark:border-navy-800 divide-y divide-slate-100 dark:divide-navy-800">
                {info.lines.map((l) => (
                  <label key={l.id} className={`flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer ${l.claimable_quantity <= 0 ? 'opacity-40' : ''}`}>
                    <input type="radio" name="line" disabled={l.claimable_quantity <= 0} checked={lineId === l.id} onChange={() => { setLineId(l.id); setQty(1); }} />
                    <span className="flex-1"><b>{l.code}</b> {isAr ? l.name_ar || l.name_en : l.name_en}<br />
                      <span className="text-xs text-slate-400">{L('Paid', 'المدفوع')} {n3(l.unit_paid)} · {L('qty', 'كمية')} {l.quantity} ({L('claimable', 'قابل للمطالبة')} {l.claimable_quantity})</span></span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${l.in_warranty ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {l.warranty_expires ? (l.in_warranty ? `${L('In warranty until', 'في الضمان حتى')} ${l.warranty_expires}` : `${L('Expired', 'انتهى')} ${l.warranty_expires}`) : L('No warranty', 'بدون ضمان')}
                    </span>
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[['replacement', ShieldCheck, L('Warranty replacement', 'استبدال بالضمان'), L('Same item, free (defective unit returned)', 'نفس الصنف مجاناً (تُرجع الوحدة المعيبة)')],
                  ['exchange', RefreshCcw, L('Exchange for another item', 'تبديل بصنف آخر'), L('Pay or receive the price difference', 'دفع أو استلام فرق السعر')]].map(([k, Icon, t1, t2]) => (
                  <button type="button" key={k} onClick={() => setType(k)} className={`text-start rounded-2xl border p-3 ${type === k ? 'border-indigo-400 bg-indigo-50 dark:bg-navy-800' : 'border-slate-100 dark:border-navy-800'}`}>
                    <Icon size={18} className={type === k ? 'text-indigo-600' : 'text-slate-400'} /><p className="text-sm font-bold mt-1.5">{t1}</p><p className="text-[11px] text-slate-400">{t2}</p>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{L('Quantity', 'الكمية')}</label><input type="number" min="1" max={line?.claimable_quantity} step="any" className="input" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
                <div><label className="label">{L('Reason', 'السبب')}</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              </div>

              {type === 'replacement' && outOfWarranty && (
                isSuper
                  ? <label className="flex items-center gap-2 text-sm text-amber-700 cursor-pointer"><input type="checkbox" className="rounded" checked={override} onChange={(e) => setOverride(e.target.checked)} />{L('Approve as an out-of-warranty exception', 'اعتماد كاستثناء خارج الضمان')}</label>
                  : <p className="text-sm text-rose-600">{L('Out of warranty — only the super admin can approve a replacement.', 'خارج الضمان — يعتمد الاستبدال المدير العام فقط.')}</p>
              )}

              {type === 'exchange' && (
                <>
                  <div><label className="label">{L('New item', 'الصنف الجديد')} *</label>
                    <select required className="input" value={newItemId} onChange={(e) => { setNewItemId(e.target.value); setNewPrice(''); }}>
                      <option value="">—</option>{items.filter((i) => i.is_active !== false).map((i) => <option key={i.id} value={i.id}>{i.code} - {isAr ? i.name_ar || i.name_en : i.name_en} ({n3(i.selling_price)})</option>)}
                    </select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">{L('New item price (per unit)', 'سعر الصنف الجديد (للوحدة)')}</label><input type="number" step="0.001" min="0" className="input" value={newPrice} placeholder={newItem ? n3(newItem.selling_price) : ''} onChange={(e) => setNewPrice(e.target.value)} /></div>
                    <div><label className="label">{L('Settle difference by', 'تسوية الفرق عبر')}</label>
                      <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">{L('Cash', 'نقداً')}</option><option value="knet">KNET</option><option value="credit">{L('Client account', 'حساب العميل')}</option></select></div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-navy-800/50 px-4 py-3 text-sm space-y-1">
                    <div className="flex justify-between"><span>{L('Credit for returned item', 'قيمة الصنف المُرجَع')}</span><b>{n3(credit)}</b></div>
                    <div className="flex justify-between"><span>{L('New item', 'الصنف الجديد')}</span><b>{n3(unit * Number(qty || 0))}</b></div>
                    <div className="flex justify-between border-t border-slate-200 dark:border-navy-700 pt-1"><span>{diff >= 0 ? L('Client pays', 'يدفع العميل') : L('Refund to client', 'يُردّ للعميل')}</span><b className={diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{n3(Math.abs(diff))}</b></div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </SlideOver>
  );
}

export default function WarrantyPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [from, setFrom] = useState(() => iso(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);

  const load = () => api.get('/warranty/claims', { params: { from, to } }).then((r) => setRows(r.data)).catch(() => setRows([]));
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, from, to]);
  const nm = (i) => (i ? (isAr ? i.name_ar || i.name_en : i.name_en) : '—');

  return (
    <div>
      <PageHeader
        title={L('Warranty & exchange', 'الضمان والتبديل')}
        subtitle={L('Replace a defective item under warranty, or exchange it for another and settle the difference', 'استبدال صنف معيب بالضمان أو تبديله بصنف آخر مع تسوية الفرق')}
        actions={<button onClick={() => setOpen(true)} className="btn-primary"><Plus size={16} />{L('New claim', 'مطالبة جديدة')}</button>}
      />
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div><label className="label">{L('From', 'من')}</label><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">{L('To', 'إلى')}</label><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 dark:bg-navy-900 text-[11px] uppercase tracking-wide text-slate-500">
            {[L('Claim', 'المطالبة'), L('Type', 'النوع'), L('Date', 'التاريخ'), L('Invoice', 'الفاتورة'), L('Returned item', 'الصنف المُرجَع'), L('Qty', 'الكمية'), L('New item', 'الصنف الجديد'), L('Difference', 'الفرق'), L('Warranty', 'الضمان'), L('Reason', 'السبب')].map((h) => <th key={h} className="px-3 py-2.5 text-start whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">{L('No claims in this period.', 'لا مطالبات في هذه الفترة.')}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-navy-800">
                <td className="px-3 py-2 font-semibold">{r.claim_no}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.type === 'exchange' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600'}`}>{r.type === 'exchange' ? L('Exchange', 'تبديل') : L('Replacement', 'استبدال')}</span></td>
                <td className="px-3 py-2 whitespace-nowrap">{String(r.createdAt || r.created_at).slice(0, 10)}</td>
                <td className="px-3 py-2"><a className="text-indigo-600 hover:underline" href={`/invoices/${r.invoice_id}`}>{r.invoice_no}</a>{r.new_invoice_no && <> → <a className="text-indigo-600 hover:underline" href={`/invoices/${r.new_invoice_id}`}>{r.new_invoice_no}</a></>}</td>
                <td className="px-3 py-2">{nm(r.item)}</td>
                <td className="px-3 py-2 tabular-nums">{Number(r.quantity)}</td>
                <td className="px-3 py-2">{r.type === 'exchange' ? nm(r.new_item) : '—'}</td>
                <td className="px-3 py-2 tabular-nums">{r.type === 'exchange' ? n3(r.price_difference) : '—'}</td>
                <td className="px-3 py-2 text-xs">{r.in_warranty ? L('In warranty', 'في الضمان') : r.warranty_override ? <span className="text-amber-600 font-semibold">{L('Exception', 'استثناء')}</span> : L('Out', 'خارج')}</td>
                <td className="px-3 py-2 max-w-[200px] truncate">{r.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <WarrantyClaimPanel open={open} onClose={() => setOpen(false)} onDone={() => load()} />
    </div>
  );
}
