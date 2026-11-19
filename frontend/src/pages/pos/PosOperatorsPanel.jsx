import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { UserPlus, KeyRound, Trash2, Copy, Link2, Save } from 'lucide-react';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';

const posUrl = () => {
  const h = window.location.hostname.replace(/^www\./, '').replace(/^pos\./, '');
  return `${window.location.protocol}//pos.${h}${window.location.port ? ':' + window.location.port : ''}`;
};

export default function PosOperatorsPanel() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const company = useCompanyStore((s) => s.activeCompany);
  const [ops, setOps] = useState([]);
  const [branches, setBranches] = useState([]);
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState({ name: '', username: '', password: '', branch_id: '', salesperson_id: '' });
  const [bpw, setBpw] = useState({});
  const [saving, setSaving] = useState(false);
  const bn = (b) => (b ? (isAr ? b.name_ar || b.name_en : b.name_en) : '—');

  const load = () => api.get('/pos-operators').then((r) => { setOps(r.data.operators || []); setBranches(r.data.branches || []); }).catch(() => {});
  useEffect(() => { if (company) { load(); api.get('/sales-people').then((r) => setPeople(r.data || [])).catch(() => {}); } }, [company]); // eslint-disable-line

  const pick = (sp) => setForm((f) => ({ ...f, salesperson_id: sp, name: f.name || (people.find((p) => p.id === sp)?.name_en || '') }));
  const create = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/pos-operators', { ...form, salesperson_id: form.salesperson_id || null });
      toast.success(L('Operator added', 'تمت إضافة المشغّل'));
      setForm({ name: '', username: '', password: '', branch_id: '', salesperson_id: '' }); load();
    } catch { /* toast */ } finally { setSaving(false); }
  };
  const toggle = (o) => api.put(`/pos-operators/${o.id}`, { is_active: !o.is_active }).then(load);
  const resetPw = async (o) => { const pw = window.prompt(L('New password for ', 'كلمة مرور جديدة لـ ') + o.username); if (pw) { await api.put(`/pos-operators/${o.id}`, { password: pw }); toast.success(L('Password changed', 'تم تغيير كلمة المرور')); } };
  const remove = async (o) => { if (window.confirm(L('Remove this operator?', 'حذف هذا المشغّل؟'))) { await api.delete(`/pos-operators/${o.id}`); load(); } };
  const saveBranchPw = async (b) => { await api.put(`/pos-operators/branches/${b.id}/password`, { password: bpw[b.id] || '' }); toast.success(L('Saved', 'تم الحفظ')); setBpw((x) => ({ ...x, [b.id]: '' })); load(); };
  const url = posUrl();

  return (
    <div className="mb-8 space-y-4">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <Link2 size={18} className="text-sky-600" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{L('POS operators sign in here', 'يدخل مشغّلو نقطة البيع من هنا')}</p>
          <p className="font-mono text-sm font-semibold text-navy-900 dark:text-white break-all" dir="ltr">{url}</p>
        </div>
        <button className="btn-ghost flex items-center gap-1.5" onClick={() => { navigator.clipboard?.writeText(url); toast.success(L('Copied', 'تم النسخ')); }}><Copy size={14} />{L('Copy', 'نسخ')}</button>
      </div>

      <form onSubmit={create} className="card p-4">
        <p className="font-bold text-navy-900 dark:text-white mb-3 flex items-center gap-2"><UserPlus size={16} />{L('Add POS operator', 'إضافة مشغّل نقطة بيع')}</p>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div><label className="label">{L('Sales person', 'مندوب المبيعات')}</label>
            <select className="input" value={form.salesperson_id} onChange={(e) => pick(e.target.value)}>
              <option value="">—</option>
              {people.map((p) => <option key={p.id} value={p.id}>{isAr ? p.name_ar || p.name_en : p.name_en}</option>)}
            </select></div>
          <div><label className="label">{L('Name', 'الاسم')}</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><label className="label">{L('Branch', 'الفرع')}</label>
            <select className="input" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} required>
              <option value="">{L('Select…', 'اختر…')}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{bn(b)}</option>)}
            </select></div>
          <div><label className="label">{L('Username', 'اسم المستخدم')}</label><input className="input" dir="ltr" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></div>
          <div><label className="label">{L('Password', 'كلمة المرور')}</label><input className="input" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
          <div className="flex items-end"><button className="btn-primary w-full" disabled={saving}>{L('Add', 'إضافة')}</button></div>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-slate-400 border-b border-slate-100 dark:border-navy-800">
            {[L('Name', 'الاسم'), L('Username', 'المستخدم'), L('Branch', 'الفرع'), L('Sales person', 'المندوب'), L('Active', 'نشط'), ''].map((h, i) => <th key={i} className="px-4 py-3 text-start">{h}</th>)}
          </tr></thead>
          <tbody>
            {!ops.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{L('No operators yet', 'لا يوجد مشغّلون بعد')}</td></tr>}
            {ops.map((o) => (
              <tr key={o.id} className="border-b border-slate-50 dark:border-navy-800/60">
                <td className="px-4 py-2.5 font-medium">{o.name}</td>
                <td className="px-4 py-2.5 font-mono" dir="ltr">{o.username}</td>
                <td className="px-4 py-2.5">{bn(o.branch)}</td>
                <td className="px-4 py-2.5">{o.salesperson ? (isAr ? o.salesperson.name_ar || o.salesperson.name_en : o.salesperson.name_en) : '—'}</td>
                <td className="px-4 py-2.5"><input type="checkbox" checked={o.is_active} onChange={() => toggle(o)} /></td>
                <td className="px-4 py-2.5 flex gap-1 justify-end">
                  <button title={L('Change password', 'تغيير كلمة المرور')} onClick={() => resetPw(o)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800"><KeyRound size={15} /></button>
                  <button title={L('Remove', 'حذف')} onClick={() => remove(o)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <p className="font-bold text-navy-900 dark:text-white mb-1">{L('Shared branch password', 'كلمة مرور الفرع المشتركة')}</p>
        <p className="text-xs text-slate-500 mb-3">{L('Anyone with it can open the POS for that branch and pick who is selling. Leave empty and save to disable.', 'أي شخص يملكها يمكنه فتح نقطة البيع للفرع واختيار البائع. اتركها فارغة واحفظ للتعطيل.')}</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {branches.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="w-40 truncate text-sm font-medium">{bn(b)}</span>
              <input className="input flex-1" dir="ltr" placeholder={b.has_password ? L('Set (type to change)', 'مُعيّنة (اكتب للتغيير)') : L('Not set', 'غير مُعيّنة')} value={bpw[b.id] || ''} onChange={(e) => setBpw({ ...bpw, [b.id]: e.target.value })} />
              <button type="button" className="btn-ghost" onClick={() => saveBranchPw(b)}><Save size={15} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
