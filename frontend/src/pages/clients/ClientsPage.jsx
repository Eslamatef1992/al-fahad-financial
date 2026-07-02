import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import ConfirmDialog from '@/components/ConfirmDialog';

const empty = { code: '', name_en: '', name_ar: '', phone: '', email: '', address: '', tax_no: '', credit_limit: 0, opening_balance: 0 };

export default function ClientsPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toDelete, setToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => { setLoading(true); api.get('/clients').then((r) => setItems(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm(row); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/clients/${editing.id}`, form);
      else await api.post('/clients', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };
  const remove = async () => { await api.delete(`/clients/${toDelete.id}`); toast.success('Deactivated'); setToDelete(null); load(); };

  const columns = [
    { key: 'code', label: t('common.code') },
    { key: 'name_en', label: t('common.nameEn') },
    { key: 'name_ar', label: t('common.nameAr') },
    { key: 'phone', label: t('common.phone') },
    { key: 'email', label: t('common.email') },
    { key: 'opening_balance', label: 'Balance', render: (r) => Number(r.opening_balance).toFixed(3) },
  ];

  return (
    <div>
      <PageHeader title={t('nav.clients')} actions={<button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>} />
      <DataTable columns={columns} data={items} loading={loading} onEdit={openEdit} onDelete={setToDelete} />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('common.code')}</label><input required className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div><label className="label">Tax No.</label><input className="input" value={form.tax_no || ''} onChange={(e) => setForm({ ...form, tax_no: e.target.value })} /></div>
        </div>
        <div><label className="label">{t('common.nameEn')}</label><input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
        <div><label className="label">{t('common.nameAr')}</label><input required dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('common.phone')}</label><input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">{t('common.email')}</label><input type="email" className="input" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        </div>
        <div><label className="label">Address</label><textarea className="input" rows={2} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Credit Limit</label><input type="number" step="0.001" className="input" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} /></div>
          <div><label className="label">Opening Balance</label><input type="number" step="0.001" className="input" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
        </div>
      </SlideOver>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={remove} />
    </div>
  );
}
