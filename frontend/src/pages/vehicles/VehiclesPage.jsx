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
import ConfirmDialog from '@/components/ConfirmDialog';
import usePermissions from '@/hooks/usePermissions';

const empty = {
  code: '', plate_no: '', make: '', model: '', year: '', color: '', vin: '', chassis_no: '', engine_no: '',
  vehicle_type: '', ownership_type: 'owned', registration_no: '', registration_expiry: '',
  insurance_company: '', insurance_policy_no: '', insurance_type: '', insurance_expiry: '',
  purchase_date: '', purchase_cost: 0, fuel_type: '', current_odometer: 0, status: 'active', notes: '',
};

export default function VehiclesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit, canDelete } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [toDelete, setToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => { setLoading(true); api.get('/vehicles').then((r) => setItems(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const openNew = () => { setForm(empty); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/vehicles', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };
  const remove = async () => { await api.delete(`/vehicles/${toDelete.id}`); toast.success('Deactivated'); setToDelete(null); load(); };

  const statusColor = { active: 'bg-emerald-50 text-emerald-600', maintenance: 'bg-amber-50 text-amber-600', inactive: 'bg-slate-100 text-slate-500', sold: 'bg-red-50 text-red-500' };

  const columns = [
    { key: 'code', label: t('common.code') },
    { key: 'plate_no', label: 'Plate No.' },
    { key: 'make', label: 'Make / Model', render: (r) => `${r.make || ''} ${r.model || ''}`.trim() || '—' },
    { key: 'vehicle_type', label: 'Type' },
    { key: 'driver', label: 'Driver', render: (r) => r.driver ? r.driver.name_en : <span className="text-slate-400">Unassigned</span> },
    { key: 'status', label: t('common.status'), render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusColor[r.status]}`}>{r.status}</span> },
  ];

  return (
    <div>
      <PageHeader title={t('nav.vehicles')} actions={canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>} />
      <DataTable columns={columns} data={items} loading={loading} onDelete={canDelete ? setToDelete : undefined} onRowClick={(row) => navigate(`/vehicles/${row.id}`)} />

      <SlideOver open={open} onClose={() => setOpen(false)} title="Add Vehicle" onSubmit={submit} submitting={saving} wide>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">{t('common.code')}</label><input required className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div><label className="label">Plate No.</label><input required className="input" value={form.plate_no} onChange={(e) => setForm({ ...form, plate_no: e.target.value })} /></div>
          <div><label className="label">Vehicle Type</label><input className="input" placeholder="Sedan, Truck, Van..." value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Make</label><input className="input" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></div>
          <div><label className="label">Model</label><input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
          <div><label className="label">Year</label><input type="number" className="input" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Color</label><input className="input" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
          <div><label className="label">Fuel Type</label><input className="input" value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })} /></div>
          <div>
            <label className="label">Ownership</label>
            <select className="input" value={form.ownership_type} onChange={(e) => setForm({ ...form, ownership_type: e.target.value })}>
              <option value="owned">Owned</option><option value="leased">Leased</option><option value="rented">Rented</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">VIN</label><input className="input" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} /></div>
          <div><label className="label">Chassis No.</label><input className="input" value={form.chassis_no} onChange={(e) => setForm({ ...form, chassis_no: e.target.value })} /></div>
          <div><label className="label">Engine No.</label><input className="input" value={form.engine_no} onChange={(e) => setForm({ ...form, engine_no: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Registration No.</label><input className="input" value={form.registration_no} onChange={(e) => setForm({ ...form, registration_no: e.target.value })} /></div>
          <div><label className="label">Registration Expiry</label><input type="date" className="input" value={form.registration_expiry} onChange={(e) => setForm({ ...form, registration_expiry: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Insurance Company</label><input className="input" value={form.insurance_company} onChange={(e) => setForm({ ...form, insurance_company: e.target.value })} /></div>
          <div><label className="label">Insurance Policy No.</label><input className="input" value={form.insurance_policy_no} onChange={(e) => setForm({ ...form, insurance_policy_no: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Insurance Type</label><input className="input" value={form.insurance_type} onChange={(e) => setForm({ ...form, insurance_type: e.target.value })} /></div>
          <div><label className="label">Insurance Expiry</label><input type="date" className="input" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Purchase Date</label><input type="date" className="input" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></div>
          <div><label className="label">Purchase Cost</label><input type="number" step="0.001" className="input" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} /></div>
          <div><label className="label">Odometer</label><input type="number" className="input" value={form.current_odometer} onChange={(e) => setForm({ ...form, current_odometer: e.target.value })} /></div>
        </div>
        <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <p className="text-xs text-slate-400">You can assign a driver and attach documents/maintenance records from the vehicle's detail page after saving.</p>
      </SlideOver>

      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={remove} />
    </div>
  );
}
