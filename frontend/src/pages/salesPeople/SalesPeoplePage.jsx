import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Target, Users, Trash2, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import SlideOver from '@/components/SlideOver';

const n3 = (v) => Number(v || 0).toFixed(3);
const emptyPerson = { id: null, name_en: '', name_ar: '', phone: '', branch_id: '', is_active: true };

// Sales people (who can be picked on a POS invoice) + monthly targets with live
// achievement and commission. Super admin / company admin only.
export default function SalesPeoplePage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [people, setPeople] = useState([]);
  const [targets, setTargets] = useState([]);
  const [perf, setPerf] = useState([]);
  const [branches, setBranches] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [pOpen, setPOpen] = useState(false);
  const [pForm, setPForm] = useState(emptyPerson);
  const [tOpen, setTOpen] = useState(false);
  const [tForm, setTForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const nameOf = (p) => (p ? (isAr ? p.name_ar || p.name_en : p.name_en) : '—');
  const load = () => {
    api.get('/sales-people', { params: { status: 'all' } }).then((r) => setPeople(r.data));
    api.get('/sales-targets', { params: { month } }).then((r) => setTargets(r.data.targets)).catch(() => setTargets([]));
    api.get('/sales-targets/performance', { params: { month } }).then((r) => setPerf(r.data.rows)).catch(() => setPerf([]));
  };
  useEffect(() => {
    if (!activeCompany) return;
    load();
  }, [activeCompany, month]);
  useEffect(() => {
    if (!activeCompany) return;
    api.get('/branches').then((r) => setBranches(r.data)).catch(() => {});
    api.get('/item-categories').then((r) => setCategories(r.data)).catch(() => {});
    api.get('/items').then((r) => setItems(r.data)).catch(() => {});
  }, [activeCompany]);

  const savePerson = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (pForm.id) await api.put(`/sales-people/${pForm.id}`, pForm); else await api.post('/sales-people', pForm);
      toast.success(L('Saved', 'تم الحفظ')); setPOpen(false); load();
    } finally { setSaving(false); }
  };
  const newTarget = () => setTForm({ id: null, salesperson_id: people.find((p) => p.is_active)?.id || '', month, target_amount: '', branch_id: people.find((p) => p.is_active)?.branch_id || '', category_id: '', item_id: '', commission_pct: '', commission_mode: 'on_achievement' });
  const saveTarget = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (tForm.id) await api.put(`/sales-targets/${tForm.id}`, tForm); else await api.post('/sales-targets', tForm);
      toast.success(L('Saved', 'تم الحفظ')); setTOpen(false); load();
    } finally { setSaving(false); }
  };
  const delTarget = async (t) => { if (window.confirm(L('Delete this target?', 'حذف هذا الهدف؟'))) { await api.delete(`/sales-targets/${t.id}`); load(); } };
  const scopeLabel = (t) => [
    t.branch_id && `${L('Branch', 'فرع')}: ${branches.find((b) => b.id === t.branch_id)?.name_en || ''}`,
    t.category_id && `${L('Category', 'فئة')}: ${categories.find((c) => c.id === t.category_id)?.name_en || ''}`,
    t.item_id && `${L('Item', 'صنف')}: ${items.find((i) => i.id === t.item_id)?.name_en || ''}`,
  ].filter(Boolean).join(' · ') || L('All sales', 'كل المبيعات');

  return (
    <div>
      <PageHeader
        title={L('Sales people & targets', 'مندوبو المبيعات والأهداف')}
        subtitle={L('Sales people appear in the POS invoice dropdown; targets are matched against their real sales (net of returns)', 'يظهر البائعون في قائمة فاتورة نقطة البيع؛ وتُقارن الأهداف بمبيعاتهم الفعلية (صافي المرتجعات)')}
        actions={<input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />}
      />

      <div className="grid xl:grid-cols-[360px_1fr] gap-5">
        <div className="card p-4 h-fit">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold flex items-center gap-2"><Users size={16} className="text-slate-400" />{L('Sales people', 'البائعون')}</p>
            <button onClick={() => { setPForm(emptyPerson); setPOpen(true); }} className="btn-primary !py-1.5 text-xs"><Plus size={14} />{L('Add', 'إضافة')}</button>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-navy-800">
            {perf.map((r) => (
              <li key={r.salesperson.id} className={`flex items-center justify-between py-2.5 text-sm ${r.salesperson.is_active ? '' : 'opacity-50'}`}>
                <span><b>{nameOf(r.salesperson)}</b><br /><span className="text-xs text-slate-400">{branches.find((b) => b.id === r.salesperson.branch_id)?.name_en || L('All branches', 'كل الفروع')} · {L('Net sales', 'صافي المبيعات')}: {n3(r.net)}{r.returned > 0 && ` (${L('returns', 'مرتجع')} ${n3(r.returned)})`}</span></span>
                <button onClick={() => { setPForm({ ...r.salesperson, name_ar: r.salesperson.name_ar || '', phone: r.salesperson.phone || '', branch_id: r.salesperson.branch_id || '' }); setPOpen(true); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 text-slate-400"><Pencil size={14} /></button>
              </li>
            ))}
            {!perf.length && <li className="py-6 text-center text-sm text-slate-400">{L('No sales people yet.', 'لا يوجد مندوبون بعد.')}</li>}
          </ul>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold flex items-center gap-2"><Target size={16} className="text-slate-400" />{L('Targets', 'الأهداف')} · {month}</p>
            <button onClick={() => { newTarget(); setTOpen(true); }} disabled={!people.length} className="btn-primary !py-1.5 text-xs"><Plus size={14} />{L('Add target', 'إضافة هدف')}</button>
          </div>
          <div className="space-y-3">
            {targets.map((t) => (
              <div key={t.id} className="rounded-2xl border border-slate-100 dark:border-navy-800 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold flex items-center gap-1.5">{nameOf(t.salesperson)}{t.reached && <Trophy size={15} className="text-amber-500" />}</p>
                    <p className="text-xs text-slate-400">{scopeLabel(t)}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setTForm({ ...t, month: String(t.month).slice(0, 7) }); setTOpen(true); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 text-slate-400"><Pencil size={14} /></button>
                    <button onClick={() => delTarget(t)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-navy-800 mt-3 overflow-hidden">
                  <div className={`h-full rounded-full ${t.reached ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, t.achieved_pct)}%` }} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-sm">
                  <span><b>{n3(t.actual.net)}</b> / {n3(t.target_amount)} <span className="text-slate-400">({t.achieved_pct.toFixed(1)}%)</span></span>
                  <span className="text-xs text-slate-500">
                    {L('Commission', 'العمولة')} {Number(t.commission_pct)}% ({t.commission_mode === 'always' ? L('always', 'دائماً') : L('on achievement', 'عند التحقيق')}) → <b className="text-emerald-600">{n3(t.commission)}</b>
                  </span>
                </div>
              </div>
            ))}
            {!targets.length && <p className="py-8 text-center text-sm text-slate-400">{L('No targets for this month.', 'لا أهداف لهذا الشهر.')}</p>}
          </div>
        </div>
      </div>

      <SlideOver open={pOpen} onClose={() => setPOpen(false)} title={pForm.id ? L('Edit sales person', 'تعديل مندوب') : L('New sales person', 'مندوب جديد')} onSubmit={savePerson} submitting={saving}>
        <div><label className="label">{L('Name (English)', 'الاسم (إنجليزي)')} *</label><input required className="input" value={pForm.name_en} onChange={(e) => setPForm({ ...pForm, name_en: e.target.value })} /></div>
        <div><label className="label">{L('Name (Arabic)', 'الاسم (عربي)')}</label><input dir="rtl" className="input" value={pForm.name_ar} onChange={(e) => setPForm({ ...pForm, name_ar: e.target.value })} /></div>
        <div><label className="label">{L('Phone', 'الهاتف')}</label><input className="input" value={pForm.phone} onChange={(e) => setPForm({ ...pForm, phone: e.target.value })} /></div>
        <div><label className="label">{L('Branch', 'الفرع')}</label>
          <select className="input" value={pForm.branch_id || ''} onChange={(e) => setPForm({ ...pForm, branch_id: e.target.value })}>
            <option value="">{L('All branches', 'كل الفروع')}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {isAr ? b.name_ar || b.name_en : b.name_en}</option>)}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">{L('Appears in the POS dropdown for this branch; targets default to this branch.', 'يظهر في قائمة نقطة البيع لهذا الفرع، وتُحتسب الأهداف على هذا الفرع افتراضياً.')}</p></div>
        {pForm.id && <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="rounded" checked={pForm.is_active} onChange={(e) => setPForm({ ...pForm, is_active: e.target.checked })} />{L('Active', 'نشط')}</label>}
      </SlideOver>

      {tForm && (
        <SlideOver open={tOpen} onClose={() => setTOpen(false)} title={tForm.id ? L('Edit target', 'تعديل هدف') : L('New target', 'هدف جديد')} onSubmit={saveTarget} submitting={saving}>
          <div><label className="label">{L('Sales person', 'البائع')} *</label>
            <select required className="input" value={tForm.salesperson_id} onChange={(e) => setTForm({ ...tForm, salesperson_id: e.target.value })}>
              {people.filter((p) => p.is_active || p.id === tForm.salesperson_id).map((p) => <option key={p.id} value={p.id}>{nameOf(p)}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">{L('Month', 'الشهر')} *</label><input required type="month" className="input" value={String(tForm.month).slice(0, 7)} onChange={(e) => setTForm({ ...tForm, month: e.target.value })} /></div>
            <div><label className="label">{L('Target amount', 'قيمة الهدف')} *</label><input required type="number" step="0.001" min="0" className="input" value={tForm.target_amount} onChange={(e) => setTForm({ ...tForm, target_amount: e.target.value })} /></div>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase pt-1">{L('Count only sales of… (optional)', 'احتساب مبيعات … فقط (اختياري)')}</p>
          <div><label className="label">{L('Branch', 'الفرع')}</label>
            <select className="input" value={tForm.branch_id || ''} onChange={(e) => setTForm({ ...tForm, branch_id: e.target.value })}><option value="">{L('All branches', 'كل الفروع')}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.code} - {b.name_en}</option>)}</select></div>
          <div><label className="label">{L('Item category', 'فئة الأصناف')}</label>
            <select className="input" value={tForm.category_id || ''} onChange={(e) => setTForm({ ...tForm, category_id: e.target.value })}><option value="">{L('All categories', 'كل الفئات')}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}</select></div>
          <div><label className="label">{L('Specific item', 'صنف محدد')}</label>
            <select className="input" value={tForm.item_id || ''} onChange={(e) => setTForm({ ...tForm, item_id: e.target.value })}><option value="">{L('All items', 'كل الأصناف')}</option>{items.map((i) => <option key={i.id} value={i.id}>{i.code} - {i.name_en}</option>)}</select></div>
          <p className="text-xs font-bold text-slate-400 uppercase pt-1">{L('Commission', 'العمولة')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">%</label><input type="number" step="0.001" min="0" max="100" className="input" value={tForm.commission_pct} onChange={(e) => setTForm({ ...tForm, commission_pct: e.target.value })} /></div>
            <div><label className="label">{L('Paid', 'تُدفع')}</label>
              <select className="input" value={tForm.commission_mode} onChange={(e) => setTForm({ ...tForm, commission_mode: e.target.value })}>
                <option value="on_achievement">{L('Only when target is reached', 'عند تحقيق الهدف فقط')}</option><option value="always">{L('On all sales', 'على كل المبيعات')}</option>
              </select></div>
          </div>
        </SlideOver>
      )}
    </div>
  );
}
