import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRightCircle, XCircle, Download, Printer, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile, printFile } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import ConfirmDialog from '@/components/ConfirmDialog';
import usePermissions from '@/hooks/usePermissions';

const STATUS_COLOR = {
  draft: 'bg-slate-100 text-slate-500', converted: 'bg-emerald-50 text-emerald-600', cancelled: 'bg-red-50 text-red-500',
};

export default function PurchaseOrderDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { canCreateEdit, canDelete } = usePermissions();
  const [po, setPo] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const load = () => api.get(`/purchase-orders/${id}`).then((r) => setPo(r.data));
  useEffect(() => { load(); }, [id]);

  const act = async () => {
    if (confirmAction === 'delete') {
      await api.delete(`/purchase-orders/${id}`);
      toast.success(t('purchaseOrders.poDeleted'));
      navigate('/purchase-orders');
      return;
    }
    if (confirmAction === 'convert') {
      const { data } = await api.post(`/purchase-orders/${id}/convert`);
      toast.success(t('purchaseOrders.convertedToBill'));
      setConfirmAction(null);
      navigate(`/invoices/${data.invoice.id}`);
      return;
    }
    await api.post(`/purchase-orders/${id}/cancel`);
    toast.success(t('purchaseOrders.status.cancelled'));
    setConfirmAction(null);
    load();
  };

  if (!po) return <p className="text-slate-400">{t('common.loading')}</p>;

  return (
    <div>
      <button onClick={() => navigate('/purchase-orders')} className="btn-ghost !px-2 mb-3"><ArrowLeft size={16} /> {t('common.back')}</button>
      <PageHeader
        title={po.po_no}
        subtitle={`${t('purchaseOrders.purchaseOrder')} · ${po.date}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => printFile(`/purchase-orders/${id}/pdf`, {})} className="btn-ghost"><Printer size={16} /> {t('common.print')}</button>
            <button onClick={() => downloadFile(`/purchase-orders/${id}/pdf`, {}, `${po.po_no}.pdf`)} className="btn-ghost"><Download size={16} /> PDF</button>
            {po.status === 'draft' && canCreateEdit && (
              <button onClick={() => navigate(`/purchase-orders/${id}/edit`)} className="btn-ghost"><Pencil size={16} /> {t('common.edit')}</button>
            )}
            {po.status === 'draft' && canDelete && (
              <button onClick={() => setConfirmAction('delete')} className="btn-danger"><Trash2 size={16} /> {t('common.delete')}</button>
            )}
            {po.status === 'draft' && canCreateEdit && (
              <button onClick={() => setConfirmAction('convert')} className="btn-primary"><ArrowRightCircle size={16} /> {t('purchaseOrders.convertToBill')}</button>
            )}
            {po.status === 'draft' && canDelete && (
              <button onClick={() => setConfirmAction('cancel')} className="btn-danger"><XCircle size={16} /> {t('common.cancel')}</button>
            )}
          </div>
        }
      />

      <div className="card p-5 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div><p className="text-xs text-slate-400 uppercase font-semibold">{t('common.supplier')}</p><p className="text-sm mt-1 font-medium">{po.supplier?.name_en || '—'}</p></div>
        <div><p className="text-xs text-slate-400 uppercase font-semibold">{t('common.status')}</p><span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold capitalize ${STATUS_COLOR[po.status]}`}>{t(`purchaseOrders.status.${po.status}`)}</span></div>
        <div><p className="text-xs text-slate-400 uppercase font-semibold">{t('common.total')}</p><p className="text-sm mt-1 font-bold">{Number(po.total).toFixed(3)}</p></div>
        <div>
          <p className="text-xs text-slate-400 uppercase font-semibold">{t('purchaseOrders.bill')}</p>
          {po.convertedInvoice ? (
            <button onClick={() => navigate(`/invoices/${po.convertedInvoice.id}`)} className="text-sm mt-1 font-bold text-gold-600 hover:underline">{po.convertedInvoice.invoice_no}</button>
          ) : <p className="text-sm mt-1 text-slate-400">—</p>}
        </div>
        {po.branch && <div><p className="text-xs text-slate-400 uppercase font-semibold">{t('common.branch')}</p><p className="text-sm mt-1 font-medium">{po.branch.code} - {po.branch.name_en}</p></div>}
      </div>

      <div className="card overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-navy-800">
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('common.description')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('common.qty')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('common.unitPrice')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('common.taxPercent')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            {po.lines?.map((l) => (
              <tr key={l.id} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                <td className="px-4 py-3">{l.item ? `${l.item.name_en}${l.description ? ' - ' + l.description : ''}` : (l.description || l.account?.name_en)}</td>
                <td className="px-4 py-3 text-end">{Number(l.quantity).toFixed(2)}</td>
                <td className="px-4 py-3 text-end">{Number(l.unit_price).toFixed(3)}</td>
                <td className="px-4 py-3 text-end">{Number(l.tax_rate).toFixed(1)}</td>
                <td className="px-4 py-3 text-end font-medium">{Number(l.line_total).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {po.notes && (
        <div className="card p-5">
          <h3 className="font-bold mb-2">{t('common.notes')}</h3>
          <p className="text-sm text-slate-500">{po.notes}</p>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        onCancel={() => setConfirmAction(null)}
        onConfirm={act}
        message={confirmAction === 'convert' ? t('purchaseOrders.convertConfirm') : confirmAction === 'delete' ? t('purchaseOrders.deleteConfirm') : t('purchaseOrders.cancelConfirm')}
        confirmLabel={confirmAction === 'convert' ? t('purchaseOrders.convertToBill') : confirmAction === 'cancel' ? t('common.cancel') : t('common.delete')}
        variant={confirmAction === 'convert' ? 'primary' : 'danger'}
      />
    </div>
  );
}
