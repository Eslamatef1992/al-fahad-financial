import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

const emptyLine = () => ({ item_id: '', account_id: '', description: '', quantity: 1, unit_price: '', tax_rate: 0 });

export default function PurchaseOrderFormPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [accounts, setAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [branches, setBranches] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const [header, setHeader] = useState({
    supplier_id: '', date: new Date().toISOString().slice(0, 10), expected_date: '',
    cost_center_id: '', branch_id: '', notes: '',
  });
  const [lines, setLines] = useState([emptyLine()]);

  useEffect(() => {
    if (!activeCompany) return;
    api.get('/accounts').then((r) => setAccounts(r.data.filter((a) => !a.is_group)));
    api.get('/cost-centers').then((r) => setCostCenters(r.data));
    api.get('/branches').then((r) => setBranches(r.data));
    api.get('/suppliers').then((r) => setSuppliers(r.data));
    api.get('/items').then((r) => setAvailableItems(r.data));
  }, [activeCompany]);

  useEffect(() => {
    if (!activeCompany || !isEdit) return;
    api.get(`/purchase-orders/${id}`).then((r) => {
      const po = r.data;
      setHeader({
        supplier_id: po.supplier_id || '', date: po.date, expected_date: po.expected_date || '',
        cost_center_id: po.cost_center_id || '', branch_id: po.branch_id || '', notes: po.notes || '',
      });
      setLines(po.lines.map((l) => ({
        item_id: l.item_id || '', account_id: l.account_id, description: l.description || '',
        quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate,
      })));
      setLoading(false);
    });
  }, [activeCompany, isEdit, id]);

  const updateLine = (idx, patch) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const pickItem = (idx, itemId) => {
    const item = availableItems.find((i) => i.id === itemId);
    updateLine(idx, {
      item_id: itemId,
      account_id: item ? item.inventory_account_id : '',
      description: item ? item.name_en : '',
    });
  };
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (idx) => setLines((ls) => ls.filter((_, i) => i !== idx));

  const computed = lines.map((l) => {
    const qty = Number(l.quantity || 0);
    const price = Number(l.unit_price || 0);
    const taxRate = Number(l.tax_rate || 0);
    const subtotal = qty * price;
    const tax = subtotal * (taxRate / 100);
    return { subtotal, tax, total: subtotal + tax };
  });
  const subtotal = computed.reduce((s, l) => s + l.subtotal, 0);
  const taxTotal = computed.reduce((s, l) => s + l.tax, 0);
  const total = subtotal + taxTotal;

  const submit = async (e) => {
    e.preventDefault();
    if (!header.supplier_id) return toast.error(t('purchaseOrders.pleaseSelectSupplier'));
    const validLines = lines
      .filter((l) => (l.item_id || l.account_id) && Number(l.unit_price) > 0)
      .map((l) => ({ ...l, item_id: l.item_id || undefined }));
    if (validLines.length === 0) return toast.error(t('purchaseOrders.addLineItemPrompt'));

    setSaving(true);
    try {
      const payload = { ...header, lines: validLines };
      if (isEdit) {
        const { data } = await api.put(`/purchase-orders/${id}`, payload);
        toast.success(t('common.save'));
        navigate(`/purchase-orders/${data.id}`);
      } else {
        const { data } = await api.post('/purchase-orders', payload);
        toast.success(t('purchaseOrders.savedAsDraft'));
        navigate(`/purchase-orders/${data.id}`);
      }
    } finally { setSaving(false); }
  };

  if (loading) return <p className="text-slate-400">{t('common.loading')}</p>;

  return (
    <div>
      <button onClick={() => navigate('/purchase-orders')} className="btn-ghost !px-2 mb-3"><ArrowLeft size={16} /> {t('common.back')}</button>
      <PageHeader title={isEdit ? t('purchaseOrders.editTitle') : t('purchaseOrders.newTitle')} />

      <form onSubmit={submit} className="space-y-5">
        <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">{t('common.supplier')}</label>
            <select required className="input" value={header.supplier_id} onChange={(e) => setHeader({ ...header, supplier_id: e.target.value })}>
              <option value="">{t('common.select')}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}
            </select>
          </div>
          <div><label className="label">{t('common.date')}</label><input required type="date" className="input" value={header.date} onChange={(e) => setHeader({ ...header, date: e.target.value })} /></div>
          <div><label className="label">{t('purchaseOrders.expectedDate')}</label><input type="date" className="input" value={header.expected_date} onChange={(e) => setHeader({ ...header, expected_date: e.target.value })} /></div>
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
          <div className="sm:col-span-2"><label className="label">{t('common.notes')}</label><textarea className="input" rows={2} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} /></div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">{t('common.lineItems')}</h3>
            <button type="button" onClick={addLine} className="btn-ghost !py-1.5"><Plus size={15} /> {t('common.addLine')}</button>
          </div>
          <p className="text-xs text-slate-400 mb-3">{t('purchaseOrders.lineHint')}</p>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <motion.div key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-12 gap-2 items-start p-3 rounded-xl bg-slate-50 dark:bg-navy-800/40">
                <select className="input col-span-3 !py-2" value={line.item_id} onChange={(e) => pickItem(idx, e.target.value)}>
                  <option value="">{t('items.noItemFreehand')}</option>
                  {availableItems.map((i) => <option key={i.id} value={i.id}>{i.code} - {i.name_en}</option>)}
                </select>
                <select required className="input col-span-2 !py-2" value={line.account_id} onChange={(e) => updateLine(idx, { account_id: e.target.value })}>
                  <option value="">{t('accounts.parentAccount')}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
                </select>
                <input placeholder={t('common.description')} className="input col-span-2 !py-2" value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                <input type="number" step="0.001" placeholder={t('common.qty')} className="input col-span-1 !py-2" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                <input type="number" step="0.001" placeholder={t('common.unitPrice')} className="input col-span-2 !py-2" value={line.unit_price} onChange={(e) => updateLine(idx, { unit_price: e.target.value })} />
                <input type="number" step="0.01" placeholder={t('common.taxPercent')} className="input col-span-1 !py-2" value={line.tax_rate} onChange={(e) => updateLine(idx, { tax_rate: e.target.value })} />
                <button type="button" onClick={() => removeLine(idx)} className="col-span-1 p-2 rounded-lg hover:bg-red-50 text-red-500 justify-self-center"><Trash2 size={15} /></button>
              </motion.div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-6 mt-4 pt-4 border-t border-slate-100 dark:border-navy-800 text-sm">
            <div><span className="text-slate-400">{t('common.subtotal')}: </span><span className="font-semibold">{subtotal.toFixed(3)}</span></div>
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
