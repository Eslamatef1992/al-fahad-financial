import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, CalendarPlus, Printer, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile, printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import ConfirmDialog from '@/components/ConfirmDialog';
import AccountPicker from '@/components/AccountPicker';
import EmployeeLeaveDialog from './EmployeeLeaveDialog';
import usePermissions from '@/hooks/usePermissions';

const empty = {
  name_en: '', name_ar: '', national_id: '', nationality: '', phone: '', email: '',
  position: '', department: '', hire_date: '', salary: 0, vacation_balance: 0, sick_leave_balance: 0, deduction: 0,
  is_driver: false, license_no: '', license_type: '', license_expiry: '',
  parent_account_id: null, deduction_parent_account_id: null,
};

function money(v) { return Number(v ?? 0).toFixed(3); }
function days(v) { return Number(v ?? 0).toFixed(2); }

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
  const [leaveEmployee, setLeaveEmployee] = useState(null);
  const [positionFilter, setPositionFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState(''); // 'YYYY-MM', native <input type="month">
  const [monthLeaves, setMonthLeaves] = useState([]);
  const [salaryFrom, setSalaryFrom] = useState('');
  const [salaryTo, setSalaryTo] = useState('');

  const load = () => { setLoading(true); api.get('/employees').then((r) => setItems(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  // Loaded lazily — only once a month is actually picked — since it's not needed for
  // the default view. GET /employee-leaves with no employee_id returns every leave
  // entry for the active company, which we then bucket by month client-side.
  useEffect(() => {
    if (activeCompany && monthFilter) api.get('/employee-leaves').then((r) => setMonthLeaves(r.data));
  }, [activeCompany, monthFilter]);

  // Distinct, sorted positions actually present in the data, for the filter dropdown.
  const positions = [...new Set(items.map((e) => e.position).filter(Boolean))].sort();
  const filteredItems = items
    .filter((e) => !positionFilter || e.position === positionFilter)
    .filter((e) => salaryFrom === '' || Number(e.salary || 0) >= Number(salaryFrom))
    .filter((e) => salaryTo === '' || Number(e.salary || 0) <= Number(salaryTo));

  // Vacation/sick days actually taken in the selected month, per employee — pulled from
  // the dated leave log (date_from's year-month), not the running balance.
  const monthlyByEmployee = {};
  if (monthFilter) {
    monthLeaves.filter((l) => l.date_from?.slice(0, 7) === monthFilter).forEach((l) => {
      const bucket = monthlyByEmployee[l.employee_id] || (monthlyByEmployee[l.employee_id] = { vacation: 0, sick: 0 });
      bucket[l.type] = (bucket[l.type] || 0) + Number(l.days || 0);
    });
  }

  // Keeps the leave dialog's displayed balances in sync with the latest fetch after
  // logging/undoing an entry (it changes the employee's balance on the backend).
  useEffect(() => {
    if (leaveEmployee) {
      const fresh = items.find((i) => i.id === leaveEmployee.id);
      if (fresh) setLeaveEmployee(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...empty, ...row, parent_account_id: row.account?.parent_id || null, deduction_parent_account_id: row.deductionAccount?.parent_id || null }); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/employees/${editing.id}`, form);
      else await api.post('/employees', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };
  const remove = async () => { await api.delete(`/employees/${toDelete.id}`); toast.success(t('common.deactivated')); setToDelete(null); load(); };

  const columns = [
    { key: 'code', label: t('common.code') },
    { key: 'name_en', label: t('common.nameEn') },
    { key: 'position', label: t('employees.position') },
    { key: 'department', label: t('employees.department') },
    { key: 'phone', label: t('common.phone') },
    { key: 'salary', label: t('employees.salary'), render: (r) => money(r.salary) },
    { key: 'vacation_balance', label: t('employees.vacationDays'), render: (r) => days(r.vacation_balance) },
    { key: 'sick_leave_balance', label: t('employees.sickLeaveDays'), render: (r) => days(r.sick_leave_balance) },
    { key: 'deduction', label: t('employees.deduction'), render: (r) => money(r.deduction) },
    ...(monthFilter ? [
      { key: 'monthlyVacation', label: t('employees.vacationThisMonth'), render: (r) => days(monthlyByEmployee[r.id]?.vacation) },
      { key: 'monthlySick', label: t('employees.sickThisMonth'), render: (r) => days(monthlyByEmployee[r.id]?.sick) },
      { key: 'netSalary', label: t('employees.netSalary'), render: (r) => money(Number(r.salary || 0) - Number(r.deduction || 0)) },
    ] : []),
    { key: 'account', label: t('accounts.parentAccount'), render: (r) => r.account ? `${r.account.code} - ${r.account.name_en}` : '—' },
    { key: 'deductionAccount', label: t('employees.deductionAccount'), render: (r) => r.deductionAccount ? `${r.deductionAccount.code} - ${r.deductionAccount.name_en}` : '—' },
    { key: 'is_driver', label: t('employees.driver'), render: (r) => r.is_driver ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gold-100 text-gold-700">{t('employees.driver')}</span> : '—' },
  ];

  return (
    <div>
      <PageHeader title={t('nav.employees')} actions={
        <div className="flex items-center gap-2">
          <select className="input !py-2" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
            <option value="">{t('employees.allPositions')}</option>
            {positions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input
            type="month"
            className="input !py-2"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            title={t('employees.filterByMonth')}
          />
          <input
            type="number"
            step="0.001"
            className="input !py-2 !w-28"
            placeholder={t('common.from')}
            title={t('employees.salaryFrom')}
            value={salaryFrom}
            onChange={(e) => setSalaryFrom(e.target.value)}
          />
          <input
            type="number"
            step="0.001"
            className="input !py-2 !w-28"
            placeholder={t('common.to')}
            title={t('employees.salaryTo')}
            value={salaryTo}
            onChange={(e) => setSalaryTo(e.target.value)}
          />
          <button onClick={() => printFile('/employees/pdf', {})} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
          <button onClick={() => downloadFile('/employees/excel', {}, 'employees.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
          {canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>}
        </div>
      } />
      <DataTable
        columns={columns}
        data={filteredItems}
        loading={loading}
        pageSize={25}
        onEdit={canCreateEdit ? openEdit : undefined}
        onDelete={canDelete ? setToDelete : undefined}
        extraActions={canCreateEdit ? (row) => (
          <button
            onClick={() => setLeaveEmployee(row)}
            title={t('employees.logLeave')}
            className="p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 text-blue-600"
          >
            <CalendarPlus size={15} />
          </button>
        ) : undefined}
      />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving} wide>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('common.code')}</label>
            <input disabled className="input opacity-60" value={editing ? form.code : t('employees.autoGenerated')} />
          </div>
          <div><label className="label">{t('employees.nationalId')}</label><input className="input" value={form.national_id || ''} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('common.nameEn')}</label><input required className="input" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
          <div><label className="label">{t('common.nameAr')}</label><input required dir="rtl" className="input" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('employees.nationality')}</label><input className="input" value={form.nationality || ''} onChange={(e) => setForm({ ...form, nationality: e.target.value })} /></div>
          <div><label className="label">{t('common.phone')}</label><input className="input" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('employees.position')}</label><input className="input" value={form.position || ''} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
          <div><label className="label">{t('employees.department')}</label><input className="input" value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t('employees.hireDate')}</label><input type="date" className="input" value={form.hire_date || ''} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
          <div><label className="label">{t('employees.salary')}</label><input type="number" step="0.001" className="input" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">{t('employees.vacationBalanceDays')}</label><input type="number" step="0.5" className="input" value={form.vacation_balance} onChange={(e) => setForm({ ...form, vacation_balance: e.target.value })} /></div>
          <div><label className="label">{t('employees.sickLeaveBalanceDays')}</label><input type="number" step="0.5" className="input" value={form.sick_leave_balance} onChange={(e) => setForm({ ...form, sick_leave_balance: e.target.value })} /></div>
          <div><label className="label">{t('employees.deduction')}</label><input type="number" step="0.001" className="input" value={form.deduction} onChange={(e) => setForm({ ...form, deduction: e.target.value })} /></div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium py-1">
          <input type="checkbox" checked={form.is_driver} onChange={(e) => setForm({ ...form, is_driver: e.target.checked })} className="w-4 h-4 rounded accent-navy-700" />
          {t('employees.driverCheckboxLabel')}
        </label>

        {form.is_driver && (
          <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-navy-800/50">
            <div><label className="label">{t('employees.licenseNo')}</label><input className="input" value={form.license_no || ''} onChange={(e) => setForm({ ...form, license_no: e.target.value })} /></div>
            <div><label className="label">{t('employees.licenseType')}</label><input className="input" value={form.license_type || ''} onChange={(e) => setForm({ ...form, license_type: e.target.value })} /></div>
            <div><label className="label">{t('employees.licenseExpiry')}</label><input type="date" className="input" value={form.license_expiry || ''} onChange={(e) => setForm({ ...form, license_expiry: e.target.value })} /></div>
          </div>
        )}

        <AccountPicker value={form.parent_account_id} onChange={(v) => setForm({ ...form, parent_account_id: v })} />
        <AccountPicker
          value={form.deduction_parent_account_id}
          onChange={(v) => setForm({ ...form, deduction_parent_account_id: v })}
          label={t('employees.deductionParentAccount')}
        />
      </SlideOver>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={remove} />
      <EmployeeLeaveDialog employee={leaveEmployee} open={!!leaveEmployee} onClose={() => setLeaveEmployee(null)} onChanged={load} />
    </div>
  );
}
