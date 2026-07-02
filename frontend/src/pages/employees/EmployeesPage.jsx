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
import usePermissions from '@/hooks/usePermissions';

const empty = {
  code: '', name_en: '', name_ar: '', national_id: '', nationality: '', phone: '', email: '',
  position: '', department: '', hire_date: '', salary: 0, is_driver: false, license_no: '', license_type: '', license_expiry: '',
};

export default function EmployeesPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit, canDelete } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toDelete, setToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => { setLoading(true); api.get('/employees').then((r) => setItems(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...empty, ...row }); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/employees/${editing.id}`, form);
      else await api.post('/employees', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };
  const remove = async () => { await api.delete(`/employees/${toDelete.id}`); toast.success('Deactivated'); setToDelete(null); load(); };

  const columns = [
    { key: 'code', label: t('common.code') },
    { key: 'name_en', label: t('common.nameEn') },
    { key: 'position', label: 'Position' },
    { key: 'department', label: 'Department' },
    { key: 'phone', label: t('common.phone') },
    { key: 'is_driver', label: 'Driver', render: (r) => r.is_driver ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gold-100 text-gold-700">Driver</span> : '—' },
  ];

  return (
    <div>
      <PageHeader title={t('nav.employees')} actions={canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>} />
      <DataTable columns={columns} data={items} loading={loading} onEdit={canCreateEdit ? openEdit : undefined} onDelete={canDelete ? setToDelete : undefined} />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving} wide>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('common.code')}</label><input required className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div><label className="label">National ID</label><input className="input" value={form.national_id || ''} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('common.nameEn')}</label><input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
          <div><label className="label">{t('common.nameAr')}</label><input required dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Nationality</label><input className="input" value={form.nationality || ''} onChange={(e) => setForm({ ...form, nationality: e.target.value })} /></div>
          <div><label className="label">{t('common.phone')}</label><input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Position</label><input className="input" value={form.position || ''} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
          <div><label className="label">Department</label><input className="input" value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Hire Date</label><input type="date" className="input" value={form.hire_date || ''} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
          <div><label className="label">Salary</label><input type="number" step="0.001" className="input" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium py-1">
          <input type="checkbox" checked={form.is_driver} onChange={(e) => setForm({ ...form, is_driver: e.target.checked })} className="w-4 h-4 rounded accent-navy-700" />
          This employee is a driver (can be assigned to a vehicle)
        </label>

        {form.is_driver && (
          <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-navy-800/50">
            <div><label className="label">License No.</label><input className="input" value={form.license_no || ''} onChange={(e) => setForm({ ...form, license_no: e.target.value })} /></div>
            <div><label className="label">License Type</label><input className="input" value={form.license_type || ''} onChange={(e) => setForm({ ...form, license_type: e.target.value })} /></div>
            <div><label className="label">License Expiry</label><input type="date" className="input" value={form.license_expiry || ''} onChange={(e) => setForm({ ...form, license_expiry: e.target.value })} /></div>
          </div>
        )}
      </SlideOver>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={remove} />
    </div>
  );
}
