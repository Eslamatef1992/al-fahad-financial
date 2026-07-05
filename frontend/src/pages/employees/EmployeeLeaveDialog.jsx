import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import api from '@/api/client';
import SlideOver from '@/components/SlideOver';
import usePermissions from '@/hooks/usePermissions';

function daysBetween(from, to) {
  if (!from || !to) return '';
  const d1 = new Date(from);
  const d2 = new Date(to);
  const diff = Math.round((d2 - d1) / 86400000) + 1;
  return diff > 0 ? diff : '';
}

const emptyForm = { type: 'vacation', date_from: '', date_to: '', days: '', notes: '' };

// Lets a super admin/accountant log an individual vacation or sick-leave entry for an
// employee (with its own dedicated "add" icon in the Employees table), which atomically
// deducts the days from that employee's running balance on the backend. Also shows the
// entry history with an undo/delete action that restores the days.
export default function EmployeeLeaveDialog({ employee, open, onClose, onChanged }) {
  const { t } = useTranslation();
  const { canDelete } = usePermissions();
  const [form, setForm] = useState(emptyForm);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadLeaves = () => {
    if (!employee) return;
    setLoading(true);
    api.get('/employee-leaves', { params: { employee_id: employee.id } }).then((r) => setLeaves(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { if (open && employee) { setForm(emptyForm); loadLeaves(); } }, [open, employee?.id]);

  const updateDates = (patch) => {
    const next = { ...form, ...patch };
    const computed = daysBetween(next.date_from, next.date_to);
    setForm({ ...next, days: computed || next.days });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/employee-leaves', { employee_id: employee.id, ...form });
      toast.success(t('employees.leaveLogged'));
      setForm(emptyForm);
      loadLeaves();
      onChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (leave) => {
    await api.delete(`/employee-leaves/${leave.id}`);
    toast.success(t('employees.leaveRemoved'));
    loadLeaves();
    onChanged?.();
  };

  if (!employee) return null;

  return (
    <SlideOver open={open} onClose={onClose} title={t('employees.logLeaveTitle', { name: employee.name_en })} onSubmit={submit} submitting={saving}>
      <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-navy-800/50 text-sm">
        <div><span className="text-slate-400">{t('employees.vacationBalanceDays')}: </span><span className="font-semibold">{Number(employee.vacation_balance ?? 0).toFixed(2)}</span></div>
        <div><span className="text-slate-400">{t('employees.sickLeaveBalanceDays')}: </span><span className="font-semibold">{Number(employee.sick_leave_balance ?? 0).toFixed(2)}</span></div>
      </div>

      <div>
        <label className="label">{t('employees.leaveType')}</label>
        <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="vacation">{t('employees.vacationDays')}</option>
          <option value="sick">{t('employees.sickLeaveDays')}</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">{t('common.from')}</label><input required type="date" className="input" value={form.date_from} onChange={(e) => updateDates({ date_from: e.target.value })} /></div>
        <div><label className="label">{t('common.to')}</label><input required type="date" className="input" value={form.date_to} onChange={(e) => updateDates({ date_to: e.target.value })} /></div>
      </div>
      <div><label className="label">{t('employees.leaveDays')}</label><input required type="number" step="0.5" min="0.5" className="input" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></div>
      <div><label className="label">{t('common.notes')}</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

      <div className="pt-2">
        <h4 className="font-bold text-sm mb-2">{t('employees.leaveHistory')}</h4>
        {loading && <p className="text-sm text-slate-400">{t('common.loading')}</p>}
        {!loading && leaves.length === 0 && <p className="text-sm text-slate-400">{t('common.noData')}</p>}
        {!loading && leaves.length > 0 && (
          <div className="space-y-2">
            {leaves.map((l) => (
              <div key={l.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-navy-800/40 text-sm">
                <div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold me-2 ${l.type === 'vacation' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                    {t(l.type === 'vacation' ? 'employees.vacationDays' : 'employees.sickLeaveDays')}
                  </span>
                  <span className="text-slate-500">{l.date_from} → {l.date_to}</span>
                  <span className="font-semibold ms-2">{Number(l.days).toFixed(2)}</span>
                  {l.notes && <span className="text-slate-400"> · {l.notes}</span>}
                </div>
                {canDelete && (
                  <button type="button" onClick={() => remove(l)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-500">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SlideOver>
  );
}
