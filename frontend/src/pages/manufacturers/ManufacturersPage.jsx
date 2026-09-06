import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import usePermissions from '@/hooks/usePermissions';

const empty = { name_en: '', name_ar: '', phone: '', address: '' };

export default function ManufacturersPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit, canDelete } = usePermissions();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/manufacturers', { params: showInactive ? { status: 'all' } : {} }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, showInactive]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({ name_en: row.name_en, name_ar: row.name_ar || '', phone: row.phone || '', address: row.address || '' });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/manufacturers/${editing.id}`, form);
      else await api.post('/manufacturers', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    await api.put(`/manufacturers/${row.id}`, { is_active: !row.is_active });
    toast.success(row.is_active ? t('common.deactivated') : t('common.activated'));
    load();
  };

  const columns = [
    { key: 'name_en', label: t('common.nameEn'), render: (r) => <span className="font-semibold">{r.name_en}</span> },
    { key: 'name_ar', label: t('common.nameAr'), render: (r) => r.name_ar || '—' },
    { key: 'phone', label: t('common.phone'), render: (r) => r.phone || '—' },
    { key: 'address', label: t('common.address'), render: (r) => r.address || '—' },
    { key: 'is_active', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {r.is_active ? t('common.active') : t('common.inactive')}
      </span>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.manufacturers')}
        subtitle={t('manufacturers.pageHint')}
        actions={canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>}
      />
      <label className="flex items-center gap-2 text-sm text-slate-500 mb-3 cursor-pointer w-fit">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
        {t('common.showInactive')}
      </label>
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        onEdit={canCreateEdit ? openEdit : undefined}
        onToggleActive={canDelete ? toggleActive : undefined}
        isInactive={(r) => !r.is_active}
        pageSize={25}
      />

      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving}>
        <div>
          <label className="label">{t('common.nameEn')}</label>
          <input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('common.nameAr')}</label>
          <input className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('common.phone')}</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">{t('common.address')}</label>
          <textarea className="input" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
      </SlideOver>
    </div>
  );
}
