import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import AccountPicker from '@/components/AccountPicker';
import usePermissions from '@/hooks/usePermissions';

const empty = {
  code: '', plate_no: '', make: '', model: '', year: '', color: '', vin: '', chassis_no: '', engine_no: '',
  vehicle_type: '', ownership_type: 'owned', registration_no: '', registration_expiry: '',
  insurance_company: '', insurance_policy_no: '', insurance_type: '', insurance_expiry: '',
  purchase_date: '', purchase_cost: 0, fuel_type: '', current_odometer: 0, status: 'active', notes: '', parent_account_id: null,
  secondary_parent_account_id: null,
};

export default function VehiclesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit, canDelete } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/vehicles', { params: showInactive ? { status: 'all' } : {} }).then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, showInactive]);

  const openNew = () => { setForm(empty); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/vehicles', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    if (row.status === 'inactive') { await api.put(`/vehicles/${row.id}`, { status: 'active' }); toast.success(t('common.activated')); }
    else { await api.delete(`/vehicles/${row.id}`); toast.success(t('common.deactivated')); }
    load();
  };

  const statusColor = { active: 'bg-emerald-50 text-emerald-600', maintenance: 'bg-amber-50 text-amber-600', inactive: 'bg-slate-100 text-slate-500', sold: 'bg-red-50 text-red-500' };
  const statusLabel = { active: t('common.active'), maintenance: 'Maintenance', inactive: t('common.inactive'), sold: 'Sold' };

  const columns = [
    { key: 'code', label: t('common.code') },
    { key: 'plate_no', label: t('vehicles.plateNo') },
    { key: 'make', label: t('vehicles.makeModel'), render: (r) => `${r.make || ''} ${r.model || ''}`.trim() || '—' },
    { key: 'vehicle_type', label: t('vehicles.vehicleType') },
    { key: 'driver', label: t('vehicles.driver'), render: (r) => r.driver ? r.driver.name_en : <span className="text-slate-400">{t('vehicles.unassigned')}</span> },
    { key: 'account', label: t('accounts.parentAccount'), render: (r) => r.account ? `${r.account.code} - ${r.account.name_en}` : '—' },
    { key: 'secondaryAccount', label: t('vehicles.secondaryAccount'), render: (r) => r.secondaryAccount ? `${r.secondaryAccount.code} - ${r.secondaryAccount.name_en}` : '—' },
    { key: 'status', label: t('common.status'), render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusColor[r.status]}`}>{statusLabel[r.status]}</span> },
  ];

  return (
    <div>
      <PageHeader title={t('nav.vehicles')} actions={canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>} />
      <label className="flex items-center gap-2 text-sm text-slate-500 mb-3 cursor-pointer w-fit">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
        {t('common.showInactive')}
      </label>
      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        onToggleActive={canDelete ? toggleActive : undefined}
        isInactive={(r) => r.status === 'inactive'}
        onRowClick={(row) => navigate(`/vehicles/${row.id}`)}
      />

      <SlideOver open={open} onClose={() => setOpen(false)} title={t('vehicles.addVehicle')} onSubmit={submit} submitting={saving} wide>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">{t('common.code')}</label>
            <input disabled className="input opacity-60" value="Auto-generated on save" />
          </div>
          <div><label className="label">{t('vehicles.plateNo')}</label><input required className="input" value={form.plate_no} onChange={(e) => setForm({ ...form, plate_no: e.target.value })} /></div>
          <div><label className="label">{t('vehicles.vehicleType')}</label><input className="input" placeholder="Sedan, Truck, Van..." value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">{t('vehicles.make')}</label><input className="input" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></div>
          <div><label className="label">{t('vehicles.model')}</label><input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
          <div><label className="label">{t('vehicles.year')}</label><input type="number" className="input" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">{t('vehicles.color')}</label><input className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
          <div><label className="label">{t('vehicles.fuelType')}</label><input className="input" value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })} /></div>
          <div>
            <label className="label">{t('vehicles.ownership')}</label>
            <select className="input" value={form.ownership_type} onChange={(e) => setForm({ ...form, ownership_type: e.target.value })}>
              <option value="owned">{t('vehicles.owned')}</option><option value="leased">{t('vehicles.leased')}</option><option value="rented">{t('vehicles.rented')}</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">{t('vehicles.vin')}</label><input className="input" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></div>
          <div><label className="label">{t('vehicles.chassisNo')}</label><input className="input" value={form.chassis_no} onChange={(e) => setForm({ ...form, chassis_no: e.target.value })} /></div>
          <div><label className="label">{t('vehicles.engineNo')}</label><input className="input" value={form.engine_no} onChange={(e) => setForm({ ...form, engine_no: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('vehicles.registrationNo')}</label><input className="input" value={form.registration_no} onChange={(e) => setForm({ ...form, registration_no: e.target.value })} /></div>
          <div><label className="label">{t('vehicles.registrationExpiry')}</label><input type="date" className="input" value={form.registration_expiry} onChange={(e) => setForm({ ...form, registration_expiry: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('vehicles.insuranceCompany')}</label><input className="input" value={form.insurance_company} onChange={(e) => setForm({ ...form, insurance_company: e.target.value })} /></div>
          <div><label className="label">{t('vehicles.insurancePolicyNo')}</label><input className="input" value={form.insurance_policy_no} onChange={(e) => setForm({ ...form, insurance_policy_no: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('vehicles.insuranceType')}</label><input className="input" value={form.insurance_type} onChange={(e) => setForm({ ...form, insurance_type: e.target.value })} /></div>
          <div><label className="label">{t('vehicles.insuranceExpiry')}</label><input type="date" className="input" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">{t('vehicles.purchaseDate')}</label><input type="date" className="input" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
          <div><label className="label">{t('vehicles.purchaseCost')}</label><input type="number" step="0.001" className="input" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} /></div>
          <div><label className="label">{t('vehicles.odometer')}</label><input type="number" className="input" value={form.current_odometer} onChange={(e) => setForm({ ...form, current_odometer: e.target.value })} /></div>
        </div>
        <div><label className="label">{t('common.notes')}</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <AccountPicker value={form.parent_account_id} onChange={(v) => setForm({ ...form, parent_account_id: v })} />
        <AccountPicker
          value={form.secondary_parent_account_id}
          onChange={(v) => setForm({ ...form, secondary_parent_account_id: v })}
          label={t('vehicles.secondaryParentAccount')}
        />
        <p className="text-xs text-slate-400">{t('vehicles.assignNote')}</p>
      </SlideOver>
    </div>
  );
}
