import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, Download, Printer, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile, printFile } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import SlideOver from '@/components/SlideOver';
import ConfirmDialog from '@/components/ConfirmDialog';
import usePermissions from '@/hooks/usePermissions';

const STATUS_COLOR = {
  draft: 'bg-slate-100 text-slate-500', posted: 'bg-blue-50 text-blue-600',
  partially_paid: 'bg-amber-50 text-amber-600', paid: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-red-50 text-red-500',
};

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canCreateEdit, canDelete } = usePermissions();
  const [invoice, setInvoice] = useState(null);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), cash_account_id: '', notes: '' });
  const [paying, setPaying] = useState(false);

  const load = () => api.get(`/invoices/${id}`).then((r) => setInvoice(r.data));
  useEffect(() => { load(); api.get('/cash-accounts').then((r) => setCashAccounts(r.data)); }, [id]);

  const act = async () => {
    await api.post(`/invoices/${id}/${confirmAction}`);
    toast.success(confirmAction === 'post' ? 'Posted to ledger' : 'Cancelled');
    setConfirmAction(null);
    load();
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    setPaying(true);
    try {
      await api.post(`/invoices/${id}/payments`, payForm);
      toast.success('Payment recorded');
      setPayOpen(false);
      setPayForm({ amount: '', date: new Date().toISOString().slice(0, 10), cash_account_id: '', notes: '' });
      load();
    } finally { setPaying(false); }
  };

  if (!invoice) return <p className="text-slate-400">Loading...</p>;
  const balance = Number(invoice.total) - Number(invoice.paid_total);
  const party = invoice.type === 'sales' ? invoice.client : invoice.supplier;

  return (
    <div>
      <button onClick={() => navigate(`/invoices/${invoice.type}`)} className="btn-ghost !px-2 mb-3"><ArrowLeft size={16} /> Back</button>
      <PageHeader
        title={invoice.invoice_no}
        subtitle={`${invoice.type === 'sales' ? 'Sales Invoice' : 'Purchase Bill'} · ${invoice.date}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => printFile(`/invoices/${id}/pdf`, {})} className="btn-ghost"><Printer size={16} /> Print</button>
            <button onClick={() => downloadFile(`/invoices/${id}/pdf`, {}, `${invoice.invoice_no}.pdf`)} className="btn-ghost"><Download size={16} /> PDF</button>
            {invoice.status === 'draft' && canCreateEdit && (
              <button onClick={() => setConfirmAction('post')} className="btn-primary"><CheckCircle2 size={16} /> Post to Ledger</button>
            )}
            {['posted', 'partially_paid'].includes(invoice.status) && canCreateEdit && (
              <button onClick={() => setPayOpen(true)} className="btn-primary"><Wallet size={16} /> Record Payment</button>
            )}
            {invoice.status === 'posted' && canDelete && (
              <button onClick={() => setConfirmAction('cancel')} className="btn-danger"><XCircle size={16} /> Cancel</button>
            )}
          </div>
        }
      />

      <div className="card p-5 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div><p className="text-xs text-slate-400 uppercase font-semibold">{invoice.type === 'sales' ? 'Client' : 'Supplier'}</p><p className="text-sm mt-1 font-medium">{party?.name_en || '—'}</p></div>
        <div><p className="text-xs text-slate-400 uppercase font-semibold">Status</p><span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold capitalize ${STATUS_COLOR[invoice.status]}`}>{invoice.status.replace('_', ' ')}</span></div>
        <div><p className="text-xs text-slate-400 uppercase font-semibold">Total</p><p className="text-sm mt-1 font-bold">{Number(invoice.total).toFixed(3)}</p></div>
        <div><p className="text-xs text-slate-400 uppercase font-semibold">Balance Due</p><p className={`text-sm mt-1 font-bold ${balance > 0.001 ? 'text-red-500' : 'text-emerald-600'}`}>{balance.toFixed(3)}</p></div>
      </div>

      <div className="card overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-navy-800">
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">Description</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">Qty</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">Unit Price</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">Tax %</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines?.map((l) => (
              <tr key={l.id} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                <td className="px-4 py-3">{l.description || l.account?.name_en}</td>
                <td className="px-4 py-3 text-end">{Number(l.quantity).toFixed(2)}</td>
                <td className="px-4 py-3 text-end">{Number(l.unit_price).toFixed(3)}</td>
                <td className="px-4 py-3 text-end">{Number(l.tax_rate).toFixed(1)}</td>
                <td className="px-4 py-3 text-end font-medium">{Number(l.line_total).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <h3 className="font-bold mb-3">Payment History</h3>
        {invoice.payments?.length ? (
          <div className="space-y-2">
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-navy-800/50 text-sm">
                <div><span className="font-medium">{p.date}</span> {p.notes && <span className="text-slate-400"> · {p.notes}</span>}</div>
                <div className="font-semibold">{Number(p.amount).toFixed(3)}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-slate-400 text-sm">No payments recorded yet.</p>}
      </div>

      <SlideOver open={payOpen} onClose={() => setPayOpen(false)} title="Record Payment" onSubmit={submitPayment} submitting={paying}>
        <div><label className="label">Amount (remaining: {balance.toFixed(3)})</label><input required type="number" step="0.001" max={balance} className="input" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></div>
        <div><label className="label">Date</label><input required type="date" className="input" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} /></div>
        <div>
          <label className="label">Cash / Bank Account</label>
          <select required className="input" value={payForm.cash_account_id} onChange={(e) => setPayForm({ ...payForm, cash_account_id: e.target.value })}>
            <option value="">Select account</option>
            {cashAccounts.map((c) => <option key={c.id} value={c.account_id}>{c.name_en}</option>)}
          </select>
        </div>
        <div><label className="label">Notes</label><textarea className="input" rows={2} value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></div>
      </SlideOver>

      <ConfirmDialog
        open={!!confirmAction}
        onCancel={() => setConfirmAction(null)}
        onConfirm={act}
        message={confirmAction === 'post' ? 'Post this invoice to the ledger?' : 'Cancel this invoice? Only allowed if no payments have been recorded.'}
      />
    </div>
  );
}
