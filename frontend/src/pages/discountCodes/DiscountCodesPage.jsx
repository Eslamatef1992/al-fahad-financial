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

const empty = {
  code: '', description: '', type: 'percentage', value: '', scope: 'invoice',
  expiry_date: '', max_redemptions: '', min_invoice_amount: '', single_use: false, item_ids: [],
};

export default function DiscountCodesPage() {
  const { t, i18n } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit, canDelete } = usePermissions();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('codes');
  const [items, setItems] = useState([]);
  const [itemQ, setItemQ] = useState('');
  const [track, setTrack] = useState(null);
  const [openCode, setOpenCode] = useState(null);
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);

  const load = () => {
    setLoading(true);
    api.get('/discount-codes', { params: showInactive ? { status: 'all' } : {} }).then((r) => setCodes(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, showInactive]);
  useEffect(() => { if (activeCompany) api.get('/items').then((r) => setItems(r.data)).catch(() => {}); }, [activeCompany]);
  useEffect(() => { if (activeCompany && tab === 'tracking') api.get('/discount-codes/tracking').then((r) => setTrack(r.data)).catch(() => setTrack(null)); }, [activeCompany, tab]);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      code: row.code, description: row.description || '', type: row.type, value: row.value, scope: row.scope,
      expiry_date: row.expiry_date || '', max_redemptions: row.max_redemptions ?? '', min_invoice_amount: row.min_invoice_amount ?? '',
      single_use: !!row.single_use, item_ids: row.item_ids || [],
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) await api.put(`/discount-codes/${editing.id}`, form);
      else await api.post('/discount-codes', form);
      toast.success(t('common.save')); setOpen(false); load();
    } finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    await api.put(`/discount-codes/${row.id}`, { is_active: !row.is_active });
    toast.success(row.is_active ? t('common.deactivated') : t('common.activated'));
    load();
  };

  const columns = [
    { key: 'code', label: t('discountCodes.code'), render: (r) => <span className="font-mono font-semibold">{r.code}</span> },
    { key: 'description', label: t('common.description'), render: (r) => r.description || '—' },
    { key: 'value', label: t('discountCodes.discount'), render: (r) => (r.type === 'percentage' ? `${Number(r.value).toFixed(2)}%` : Number(r.value).toFixed(3)) },
    { key: 'scope', label: t('discountCodes.scope'), render: (r) => (
      <span>{t(`discountCodes.scope_${r.scope}`)}{r.single_use && <span className="ms-1.5 px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 text-[10px] font-bold">{L('ONE-TIME', 'مرة واحدة')}</span>}{r.item_ids?.length > 0 && <span className="ms-1.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-[10px] font-bold">{r.item_ids.length} {L('ITEMS', 'أصناف')}</span>}</span>
    ) },
    { key: 'used_count', label: t('discountCodes.usage'), render: (r) => (r.max_redemptions ? `${r.used_count} / ${r.max_redemptions}` : `${r.used_count} (${t('discountCodes.unlimited')})`) },
    { key: 'min_invoice_amount', label: t('discountCodes.minAmount'), render: (r) => (r.min_invoice_amount ? Number(r.min_invoice_amount).toFixed(3) : '—') },
    { key: 'expiry_date', label: t('discountCodes.expiry'), render: (r) => r.expiry_date || t('discountCodes.noExpiry') },
    { key: 'is_active', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {r.is_active ? t('common.active') : t('common.inactive')}
      </span>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.discountCodes')}
        actions={canCreateEdit && <button onClick={openNew} className="btn-primary"><Plus size={16} /> {t('common.add')}</button>}
      />
      <div className="flex gap-2 mb-4 border-b border-slate-100 dark:border-navy-800">
        {[['codes', L('Coupons', 'الكوبونات')], ['tracking', L('Tracking & effect', 'التتبع والأثر')]].map(([k, lab]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 ${tab === k ? 'border-gold-500 text-navy-900 dark:text-white' : 'border-transparent text-slate-400'}`}>{lab}</button>
        ))}
      </div>
      {tab === 'tracking' && (
        <div className="space-y-4">
          {track && (
            <div className="grid sm:grid-cols-3 gap-3">
              {[[L('Redemptions', 'مرات الاستخدام'), track.totals.redemptions], [L('Total discount given', 'إجمالي الخصم'), Number(track.totals.discount).toFixed(3)], [L('Sales using coupons', 'مبيعات بالكوبونات'), Number(track.totals.sales).toFixed(3)]].map(([lab, v]) => (
                <div key={lab} className="card p-4"><p className="text-xs text-slate-400 uppercase font-semibold">{lab}</p><p className="text-2xl font-extrabold mt-1">{v}</p></div>
              ))}
            </div>
          )}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 dark:bg-navy-900 text-[11px] uppercase tracking-wide text-slate-500">
                {[L('Coupon', 'الكوبون'), L('Kind', 'النوع'), L('Expiry', 'الانتهاء'), L('Used', 'مستخدم'), L('Remaining', 'المتبقي'), L('Discount given', 'الخصم الممنوح'), L('Sales', 'المبيعات'), ''].map((h, i) => <th key={i} className="px-3 py-2.5 text-start whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {(track?.codes || []).map((c) => (
                  <>
                    <tr key={c.id} className="border-t border-slate-100 dark:border-navy-800">
                      <td className="px-3 py-2 font-mono font-semibold">{c.code}</td>
                      <td className="px-3 py-2 text-xs">{c.single_use ? L('One-time', 'مرة واحدة') : c.item_ids.length ? L('Per item', 'لصنف') : c.scope === 'line' ? L('Per line', 'لكل بند') : L('Invoice', 'فاتورة')}</td>
                      <td className="px-3 py-2">{c.expiry_date ? <span className={c.expired ? 'text-rose-600 font-semibold' : ''}>{c.expiry_date}{c.expired && ` (${L('expired', 'منتهي')})`}</span> : '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{c.redemptions}{c.max_redemptions ? ` / ${c.max_redemptions}` : ''}</td>
                      <td className="px-3 py-2 tabular-nums">{c.remaining ?? '∞'}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold text-rose-600">{c.total_discount.toFixed(3)}</td>
                      <td className="px-3 py-2 tabular-nums">{c.sales_after_discount.toFixed(3)}</td>
                      <td className="px-3 py-2"><button onClick={() => setOpenCode(openCode === c.id ? null : c.id)} className="text-xs text-indigo-600 font-semibold">{openCode === c.id ? L('Hide', 'إخفاء') : L('Invoices', 'الفواتير')}</button></td>
                    </tr>
                    {openCode === c.id && (
                      <tr key={`${c.id}-d`}><td colSpan={8} className="px-3 py-2 bg-slate-50/60 dark:bg-navy-900/40">
                        {c.invoices.length ? c.invoices.map((v) => (
                          <div key={v.invoice_id} className="flex flex-wrap items-center gap-x-5 text-xs py-1">
                            <a className="text-indigo-600 font-semibold hover:underline" href={`/invoices/${v.invoice_id}`}>{v.invoice_no}</a>
                            <span>{v.date}</span><span>{v.client || '—'}</span><span>{v.salesperson || ''}</span>
                            <span>{L('Total', 'الإجمالي')} {v.total.toFixed(3)}</span><span className="text-rose-600">−{v.discount.toFixed(3)}</span>
                          </div>
                        )) : <span className="text-xs text-slate-400">{L('Not used yet.', 'لم يُستخدم بعد.')}</span>}
                      </td></tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === 'codes' && (<>
      <label className="flex items-center gap-2 text-sm text-slate-500 mb-3 cursor-pointer w-fit">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
        {t('common.showInactive')}
      </label>
      <DataTable
        columns={columns}
        data={codes}
        loading={loading}
        onEdit={canCreateEdit ? openEdit : undefined}
        onToggleActive={canDelete ? toggleActive : undefined}
        isInactive={(r) => !r.is_active}
        pageSize={25}
      />
      </>)}

      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? t('common.edit') : t('common.add')} onSubmit={submit} submitting={saving}>
        <div>
          <label className="label">{t('discountCodes.code')}</label>
          <input required className="input font-mono" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SAVE10" />
        </div>
        <div>
          <label className="label">{t('common.description')}</label>
          <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('discountCodes.type')}</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="percentage">{t('discountCodes.percentage')}</option>
              <option value="fixed">{t('discountCodes.fixed')}</option>
            </select>
          </div>
          <div>
            <label className="label">{form.type === 'percentage' ? t('discountCodes.valuePercent') : t('discountCodes.valueAmount')}</label>
            <input required type="number" step="0.001" min="0" max={form.type === 'percentage' ? 100 : undefined} className="input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">{t('discountCodes.scope')}</label>
          <select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
            <option value="invoice">{t('discountCodes.scope_invoice')}</option>
            <option value="line">{t('discountCodes.scope_line')}</option>
          </select>
          <p className="text-xs text-slate-400 mt-1">{t('discountCodes.scopeHint')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('discountCodes.expiry')}</label>
            <input type="date" className="input" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
          </div>
          <div>
            <label className="label">{t('discountCodes.maxRedemptions')}</label>
            <input type="number" step="1" min="0" className="input" value={form.max_redemptions} onChange={(e) => setForm({ ...form, max_redemptions: e.target.value })} placeholder={t('discountCodes.unlimited')} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="rounded" checked={form.single_use} onChange={(e) => setForm({ ...form, single_use: e.target.checked })} />
          {L('One-time coupon (valid for a single invoice only)', 'كوبون لمرة واحدة (صالح لفاتورة واحدة فقط)')}
        </label>
        <div>
          <label className="label">{L('Limit to specific items (optional)', 'حصر على أصناف محددة (اختياري)')} {form.item_ids.length > 0 && <span className="text-indigo-600">· {form.item_ids.length}</span>}</label>
          <input className="input mb-2" placeholder={L('Search items…', 'ابحث عن صنف…')} value={itemQ} onChange={(e) => setItemQ(e.target.value)} />
          <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 dark:border-navy-800 divide-y divide-slate-50 dark:divide-navy-800">
            {items.filter((i) => form.item_ids.includes(i.id) || `${i.code} ${i.name_en} ${i.name_ar}`.toLowerCase().includes(itemQ.toLowerCase())).slice(0, 60).map((i) => (
              <label key={i.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-navy-800">
                <input type="checkbox" className="rounded" checked={form.item_ids.includes(i.id)} onChange={(e) => setForm({ ...form, item_ids: e.target.checked ? [...form.item_ids, i.id] : form.item_ids.filter((x) => x !== i.id), scope: 'line' })} />
                <span className="text-slate-400">{i.code}</span> {i.name_en}
              </label>
            ))}
          </div>
          {form.item_ids.length > 0 && <p className="text-xs text-slate-400 mt-1">{L('A per-item coupon is applied on the item line, never on the whole invoice.', 'يُطبَّق كوبون الصنف على بند الصنف وليس على الفاتورة كاملة.')}</p>}
        </div>
        <div>
          <label className="label">{t('discountCodes.minAmount')}</label>
          <input type="number" step="0.001" min="0" className="input" value={form.min_invoice_amount} onChange={(e) => setForm({ ...form, min_invoice_amount: e.target.value })} placeholder={t('discountCodes.noMinimum')} />
        </div>
      </SlideOver>
    </div>
  );
}
