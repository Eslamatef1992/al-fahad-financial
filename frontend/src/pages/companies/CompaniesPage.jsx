import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import ConfirmDialog from '@/components/ConfirmDialog';

const empty = { code: '', name_en: '', name_ar: '', industry: '', base_currency: 'KWD' };

export default function CompaniesPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/companies').then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm(row); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await api.put(`/companies/${editing.id}`, form);
      else await api.post('/companies', form);
      toast.success(t('common.save'));
      setOpen(false);
      load();
    } finally { setSaving(false); }
  };

  const remove = async () => {
    await api.delete(`/companies/${toDelete.id}`);
    toast.success('Deactivated');
    setToDelete(null);
    load();
  };

  const columns = [
    { key: 'code', label: t('common.code') },
    { key: 'name_en', label: t('common.nameEn') },
    { key: 'name_ar', label: t('common.nameAr') },
    { key: 'industry', label: 'Industry' },
    { key: 'is_active', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
        {r.is_active ? t('common.active') : t('common.inactive')}
      </span>
    ) },
  ];

  return (
    <div>
      <PageHeader title={t('nav.companies')} actions={
        <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>
      } />
      <DataTable columns={columns} data={items} loading={loading} onEdit={openEdit} onDelete={setToDelete} />

      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving}>
        <div><label className="label">{t('common.code')}</label><input required className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
        <div><label className="label">{t('common.nameEn')}</label><input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
        <div><label className="label">{t('common.nameAr')}</label><input required dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
        <div><label className="label">Industry</label><input className="input" value={form.industry || ''} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
        <div><label className="label">Base Currency</label><input className="input" value={form.base_currency || 'KWD'} onChange={(e) => setForm({ ...form, base_currency: e.target.value })} /></div>
      </SlideOver>

      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={remove} />
    </div>
  );
}
