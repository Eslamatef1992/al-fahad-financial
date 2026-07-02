import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';

const emptyLine = () => ({ account_id: '', cost_center_id: '', client_id: '', supplier_id: '', debit: '', credit: '', description: '' });

export default function VoucherFormPage() {
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [accounts, setAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [clients, setClients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [saving, setSaving] = useState(false);

  const [header, setHeader] = useState({ voucher_type: 'journal', date: new Date().toISOString().slice(0, 10), description: '', cost_center_id: '' });
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);

  useEffect(() => {
    if (!activeCompany) return;
    api.get('/accounts').then((r) => setAccounts(r.data.filter((a) => !a.is_group)));
    api.get('/cost-centers').then((r) => setCostCenters(r.data));
    api.get('/clients').then((r) => setClients(r.data));
    api.get('/suppliers').then((r) => setSuppliers(r.data));
  }, [activeCompany]);

  const updateLine = (idx, patch) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, emptyLine()]);
  const removeLine = (idx) => setLines((ls) => ls.filter((_, i) => i !== idx));

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!balanced) return toast.error('Voucher must be balanced (total debit = total credit)');
    setSaving(true);
    try {
      const payload = { ...header, lines: lines.filter((l) => l.account_id) };
      const { data } = await api.post('/vouchers', payload);
      toast.success('Voucher created as draft');
      navigate(`/vouchers/${data.id}`);
    } finally { setSaving(false); }
  };

  return (
    <div>
      <button onClick={() => navigate('/vouchers')} className="btn-ghost !px-2 mb-3"><ArrowLeft size={16} /> Back to Vouchers</button>
      <PageHeader title="New Voucher" />

      <form onSubmit={submit} className="space-y-5">
        <div className="card p-5 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">Voucher Type</label>
            <select className="input" value={header.voucher_type} onChange={(e) => setHeader({ ...header, voucher_type: e.target.value })}>
              <option value="receipt">Receipt</option><option value="payment">Payment</option><option value="journal">Journal</option>
            </select>
          </div>
          <div><label className="label">Date</label><input required type="date" className="input" value={header.date} onChange={(e) => setHeader({ ...header, date: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label">Description</label><input className="input" value={header.description} onChange={(e) => setHeader({ ...header, description: e.target.value })} /></div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">Voucher Lines</h3>
            <button type="button" onClick={addLine} className="btn-ghost !py-1.5"><Plus size={15} /> Add Line</button>
          </div>

          <div className="space-y-3">
            {lines.map((line, idx) => (
              <motion.div key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-12 gap-2 items-start p-3 rounded-xl bg-slate-50 dark:bg-navy-800/40">
                <select required className="input col-span-3 !py-2" value={line.account_id} onChange={(e) => updateLine(idx, { account_id: e.target.value })}>
                  <option value="">Account...</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name_en}</option>)}
                </select>
                <select className="input col-span-2 !py-2" value={line.cost_center_id} onChange={(e) => updateLine(idx, { cost_center_id: e.target.value })}>
                  <option value="">Cost center</option>
                  {costCenters.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name_en}</option>)}
                </select>
                <input placeholder="Description" className="input col-span-2 !py-2" value={line.description} onChange={(e) => updateLine(idx, { description: e.target.value })} />
                <input type="number" step="0.001" placeholder="Debit" className="input col-span-2 !py-2" value={line.debit} onChange={(e) => updateLine(idx, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} />
                <input type="number" step="0.001" placeholder="Credit" className="input col-span-2 !py-2" value={line.credit} onChange={(e) => updateLine(idx, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} />
                <button type="button" onClick={() => removeLine(idx)} className="col-span-1 p-2 rounded-lg hover:bg-red-50 text-red-500 justify-self-center"><Trash2 size={15} /></button>
              </motion.div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-6 mt-4 pt-4 border-t border-slate-100 dark:border-navy-800">
            <div className="text-sm"><span className="text-slate-400">Total Debit: </span><span className="font-bold">{totalDebit.toFixed(3)}</span></div>
            <div className="text-sm"><span className="text-slate-400">Total Credit: </span><span className="font-bold">{totalCredit.toFixed(3)}</span></div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${balanced ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
              {balanced ? 'Balanced' : 'Not Balanced'}
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <button disabled={saving || !balanced} className="btn-primary"><Save size={16} /> Save as Draft</button>
        </div>
      </form>
    </div>
  );
}
