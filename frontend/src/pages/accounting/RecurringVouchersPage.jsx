import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import DataTable from '@/components/DataTable';
import SlideOver from '@/components/SlideOver';
import ConfirmDialog from '@/components/ConfirmDialog';
import usePermissions from '@/hooks/usePermissions';

const emptyLine = () => ({ account_id: '', debit: '', credit: '', description: '' });
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({ name: '', voucher_type: 'journal', frequency: 'monthly', next_run_date: today(), description: '', branch_id: '', cost_center_id: '' });

export default function RecurringVouchersPage() {
  const { L, isAr, branches } = useOutletContext();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit } = usePermissions();
  const [items, setItems] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [toDeactivate, setToDeactivate] = useState(null);
  const [generating, setGenerating] = useState(false);

  const load = () => { setLoading(true); api.get('/recurring-vouchers').then((r) => setItems(r.data)).finally(() => setLoading(false)); };
  useEffect(() => {
    if (!activeCompany) return;
    load();
    api.get('/accounts').then((r) => setAccounts(r.data.filter((a) => !a.is_group)));
  }, [activeCompany]);

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;
  const setLine = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const openNew = () => { setEditing(null); setForm(emptyForm()); setLines([emptyLine(), emptyLine()]); setOpen(true); };
  const openEdit = (r) => {
    setEditing(r);
    setForm({ name: r.name, voucher_type: r.voucher_type, frequency: r.frequency, next_run_date: r.next_run_date, description: r.description || '', branch_id: r.branch_id || '', cost_center_id: r.cost_center_id || '' });
    setLines((r.lines || []).map((l) => ({ ...l, debit: l.debit || '', credit: l.credit || '' })));
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!balanced) { toast.error(L('Debit and credit must balance', 'يجب أن يتساوى المدين والدائن')); return; }
    setSaving(true);
    try {
      const body = { ...form, lines: lines.filter((l) => l.account_id) };
      if (editing) await api.put(`/recurring-vouchers/${editing.id}`, body);
      else await api.post('/recurring-vouchers', body);
      toast.success(L('Saved', 'تم الحفظ')); setOpen(false); load();
    } finally { setSaving(false); }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post('/recurring-vouchers/generate-due');
      toast.success(L(`${data.generated_count} draft voucher(s) generated`, `تم إنشاء ${data.generated_count} سند مسودة`));
      load();
    } finally { setGenerating(false); }
  };

  const freq = { weekly: L('Weekly', 'أسبوعي'), monthly: L('Monthly', 'شهري'), quarterly: L('Quarterly', 'ربع سنوي'), yearly: L('Yearly', 'سنوي') };
  const typeLabel = { receipt: L('Receipt', 'قبض'), payment: L('Payment', 'صرف'), journal: L('Journal', 'قيد') };
  const columns = [
    { key: 'name', label: L('Name', 'الاسم') },
    { key: 'voucher_type', label: L('Type', 'النوع'), render: (r) => typeLabel[r.voucher_type] },
    { key: 'frequency', label: L('Frequency', 'التكرار'), render: (r) => freq[r.frequency] },
    { key: 'next_run_date', label: L('Next run', 'التشغيل القادم') },
    { key: 'amount', label: L('Amount', 'المبلغ'), render: (r) => (r.lines || []).reduce((s, l) => s + Number(l.debit || 0), 0).toFixed(3) },
    { key: 'is_active', label: L('Status', 'الحالة'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{r.is_active ? L('Active', 'نشط') : L('Inactive', 'غير نشط')}</span>
    ) },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-navy-900 dark:text-white">{L('Recurring Vouchers', 'السندات المتكررة')}</h1>
        {canCreateEdit && (
          <div className="flex gap-2">
            <button onClick={generate} disabled={generating} className="btn-ghost"><RefreshCw size={16} className={generating ? 'animate-spin' : ''} />{L('Generate due now', 'إنشاء المستحق الآن')}</button>
            <button onClick={openNew} className="btn-primary"><Plus size={16} />{L('New template', 'قالب جديد')}</button>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-3">{L('Templates create a DRAFT voucher automatically each period (daily check at 02:00). Review and post the drafts from Vouchers.', 'تنشئ القوالب سند مسودة تلقائياً في كل فترة (فحص يومي الساعة 02:00). راجع المسودات وقم بترحيلها من السندات.')}</p>
      <DataTable
        columns={columns} data={items} loading={loading} pageSize={25}
        isInactive={(r) => !r.is_active}
        onEdit={canCreateEdit ? openEdit : undefined}
        onToggleActive={canCreateEdit ? (r) => (r.is_active ? setToDeactivate(r) : api.put(`/recurring-vouchers/${r.id}`, { is_active: true }).then(load)) : undefined}
      />

      <SlideOver wide open={open} onClose={() => setOpen(false)} title={editing ? L('Edit template', 'تعديل القالب') : L('New recurring voucher', 'سند متكرر جديد')} onSubmit={submit} submitting={saving}>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="label">{L('Name', 'الاسم')}</label><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={L('e.g. Monthly rent', 'مثال: إيجار شهري')} /></div>
          <div><label className="label">{L('Voucher type', 'نوع السند')}</label>
            <select className="input" value={form.voucher_type} onChange={(e) => setForm({ ...form, voucher_type: e.target.value })}>
              {Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="label">{L('Frequency', 'التكرار')}</label>
            <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              {Object.entries(freq).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className="label">{L('First / next run date', 'تاريخ التشغيل القادم')}</label><input required type="date" className="input" value={form.next_run_date} onChange={(e) => setForm({ ...form, next_run_date: e.target.value })} /></div>
          <div><label className="label">{L('Branch', 'الفرع')}</label>
            <select className="input" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{isAr ? b.name_ar : b.name_en}</option>)}
            </select></div>
          <div className="sm:col-span-2"><label className="label">{L('Description', 'الوصف')}</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between"><label className="label !mb-0">{L('Lines', 'البنود')}</label>
            <button type="button" className="btn-ghost !py-1" onClick={() => setLines([...lines, emptyLine()])}><Plus size={14} />{L('Add line', 'إضافة بند')}</button></div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <select className="input col-span-5 !py-2" value={l.account_id} onChange={(e) => setLine(i, { account_id: e.target.value })}>
                <option value="">{L('Account…', 'الحساب…')}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
              </select>
              <input type="number" step="0.001" placeholder={L('Debit', 'مدين')} className="input col-span-3 !py-2" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} />
              <input type="number" step="0.001" placeholder={L('Credit', 'دائن')} className="input col-span-3 !py-2" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} />
              <button type="button" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="col-span-1 p-2 rounded-lg hover:bg-red-50 text-red-500 disabled:opacity-30"><Trash2 size={15} /></button>
            </div>
          ))}
          <p className={`text-xs font-semibold ${balanced ? 'text-emerald-600' : 'text-rose-500'}`}>
            {L('Debit', 'مدين')}: {totalDebit.toFixed(3)} · {L('Credit', 'دائن')}: {totalCredit.toFixed(3)} {balanced ? '✓' : `(${L('not balanced', 'غير متوازن')})`}
          </p>
        </div>
      </SlideOver>

      <ConfirmDialog
        open={!!toDeactivate} message={L('Deactivate this template? No further vouchers will be generated from it.', 'تعطيل هذا القالب؟ لن يتم إنشاء سندات أخرى منه.')}
        onCancel={() => setToDeactivate(null)}
        onConfirm={async () => { await api.delete(`/recurring-vouchers/${toDeactivate.id}`); setToDeactivate(null); load(); }}
      />
    </div>
  );
}
