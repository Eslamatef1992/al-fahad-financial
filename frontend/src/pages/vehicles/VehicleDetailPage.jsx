import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, UserCog, FileText, Wrench, Plus, Trash2, Download, Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fileUrl } from '@/api/client';
import PageHeader from '@/components/PageHeader';

const TABS = ['overview', 'driver', 'documents', 'maintenance'];

export default function VehicleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [tab, setTab] = useState('overview');
  const [docForm, setDocForm] = useState({ doc_type: '', doc_number: '', issue_date: '', expiry_date: '' });
  const [docFile, setDocFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [maintForm, setMaintForm] = useState({ date: '', type: '', odometer: '', cost: '', vendor: '', description: '' });

  const load = () => {
    api.get(`/vehicles/${id}`).then((r) => setVehicle(r.data));
    api.get('/employees').then((r) => setDrivers(r.data.filter((e) => e.is_driver)));
  };
  useEffect(load, [id]);

  const assignDriver = async (driverId) => {
    await api.post(`/vehicles/${id}/assign-driver`, { driverId: driverId || null });
    toast.success('Driver updated');
    load();
  };

  const addDocument = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      const formData = new FormData();
      Object.entries(docForm).forEach(([k, v]) => formData.append(k, v || ''));
      if (docFile) formData.append('file', docFile);
      await api.post(`/vehicles/${id}/documents`, formData);
      setDocForm({ doc_type: '', doc_number: '', issue_date: '', expiry_date: '' });
      setDocFile(null);
      toast.success('Document added');
      load();
    } finally { setUploading(false); }
  };
  const removeDocument = async (docId) => { await api.delete(`/vehicles/${id}/documents/${docId}`); load(); };

  const addMaintenance = async (e) => {
    e.preventDefault();
    await api.post(`/vehicles/${id}/maintenance`, maintForm);
    setMaintForm({ date: '', type: '', odometer: '', cost: '', vendor: '', description: '' });
    toast.success('Maintenance record added');
    load();
  };
  const removeMaintenance = async (recId) => { await api.delete(`/vehicles/${id}/maintenance/${recId}`); load(); };

  if (!vehicle) return <p className="text-slate-400">Loading...</p>;

  const field = (label, value) => (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value || '—'}</p>
    </div>
  );

  return (
    <div>
      <button onClick={() => navigate('/vehicles')} className="btn-ghost !px-2 mb-3"><ArrowLeft size={16} /> Back to Vehicles</button>
      <PageHeader title={`${vehicle.make || ''} ${vehicle.model || ''} — ${vehicle.plate_no}`} subtitle={`Code: ${vehicle.code}`} />

      <div className="flex gap-1 mb-5 border-b border-slate-100 dark:border-navy-800">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${tab === tb ? 'border-gold-500 text-navy-900 dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {tb}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6 grid grid-cols-2 md:grid-cols-3 gap-5">
          {field('Vehicle Type', vehicle.vehicle_type)}
          {field('Color', vehicle.color)}
          {field('Year', vehicle.year)}
          {field('VIN', vehicle.vin)}
          {field('Chassis No.', vehicle.chassis_no)}
          {field('Engine No.', vehicle.engine_no)}
          {field('Ownership', vehicle.ownership_type)}
          {field('Fuel Type', vehicle.fuel_type)}
          {field('Odometer', vehicle.current_odometer)}
          {field('Registration No.', vehicle.registration_no)}
          {field('Registration Expiry', vehicle.registration_expiry)}
          {field('Insurance Company', vehicle.insurance_company)}
          {field('Insurance Policy No.', vehicle.insurance_policy_no)}
          {field('Insurance Expiry', vehicle.insurance_expiry)}
          {field('Purchase Date', vehicle.purchase_date)}
          {field('Purchase Cost', vehicle.purchase_cost)}
          {field('Status', vehicle.status)}
          <div className="col-span-full">{field('Notes', vehicle.notes)}</div>
        </motion.div>
      )}

      {tab === 'driver' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-6 max-w-lg">
          <div className="flex items-center gap-2 mb-4"><UserCog size={18} className="text-gold-500" /><h3 className="font-bold">Assigned Driver</h3></div>
          {vehicle.driver ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-navy-800/50 mb-4">
              <p className="font-semibold">{vehicle.driver.name_en} / {vehicle.driver.name_ar}</p>
              <p className="text-sm text-slate-500 mt-1">License: {vehicle.driver.license_no || '—'} (exp. {vehicle.driver.license_expiry || '—'})</p>
              <p className="text-sm text-slate-500">{vehicle.driver.phone}</p>
            </div>
          ) : <p className="text-slate-400 mb-4">No driver currently assigned.</p>}
          <label className="label">Assign a driver</label>
          <select className="input" value={vehicle.assigned_driver_id || ''} onChange={(e) => assignDriver(e.target.value)}>
            <option value="">— Unassigned —</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name_en} ({d.license_no || 'no license #'})</option>)}
          </select>
        </motion.div>
      )}

      {tab === 'documents' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid md:grid-cols-2 gap-5">
          <form onSubmit={addDocument} className="card p-5 space-y-3 h-fit">
            <div className="flex items-center gap-2 mb-1"><FileText size={18} className="text-gold-500" /><h3 className="font-bold">Add Document</h3></div>
            <input required placeholder="Document type (registration, permit...)" className="input" value={docForm.doc_type} onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })} />
            <input placeholder="Document number" className="input" value={docForm.doc_number} onChange={(e) => setDocForm({ ...docForm, doc_number: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="input" value={docForm.issue_date} onChange={(e) => setDocForm({ ...docForm, issue_date: e.target.value })} />
              <input type="date" className="input" value={docForm.expiry_date} onChange={(e) => setDocForm({ ...docForm, expiry_date: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-navy-700 px-3.5 py-2.5 text-sm cursor-pointer hover:border-navy-400 transition-colors">
              <Paperclip size={16} className="text-slate-400 shrink-0" />
              <span className="truncate text-slate-500">{docFile ? docFile.name : 'Attach a file (PDF, PNG, JPG — max 10MB)'}</span>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
            </label>
            <button disabled={uploading} className="btn-primary w-full"><Plus size={16} /> {uploading ? 'Uploading...' : 'Add'}</button>
          </form>
          <div className="card p-5">
            <h3 className="font-bold mb-3">Documents on file</h3>
            <div className="space-y-2">
              {vehicle.documents?.length ? vehicle.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-navy-800/50">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{d.doc_type} {d.doc_number && `— ${d.doc_number}`}</p>
                    <p className="text-xs text-slate-400">Expires: {d.expiry_date || '—'} {d.file_name && `· ${d.file_name}`}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {d.file_url && (
                      <a href={fileUrl(d.file_url)} target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-navy-700 text-slate-500" title="Download">
                        <Download size={14} />
                      </a>
                    )}
                    <button onClick={() => removeDocument(d.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              )) : <p className="text-slate-400 text-sm">No documents added yet.</p>}
            </div>
          </div>
        </motion.div>
      )}

      {tab === 'maintenance' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid md:grid-cols-2 gap-5">
          <form onSubmit={addMaintenance} className="card p-5 space-y-3 h-fit">
            <div className="flex items-center gap-2 mb-1"><Wrench size={18} className="text-gold-500" /><h3 className="font-bold">Add Maintenance Record</h3></div>
            <div className="grid grid-cols-2 gap-3">
              <input required type="date" className="input" value={maintForm.date} onChange={(e) => setMaintForm({ ...maintForm, date: e.target.value })} />
              <input placeholder="Type (service, repair...)" className="input" value={maintForm.type} onChange={(e) => setMaintForm({ ...maintForm, type: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" placeholder="Odometer" className="input" value={maintForm.odometer} onChange={(e) => setMaintForm({ ...maintForm, odometer: e.target.value })} />
              <input type="number" step="0.001" placeholder="Cost" className="input" value={maintForm.cost} onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })} />
            </div>
            <input placeholder="Vendor" className="input" value={maintForm.vendor} onChange={(e) => setMaintForm({ ...maintForm, vendor: e.target.value })} />
            <textarea placeholder="Description" className="input" rows={2} value={maintForm.description} onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })} />
            <button className="btn-primary w-full"><Plus size={16} /> Add</button>
          </form>
          <div className="card p-5">
            <h3 className="font-bold mb-3">Maintenance history</h3>
            <div className="space-y-2">
              {vehicle.maintenanceRecords?.length ? vehicle.maintenanceRecords.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-navy-800/50">
                  <div><p className="font-medium text-sm">{m.type} — {m.date}</p><p className="text-xs text-slate-400">{m.vendor} · Cost: {m.cost}</p></div>
                  <button onClick={() => removeMaintenance(m.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                </div>
              )) : <p className="text-slate-400 text-sm">No maintenance records yet.</p>}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
