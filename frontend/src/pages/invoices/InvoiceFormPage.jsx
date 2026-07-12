import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

const emptyLine = () => ({ account_id: '', description: '', quantity: 1, unit_price: '', tax_rate: 0 });

export default function InvoiceFormPage() {
  const { t } = useTranslation();
  const { type, id } = useParams(); // 'sales' | 'purchase'; id present only when editing an existing draft
  const isEdit = !!id;
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [accounts, setAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const partyKey = type === 'sales' ? 'client_id' : 'supplier_id';
  const [header, setHeader] = useState({
    client_id: '', supplier_id: '', date: new Date().toISOString().slice(0, 10), due_date: '',
    cost_center_id: '', reference_no: '', notes: '',
  });
  const [lines, setLines] = useState([emptyLine()]);

  useEffect(() => {
    if (!activeCompany) return;
    const relevantType = type === 'sales' ? ['revenue'] : ['expense'];
    api.get('/accounts').then((r) => setAccounts(r.data.filter((a) => !a.is_group && relevantType.includes(a.type))));
    api.get('/cost-centers').then((r) => setCostCenters(r.data));
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
        cost_center_id: inv.cost_center_id || '', reference_no: inv.reference_no || '', notes: inv.notes || '',
      });
      setLines(inv.lines.map((l) => ({
        account_id: l.account_id, description: l.description || '',
        quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate,
      })));
      setLoading(false);
    });
  }, [activeCompany, isEdit, id]);

  const updateLine = (idx, patch) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
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
    if (!header[partyKey]) return toast.error(type === 'sales' ? t('invoices.pleaseSelectClient') : t('invoices.pleaseSelectSupplier'));
    const validLines = lines.filter((l) => l.account_id && Number(l.unit_price) > 0);
    if (validLines.length === 0) return toast.error(t('invoices.addLineItemPrompt'));

    setSaving(true);
    try {
      const payload = { type, ...header, client_id: header.client_id || undefined, supplier_id: header.supplier_id || undefined, lines: validLines };
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
          <div className="sm:col-span-2"><label className="label">{t('common.notes')}</label><textarea className="input" rows={2} value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} /></div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">{t('common.lineItems')}</h3>
            <button type="button" onClick={addLine} className="btn-ghost !py-1.5"><Plus size={15} /> {t('common.addLine')}</button>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <motion.div key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-12 gap-2 items-start p-3 rounded-xl bg-slate-50 dark:bg-navy-800/40">
                <select required className="input col-span-3 !py-2" value={line.account_id} onChange={(e) => updateLine(idx, { account_id: e.target.value })}>
                  <option value="">{type === 'sales' ? t('invoices.revenueAccountPlaceholder') : t('invoices.expenseAccountPlaceholder')}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
                </select>
                <input placeholder={t('common.description')} className="input col-span-3 !py-2" value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                <input type="number" step="0.001" placeholder={t('common.qty')} className="input col-span-1 !py-2" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                <input type="number" step="0.001" placeholder={t('common.unitPrice')} className="input col-span-2 !py-2" value={line.unit_price} onChange={(e) => updateLine(idx, { unit_price: e.target.value })} />
                <input type="number" step="0.01" placeholder={t('common.taxPercent')} className="input col-span-1 !py-2" value={line.tax_rate} onChange={(e) => updateLine(idx, { tax_rate: e.target.value })} />
                <div className="col-span-1 text-sm py-2 text-end font-semibold">{(Number(line.quantity || 0) * Number(line.unit_price || 0) * (1 + Number(line.tax_rate || 0) / 100)).toFixed(2)}</div>
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
