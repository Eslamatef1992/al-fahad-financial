import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import ConfirmDialog from '@/components/ConfirmDialog';
import usePermissions from '@/hooks/usePermissions';

const emptyLine = () => ({ account_id: '', description: '', quantity: 1, unit_price: '', tax_rate: 0 });
const emptyForm = {
  type: 'sales', client_id: '', supplier_id: '', name: '', frequency: 'monthly',
  due_in_days: 30, next_run_date: new Date().toISOString().slice(0, 10), notes: '',
};

export default function RecurringInvoicesPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canManageStructure } = usePermissions();
  const [items, setItems] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [toDeactivate, setToDeactivate] = useState(null);
  const [generating, setGenerating] = useState(false);

  const load = () => { setLoading(true); api.get('/recurring-invoices').then((r) => setItems(r.data)).finally(() => setLoading(false)); };
  useEffect(() => {
    if (!activeCompany) return;
    load();
    api.get('/accounts').then((r) => setAccounts(r.data.filter((a) => !a.is_group)));
    api.get('/clients').then((r) => setClients(r.data));
    api.get('/suppliers').then((r) => setSuppliers(r.data));
  }, [activeCompany]);

  const openNew = () => { setForm(emptyForm); setLines([emptyLine()]); setOpen(true); };
  const updateLine = (idx, patch) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, client_id: form.type === 'sales' ? form.client_id : undefined, supplier_id: form.type === 'purchase' ? form.supplier_id : undefined, lines: lines.filter((l) => l.account_id && l.unit_price) };
      await api.post('/recurring-invoices', payload);
      toast.success(t('recurringInvoices.templateCreated'));
      setOpen(false);
      load();
    } finally { setSaving(false); }
  };

  const deactivate = async () => { await api.delete(`/recurring-invoices/${toDeactivate.id}`); toast.success(t('common.deactivated')); setToDeactivate(null); load(); };

  const generateNow = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post('/recurring-invoices/generate-due');
      toast.success(t('recurringInvoices.invoicesGenerated', { count: data.generated_count }));
      load();
    } finally { setGenerating(false); }
  };

  const columns = [
    { key: 'name', label: t('recurringInvoices.name') },
    { key: 'type', label: t('common.type'), render: (r) => <span className="capitalize">{r.type}</span> },
    { key: 'party', label: t('recurringInvoices.clientSupplier'), render: (r) => (r.type === 'sales' ? r.client?.name_en : r.supplier?.name_en) || '—' },
    { key: 'frequency', label: t('recurringInvoices.frequency'), render: (r) => <span className="capitalize">{r.frequency}</span> },
    { key: 'next_run_date', label: t('recurringInvoices.nextRun') },
    { key: 'is_active', label: t('common.status'), render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{r.is_active ? t('common.active') : t('common.inactive')}</span> },
  ];

  return (
    <div>
      <PageHeader title={t('nav.recurringInvoices')} subtitle={t('recurringInvoices.subtitle')} actions={
        <div className="flex items-center gap-2">
          <button onClick={generateNow} disabled={generating} className="btn-ghost"><RefreshCw size={16} /> {t('recurringInvoices.generateDueNow')}</button>
          {canManageStructure && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('recurringInvoices.newTemplate')}</button>}
        </div>
      } />
      <DataTable columns={columns} data={items} loading={loading} onDelete={canManageStructure ? setToDeactivate : undefined} />

      <SlideOver open={open} onClose={() => setOpen(false)} title={t('recurringInvoices.newRecurringTemplate')} onSubmit={submit} submitting={saving} wide>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('common.type')}</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="sales">{t('recurringInvoices.salesClient')}</option>
              <option value="purchase">{t('recurringInvoices.purchaseSupplier')}</option>
            </select>
          </div>
          <div>
            <label className="label">{form.type === 'sales' ? t('common.client') : t('common.supplier')}</label>
            <select required className="input" value={form.type === 'sales' ? form.client_id : form.supplier_id} onChange={(e) => setForm({ ...form, [form.type === 'sales' ? 'client_id' : 'supplier_id']: e.target.value })}>
              <option value="">{t('common.select')}</option>
              {(form.type === 'sales' ? clients : suppliers).map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">{t('recurringInvoices.templateName')}</label><input required placeholder={t('recurringInvoices.templateNamePlaceholder')} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">{t('recurringInvoices.frequency')}</label>
            <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              <option value="weekly">{t('recurringInvoices.weekly')}</option><option value="monthly">{t('recurringInvoices.monthly')}</option>
              <option value="quarterly">{t('recurringInvoices.quarterly')}</option><option value="yearly">{t('recurringInvoices.yearly')}</option>
            </select>
          </div>
          <div><label className="label">{t('recurringInvoices.nextRunDate')}</label><input required type="date" className="input" value={form.next_run_date} onChange={(e) => setForm({ ...form, next_run_date: e.target.value })} /></div>
          <div><label className="label">{t('recurringInvoices.dueInDays')}</label><input type="number" className="input" value={form.due_in_days} onChange={(e) => setForm({ ...form, due_in_days: e.target.value })} /></div>
        </div>

        <div className="pt-2">
          <label className="label">{t('common.lineItems')}</label>
          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 p-2 rounded-lg bg-slate-50 dark:bg-navy-800/40">
                <select className="input col-span-4 !py-1.5" value={l.account_id} onChange={(e) => updateLine(idx, { account_id: e.target.value })}>
                  <option value="">{t('recurringInvoices.accountPlaceholder')}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
                </select>
                <input placeholder={t('common.description')} className="input col-span-4 !py-1.5" value={l.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                <input type="number" placeholder={t('common.qty')} className="input col-span-2 !py-1.5" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                <input type="number" placeholder={t('recurringInvoices.pricePlaceholder')} className="input col-span-2 !py-1.5" value={l.unit_price} onChange={(e) => updateLine(idx, { unit_price: e.target.value })} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="btn-ghost !py-1 mt-2"><Plus size={14} /> {t('common.addLine')}</button>
        </div>
        <div><label className="label">{t('common.notes')}</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </SlideOver>

      <ConfirmDialog open={!!toDeactivate} onCancel={() => setToDeactivate(null)} onConfirm={deactivate} message={t('recurringInvoices.deactivateConfirm')} />
    </div>
  );
}
