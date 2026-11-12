import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Save, Tag, X, CalendarClock, Search, Banknote, Users, CheckCircle2, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import useFinancialDefaults from '@/hooks/useFinancialDefaults';

const emptyLine = () => ({
  account_id: '', item_id: '', item_query: '', description: '', quantity: 1, unit_price: '', tax_rate: 0,
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
  const financialDefaults = useFinancialDefaults();
  const [accounts, setAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [branches, setBranches] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  // Smart client search (new sales invoices only) — search by name or
  // phone with a floating suggestions dropdown; Enter selects the top
  // match, or — if nothing matches — opens the New Customer modal with
  // Name/Phone prefilled from what was typed (numeric input -> Phone,
  // text -> Name), the other field left required.
  const [clientPhoneQuery, setClientPhoneQuery] = useState('');
  const [newClientModalOpen, setNewClientModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  // Dynamic Payment Options (new sales invoices only) — same one-step
  // "create, post, and settle" pattern as POS checkout.
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [tenderAmounts, setTenderAmounts] = useState({});
  const [creditAmount, setCreditAmount] = useState('');
  const [completingPay, setCompletingPay] = useState(false);

  const partyKey = type === 'sales' ? 'client_id' : 'supplier_id';
  const [header, setHeader] = useState({
    client_id: '', supplier_id: '', date: new Date().toISOString().slice(0, 10), due_date: '',
    cost_center_id: '', branch_id: '', reference_no: '', notes: '',
    discount_code: '', discount_preview: null, discount_error: '',
    delivery_date: '', delivery_address: '',
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
    if (type === 'sales') {
      api.get('/clients').then((r) => setClients(r.data));
      api.get('/payment-methods').then((r) => setPaymentMethods(r.data)).catch(() => {});
    } else api.get('/suppliers').then((r) => setSuppliers(r.data));
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
        delivery_date: inv.delivery_date || '',
        delivery_address: inv.delivery_address || '',
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

  // Picking a client prefills the delivery address from their record, but
  // only when the field is still empty — an address the user already typed
  // or edited for this specific delivery is never silently overwritten.
  const pickClient = (clientId) => {
    const client = clients.find((c) => c.id === clientId);
    setHeader((h) => ({
      ...h,
      client_id: clientId,
      delivery_address: !h.delivery_address && client?.address ? client.address : h.delivery_address,
    }));
  };

  const selectedClient = clients.find((c) => c.id === header.client_id) || null;
  const clientQueryTrimmed = clientPhoneQuery.trim();
  const phoneMatches = clientQueryTrimmed
    ? clients.filter((c) => c.phone?.includes(clientQueryTrimmed) || c.name_en?.toLowerCase().includes(clientQueryTrimmed.toLowerCase()) || c.name_ar?.includes(clientQueryTrimmed)).slice(0, 6)
    : [];
  // Numeric-looking input (digits, plus optional +/-/spaces) is treated as a
  // phone number; anything else is treated as a name — mirrors how a cashier
  // would naturally type either one into the same box.
  const clientQueryIsNumeric = /\d/.test(clientQueryTrimmed) && /^[0-9+\-\s]+$/.test(clientQueryTrimmed);

  const clearClientSelection = () => {
    pickClient('');
    setClientPhoneQuery('');
    setNewClientName('');
    setNewClientPhone('');
  };

  // Enter in the search box: jump to the top match, or — if nothing
  // matches — open the New Customer modal, prefilling whichever field
  // matches what was typed (numeric -> Phone, text -> Name) and leaving
  // the other one empty and required.
  const selectTopClientMatch = () => {
    if (phoneMatches.length) {
      pickClient(phoneMatches[0].id);
      setClientPhoneQuery('');
      return;
    }
    if (!clientQueryTrimmed) return;
    setNewClientName(clientQueryIsNumeric ? '' : clientQueryTrimmed);
    setNewClientPhone(clientQueryIsNumeric ? clientQueryTrimmed : '');
    setNewClientModalOpen(true);
  };
  const closeNewClientModal = () => {
    setNewClientModalOpen(false);
    setNewClientName('');
    setNewClientPhone('');
  };
  const createQuickClient = async () => {
    if (!newClientName.trim() || !newClientPhone.trim()) return toast.error(t('pos.quickClientRequired'));
    setSavingClient(true);
    try {
      const { data } = await api.post('/clients', {
        name_en: newClientName.trim(),
        name_ar: newClientName.trim(),
        phone: newClientPhone.trim(),
        parent_account_id: financialDefaults.client_parent_account_id || null,
      });
      setClients((prev) => [...prev, data]);
      pickClient(data.id);
      setNewClientName('');
      setNewClientPhone('');
      setClientPhoneQuery('');
      setNewClientModalOpen(false);
      toast.success(t('pos.customerAdded'));
    } catch (e) { /* toast handled globally */ }
    finally { setSavingClient(false); }
  };

  // The redesigned "New Sales Invoice" screen (super-admin paper-ledger UI):
  // no Cost Center / Revenue Account pickers, no tax fields, Enter adds a
  // line, items are found by name OR SKU. Editing a draft and Purchase Bills
  // keep the original full form (they still need an explicit account and
  // may carry tax).
  const isNewSales = type === 'sales' && !isEdit;

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
      item_query: '',
      description: item.name_en,
      unit_price: type === 'sales' ? item.selling_price : item.cost_price,
      account_id: type === 'sales' ? item.income_account_id : item.inventory_account_id,
    });
  };
  const itemSearchRefs = useRef([]);
  const addLine = (focusNew) => {
    setLines((ls) => [...ls, emptyLine()]);
    if (focusNew) setTimeout(() => itemSearchRefs.current[lines.length]?.focus(), 0);
  };
  const removeLine = (idx) => setLines((ls) => ls.filter((_, i) => i !== idx));
  // Enter anywhere in a New Sales Invoice line row adds another line instead
  // of submitting the form — matches typing straight down a paper ledger.
  const handleLineKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addLine(true);
  };
  const itemMatches = (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return availableItems.filter((i) => i.name_en?.toLowerCase().includes(q) || i.name_ar?.includes(query.trim()) || i.sku?.toLowerCase().includes(q)).slice(0, 8);
  };

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
    const taxRate = isNewSales ? 0 : Number(l.tax_rate || 0);
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

  // New Sales Invoice lines carry no explicit account picker anymore — they
  // always post to the item's own income account when one is picked, or the
  // company's default Income Account for Items (Financial Configuration)
  // for a freehand line, exactly like the Item form's own Income Account
  // now defaults silently instead of asking.
  const resolveLineAccountId = (l) => l.account_id || (isNewSales ? financialDefaults.item_income_account_id : '');

  const buildValidLines = () => lines
    .filter((l) => resolveLineAccountId(l) && Number(l.unit_price) > 0)
    .map((l) => ({
      account_id: resolveLineAccountId(l),
      item_id: l.item_id || undefined,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_rate: isNewSales ? 0 : l.tax_rate,
      discount_code: l.discount_code?.trim() || undefined,
      is_booked: type === 'sales' && !!l.item_id && l.is_booked,
      delivery_date: type === 'sales' && !!l.item_id && l.is_booked ? l.delivery_date : undefined,
    }));

  const buildInvoicePayload = (validLines) => ({
    type,
    client_id: header.client_id || undefined,
    supplier_id: header.supplier_id || undefined,
    date: header.date,
    due_date: header.due_date,
    cost_center_id: isNewSales ? undefined : header.cost_center_id,
    branch_id: header.branch_id,
    reference_no: header.reference_no,
    notes: header.notes,
    discount_code: header.discount_code?.trim() || undefined,
    delivery_date: type === 'sales' ? (header.delivery_date || undefined) : undefined,
    delivery_address: type === 'sales' ? (header.delivery_address || undefined) : undefined,
    lines: validLines,
  });

  // A line with real quantity/price that still resolves to no account means
  // Financial Configuration has no default Income Account for Items set —
  // that's a distinct, actionable error from "you forgot to add a line".
  const hasUnresolvedAccountLine = () => isNewSales && lines.some((l) => Number(l.unit_price) > 0 && Number(l.quantity) > 0 && !resolveLineAccountId(l));

  const submit = async (e) => {
    e.preventDefault();
    if (!header[partyKey]) return toast.error(type === 'sales' ? t('invoices.pleaseSelectClient') : t('invoices.pleaseSelectSupplier'));
    if (hasUnresolvedAccountLine()) return toast.error(t('invoices.noDefaultIncomeAccount'));
    const validLines = buildValidLines();
    if (validLines.length === 0) return toast.error(t('invoices.addLineItemPrompt'));
    if (validLines.some((l) => l.is_booked && !l.delivery_date)) return toast.error(t('invoices.bookedNeedsDate'));

    setSaving(true);
    try {
      const payload = buildInvoicePayload(validLines);
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

  // "Complete & Pay" — one-step create + post + settle, sales invoices only.
  // Mirrors POS checkout exactly: every active Payment Setting Option can
  // take a tender, plus Credit, and the tendered total must match the
  // invoice total before it's allowed through.
  const activePaymentMethods = paymentMethods.filter((pm) => pm.is_active);
  const tenderTotal = Object.values(tenderAmounts).reduce((s, v) => s + Number(v || 0), 0) + Number(creditAmount || 0);
  const completeAndPay = async () => {
    if (!header.client_id) return toast.error(t('invoices.pleaseSelectClient'));
    if (hasUnresolvedAccountLine()) return toast.error(t('invoices.noDefaultIncomeAccount'));
    const validLines = buildValidLines();
    if (validLines.length === 0) return toast.error(t('invoices.addLineItemPrompt'));
    if (validLines.some((l) => l.is_booked && !l.delivery_date)) return toast.error(t('invoices.bookedNeedsDate'));
    if (Math.abs(tenderTotal - total) > 0.001) return toast.error(t('pos.tenderMismatch'));

    setCompletingPay(true);
    try {
      const payments = [];
      activePaymentMethods.forEach((pm) => {
        const amt = Number(tenderAmounts[pm.id] || 0);
        if (amt > 0) payments.push({ payment_method_id: pm.id, amount: amt });
      });
      if (Number(creditAmount) > 0) payments.push({ payment_method_id: null, amount: Number(creditAmount) });

      const payload = { ...buildInvoicePayload(validLines), payments };
      const { data } = await api.post('/invoices/create-and-settle', payload);
      toast.success(t('pos.saleCompleted'));
      navigate(`/invoices/${data.id}`);
    } finally { setCompletingPay(false); }
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
          {type === 'sales' && !isEdit ? (
            <div>
              <label className="label !flex items-center gap-1"><Users size={13} />{t('common.client')}</label>
              {selectedClient ? (
                <div className="flex items-center justify-between gap-2 input !py-2">
                  <span className="text-sm truncate">{selectedClient.name_en}{selectedClient.phone ? ` — ${selectedClient.phone}` : ''}</span>
                  <button type="button" onClick={clearClientSelection} className="text-xs font-semibold text-slate-400 hover:text-red-500 shrink-0">{t('common.change')}</button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
                    <input
                      className="input !ps-8"
                      value={clientPhoneQuery}
                      onChange={(e) => setClientPhoneQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); selectTopClientMatch(); } }}
                      placeholder={t('pos.searchCustomerHint')}
                    />
                  </div>
                  {clientQueryTrimmed && phoneMatches.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-900 shadow-lg">
                      {phoneMatches.map((c, i) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => { pickClient(c.id); setClientPhoneQuery(''); }}
                          className={`w-full text-start px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors ${i === 0 ? 'bg-slate-100 dark:bg-navy-800' : 'hover:bg-slate-50 dark:hover:bg-navy-800'}`}
                        >
                          <span className="truncate">{c.name_en}</span>
                          <span className="text-xs text-slate-400 shrink-0">{c.phone || '-'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {clientQueryTrimmed && phoneMatches.length === 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
                      <p className="text-xs text-amber-600">{t('pos.noMatchesCreateNew')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="label">{type === 'sales' ? t('common.client') : t('common.supplier')}</label>
              <select
                required
                className="input"
                value={header[partyKey]}
                onChange={(e) => (type === 'sales' ? pickClient(e.target.value) : setHeader({ ...header, [partyKey]: e.target.value }))}
              >
                <option value="">{t('common.select')}</option>
                {(type === 'sales' ? clients : suppliers).map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
              </select>
            </div>
          )}
          <div><label className="label">{t('common.referenceNo')}</label><input className="input" value={header.reference_no} onChange={(e) => setHeader({ ...header, reference_no: e.target.value })} /></div>
          <div><label className="label">{t('common.date')}</label><input required type="date" className="input" value={header.date} onChange={(e) => setHeader({ ...header, date: e.target.value })} /></div>
          <div><label className="label">{t('common.dueDate')}</label><input type="date" className="input" value={header.due_date} onChange={(e) => setHeader({ ...header, due_date: e.target.value })} /></div>
          {type === 'sales' && (
            <>
              <div>
                <label className="label !flex items-center gap-1"><CalendarClock size={13} />{t('invoices.deliveryDate')}</label>
                <input type="date" className="input" value={header.delivery_date} onChange={(e) => setHeader({ ...header, delivery_date: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">{t('invoices.deliveryAddress')}</label>
                <textarea className="input" rows={2} value={header.delivery_address} onChange={(e) => setHeader({ ...header, delivery_address: e.target.value })} placeholder={t('invoices.deliveryAddressHint')} />
              </div>
            </>
          )}
          {!isNewSales && (
            <div>
              <label className="label">{t('vouchers.costCenter')}</label>
              <select className="input" value={header.cost_center_id} onChange={(e) => setHeader({ ...header, cost_center_id: e.target.value })}>
                <option value="">{t('common.none')}</option>
                {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">{t('common.branch')}</label>
            <select className="input" value={header.branch_id} onChange={(e) => setHeader({ ...header, branch_id: e.target.value })}>
              <option value="">{t('common.none')}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label !flex items-center gap-1.5"><Tag size={13} /> {t('invoices.discountCode')}</label>
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
            <button type="button" onClick={() => addLine(true)} className="btn-ghost !py-1.5"><Plus size={15} /> {t('common.addLine')}</button>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <motion.div key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-xl bg-slate-50 dark:bg-navy-800/40">
                {isNewSales ? (
                  <div className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-1 text-sm py-2 text-center text-slate-400 font-semibold">{idx + 1}</div>
                    <div className="col-span-3 relative">
                      {line.item_id ? (
                        <div className="input !py-2 flex items-center justify-between gap-2">
                          <span className="text-sm truncate">{availableItems.find((i) => i.id === line.item_id)?.sku ? `${availableItems.find((i) => i.id === line.item_id).sku} — ` : ''}{availableItems.find((i) => i.id === line.item_id)?.name_en}</span>
                          <button type="button" onClick={() => updateLine(idx, { item_id: '', item_query: '' })} className="text-slate-400 hover:text-red-500 shrink-0"><X size={13} /></button>
                        </div>
                      ) : (
                        <>
                          <input
                            ref={(el) => { itemSearchRefs.current[idx] = el; }}
                            className="input !py-2"
                            placeholder={t('items.searchByNameOrSku')}
                            value={line.item_query}
                            onChange={(e) => updateLine(idx, { item_query: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter' && itemMatches(line.item_query).length) { e.preventDefault(); pickItem(idx, itemMatches(line.item_query)[0].id); } else handleLineKeyDown(e); }}
                          />
                          {line.item_query.trim() && (
                            <div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-900 shadow-lg">
                              {itemMatches(line.item_query).map((i) => (
                                <button
                                  type="button"
                                  key={i.id}
                                  onClick={() => pickItem(idx, i.id)}
                                  className="w-full text-start px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-navy-800 flex items-center justify-between gap-2 transition-colors"
                                >
                                  <span className="truncate">{i.name_en}</span>
                                  <span className="text-xs text-slate-400 shrink-0">{i.sku || '-'}</span>
                                </button>
                              ))}
                              {itemMatches(line.item_query).length === 0 && (
                                <p className="px-3 py-2 text-xs text-slate-400">{t('common.noData')}</p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <input onKeyDown={handleLineKeyDown} placeholder={t('common.description')} className="input col-span-3 !py-2" value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                    <input onKeyDown={handleLineKeyDown} type="number" step="0.001" placeholder={t('common.qty')} className="input col-span-1 !py-2" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                    <input onKeyDown={handleLineKeyDown} type="number" step="0.001" placeholder={t('common.unitPrice')} className="input col-span-2 !py-2" value={line.unit_price} onChange={(e) => updateLine(idx, { unit_price: e.target.value })} />
                    <div className="col-span-1 text-sm py-2 text-end font-semibold">{computed[idx].total.toFixed(2)}</div>
                    <button type="button" onClick={() => removeLine(idx)} className="col-span-1 p-2 rounded-lg hover:bg-red-50 text-red-500 justify-self-center"><Trash2 size={15} /></button>
                  </div>
                ) : (
                <div className="grid grid-cols-13 gap-2 items-start">
                  <div className="col-span-1 text-sm py-2 text-center text-slate-400 font-semibold">{idx + 1}</div>
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
                )}

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
            {!isNewSales && (
              <div><span className="text-slate-400">{t('common.tax')}: </span><span className="font-semibold">{taxTotal.toFixed(3)}</span></div>
            )}
            <div><span className="text-slate-400">{t('common.total')}: </span><span className="font-bold text-base">{total.toFixed(3)}</span></div>
          </div>
        </div>

        {type === 'sales' && !isEdit && (
          <div className="card p-5">
            <h3 className="font-bold mb-1 flex items-center gap-1.5"><Wallet size={16} />{t('pos.pay')}</h3>
            <p className="text-sm text-slate-500 mb-4">{t('pos.amountDue', { amount: total.toFixed(3) })}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activePaymentMethods.length === 0 && (
                <p className="text-xs text-amber-500 sm:col-span-2">{t('pos.noPaymentMethods')}</p>
              )}
              {activePaymentMethods.map((pm) => (
                <div key={pm.id}>
                  <label className="label !flex items-center gap-1"><Banknote size={13} />{pm.name_en}</label>
                  <input
                    type="number" step="0.001" className="input"
                    value={tenderAmounts[pm.id] || ''}
                    onChange={(e) => setTenderAmounts({ ...tenderAmounts, [pm.id]: e.target.value })}
                  />
                </div>
              ))}
              <div>
                <label className="label !flex items-center gap-1"><Users size={13} />{t('pos.credit')}</label>
                <input type="number" step="0.001" className="input" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} disabled={!header.client_id} />
                {!header.client_id && <p className="text-xs text-amber-500 mt-1">{t('pos.creditNeedsClient')}</p>}
              </div>
            </div>
            <div className="flex items-center justify-between text-sm pt-3 mt-3 border-t border-slate-100 dark:border-navy-800">
              <span className="text-slate-500">{t('pos.tendered')}</span>
              <span className={`font-semibold ${Math.abs(tenderTotal - total) > 0.001 ? 'text-red-500' : 'text-emerald-500'}`}>{tenderTotal.toFixed(3)}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button disabled={saving} className="btn-ghost"><Save size={16} /> {isEdit ? t('vouchers.saveChanges') : t('vouchers.saveAsDraft')}</button>
          {type === 'sales' && !isEdit && (
            <button type="button" onClick={completeAndPay} disabled={completingPay} className="btn-primary">
              <CheckCircle2 size={16} /> {completingPay ? t('common.loading') : t('pos.completeSale')}
            </button>
          )}
        </div>
      </form>

      {newClientModalOpen && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={closeNewClientModal} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-6 max-w-sm w-full">
              <p className="font-bold text-lg text-navy-900 dark:text-white mb-4">{t('pos.newCustomer')}</p>
              <div className="space-y-3">
                <div>
                  <label className="label">{t('common.name')}</label>
                  <input
                    autoFocus={!newClientName}
                    className="input"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">{t('common.phone')}</label>
                  <input
                    autoFocus={!!newClientName}
                    className="input"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    placeholder={t('pos.phoneRequiredHint')}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-6">
                <button type="button" onClick={closeNewClientModal} className="btn-ghost">{t('common.cancel')}</button>
                <button type="button" onClick={createQuickClient} disabled={savingClient} className="btn-primary">
                  {savingClient ? t('common.loading') : t('pos.newCustomer')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
