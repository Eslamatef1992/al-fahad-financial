import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Save, Tag, X, CalendarClock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

const emptyLine = () => ({
  account_id: '', item_id: '', description: '', quantity: 1, unit_price: '', tax_rate: 0,
  discount_code: '', discount_preview: null, discount_error: '', is_booked: false, delivery_date: '',
});

// Splits `totalDiscount` across `weights` proportionally, fixing rounding
// drift on the last non-zero-weight entry — mirrors discountService's
// allocateProportional on the backend exactly, so this form's live preview
// matches what actually gets saved.
function allocateProportional(totalDiscount, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || totalDiscount <= 0) return weights.map(() => 0);
  const round3 = (n) => Math.round(n * 1000) / 1000;
  const allocated = weights.map((w) => round3((totalDiscount * w) / sum));
  const diff = round3(totalDiscount - allocated.reduce((a, b) => a + b, 0));
  if (Math.abs(diff) >= 0.001) {
    for (let i = weights.length - 1; i >= 0; i -= 1) {
      if (weights[i] > 0) { allocated[i] = round3(allocated[i] + diff); break; }
    }
  }
  return allocated;
}

export default function InvoiceFormPage() {
  const { t } = useTranslation();
  const { type, id } = useParams(); // 'sales' | 'purchase'; id present only when editing an existing draft
  const isEdit = !!id;
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [accounts, setAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [branches, setBranches] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const partyKey = type === 'sales' ? 'client_id' : 'supplier_id';
  const [header, setHeader] = useState({
    client_id: '', supplier_id: '', date: new Date().toISOString().slice(0, 10), due_date: '',
    cost_center_id: '', branch_id: '', reference_no: '', notes: '',
    discount_code: '', discount_preview: null, discount_error: '',
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  useEffect(() => {
    if (!activeCompany) return;
    // Purchase bill lines can post to either an expense account (a plain
    // service/expense purchase) or an asset account (an inventory item's
    // stock account, auto-filled when the line is linked to an Item below).
    const relevantType = type === 'sales' ? ['revenue'] : ['expense', 'asset'];
    api.get('/accounts').then((r) => setAccounts(r.data.filter((a) => !a.is_group && relevantType.includes(a.type))));
    api.get('/cost-centers').then((r) => setCostCenters(r.data));
    api.get('/branches').then((r) => setBranches(r.data));
    api.get('/items').then((r) => setAvailableItems(r.data));
    if (type === 'sales') api.get('/clients').then((r) => setClients(r.data));
    else api.get('/suppliers').then((r) => setSuppliers(r.data));
  }, [activeCompany, type]);

  // Editing an existing draft — load it in and prefill the form once.
  useEffect(() => {
    if (!activeCompany || !isEdit) return;
    api.get(`/invoices/${id}`).then((r) => {
      const inv = r.data;
      setHeader({
        client_id: inv.client_id || '', supplier_id: inv.supplier_id || '',
        date: inv.date, due_date: inv.due_date || '',
        cost_center_id: inv.cost_center_id || '', branch_id: inv.branch_id || '', reference_no: inv.reference_no || '', notes: inv.notes || '',
        discount_code: inv.discountCode?.code || '',
        discount_preview: inv.discountCode ? { code: inv.discountCode.code, discount_amount: Number(inv.discount_amount || 0) } : null,
        discount_error: '',
      });
      setLines(inv.lines.map((l) => ({
        account_id: l.account_id, item_id: l.item_id || '', description: l.description || '',
        quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate,
        discount_code: l.discountCode?.code || '',
        discount_preview: l.discountCode ? { code: l.discountCode.code, discount_amount: Number(l.discount_amount || 0) } : null,
        discount_error: '',
        is_booked: !!l.is_booked,
        delivery_date: l.delivery_date || '',
      })));
      setLoading(false);
    });
  }, [activeCompany, isEdit, id]);

  const updateLine = (idx, patch) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  // Picking a stock item auto-fills the description, price, and destination
  // account (revenue account for sales, inventory asset account for
  // purchases) — the account can still be overridden afterward. Posting this
  // invoice later will automatically move stock and, for sales, post COGS.
  const pickItem = (idx, itemId) => {
    const item = availableItems.find((i) => i.id === itemId);
    if (!item) { updateLine(idx, { item_id: '' }); return; }
    updateLine(idx, {
      item_id: itemId,
      description: item.name_en,
      unit_price: type === 'sales' ? item.selling_price : item.cost_price,
      account_id: type === 'sales' ? item.income_account_id : item.inventory_account_id,
    });
  };
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (idx) => setLines((ls) => ls.filter((_, i) => i !== idx));

  const rawLineAmount = (l) => Number(l.quantity || 0) * Number(l.unit_price || 0);
  const hasLineDiscounts = lines.some((l) => l.discount_code || l.discount_preview);
  const hasHeaderDiscount = !!(header.discount_code || header.discount_preview);

  const applyHeaderDiscount = async () => {
    if (!header.discount_code.trim()) return;
    setApplyingDiscount(true);
    try {
      const rawSubtotal = lines.reduce((s, l) => s + rawLineAmount(l), 0);
      const { data } = await api.post('/discount-codes/preview', { code: header.discount_code.trim(), base_amount: rawSubtotal, scope: 'invoice' });
      setHeader((h) => ({ ...h, discount_preview: data, discount_error: '' }));
    } catch (err) {
      setHeader((h) => ({ ...h, discount_preview: null, discount_error: err.response?.data?.message || t('common.error') }));
    } finally { setApplyingDiscount(false); }
  };
  const removeHeaderDiscount = () => setHeader((h) => ({ ...h, discount_code: '', discount_preview: null, discount_error: '' }));

  const applyLineDiscount = async (idx) => {
    const code = lines[idx].discount_code.trim();
    if (!code) return;
    try {
      const { data } = await api.post('/discount-codes/preview', { code, base_amount: rawLineAmount(lines[idx]), scope: 'line' });
      updateLine(idx, { discount_preview: data, discount_error: '' });
    } catch (err) {
      updateLine(idx, { discount_preview: null, discount_error: err.response?.data?.message || t('common.error') });
    }
  };
  const removeLineDiscount = (idx) => updateLine(idx, { discount_code: '', discount_preview: null, discount_error: '' });

  const rawAmounts = lines.map(rawLineAmount);
  const headerAllocated = header.discount_preview ? allocateProportional(header.discount_preview.discount_amount, rawAmounts) : lines.map(() => 0);
  const computed = lines.map((l, i) => {
    const qty = Number(l.quantity || 0);
    const price = Number(l.unit_price || 0);
    const taxRate = Number(l.tax_rate || 0);
    const raw = qty * price;
    const discount = header.discount_preview ? headerAllocated[i] : Number(l.discount_preview?.discount_amount || 0);
    const net = Math.max(0, raw - discount);
    const tax = net * (taxRate / 100);
    return { subtotal: net, tax, total: net + tax, discount };
  });
  const subtotal = computed.reduce((s, l) => s + l.subtotal, 0);
  const taxTotal = computed.reduce((s, l) => s + l.tax, 0);
  const totalDiscount = computed.reduce((s, l) => s + l.discount, 0);
  const total = subtotal + taxTotal;

  const submit = async (e) => {
    e.preventDefault();
    if (!header[partyKey]) return toast.error(type === 'sales' ? t('invoices.pleaseSelectClient') : t('invoices.pleaseSelectSupplier'));
    const validLines = lines
      .filter((l) => l.account_id && Number(l.unit_price) > 0)
      .map((l) => ({
        account_id: l.account_id,
        item_id: l.item_id || undefined,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_rate: l.tax_rate,
        discount_code: l.discount_code?.trim() || undefined,
        is_booked: type === 'sales' && !!l.item_id && l.is_booked,
        delivery_date: type === 'sales' && !!l.item_id && l.is_booked ? l.delivery_date : undefined,
      }));
    if (validLines.length === 0) return toast.error(t('invoices.addLineItemPrompt'));
    if (validLines.some((l) => l.is_booked && !l.delivery_date)) return toast.error(t('invoices.bookedNeedsDate'));

    setSaving(true);
    try {
      const payload = {
        type,
        client_id: header.client_id || undefined,
        supplier_id: header.supplier_id || undefined,
        date: header.date,
        due_date: header.due_date,
        cost_center_id: header.cost_center_id,
        branch_id: header.branch_id,
        reference_no: header.reference_no,
        notes: header.notes,
        discount_code: header.discount_code?.trim() || undefined,
        lines: validLines,
      };
      if (isEdit) {
        const { data } = await api.put(`/invoices/${id}`, payload);
        toast.success(t('common.save'));
        navigate(`/invoices/${data.id}`);
      } else {
        const { data } = await api.post('/invoices', payload);
        toast.success(t('invoices.savedAsDraft'));
        navigate(`/invoices/${data.id}`);
      }
    } finally { setSaving(false); }
  };

  if (loading) return <p className="text-slate-400">{t('common.loading')}</p>;

  return (
    <div>
      <button onClick={() => navigate(`/invoices/${type}`)} className="btn-ghost !px-2 mb-3"><ArrowLeft size={16} /> {t('common.back')}</button>
      <PageHeader title={isEdit
        ? (type === 'sales' ? t('invoices.editSalesInvoiceTitle') : t('invoices.editPurchaseBillTitle'))
        : (type === 'sales' ? t('invoices.newSalesInvoiceTitle') : t('invoices.newPurchaseBillTitle'))} />

      <form onSubmit={submit} className="space-y-5">
        <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">{type === 'sales' ? t('common.client') : t('common.supplier')}</label>
            <select required className="input" value={header[partyKey]} onChange={(e) => setHeader({ ...header, [partyKey]: e.target.value })}>
              <option value="">{t('common.select')}</option>
              {(type === 'sales' ? clients : suppliers).map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
            </select>
          </div>
          <div><label className="label">{t('common.referenceNo')}</label><input className="input" value={header.reference_no} onChange={(e) => setHeader({ ...header, reference_no: e.target.value })} /></div>
          <div><label className="label">{t('common.date')}</label><input required type="date" className="input" value={header.date} onChange={(e) => setHeader({ ...header, date: e.target.value })} /></div>
          <div><label className="label">{t('common.dueDate')}</label><input type="date" className="input" value={header.due_date} onChange={(e) => setHeader({ ...header, due_date: e.target.value })} /></div>
          <div>
            <label className="label">{t('vouchers.costCenter')}</label>
            <select className="input" value={header.cost_center_id} onChange={(e) => setHeader({ ...header, cost_center_id: e.target.value })}>
              <option value="">{t('common.none')}</option>
              {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('common.branch')}</label>
            <select className="input" value={header.branch_id} onChange={(e) => setHeader({ ...header, branch_id: e.target.value })}>
              <option value="">{t('common.none')}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label flex items-center gap-1.5"><Tag size={13} /> {t('invoices.discountCode')}</label>
            {!hasLineDiscounts && (
              <>
                <div className="flex gap-2">
                  <input
                    className="input"
                    value={header.discount_code}
                    onChange={(e) => setHeader({ ...header, discount_code: e.target.value.toUpperCase(), discount_preview: null, discount_error: '' })}
                    placeholder={t('invoices.discountCodePlaceholder')}
                    disabled={!!header.discount_preview}
                  />
                  {header.discount_preview ? (
                    <button type="button" onClick={removeHeaderDiscount} className="btn-ghost shrink-0">{t('invoices.removeDiscount')}</button>
                  ) : (
                    <button type="button" onClick={applyHeaderDiscount} disabled={applyingDiscount || !header.discount_code.trim()} className="btn-ghost shrink-0">{t('invoices.applyDiscount')}</button>
                  )}
                </div>
                {header.discount_preview && (
                  <p className="text-xs text-emerald-600 mt-1">{t('invoices.discountAppliedAmount', { amount: Number(header.discount_preview.discount_amount).toFixed(3) })}</p>
                )}
                {header.discount_error && <p className="text-xs text-red-500 mt-1">{header.discount_error}</p>}
                <p className="text-xs text-slate-400 mt-1">{t('invoices.invoiceDiscountHint')}</p>
              </>
            )}
            {hasLineDiscounts && <p className="text-xs text-slate-400">{t('invoices.lineDiscountHint')}</p>}
          </div>
          <div className="sm:col-span-2"><label className="label">{t('common.notes')}</label><textarea className="input" rows={2} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} /></div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">{t('common.lineItems')}</h3>
            <button type="button" onClick={addLine} className="btn-ghost !py-1.5"><Plus size={15} /> {t('common.addLine')}</button>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <motion.div key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-xl bg-slate-50 dark:bg-navy-800/40">
                <div className="grid grid-cols-12 gap-2 items-start">
                  <select className="input col-span-2 !py-2" value={line.item_id} onChange={(e) => pickItem(idx, e.target.value)} title={t('items.pickItemHint')}>
                    <option value="">{t('items.noItemFreehand')}</option>
                    {availableItems.map((i) => <option key={i.id} value={i.id}>{i.code} - {i.name_en}</option>)}
                  </select>
                  <select required className="input col-span-2 !py-2" value={line.account_id} onChange={(e) => updateLine(idx, { account_id: e.target.value })}>
                    <option value="">{type === 'sales' ? t('invoices.revenueAccountPlaceholder') : t('invoices.expenseAccountPlaceholder')}</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
                  </select>
                  <input placeholder={t('common.description')} className="input col-span-2 !py-2" value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                  <input type="number" step="0.001" placeholder={t('common.qty')} className="input col-span-1 !py-2" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                  <input type="number" step="0.001" placeholder={t('common.unitPrice')} className="input col-span-2 !py-2" value={line.unit_price} onChange={(e) => updateLine(idx, { unit_price: e.target.value })} />
                  <input type="number" step="0.01" placeholder={t('common.taxPercent')} className="input col-span-1 !py-2" value={line.tax_rate} onChange={(e) => updateLine(idx, { tax_rate: e.target.value })} />
                  <div className="col-span-1 text-sm py-2 text-end font-semibold">{computed[idx].total.toFixed(2)}</div>
                  <button type="button" onClick={() => removeLine(idx)} className="col-span-1 p-2 rounded-lg hover:bg-red-50 text-red-500 justify-self-center"><Trash2 size={15} /></button>
                </div>

                {type === 'sales' && line.item_id && (
                  <div className="flex items-center gap-2 mt-2 ps-1">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={line.is_booked}
                        onChange={(e) => updateLine(idx, { is_booked: e.target.checked, delivery_date: e.target.checked ? line.delivery_date : '' })}
                      />
                      <CalendarClock size={13} className="text-slate-400" />
                      {t('invoices.bookForLater')}
                    </label>
                    {line.is_booked && (
                      <input
                        required
                        type="date"
                        className="input !py-1.5 !w-auto text-xs"
                        value={line.delivery_date}
                        onChange={(e) => updateLine(idx, { delivery_date: e.target.value })}
                      />
                    )}
                  </div>
                )}
                {type === 'sales' && !line.item_id && (
                  <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-2 ps-1">
                    <CalendarClock size={13} />
                    {t('invoices.bookForLaterNeedsItem')}
                  </p>
                )}

                {!hasHeaderDiscount && (
                  <div className="flex items-center gap-2 mt-2 ps-1">
                    <Tag size={12} className="text-slate-400 shrink-0" />
                    <input
                      className="input !py-1.5 text-xs max-w-[160px]"
                      value={line.discount_code}
                      onChange={(e) => updateLine(idx, { discount_code: e.target.value.toUpperCase(), discount_preview: null, discount_error: '' })}
                      placeholder={t('invoices.discountCodePlaceholder')}
                      disabled={!!line.discount_preview}
                    />
                    {line.discount_preview ? (
                      <>
                        <span className="text-xs text-emerald-600">{t('invoices.discountAppliedAmount', { amount: Number(line.discount_preview.discount_amount).toFixed(3) })}</span>
                        <button type="button" onClick={() => removeLineDiscount(idx)} className="p-1 rounded hover:bg-red-50 text-red-500"><X size={13} /></button>
                      </>
                    ) : (
                      <button type="button" onClick={() => applyLineDiscount(idx)} disabled={!line.discount_code.trim()} className="btn-ghost !py-1 !px-2 text-xs">{t('invoices.applyDiscount')}</button>
                    )}
                    {line.discount_error && <span className="text-xs text-red-500">{line.discount_error}</span>}
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-6 mt-4 pt-4 border-t border-slate-100 dark:border-navy-800 text-sm">
            <div><span className="text-slate-400">{t('common.subtotal')}: </span><span className="font-semibold">{(subtotal + totalDiscount).toFixed(3)}</span></div>
            {totalDiscount > 0.0009 && (
              <div><span className="text-slate-400">{t('invoices.discount')}: </span><span className="font-semibold text-emerald-600">-{totalDiscount.toFixed(3)}</span></div>
            )}
            <div><span className="text-slate-400">{t('common.tax')}: </span><span className="font-semibold">{taxTotal.toFixed(3)}</span></div>
            <div><span className="text-slate-400">{t('common.total')}: </span><span className="font-bold text-base">{total.toFixed(3)}</span></div>
          </div>
        </div>

        <div className="flex justify-end">
          <button disabled={saving} className="btn-primary"><Save size={16} /> {isEdit ? t('vouchers.saveChanges') : t('vouchers.saveAsDraft')}</button>
        </div>
      </form>
    </div>
  );
}
