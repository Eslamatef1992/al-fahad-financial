import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

const emptyLine = () => ({ account_id: '', cost_center_id: '', client_id: '', supplier_id: '', debit: '', credit: '', description: '' });

export default function VoucherFormPage() {
  const { id } = useParams(); // present only when editing an existing draft voucher
  const isEdit = !!id;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [accounts, setAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  const [header, setHeader] = useState({ voucher_type: 'journal', date: new Date().toISOString().slice(0, 10), description: '', cost_center_id: '' });
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);

  useEffect(() => {
    if (!activeCompany) return;
    api.get('/accounts').then((r) => setAccounts(r.data.filter((a) => !a.is_group)));
    api.get('/cost-centers').then((r) => setCostCenters(r.data));
    api.get('/clients').then((r) => setClients(r.data));
    api.get('/suppliers').then((r) => setSuppliers(r.data));
  }, [activeCompany]);

  useEffect(() => {
    if (!activeCompany || !isEdit) return;
    setLoading(true);
    api.get(`/vouchers/${id}`).then((r) => {
      const v = r.data;
      if (v.status !== 'draft') {
        toast.error(t('vouchers.editHint'));
        navigate(`/vouchers/${id}`);
        return;
      }
      setHeader({ voucher_type: v.voucher_type, date: v.date, description: v.description || '', cost_center_id: v.cost_center_id || '' });
      setLines((v.lines || []).map((l) => ({
        account_id: l.account_id || '', cost_center_id: l.cost_center_id || '', client_id: l.client_id || '',
        supplier_id: l.supplier_id || '', debit: Number(l.debit) > 0 ? l.debit : '', credit: Number(l.credit) > 0 ? l.credit : '',
        description: l.description || '',
      })));
    }).finally(() => setLoading(false));
  }, [activeCompany, isEdit, id]);

  const updateLine = (idx, patch) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (idx) => setLines((ls) => ls.filter((_, i) => i !== idx));

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!balanced) return toast.error(t('vouchers.mustBeBalanced'));
    setSaving(true);
    try {
      const payload = { ...header, lines: lines.filter((l) => l.account_id) };
      if (isEdit) {
        const { data } = await api.put(`/vouchers/${id}`, payload);
        toast.success(t('vouchers.updatedDraft'));
        navigate(`/vouchers/${data.id}`);
      } else {
        const { data } = await api.post('/vouchers', payload);
        toast.success(t('vouchers.createdDraft'));
        navigate(`/vouchers/${data.id}`);
      }
    } finally { setSaving(false); }
  };

  if (loading) return <p className="text-slate-400">{t('common.loading')}</p>;

  return (
    <div>
      <button onClick={() => navigate('/vouchers')} className="btn-ghost !px-2 mb-3"><ArrowLeft size={16} /> {t('vouchers.backToVouchers')}</button>
      <PageHeader title={isEdit ? t('vouchers.editVoucher') : t('vouchers.newVoucher')} />

      <form onSubmit={submit} className="space-y-5">
        <div className="card p-5 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">{t('vouchers.voucherType')}</label>
            <select className="input" value={header.voucher_type} onChange={(e) => setHeader({ ...header, voucher_type: e.target.value })}>
              <option value="receipt">{t('vouchers.receipt')}</option><option value="payment">{t('vouchers.payment')}</option><option value="journal">{t('vouchers.journal')}</option>
            </select>
          </div>
          <div><label className="label">{t('common.date')}</label><input required type="date" className="input" value={header.date} onChange={(e) => setHeader({ ...header, date: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">{t('common.description')}</label><input className="input" value={header.description} onChange={(e) => setHeader({ ...header, description: e.target.value })} /></div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">{t('vouchers.voucherLines')}</h3>
            <button type="button" onClick={addLine} className="btn-ghost !py-1.5"><Plus size={15} /> {t('vouchers.addLine')}</button>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <motion.div key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-12 gap-2 items-start p-3 rounded-xl bg-slate-50 dark:bg-navy-800/40">
                <select required className="input col-span-3 !py-2" value={line.account_id} onChange={(e) => updateLine(idx, { account_id: e.target.value })}>
                  <option value="">{t('vouchers.account')}...</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
                </select>
                <select className="input col-span-2 !py-2" value={line.cost_center_id} onChange={(e) => updateLine(idx, { cost_center_id: e.target.value })}>
                  <option value="">{t('vouchers.costCenter')}</option>
                  {costCenters.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name_en}</option>)}
                </select>
                <input placeholder={t('common.description')} className="input col-span-2 !py-2" value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                <input type="number" step="0.001" placeholder={t('vouchers.debit')} className="input col-span-2 !py-2" value={line.debit} onChange={(e) => updateLine(idx, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} />
                <input type="number" step="0.001" placeholder={t('vouchers.credit')} className="input col-span-2 !py-2" value={line.credit} onChange={(e) => updateLine(idx, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} />
                <button type="button" onClick={() => removeLine(idx)} className="col-span-1 p-2 rounded-lg hover:bg-red-50 text-red-500 justify-self-center"><Trash2 size={15} /></button>
              </motion.div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-6 mt-4 pt-4 border-t border-slate-100 dark:border-navy-800">
            <div className="text-sm"><span className="text-slate-400">{t('vouchers.totalDebit')}: </span><span className="font-bold">{totalDebit.toFixed(3)}</span></div>
            <div className="text-sm"><span className="text-slate-400">{t('vouchers.totalCredit')}: </span><span className="font-bold">{totalCredit.toFixed(3)}</span></div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${balanced ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
              {balanced ? t('vouchers.balanced') : t('vouchers.notBalanced')}
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <button disabled={saving || !balanced} className="btn-primary"><Save size={16} /> {isEdit ? t('vouchers.saveChanges') : t('vouchers.saveAsDraft')}</button>
        </div>
      </form>
    </div>
  );
}
