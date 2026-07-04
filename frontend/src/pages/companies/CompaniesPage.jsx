import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fileUrl } from '@/api/client';
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
  const [uploadingLogo, setUploadingLogo] = useState(false);

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
      if (editing) {
        const { data } = await api.put(`/companies/${editing.id}`, form);
        setEditing(data);
      } else {
        const { data } = await api.post('/companies', form);
        // Keep the panel open, switched into edit mode, so the logo can be uploaded
        // right away instead of forcing a second trip back into this company later.
        setEditing(data);
        setForm(data);
      }
      toast.success(t('common.save'));
      load();
    } finally { setSaving(false); }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/companies/${editing.id}/logo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setEditing(data);
      setForm(data);
      toast.success('Logo updated — it will now appear on invoices, vouchers, and reports for this company');
      load();
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const remove = async () => {
    await api.delete(`/companies/${toDelete.id}`);
    toast.success(t('common.deactivated'));
    setToDelete(null);
    load();
  };

  const columns = [
    { key: 'logo_url', label: 'Logo', render: (r) => r.logo_url ? (
      <img src={fileUrl(r.logo_url)} alt="" className="w-8 h-8 rounded-lg object-cover" />
    ) : <span className="text-slate-300">—</span> },
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

        <div className="pt-2 border-t border-slate-100 dark:border-navy-800">
          <label className="label">Logo</label>
          {editing ? (
            <div className="flex items-center gap-3">
              {form.logo_url ? (
                <img src={fileUrl(form.logo_url)} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-navy-700" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-400 text-xs">None</div>
              )}
              <label className="btn-ghost cursor-pointer !py-1.5">
                <Upload size={14} /> {uploadingLogo ? 'Uploading...' : (form.logo_url ? 'Replace' : 'Upload')}
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" disabled={uploadingLogo} onChange={uploadLogo} />
              </label>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Save the company first, then upload its logo — it will appear on that company's invoices, vouchers, and reports.</p>
          )}
        </div>
      </SlideOver>

      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={remove} />
    </div>
  );
}
