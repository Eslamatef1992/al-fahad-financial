import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, KeyRound, Building2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import ConfirmDialog from '@/components/ConfirmDialog';

const emptyUser = { name: '', email: '', password: '', role: 'accountant', companyIds: [], companyRole: 'accountant' };
const ROLE_COLOR = { super_admin: 'bg-gold-100 text-gold-700', admin: 'bg-navy-100 text-navy-700', accountant: 'bg-blue-50 text-blue-600', viewer: 'bg-slate-100 text-slate-500' };

export default function UsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyUser);
  const [saving, setSaving] = useState(false);
  const [pwUser, setPwUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [assignUser, setAssignUser] = useState(null);
  const [assignCompanyId, setAssignCompanyId] = useState('');
  const [assignRole, setAssignRole] = useState('accountant');
  const [toDeactivate, setToDeactivate] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/users'), api.get('/companies')])
      .then(([u, c]) => { setUsers(u.data); setCompanies(c.data); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => { setEditing(null); setForm(emptyUser); setOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ ...emptyUser, name: u.name, role: u.role }); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await api.put(`/users/${editing.id}`, { name: form.name, role: form.role });
      else await api.post('/users', form);
      toast.success(t('common.save'));
      setOpen(false);
      load();
    } finally { setSaving(false); }
  };

  const deactivate = async () => {
    await api.put(`/users/${toDeactivate.id}`, { is_active: false });
    toast.success('User deactivated');
    setToDeactivate(null);
    load();
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters');
    await api.put(`/users/${pwUser.id}/password`, { newPassword });
    toast.success('Password reset');
    setPwUser(null);
    setNewPassword('');
  };

  const submitAssign = async (e) => {
    e.preventDefault();
    if (!assignCompanyId) return toast.error('Select a company');
    await api.post(`/users/${assignUser.id}/companies`, { company_id: assignCompanyId, role: assignRole });
    toast.success('Company access updated');
    setAssignUser(null);
    setAssignCompanyId('');
    load();
  };

  const removeCompany = async (userId, companyId) => {
    await api.delete(`/users/${userId}/companies/${companyId}`);
    toast.success('Access removed');
    load();
  };

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: t('common.email') },
    { key: 'role', label: 'Global Role', render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${ROLE_COLOR[r.role]}`}>{r.role.replace('_', ' ')}</span> },
    {
      key: 'companies', label: 'Company Access', render: (r) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {r.companies?.length ? r.companies.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-navy-800">
              {c.code} · {c.UserCompany?.role}
              <button onClick={(e) => { e.stopPropagation(); removeCompany(r.id, c.id); }} className="hover:text-red-500"><X size={11} /></button>
            </span>
          )) : <span className="text-slate-400 text-xs">{r.role === 'super_admin' ? 'All companies' : 'None'}</span>}
        </div>
      ),
    },
    {
      key: 'status', label: t('common.status'), render: (r) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
          {r.is_active ? t('common.active') : t('common.inactive')}
        </span>
      ),
    },
    {
      key: 'reset', label: 'Password', render: (r) => (
        <button onClick={(e) => { e.stopPropagation(); setPwUser(r); setNewPassword(''); }} className="btn-ghost !py-1 !px-2 text-xs">
          <KeyRound size={13} /> Reset
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Users & Access" subtitle="Manage accounts, roles, and which companies each user can access" actions={
        <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>
      } />

      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        onEdit={openEdit}
        onDelete={(u) => setToDeactivate(u)}
        onRowClick={(u) => { setAssignUser(u); setAssignCompanyId(''); setAssignRole('accountant'); }}
      />
      <p className="text-xs text-slate-400 mt-2">Click a row to grant company access. Use the trash icon to deactivate a user.</p>

      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit User' : 'New User'} onSubmit={submit} submitting={saving}>
        <div><label className="label">Name</label><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        {!editing && (
          <>
            <div><label className="label">{t('common.email')}</label><input required type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">Initial Password</label><input required type="password" minLength={8} className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          </>
        )}
        <div>
          <label className="label">Global Role</label>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="viewer">Viewer</option>
            <option value="accountant">Accountant</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin (all companies)</option>
          </select>
        </div>
        {!editing && form.role !== 'super_admin' && (
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-navy-800/50">
            <div className="col-span-2">
              <label className="label">Grant access to company</label>
              <select className="input" value={form.companyIds[0] || ''} onChange={(e) => setForm({ ...form, companyIds: e.target.value ? [e.target.value] : [] })}>
                <option value="">— None yet, assign later —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Role for this company</label>
              <select className="input" value={form.companyRole} onChange={(e) => setForm({ ...form, companyRole: e.target.value })}>
                <option value="viewer">Viewer (read-only)</option>
                <option value="accountant">Accountant (create/edit/post)</option>
                <option value="admin">Admin (full control)</option>
              </select>
            </div>
          </div>
        )}
      </SlideOver>

      {/* Reset password */}
      <SlideOver open={!!pwUser} onClose={() => setPwUser(null)} title={`Reset password — ${pwUser?.name || ''}`} onSubmit={submitPassword}>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2"><KeyRound size={16} /> Sets a new password immediately; the user isn't notified automatically.</div>
        <div><label className="label">New Password</label><input required type="password" minLength={8} className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
      </SlideOver>

      {/* Assign company access */}
      <SlideOver open={!!assignUser} onClose={() => setAssignUser(null)} title={`Company access — ${assignUser?.name || ''}`} onSubmit={submitAssign}>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2"><Building2 size={16} /> Grant or update access to a company.</div>
        <div>
          <label className="label">Company</label>
          <select className="input" value={assignCompanyId} onChange={(e) => setAssignCompanyId(e.target.value)}>
            <option value="">Select a company</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={assignRole} onChange={(e) => setAssignRole(e.target.value)}>
            <option value="viewer">Viewer (read-only)</option>
            <option value="accountant">Accountant (create/edit/post)</option>
            <option value="admin">Admin (full control)</option>
          </select>
        </div>
        {assignUser?.companies?.length > 0 && (
          <div className="pt-2">
            <p className="label mb-2">Current access</p>
            <div className="space-y-1">
              {assignUser.companies.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-slate-50 dark:bg-navy-800/50">
                  <span>{c.name_en}</span>
                  <span className="text-xs text-slate-400 capitalize">{c.UserCompany?.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SlideOver>

      <ConfirmDialog open={!!toDeactivate} onCancel={() => setToDeactivate(null)} onConfirm={deactivate} message="Deactivate this user? They will no longer be able to log in." />
    </div>
  );
}
