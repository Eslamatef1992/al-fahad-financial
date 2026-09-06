import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, PauseCircle, XCircle, Lock, Unlock, CreditCard, Banknote, Landmark, Users,
  CalendarClock, RotateCcw, UserPlus, X, FileText, Boxes, Factory, Ticket, PieChart, Tag,
} from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import useFinancialDefaults from '@/hooks/useFinancialDefaults';

const money = (n) => Number(n || 0).toFixed(3);

// One square button in the right-side action rail: icon on top, tiny label
// below, with an optional small count badge (e.g. number of held invoices).
function RailButton({ icon: Icon, label, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className="relative card p-2 flex flex-col items-center justify-center gap-1 hover:shadow-md transition-shadow text-center"
    >
      <Icon size={18} className="text-navy-900 dark:text-white" />
      <span className="text-[9px] font-medium text-slate-500 leading-tight">{label}</span>
      {!!badge && (
        <span className="absolute top-1 end-1 bg-red-500 text-white text-[9px] leading-none rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>
      )}
    </button>
  );
}

export default function PosPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const financialDefaults = useFinancialDefaults();

  const [access, setAccess] = useState(null); // { level, posPermissions, shift }
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [branches, setBranches] = useState([]);
  const [clients, setClients] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [manufactureOrderOpen, setManufactureOrderOpen] = useState(false);
  const [isManufactureOrder, setIsManufactureOrder] = useState(false);
  const [manufacturerId, setManufacturerId] = useState('');

  const [openFloat, setOpenFloat] = useState('');
  const [openBranch, setOpenBranch] = useState('');

  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]); // { item, quantity, unit_price }
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClient, setNewClient] = useState({ name_en: '', phone: '' });
  const [savingClient, setSavingClient] = useState(false);
  const [held, setHeld] = useState([]);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [tender, setTender] = useState({ cash: '', knet: '', credit: '', knetReference: '' });
  const [closeOpen, setCloseOpen] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [voidTarget, setVoidTarget] = useState(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyFilters, setHistoryFilters] = useState({ date_from: '', date_to: '', q: '' });
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  // Redesigned rail: main area now shows the invoice line-items table instead
  // of a product grid. Items get added either by typing/scanning a code into
  // the always-visible box below, or via the Inventory icon's search popup.
  const [codeEntry, setCodeEntry] = useState('');
  const [codeSuggestions, setCodeSuggestions] = useState([]);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  // 'branch' = only this shift's branch stock, 'main' = company-wide across
  // every branch. Defaults to the cashier's own branch since that's what
  // they're actually standing in front of.
  const [inventoryTab, setInventoryTab] = useState('branch');
  const [heldOpen, setHeldOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [couponsOpen, setCouponsOpen] = useState(false);
  const [discountCodes, setDiscountCodes] = useState([]);
  const [discountCode, setDiscountCode] = useState('');
  const [discountPreview, setDiscountPreview] = useState(null);
  const [discountError, setDiscountError] = useState('');
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  const loadAccess = () => {
    setLoadingAccess(true);
    api.get('/pos/me').then((r) => setAccess(r.data)).finally(() => setLoadingAccess(false));
  };
  const loadHeld = () => api.get('/pos/sales/held').then((r) => setHeld(r.data)).catch(() => {});

  useEffect(() => {
    if (!activeCompany) return;
    loadAccess();
    api.get('/branches').then((r) => setBranches(r.data)).catch(() => {});
    api.get('/clients').then((r) => setClients(r.data)).catch(() => {});
    api.get('/manufacturers').then((r) => setManufacturers(r.data)).catch(() => {});
    loadHeld();
  }, [activeCompany]);

  const branchScope = inventoryTab === 'branch' ? access?.shift?.branch_id || null : null;

  useEffect(() => {
    if (!access?.shift) return;
    const handle = setTimeout(() => {
      const params = { ...(query ? { q: query } : {}), ...(branchScope ? { branch_id: branchScope } : {}) };
      api.get('/items', { params }).then((r) => {
        const sorted = [...r.data].sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));
        setProducts(sorted.slice(0, 40));
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [query, access?.shift, branchScope]);

  // Live suggestions for the quick code-entry box: matches by code, SKU or
  // name as soon as a couple of characters are typed, so the cashier can pick
  // from a list instead of needing the exact code and pressing Enter blind.
  useEffect(() => {
    if (!access?.shift || !codeEntry.trim()) { setCodeSuggestions([]); return; }
    const handle = setTimeout(() => {
      const params = { q: codeEntry.trim(), ...(branchScope ? { branch_id: branchScope } : {}) };
      api.get('/items', { params }).then((r) => setCodeSuggestions(r.data.slice(0, 8))).catch(() => {});
    }, 150);
    return () => clearTimeout(handle);
  }, [codeEntry, access?.shift, branchScope]);

  const total = useMemo(() => cart.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0), [cart]);
  const netTotal = discountPreview ? Math.max(total - Number(discountPreview.discount_amount || 0), 0) : total;
  const canCredit = access?.level === 'operator' || access?.posPermissions?.includes('credit_sale');
  const canVoid = access?.level === 'operator' || access?.posPermissions?.includes('void');
  const canRefund = access?.level === 'operator' || access?.posPermissions?.includes('refund');

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => c.name_en?.toLowerCase().includes(q) || c.name_ar?.includes(q) || c.phone?.includes(clientSearch));
  }, [clients, clientSearch]);

  const createQuickClient = async () => {
    if (!newClient.name_en.trim() || !newClient.phone.trim()) {
      toast.error(t('pos.quickClientRequired'));
      return;
    }
    setSavingClient(true);
    try {
      const { data } = await api.post('/clients', {
        name_en: newClient.name_en.trim(),
        name_ar: newClient.name_en.trim(),
        phone: newClient.phone.trim(),
        parent_account_id: financialDefaults.client_parent_account_id || null,
      });
      setClients((prev) => [...prev, data]);
      setClientId(data.id);
      setClientSearch('');
      setNewClient({ name_en: '', phone: '' });
      setNewClientOpen(false);
      toast.success(t('pos.customerAdded'));
    } catch (e) { /* toast handled globally */ }
    finally { setSavingClient(false); }
  };

  const loadHistory = () => {
    setHistoryLoading(true);
    const params = {};
    if (historyFilters.date_from) params.date_from = historyFilters.date_from;
    if (historyFilters.date_to) params.date_to = historyFilters.date_to;
    if (historyFilters.q) params.q = historyFilters.q;
    api.get('/pos/sales/history', { params }).then((r) => setHistoryRows(r.data)).finally(() => setHistoryLoading(false));
  };
  const openHistory = () => { setHistoryOpen(true); loadHistory(); };

  const confirmRefund = async () => {
    setRefunding(true);
    try {
      await api.post(`/pos/sales/${refundTarget.id}/refund`, { reason: refundReason || undefined });
      toast.success(t('pos.refunded'));
      setRefundTarget(null);
      setRefundReason('');
      loadHistory();
    } catch (e) { /* toast handled globally */ }
    finally { setRefunding(false); }
  };

  const addToCart = (item) => {
    if (Number(item.available_quantity) <= 0) return toast.error(t('pos.outOfStock'));
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id);
      if (existing) {
        if (Number(existing.quantity) + 1 > Number(item.available_quantity)) { toast.error(t('pos.outOfStock')); return prev; }
        return prev.map((l) => l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...prev, { item, quantity: 1, unit_price: Number(item.selling_price || 0) }];
    });
  };
  const changeQty = (itemId, delta) => {
    setCart((prev) => prev.map((l) => {
      if (l.item.id !== itemId) return l;
      const next = l.quantity + delta;
      if (next > Number(l.item.available_quantity)) { toast.error(t('pos.outOfStock')); return l; }
      return { ...l, quantity: next };
    }).filter((l) => l.quantity > 0));
  };
  const removeLine = (itemId) => setCart((prev) => prev.filter((l) => l.item.id !== itemId));
  const clearCart = () => {
    setCart([]); setClientId(''); setDeliveryDate(''); setDeliveryAddress('');
    setDiscountCode(''); setDiscountPreview(null); setDiscountError(''); setCodeEntry('');
    setIsManufactureOrder(false); setManufacturerId('');
  };
  // "Invoice" rail icon — starts a fresh blank sale.
  const newInvoice = () => clearCart();

  // Quick code/barcode entry: typed into the always-visible box above the
  // invoice table, or scanned. Looks for an exact code/sku match first (what
  // a barcode scan produces); falls back to the first search result so a
  // partial code still finds something.
  const addByCode = async () => {
    const code = codeEntry.trim();
    if (!code) return;
    try {
      const { data } = await api.get('/items', { params: { q: code, ...(branchScope ? { branch_id: branchScope } : {}) } });
      if (!data.length) { toast.error(t('pos.itemNotFound')); return; }
      const exact = data.find((p) => p.code?.toLowerCase() === code.toLowerCase() || p.sku?.toLowerCase() === code.toLowerCase());
      addToCart(exact || data[0]);
      setCodeEntry('');
      setCodeSuggestions([]);
    } catch (e) { /* toast handled globally */ }
  };
  const pickSuggestion = (item) => { addToCart(item); setCodeEntry(''); setCodeSuggestions([]); };

  const loadDiscountCodes = () => api.get('/discount-codes').then((r) => setDiscountCodes(r.data)).catch(() => {});
  const applyDiscount = async (codeOverride) => {
    const code = (codeOverride || discountCode).trim().toUpperCase();
    if (!code) return;
    setApplyingDiscount(true);
    try {
      const { data } = await api.post('/discount-codes/preview', { code, base_amount: total, scope: 'invoice' });
      setDiscountCode(code);
      setDiscountPreview(data);
      setDiscountError('');
      setCouponsOpen(false);
    } catch (err) {
      setDiscountPreview(null);
      setDiscountError(err.response?.data?.message || t('common.error'));
    } finally { setApplyingDiscount(false); }
  };
  const removeDiscount = () => { setDiscountCode(''); setDiscountPreview(null); setDiscountError(''); };

  // Picking a client prefills the delivery address from their record, but
  // never overwrites an address already typed for this sale.
  const pickClient = (id) => {
    const client = clients.find((c) => c.id === id);
    setClientId(id);
    setDeliveryAddress((prev) => (!prev && client?.address ? client.address : prev));
  };

  const openShift = async () => {
    try {
      await api.post('/pos/shift/open', { branch_id: openBranch || null, opening_float: Number(openFloat || 0) });
      toast.success(t('pos.shiftOpened'));
      loadAccess();
    } catch (e) { /* toast handled globally */ }
  };

  const doCloseShift = async () => {
    try {
      await api.post(`/pos/shift/${access.shift.id}/close`, { counted_cash: Number(countedCash || 0) });
      toast.success(t('pos.shiftClosed'));
      setCloseOpen(false);
      setCountedCash('');
      loadAccess();
    } catch (e) { /* toast handled globally */ }
  };

  const buildLines = () => cart.map((l) => ({
    account_id: l.item.income_account_id,
    item_id: l.item.id,
    description: l.item.name_en,
    quantity: l.quantity,
    unit_price: l.unit_price,
  }));

  const hold = async () => {
    if (!cart.length) return;
    try {
      await api.post('/pos/sales', { client_id: clientId || null, action: 'hold', lines: buildLines(), delivery_date: deliveryDate || null, delivery_address: deliveryAddress || null, discount_code: discountCode || undefined, is_manufacture_order: isManufactureOrder, manufacturer_id: isManufactureOrder ? (manufacturerId || null) : null });
      toast.success(t('pos.saleHeld'));
      clearCart();
      loadHeld();
    } catch (e) { /* toast handled globally */ }
  };

  const resumeHeld = (sale) => {
    setCart(sale.lines.map((l) => ({
      item: { id: l.item_id, name_en: l.description, income_account_id: l.account_id, selling_price: l.unit_price, available_quantity: 999999 },
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
    })));
    setClientId(sale.client_id || '');
    setDeliveryDate(sale.delivery_date || '');
    setDeliveryAddress(sale.delivery_address || '');
    voidHeldSilently(sale.id);
  };
  const voidHeldSilently = async (id) => { try { await api.post(`/pos/sales/${id}/void`); loadHeld(); } catch (e) {} };

  const tenderTotal = Number(tender.cash || 0) + Number(tender.knet || 0) + Number(tender.credit || 0);
  const submitPayment = async () => {
    if (Math.abs(tenderTotal - netTotal) > 0.001) return toast.error(t('pos.tenderMismatch'));
    if (Number(tender.knet) > 0 && !tender.knetReference.trim()) return toast.error(t('pos.knetReferenceRequired'));
    setPaying(true);
    try {
      const payments = [];
      if (Number(tender.cash) > 0) payments.push({ method: 'cash', amount: Number(tender.cash) });
      if (Number(tender.knet) > 0) payments.push({ method: 'knet', amount: Number(tender.knet), reference: tender.knetReference.trim() });
      if (Number(tender.credit) > 0) payments.push({ method: 'credit', amount: Number(tender.credit) });
      await api.post('/pos/sales', { client_id: clientId || null, action: 'complete', lines: buildLines(), payments, delivery_date: deliveryDate || null, delivery_address: deliveryAddress || null, discount_code: discountCode || undefined, is_manufacture_order: isManufactureOrder, manufacturer_id: isManufactureOrder ? (manufacturerId || null) : null });
      toast.success(t('pos.saleCompleted'));
      setPayOpen(false);
      setTender({ cash: '', knet: '', credit: '', knetReference: '' });
      clearCart();
    } catch (e) { /* toast handled globally */ }
    finally { setPaying(false); }
  };

  const confirmVoid = async () => {
    try {
      await api.post(`/pos/sales/${voidTarget.id}/void`);
      toast.success(t('pos.saleVoided'));
      loadHeld();
    } catch (e) { /* toast handled globally */ }
    setVoidTarget(null);
  };

  if (loadingAccess) return <div className="p-8 text-center text-slate-400">{t('common.loading')}</div>;
  if (!access?.level) {
    return (
      <div>
        <PageHeader title={t('nav.pos')} />
        <div className="card p-8 text-center text-slate-500">{t('pos.noAccess')}</div>
      </div>
    );
  }

  if (!access.shift) {
    return (
      <div className="max-w-md mx-auto mt-10">
        <div className="card p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-navy-900 text-white dark:bg-white dark:text-navy-900 flex items-center justify-center mx-auto mb-4">
            <Unlock size={24} />
          </div>
          <h2 className="font-bold text-lg text-navy-900 dark:text-white mb-1">{t('pos.openShiftTitle')}</h2>
          <p className="text-sm text-slate-500 mb-6">{t('pos.openShiftHint')}</p>
          <div className="space-y-3 text-start">
            <div>
              <label className="label">{t('common.branch')}</label>
              <select className="input" value={openBranch} onChange={(e) => setOpenBranch(e.target.value)}>
                <option value="">{t('common.select')}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name_en}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('pos.openingFloat')}</label>
              <input type="number" step="0.001" className="input" value={openFloat} onChange={(e) => setOpenFloat(e.target.value)} placeholder="0.000" />
            </div>
          </div>
          <button onClick={openShift} className="btn-primary w-full mt-6">{t('pos.openShift')}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('nav.pos')}
        subtitle={t('pos.shiftInfo', { branch: branches.find((b) => b.id === access.shift.branch_id)?.name_en || t('branches.unbranchedPool'), float: money(access.shift.opening_float) })}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_84px] gap-3">
        {/* Invoice */}
        <div className="space-y-3 min-w-0">
          {/* Header strip: client, quick code entry, coupon, total, hold/pay */}
          <div className="card p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="label flex items-center gap-1 text-[11px]"><Users size={11} />{t('common.client')}</label>
                  <button type="button" onClick={() => setNewClientOpen(true)} className="text-[11px] font-semibold text-navy-900 dark:text-white flex items-center gap-1 mb-1">
                    <UserPlus size={11} />{t('pos.newCustomer')}
                  </button>
                </div>
                <input
                  className="input mb-1 text-xs py-1.5"
                  placeholder={t('pos.searchCustomerHint')}
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                <select className="input text-xs py-1.5" value={clientId} onChange={(e) => pickClient(e.target.value)}>
                  <option value="">{t('pos.walkIn')}</option>
                  {filteredClients.map((c) => <option key={c.id} value={c.id}>{c.name_en}{c.phone ? ` — ${c.phone}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="label flex items-center gap-1 text-[11px]"><FileText size={11} />{t('pos.quickAddByCode')}</label>
                <div className="relative">
                  <Search size={13} className="absolute top-1/2 -translate-y-1/2 start-2.5 text-slate-400" />
                  <input
                    className="input ps-7 text-xs py-1.5"
                    placeholder={t('pos.quickAddByCodeHint')}
                    value={codeEntry}
                    onChange={(e) => setCodeEntry(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addByCode(); } }}
                  />
                  {!!codeEntry.trim() && !!codeSuggestions.length && (
                    <div className="absolute z-30 top-full mt-1 start-0 end-0 card p-1 max-h-56 overflow-y-auto shadow-lg">
                      {codeSuggestions.map((p) => (
                        <button
                          key={p.id}
                          onMouseDown={() => pickSuggestion(p)}
                          disabled={Number(p.available_quantity) <= 0}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-900 text-start disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-navy-900 dark:text-white truncate">{p.name_en}</p>
                            <p className="text-[10px] text-slate-400">{p.code}</p>
                          </div>
                          <div className="text-end shrink-0">
                            <p className="text-xs font-semibold text-navy-900 dark:text-white">{money(p.selling_price)}</p>
                            <p className="text-[10px] text-slate-400">{Number(p.available_quantity)} {t('pos.available')}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {discountPreview ? (
                  <div className="flex items-center justify-between mt-1.5 text-[11px] text-emerald-600">
                    <span className="flex items-center gap-1"><Tag size={11} />{discountPreview.code} — {t('invoices.discountAppliedAmount', { amount: money(discountPreview.discount_amount) })}</span>
                    <button onClick={removeDiscount} className="text-red-500"><X size={12} /></button>
                  </div>
                ) : discountError ? (
                  <p className="text-[11px] text-red-500 mt-1.5">{discountError}</p>
                ) : null}
                {!!deliveryAddress && (
                  <p className="flex items-start gap-1 mt-1.5 text-[11px] text-slate-500">
                    <CalendarClock size={11} className="shrink-0 mt-0.5" />
                    <span className="truncate">{deliveryDate ? `${deliveryDate} — ` : ''}{deliveryAddress}</span>
                  </p>
                )}
                {isManufactureOrder && (
                  <p className="flex items-center gap-1 mt-1.5 text-[11px] text-amber-600">
                    <Factory size={11} className="shrink-0" />
                    <span className="truncate">{t('pos.railManufactureOrder')}{manufacturerId ? ` — ${manufacturers.find((m) => m.id === manufacturerId)?.name_en || ''}` : ''}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[45vh] mb-2 border border-slate-100 dark:border-navy-800 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-navy-900 text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="text-start py-1.5 px-2 font-semibold">{t('pos.colCode')}</th>
                    <th className="text-start py-1.5 px-2 font-semibold">{t('pos.colDescription')}</th>
                    <th className="text-center py-1.5 px-2 font-semibold">{t('pos.colQty')}</th>
                    <th className="text-end py-1.5 px-2 font-semibold">{t('pos.colPrice')}</th>
                    <th className="text-end py-1.5 px-2 font-semibold">{t('pos.colTotal')}</th>
                    <th className="py-1.5 px-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((l) => (
                    <tr key={l.item.id} className="border-t border-slate-100 dark:border-navy-800">
                      <td className="py-1.5 px-2 text-slate-400 whitespace-nowrap">{l.item.code}</td>
                      <td className="py-1.5 px-2 min-w-0">
                        <p className="truncate font-medium text-navy-900 dark:text-white leading-tight">{l.item.name_en}</p>
                      </td>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-0.5 justify-center">
                          <button onClick={() => changeQty(l.item.id, -1)} className="p-0.5 rounded bg-slate-100 dark:bg-navy-800"><Minus size={10} /></button>
                          <span className="w-6 text-center">{l.quantity}</span>
                          <button onClick={() => changeQty(l.item.id, 1)} className="p-0.5 rounded bg-slate-100 dark:bg-navy-800"><Plus size={10} /></button>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-end whitespace-nowrap">{money(l.unit_price)}</td>
                      <td className="py-1.5 px-2 text-end font-semibold text-navy-900 dark:text-white whitespace-nowrap">{money(l.quantity * l.unit_price)}</td>
                      <td className="py-1.5 px-1">
                        <button onClick={() => removeLine(l.item.id)} className="p-0.5 rounded bg-red-50 dark:bg-red-950 text-red-500"><Trash2 size={11} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!cart.length && <p className="text-center text-xs text-slate-400 py-8">{t('pos.emptyCart')}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                {discountPreview && <p className="text-[11px] text-slate-400 line-through">{money(total)}</p>}
                <div className="flex items-center gap-1.5 font-bold text-base text-navy-900 dark:text-white">
                  <span>{t('common.total')}</span>
                  <span>{money(netTotal)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={hold} disabled={!cart.length} className="btn-ghost flex items-center justify-center gap-1 text-xs py-1.5 px-3 disabled:opacity-40"><PauseCircle size={13} />{t('pos.hold')}</button>
                <button onClick={() => setPayOpen(true)} disabled={!cart.length} className="btn-primary flex items-center justify-center gap-1 text-xs py-1.5 px-3 disabled:opacity-40"><CreditCard size={13} />{t('pos.pay')}</button>
              </div>
            </div>
          </div>
        </div>

        {/* Action rail */}
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-1.5 content-start">
          <RailButton icon={FileText} label={t('pos.railInvoice')} onClick={newInvoice} />
          <RailButton icon={Boxes} label={t('pos.railInventory')} onClick={() => setInventoryOpen(true)} />
          {canRefund && <RailButton icon={RotateCcw} label={t('pos.refund')} onClick={openHistory} />}
          <RailButton icon={Lock} label={t('pos.closeShift')} onClick={() => setCloseOpen(true)} />
          <RailButton icon={PauseCircle} label={t('pos.railHoldInvoices')} onClick={() => setHeldOpen(true)} badge={held.length || null} />
          <RailButton icon={Factory} label={t('pos.railManufactureOrder')} onClick={() => setManufactureOrderOpen(true)} badge={isManufactureOrder ? '✓' : null} />
          <RailButton icon={CalendarClock} label={t('invoices.deliveryDate')} onClick={() => setDeliveryOpen(true)} />
          <RailButton icon={Ticket} label={t('pos.railCoupons')} onClick={() => { setCouponsOpen(true); loadDiscountCodes(); }} />
          <RailButton icon={PieChart} label={t('nav.reports')} onClick={() => navigate('/reports')} />
        </div>
      </div>

      {/* Inventory search popup — add items by browsing/searching */}
      {inventoryOpen && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setInventoryOpen(false)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-4 max-w-4xl w-full max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-navy-900 dark:text-white flex items-center gap-2"><Boxes size={16} />{t('pos.searchFullInventory')}</p>
                <button onClick={() => setInventoryOpen(false)}><X size={18} /></button>
              </div>
              <div className="flex gap-1.5 mb-3">
                <button
                  onClick={() => setInventoryTab('branch')}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${inventoryTab === 'branch' ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900' : 'bg-slate-100 dark:bg-navy-800 text-slate-500'}`}
                >
                  {t('pos.tabBranchInventory')}
                </button>
                <button
                  onClick={() => setInventoryTab('main')}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${inventoryTab === 'main' ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900' : 'bg-slate-100 dark:bg-navy-800 text-slate-500'}`}
                >
                  {t('pos.tabMainInventory')}
                </button>
              </div>
              <div className="relative mb-3">
                <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-2.5 text-slate-400" />
                <input className="input ps-8 text-sm" placeholder={t('pos.searchProducts')} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 overflow-y-auto pe-1">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={Number(p.available_quantity) <= 0}
                    className="card p-1.5 text-start hover:shadow-md transition-shadow disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <p className="font-semibold text-xs text-navy-900 dark:text-white truncate leading-tight">{p.name_en}</p>
                    <p className="text-[10px] text-slate-400 truncate">{p.code}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-bold text-xs text-navy-900 dark:text-white">{money(p.selling_price)}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded-full ${Number(p.available_quantity) > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                        {Number(p.available_quantity)} {t('pos.available')}
                      </span>
                    </div>
                    {Number(p.booked_quantity) > 0 && (
                      <p className="text-[9px] text-amber-500 mt-0.5">{Number(p.booked_quantity)} {t('items.booked')}</p>
                    )}
                  </button>
                ))}
                {!products.length && <p className="col-span-full text-center text-sm text-slate-400 py-8">{t('pos.noProducts')}</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Held invoices */}
      {heldOpen && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setHeldOpen(false)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-4 max-w-md w-full max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-navy-900 dark:text-white flex items-center gap-2"><PauseCircle size={16} />{t('pos.heldSales')}</p>
                <button onClick={() => setHeldOpen(false)}><X size={18} /></button>
              </div>
              <div className="space-y-1.5 overflow-y-auto">
                {held.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-lg px-3 py-2 text-sm">
                    <button onClick={() => { resumeHeld(h); setHeldOpen(false); }} className="font-medium hover:underline text-start">{h.invoice_no} — {money(h.total)}</button>
                    {canVoid && <button onClick={() => setVoidTarget(h)}><XCircle size={14} /></button>}
                  </div>
                ))}
                {!held.length && <p className="text-center text-sm text-slate-400 py-6">{t('common.noData')}</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delivery date/address */}
      {deliveryOpen && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setDeliveryOpen(false)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-6 max-w-sm w-full">
              <p className="font-bold text-lg text-navy-900 dark:text-white mb-4 flex items-center gap-2"><CalendarClock size={18} />{t('invoices.deliveryDate')}</p>
              <label className="label">{t('invoices.deliveryDate')}</label>
              <input type="date" className="input mb-3" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              <label className="label">{t('invoices.deliveryAddress')}</label>
              <textarea className="input" rows={3} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder={t('invoices.deliveryAddressHint')} />
              <div className="flex items-center justify-end gap-2 mt-6">
                <button onClick={() => setDeliveryOpen(false)} className="btn-primary">{t('common.done')}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Manufacture Order tag — checking the box and picking a manufacturer
          only tags this sale for later filtering/reporting, it does not open
          any purchasing flow. */}
      {manufactureOrderOpen && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setManufactureOrderOpen(false)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-6 max-w-sm w-full">
              <p className="font-bold text-lg text-navy-900 dark:text-white mb-4 flex items-center gap-2"><Factory size={18} />{t('pos.railManufactureOrder')}</p>
              <label className="flex items-center gap-2 text-sm text-navy-900 dark:text-white mb-3 cursor-pointer">
                <input type="checkbox" className="rounded" checked={isManufactureOrder} onChange={(e) => setIsManufactureOrder(e.target.checked)} />
                {t('pos.manufactureOrderCheckbox')}
              </label>
              {isManufactureOrder && (
                <div>
                  <label className="label">{t('nav.manufacturers')}</label>
                  <select className="input" value={manufacturerId} onChange={(e) => setManufacturerId(e.target.value)}>
                    <option value="">{t('common.select')}</option>
                    {manufacturers.filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{m.name_en}</option>)}
                  </select>
                </div>
              )}
              <div className="flex items-center justify-end gap-2 mt-6">
                <button onClick={() => setManufactureOrderOpen(false)} className="btn-primary">{t('common.done')}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Available coupons */}
      {couponsOpen && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setCouponsOpen(false)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-4 max-w-md w-full max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-navy-900 dark:text-white flex items-center gap-2"><Ticket size={16} />{t('pos.railCoupons')}</p>
                <button onClick={() => setCouponsOpen(false)}><X size={18} /></button>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <input className="input text-sm" placeholder={t('invoices.discountCodePlaceholder')} value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} />
                <button onClick={() => applyDiscount()} disabled={applyingDiscount || !discountCode.trim()} className="btn-primary shrink-0">{t('invoices.applyDiscount')}</button>
              </div>
              {discountError && <p className="text-xs text-red-500 mb-2">{discountError}</p>}
              <div className="space-y-1.5 overflow-y-auto">
                {discountCodes.filter((c) => c.is_active).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => applyDiscount(c.code)}
                    className="w-full flex items-center justify-between gap-2 border border-slate-100 dark:border-navy-800 rounded-lg px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-navy-900 text-start"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-navy-900 dark:text-white">{c.code}</p>
                      {c.description && <p className="text-xs text-slate-400 truncate">{c.description}</p>}
                    </div>
                    <span className="text-xs font-semibold text-emerald-600 shrink-0">
                      {c.type === 'percentage' ? `${Number(c.value)}%` : money(c.value)}
                    </span>
                  </button>
                ))}
                {!discountCodes.length && <p className="text-center text-sm text-slate-400 py-6">{t('common.noData')}</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Payment modal */}
      {payOpen && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setPayOpen(false)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-6 max-w-sm w-full">
              <p className="font-bold text-lg text-navy-900 dark:text-white mb-1">{t('pos.pay')}</p>
              <p className="text-sm text-slate-500 mb-4">{t('pos.amountDue', { amount: money(netTotal) })}</p>
              <div className="space-y-3">
                <div>
                  <label className="label flex items-center gap-1"><Banknote size={13} />{t('pos.cash')}</label>
                  <input type="number" step="0.001" className="input" value={tender.cash} onChange={(e) => setTender({ ...tender, cash: e.target.value })} />
                </div>
                <div>
                  <label className="label flex items-center gap-1"><Landmark size={13} />{t('pos.knet')}</label>
                  <input type="number" step="0.001" className="input" value={tender.knet} onChange={(e) => setTender({ ...tender, knet: e.target.value })} />
                  {Number(tender.knet) > 0 && (
                    <input
                      className="input mt-1.5"
                      value={tender.knetReference}
                      onChange={(e) => setTender({ ...tender, knetReference: e.target.value })}
                      placeholder={t('pos.knetReferencePlaceholder')}
                    />
                  )}
                </div>
                {canCredit && (
                  <div>
                    <label className="label flex items-center gap-1"><Users size={13} />{t('pos.credit')}</label>
                    <input type="number" step="0.001" className="input" value={tender.credit} onChange={(e) => setTender({ ...tender, credit: e.target.value })} disabled={!clientId} />
                    {!clientId && <p className="text-xs text-amber-500 mt-1">{t('pos.creditNeedsClient')}</p>}
                  </div>
                )}
                <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100 dark:border-navy-800">
                  <span className="text-slate-500">{t('pos.tendered')}</span>
                  <span className={`font-semibold ${Math.abs(tenderTotal - netTotal) > 0.001 ? 'text-red-500' : 'text-emerald-500'}`}>{money(tenderTotal)}</span>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-6">
                <button onClick={() => setPayOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
                <button onClick={submitPayment} disabled={paying} className="btn-primary">{paying ? t('common.loading') : t('pos.completeSale')}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Close shift modal */}
      {closeOpen && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setCloseOpen(false)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-6 max-w-sm w-full">
              <p className="font-bold text-lg text-navy-900 dark:text-white mb-4">{t('pos.closeShift')}</p>
              <label className="label">{t('pos.countedCash')}</label>
              <input type="number" step="0.001" className="input" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
              <div className="flex items-center justify-end gap-2 mt-6">
                <button onClick={() => setCloseOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
                <button onClick={doCloseShift} className="btn-primary">{t('pos.closeShift')}</button>
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!voidTarget}
        onCancel={() => setVoidTarget(null)}
        onConfirm={confirmVoid}
        message={t('pos.confirmVoid')}
        confirmLabel={t('pos.void')}
      />

      {/* New customer quick-add */}
      {newClientOpen && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setNewClientOpen(false)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-6 max-w-sm w-full">
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-lg text-navy-900 dark:text-white flex items-center gap-2"><UserPlus size={18} />{t('pos.newCustomer')}</p>
                <button onClick={() => setNewClientOpen(false)}><X size={18} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label">{t('common.nameEn')}</label>
                  <input className="input" value={newClient.name_en} onChange={(e) => setNewClient({ ...newClient, name_en: e.target.value })} />
                </div>
                <div>
                  <label className="label">{t('common.phone')}</label>
                  <input className="input" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder={t('pos.phoneRequiredHint')} />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-6">
                <button onClick={() => setNewClientOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
                <button onClick={createQuickClient} disabled={savingClient} className="btn-primary">{savingClient ? t('common.loading') : t('common.save')}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Sales history: Invoices By Date + Customer search + Refund */}
      {historyOpen && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setHistoryOpen(false)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-6 max-w-3xl w-full max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-lg text-navy-900 dark:text-white flex items-center gap-2"><CalendarClock size={18} />{t('pos.invoicesByDate')}</p>
                <button onClick={() => setHistoryOpen(false)}><X size={18} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4">
                <input type="date" className="input" value={historyFilters.date_from} onChange={(e) => setHistoryFilters({ ...historyFilters, date_from: e.target.value })} />
                <input type="date" className="input" value={historyFilters.date_to} onChange={(e) => setHistoryFilters({ ...historyFilters, date_to: e.target.value })} />
                <input className="input sm:col-span-1" placeholder={t('pos.customerSearchPlaceholder')} value={historyFilters.q} onChange={(e) => setHistoryFilters({ ...historyFilters, q: e.target.value })} />
                <button onClick={loadHistory} className="btn-primary">{t('common.applyFilters')}</button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {historyLoading && <p className="text-center text-sm text-slate-400 py-6">{t('common.loading')}</p>}
                {!historyLoading && !historyRows.length && <p className="text-center text-sm text-slate-400 py-6">{t('common.noData')}</p>}
                {!historyLoading && historyRows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-navy-800 pb-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-navy-900 dark:text-white">{row.invoice_no} — {row.date}</p>
                      <p className="text-xs text-slate-400 truncate">{row.client ? `${row.client.name_en}${row.client.phone ? ' — ' + row.client.phone : ''}` : t('pos.walkIn')}</p>
                      {row.delivery_date && <p className="text-xs text-amber-500 truncate">{t('invoices.deliveryDate')}: {row.delivery_date}</p>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-semibold text-navy-900 dark:text-white">{money(row.total)}</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${row.status === 'cancelled' ? 'bg-slate-100 text-slate-400' : row.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                        {t(`pos.status_${row.status}`)}
                      </span>
                      {canRefund && ['paid', 'partially_paid'].includes(row.status) && (
                        <button onClick={() => setRefundTarget(row)} title={t('pos.refund')} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-500">
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Refund confirm */}
      {!!refundTarget && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setRefundTarget(null)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-6 max-w-sm w-full">
              <p className="font-bold text-lg text-navy-900 dark:text-white mb-2">{t('pos.refund')}</p>
              <p className="text-sm text-slate-500 mb-4">{t('pos.confirmRefund', { invoice: refundTarget.invoice_no })}</p>
              <label className="label">{t('pos.refundReason')}</label>
              <textarea className="input" rows={2} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
              <div className="flex items-center justify-end gap-2 mt-6">
                <button onClick={() => setRefundTarget(null)} className="btn-ghost">{t('common.cancel')}</button>
                <button onClick={confirmRefund} disabled={refunding} className="btn-primary">{refunding ? t('common.loading') : t('pos.refund')}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
