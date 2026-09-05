import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, PauseCircle, XCircle, Lock, Unlock, CreditCard, Banknote, Landmark, Users,
  CalendarClock, RotateCcw, UserPlus, X,
} from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import useFinancialDefaults from '@/hooks/useFinancialDefaults';

const money = (n) => Number(n || 0).toFixed(3);

export default function PosPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const financialDefaults = useFinancialDefaults();

  const [access, setAccess] = useState(null); // { level, posPermissions, shift }
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [branches, setBranches] = useState([]);
  const [clients, setClients] = useState([]);

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
    loadHeld();
  }, [activeCompany]);

  useEffect(() => {
    if (!access?.shift) return;
    const handle = setTimeout(() => {
      api.get('/items', { params: query ? { q: query } : {} }).then((r) => setProducts(r.data.slice(0, 40)));
    }, 200);
    return () => clearTimeout(handle);
  }, [query, access?.shift]);

  const total = useMemo(() => cart.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0), [cart]);
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
  const clearCart = () => { setCart([]); setClientId(''); setDeliveryDate(''); setDeliveryAddress(''); };

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
      await api.post('/pos/sales', { client_id: clientId || null, action: 'hold', lines: buildLines(), delivery_date: deliveryDate || null, delivery_address: deliveryAddress || null });
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
    if (Math.abs(tenderTotal - total) > 0.001) return toast.error(t('pos.tenderMismatch'));
    if (Number(tender.knet) > 0 && !tender.knetReference.trim()) return toast.error(t('pos.knetReferenceRequired'));
    setPaying(true);
    try {
      const payments = [];
      if (Number(tender.cash) > 0) payments.push({ method: 'cash', amount: Number(tender.cash) });
      if (Number(tender.knet) > 0) payments.push({ method: 'knet', amount: Number(tender.knet), reference: tender.knetReference.trim() });
      if (Number(tender.credit) > 0) payments.push({ method: 'credit', amount: Number(tender.credit) });
      await api.post('/pos/sales', { client_id: clientId || null, action: 'complete', lines: buildLines(), payments, delivery_date: deliveryDate || null, delivery_address: deliveryAddress || null });
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
        actions={<button onClick={() => setCloseOpen(true)} className="btn-ghost flex items-center gap-2"><Lock size={15} />{t('pos.closeShift')}</button>}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={openHistory} className="btn-ghost flex items-center gap-1.5 text-sm"><CalendarClock size={15} />{t('pos.invoicesByDate')}</button>
        <button onClick={openHistory} className="btn-ghost flex items-center gap-1.5 text-sm"><Users size={15} />{t('common.client')}</button>
        {canRefund && <button onClick={openHistory} className="btn-ghost flex items-center gap-1.5 text-sm"><RotateCcw size={15} />{t('pos.refund')}</button>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Products */}
        <div className="lg:col-span-2 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('pos.searchFullInventory')}</p>
          <div className="relative">
            <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
            <input className="input ps-9" placeholder={t('pos.searchProducts')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto pe-1">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={Number(p.available_quantity) <= 0}
                className="card p-3 text-start hover:shadow-md transition-shadow disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <p className="font-semibold text-sm text-navy-900 dark:text-white truncate">{p.name_en}</p>
                <p className="text-xs text-slate-400 truncate">{p.code}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-sm text-navy-900 dark:text-white">{money(p.selling_price)}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${Number(p.available_quantity) > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {Number(p.available_quantity)} {t('pos.available')}
                  </span>
                </div>
                {Number(p.booked_quantity) > 0 && (
                  <p className="text-[11px] text-amber-500 mt-1">{Number(p.booked_quantity)} {t('items.booked')}</p>
                )}
              </button>
            ))}
            {!products.length && <p className="col-span-full text-center text-sm text-slate-400 py-8">{t('pos.noProducts')}</p>}
          </div>

          {!!held.length && (
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-2 flex items-center gap-2"><PauseCircle size={15} />{t('pos.heldSales')}</p>
              <div className="flex flex-wrap gap-2">
                {held.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-lg px-3 py-1.5 text-sm">
                    <button onClick={() => resumeHeld(h)} className="font-medium hover:underline">{h.invoice_no} — {money(h.total)}</button>
                    {canVoid && <button onClick={() => setVoidTarget(h)}><XCircle size={14} /></button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="card p-4 flex flex-col h-fit sticky top-4">
          <p className="font-bold text-navy-900 dark:text-white mb-3 flex items-center gap-2"><ShoppingCart size={16} />{t('pos.cart')}</p>

          <div className="mb-3">
            <div className="flex items-center justify-between">
              <label className="label flex items-center gap-1"><Users size={13} />{t('common.client')}</label>
              <button type="button" onClick={() => setNewClientOpen(true)} className="text-xs font-semibold text-navy-900 dark:text-white flex items-center gap-1 mb-1.5">
                <UserPlus size={13} />{t('pos.newCustomer')}
              </button>
            </div>
            <input
              className="input mb-1.5 text-sm"
              placeholder={t('pos.searchCustomerHint')}
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
            <select className="input" value={clientId} onChange={(e) => pickClient(e.target.value)}>
              <option value="">{t('pos.walkIn')}</option>
              {filteredClients.map((c) => <option key={c.id} value={c.id}>{c.name_en}{c.phone ? ` — ${c.phone}` : ''}</option>)}
            </select>
          </div>

          <div className="mb-3">
            <label className="label flex items-center gap-1"><CalendarClock size={13} />{t('invoices.deliveryDate')}</label>
            <input type="date" className="input mb-1.5" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            <label className="label">{t('invoices.deliveryAddress')}</label>
            <textarea className="input" rows={2} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder={t('invoices.deliveryAddressHint')} />
          </div>

          <div className="flex-1 overflow-y-auto max-h-[35vh] space-y-2 mb-3">
            {cart.map((l) => (
              <div key={l.item.id} className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 dark:border-navy-800 pb-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-navy-900 dark:text-white">{l.item.name_en}</p>
                  <p className="text-xs text-slate-400">{money(l.unit_price)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => changeQty(l.item.id, -1)} className="p-1 rounded bg-slate-100 dark:bg-navy-800"><Minus size={12} /></button>
                  <span className="w-6 text-center">{l.quantity}</span>
                  <button onClick={() => changeQty(l.item.id, 1)} className="p-1 rounded bg-slate-100 dark:bg-navy-800"><Plus size={12} /></button>
                  <button onClick={() => removeLine(l.item.id)} className="p-1 rounded bg-red-50 dark:bg-red-950 text-red-500 ms-1"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
            {!cart.length && <p className="text-center text-sm text-slate-400 py-6">{t('pos.emptyCart')}</p>}
          </div>

          <div className="flex items-center justify-between font-bold text-lg text-navy-900 dark:text-white mb-3">
            <span>{t('common.total')}</span>
            <span>{money(total)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={hold} disabled={!cart.length} className="btn-ghost flex items-center justify-center gap-1 disabled:opacity-40"><PauseCircle size={15} />{t('pos.hold')}</button>
            <button onClick={() => setPayOpen(true)} disabled={!cart.length} className="btn-primary flex items-center justify-center gap-1 disabled:opacity-40"><CreditCard size={15} />{t('pos.pay')}</button>
          </div>
        </div>
      </div>

      {/* Payment modal */}
      {payOpen && (
        <>
          <div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={() => setPayOpen(false)} />
          <div className="fixed z-50 inset-0 flex items-center justify-center p-4">
            <div className="card p-6 max-w-sm w-full">
              <p className="font-bold text-lg text-navy-900 dark:text-white mb-1">{t('pos.pay')}</p>
              <p className="text-sm text-slate-500 mb-4">{t('pos.amountDue', { amount: money(total) })}</p>
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
                  <span className={`font-semibold ${Math.abs(tenderTotal - total) > 0.001 ? 'text-red-500' : 'text-emerald-500'}`}>{money(tenderTotal)}</span>
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
