import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Undo2, X, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { printCreditNote } from '@/utils/printCreditNote';

const n3 = (v) => Number(v || 0).toFixed(3);

// Partial return / refund dialog for any posted sales invoice (back-office or POS).
// The operator picks how many of each line come back, whether the goods go back to
// sellable stock or are written off as damaged, and how the customer is repaid.
export default function ReturnModal({ invoiceId, onClose, onDone }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const [info, setInfo] = useState(null);
  const [sel, setSel] = useState({}); // lineId -> { quantity, disposition }
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('cash');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!invoiceId) return;
    setInfo(null); setSel({}); setDone(null); setReason('');
    api.get(`/sales-returns/for-invoice/${invoiceId}`).then((r) => setInfo(r.data)).catch(() => onClose());
  }, [invoiceId]);

  const setLine = (id, patch) => setSel((s) => ({ ...s, [id]: { quantity: 0, disposition: 'restock', ...s[id], ...patch } }));

  // Estimated value of what is selected (pro-rata of each line's total).
  const estimate = useMemo(() => {
    if (!info) return 0;
    return info.lines.reduce((sum, l) => {
      const q = Number(sel[l.id]?.quantity || 0);
      return sum + (l.quantity ? (l.line_total * q) / l.quantity : 0);
    }, 0);
  }, [info, sel]);
  const outstanding = info ? Math.max(0, info.invoice.total - info.invoice.paid_total) : 0;
  const offset = Math.min(estimate, outstanding);
  const payout = Math.max(0, estimate - offset);

  if (!invoiceId) return null;

  const submit = async () => {
    const lines = Object.entries(sel).filter(([, v]) => Number(v.quantity) > 0)
      .map(([invoice_line_id, v]) => ({ invoice_line_id, quantity: Number(v.quantity), disposition: v.disposition }));
    if (!lines.length) return toast.error(L('Choose at least one item to return', 'اختر صنفاً واحداً على الأقل للإرجاع'));
    setSaving(true);
    try {
      const { data } = await api.post('/sales-returns', { invoice_id: invoiceId, lines, reason: reason || undefined, refund_method: method });
      setDone(data);
      toast.success(`${data.return_no}`);
      onDone?.(data);
    } catch (e) { /* toast handled globally */ } finally { setSaving(false); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed z-50 inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="card p-0 w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-800">
            <p className="font-bold text-lg text-navy-900 dark:text-white flex items-center gap-2"><Undo2 size={18} />{L('Return / Refund', 'إرجاع / استرداد')} {info && <span className="text-slate-400 font-medium text-sm">· {info.invoice.invoice_no}</span>}</p>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800"><X size={18} /></button>
          </div>

          {!info && <p className="p-8 text-center text-slate-400">…</p>}

          {info && done && (
            <div className="p-8 text-center space-y-3">
              <p className="text-lg font-bold text-emerald-600">{L('Return completed', 'تم الإرجاع')} — {done.return_no}</p>
              <p className="text-sm text-slate-500">
                {L('Total returned', 'إجمالي المرتجع')}: <b>{n3(done.total)}</b>
                {Number(done.applied_to_invoice) > 0 && <> · {L('applied to invoice balance', 'خُصم من رصيد الفاتورة')}: {n3(done.applied_to_invoice)}</>}
                {Number(done.refunded_amount) > 0 && <> · {L('paid back', 'مردود نقداً')}: {n3(done.refunded_amount)}</>}
                {Number(done.credited_amount) > 0 && <> · {L('client credit', 'رصيد للعميل')}: {n3(done.credited_amount)}</>}
              </p>
              <div className="flex justify-center gap-2">
                <button onClick={() => printCreditNote(done.id)} className="btn-ghost"><Printer size={16} />{L('Print credit note', 'طباعة إشعار دائن')}</button>
                <button onClick={onClose} className="btn-primary">{L('Close', 'إغلاق')}</button>
              </div>
            </div>
          )}

          {info && !done && !info.eligible && (
            <p className="p-8 text-center text-slate-500">{L('Only a posted, uncancelled sales invoice can be returned.', 'يمكن إرجاع فاتورة مبيعات مرحّلة وغير ملغاة فقط.')}</p>
          )}

          {info && !done && info.eligible && (
            <>
              <div className="overflow-y-auto p-5 space-y-4">
                <div className="rounded-xl border border-slate-100 dark:border-navy-800 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-navy-900 text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 text-start">{L('Item', 'الصنف')}</th>
                        <th className="px-3 py-2 text-end">{L('Sold', 'المباع')}</th>
                        <th className="px-3 py-2 text-end">{L('Returned', 'مرتجع سابقاً')}</th>
                        <th className="px-3 py-2 text-end">{L('Return qty', 'كمية الإرجاع')}</th>
                        <th className="px-3 py-2 text-start">{L('Goods', 'البضاعة')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.lines.map((l) => {
                        const blocked = l.is_booked || l.remaining_quantity <= 0;
                        const v = sel[l.id] || {};
                        return (
                          <tr key={l.id} className={`border-t border-slate-100 dark:border-navy-800 ${blocked ? 'opacity-50' : ''}`}>
                            <td className="px-3 py-2">{l.description || l.name_en}{l.is_booked && <span className="ms-2 text-[10px] text-amber-600">({L('booked — cancel booking instead', 'محجوز — الغِ الحجز بدلاً من ذلك')})</span>}</td>
                            <td className="px-3 py-2 text-end tabular-nums">{l.quantity}</td>
                            <td className="px-3 py-2 text-end tabular-nums">{l.returned_quantity}</td>
                            <td className="px-3 py-2 text-end">
                              <input
                                type="number" min="0" max={l.remaining_quantity} step="any" disabled={blocked}
                                className="input !py-1 !w-24 text-end" value={v.quantity ?? ''} placeholder="0"
                                onChange={(e) => setLine(l.id, { quantity: Math.min(l.remaining_quantity, Math.max(0, Number(e.target.value))) || '' })}
                              />
                            </td>
                            <td className="px-3 py-2">
                              {l.has_stock ? (
                                <select disabled={blocked} className="input !py-1 text-xs" value={v.disposition || 'restock'} onChange={(e) => setLine(l.id, { disposition: e.target.value })}>
                                  <option value="restock">{L('Back to stock', 'إلى المخزون')}</option>
                                  <option value="damaged">{L('Damaged (write off)', 'تالف (شطب)')}</option>
                                </select>
                              ) : <span className="text-xs text-slate-400">{l.is_manufacture_item ? L('Made-to-order', 'تصنيع حسب الطلب') : '—'}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">{L('Refund method', 'طريقة الاسترداد')}</label>
                    <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                      <option value="cash">{L('Cash back', 'نقداً')}</option>
                      <option value="knet">{L('KNET / card', 'كي نت / بطاقة')}</option>
                      <option value="credit">{L('Keep as client credit', 'رصيد للعميل')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">{L('Reason', 'السبب')}</label>
                    <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-navy-800/50 px-4 py-3 text-sm space-y-1">
                  <div className="flex justify-between"><span>{L('Return value', 'قيمة المرتجع')}</span><b>{n3(estimate)}</b></div>
                  {offset > 0 && <div className="flex justify-between text-slate-500"><span>{L('Reduces what the client still owes', 'يخفض المبلغ المستحق على العميل')}</span><span>{n3(offset)}</span></div>}
                  {payout > 0 && <div className="flex justify-between text-slate-500"><span>{method === 'credit' ? L('Kept as client credit', 'يبقى رصيداً للعميل') : L('Paid back to the customer', 'يُردّ للعميل')}</span><span>{n3(payout)}</span></div>}
                  <p className="text-[11px] text-slate-400 pt-1">{L('Exact amounts (incl. tax) are calculated when you confirm.', 'تُحسب المبالغ الدقيقة (شاملة الضريبة) عند التأكيد.')}</p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-navy-800">
                <button onClick={onClose} className="btn-ghost">{L('Cancel', 'إلغاء')}</button>
                <button onClick={submit} disabled={saving || estimate <= 0} className="btn-primary">{saving ? '…' : L('Confirm return', 'تأكيد الإرجاع')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
