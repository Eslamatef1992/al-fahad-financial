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

const empty = { name_en: '', name_ar: '', base_unit_id: '', conversion_factor: '' };

export default function UnitsPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit, canDelete } = usePermissions();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  // Only true base units (no base_unit_id of their own) can be picked as
  // someone else's base — keeps conversions a single multiply/divide, never a
  // chain to resolve.
  const baseUnitOptions = units.filter((u) => !u.base_unit_id && u.id !== editing?.id);

  const load = () => {
    setLoading(true);
    api.get('/units', { params: showInactive ? { status: 'all' } : {} }).then((r) => setUnits(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, showInactive]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      name_en: row.name_en, name_ar: row.name_ar || '',
      base_unit_id: row.base_unit_id || '', conversion_factor: row.base_unit_id ? row.conversion_factor : '',
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        name_en: form.name_en,
        name_ar: form.name_ar,
        base_unit_id: form.base_unit_id || null,
        conversion_factor: form.base_unit_id ? form.conversion_factor : null,
      };
      if (editing) await api.put(`/units/${editing.id}`, payload);
      else await api.post('/units', payload);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    await api.put(`/units/${row.id}`, { is_active: !row.is_active });
    toast.success(row.is_active ? t('common.deactivated') : t('common.activated'));
    load();
  };

  const columns = [
    { key: 'name_en', label: t('common.nameEn') },
    { key: 'name_ar', label: t('common.nameAr'), render: (r) => r.name_ar || '—' },
    { key: 'conversion', label: t('units.conversion'), render: (r) => (
      r.base_unit_id
        ? <span>1 {r.name_en} = <span className="font-semibold">{Number(r.conversion_factor).toFixed(3)}</span> {r.baseUnit?.name_en}</span>
        : <span className="text-slate-400">{t('units.baseUnit')}</span>
    ) },
    { key: 'is_active', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {r.is_active ? t('common.active') : t('common.inactive')}
      </span>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.units')}
        actions={canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>}
      />
      <p className="text-sm text-slate-500 mb-3">{t('units.pageHint')}</p>
      <label className="flex items-center gap-2 text-sm text-slate-500 mb-3 cursor-pointer w-fit">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
        {t('common.showInactive')}
      </label>
      <DataTable
        columns={columns}
        data={units}
        loading={loading}
        onEdit={canCreateEdit ? openEdit : undefined}
        onToggleActive={canDelete ? toggleActive : undefined}
        isInactive={(r) => !r.is_active}
        pageSize={25}
      />

      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving}>
        <div><label className="label">{t('common.nameEn')}</label><input required autoFocus className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} placeholder="Roll, Box, Meter..." /></div>
        <div><label className="label">{t('common.nameAr')}</label><input dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
        <div>
          <label className="label">{t('units.baseUnitOptional')}</label>
          <select className="input" value={form.base_unit_id} onChange={(e) => setForm({ ...form, base_unit_id: e.target.value })}>
            <option value="">{t('units.noneIsBaseUnit')}</option>
            {baseUnitOptions.map((u) => <option key={u.id} value={u.id}>{u.name_en}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">{t('units.baseUnitHint')}</p>
        </div>
        {form.base_unit_id && (
          <div>
            <label className="label">{t('units.conversionFactor')}</label>
            <input required type="number" step="0.000001" min="0.000001" className="input" value={form.conversion_factor} onChange={(e) => setForm({ ...form, conversion_factor: e.target.value })} placeholder="e.g. 50" />
            <p className="text-xs text-slate-400 mt-1">
              {t('units.conversionFactorHint', {
                unit: form.name_en || '…',
                base: baseUnitOptions.find((u) => u.id === form.base_unit_id)?.name_en || '…',
              })}
            </p>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
