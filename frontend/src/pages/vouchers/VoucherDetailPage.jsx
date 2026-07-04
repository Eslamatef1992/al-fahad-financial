import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, XCircle, Download, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { downloadFile } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import usePermissions from '@/hooks/usePermissions';
import ConfirmDialog from '@/components/ConfirmDialog';

const STATUS_COLOR = { draft: 'bg-slate-100 text-slate-500', posted: 'bg-emerald-50 text-emerald-600', cancelled: 'bg-red-50 text-red-500' };

export default function VoucherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { canCreateEdit, canDelete } = usePermissions();
  const [voucher, setVoucher] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // 'post' | 'cancel'

  const load = () => api.get(`/vouchers/${id}`).then((r) => setVoucher(r.data));
  useEffect(load, [id]);

  const act = async () => {
    await api.post(`/vouchers/${id}/${confirmAction}`);
    toast.success(confirmAction === 'post' ? t('vouchers.postedSuccess') : t('vouchers.cancelledSuccess'));
    setConfirmAction(null);
    load();
  };

  if (!voucher) return <p className="text-slate-400">{t('common.loading')}</p>;

  return (
    <div>
      <button onClick={() => navigate('/vouchers')} className="btn-ghost !px-2 mb-3"><ArrowLeft size={16} /> {t('vouchers.backToVouchers')}</button>
      <PageHeader
        title={voucher.voucher_no}
        subtitle={`${voucher.voucher_type} · ${voucher.date}`}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => downloadFile(`/vouchers/${id}/pdf`, {}, `${voucher.voucher_no}.pdf`)} className="btn-ghost">
              <Download size={16} /> {t('vouchers.downloadPdf')}
            </button>
            {voucher.status === 'draft' && canCreateEdit && (
              <button onClick={() => navigate(`/vouchers/${id}/edit`)} className="btn-ghost"><Pencil size={16} /> {t('common.edit')}</button>
            )}
            {voucher.status === 'draft' && canCreateEdit ? (
              <button onClick={() => setConfirmAction('post')} className="btn-primary"><CheckCircle2 size={16} /> {t('vouchers.postToLedger')}</button>
            ) : voucher.status === 'posted' && canDelete ? (
              <button onClick={() => setConfirmAction('cancel')} className="btn-danger"><XCircle size={16} /> {t('vouchers.cancelVoucher')}</button>
            ) : null}
          </div>
        }
      />

      <div className="card p-5 mb-5 flex flex-wrap items-center gap-6">
        <div><p className="text-xs text-slate-400 uppercase font-semibold">{t('common.status')}</p><span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold capitalize ${STATUS_COLOR[voucher.status]}`}>{t(`vouchers.status.${voucher.status}`)}</span></div>
        <div><p className="text-xs text-slate-400 uppercase font-semibold">{t('common.description')}</p><p className="text-sm mt-1">{voucher.description || '—'}</p></div>
        <div><p className="text-xs text-slate-400 uppercase font-semibold">{t('common.total')}</p><p className="text-sm mt-1 font-bold">{Number(voucher.total_debit).toFixed(3)}</p></div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-navy-800">
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('vouchers.account')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('vouchers.costCenter')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-slate-500 uppercase">{t('common.description')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('vouchers.debit')}</th>
              <th className="px-4 py-3 text-end text-xs font-semibold text-slate-500 uppercase">{t('vouchers.credit')}</th>
            </tr>
          </thead>
          <tbody>
            {voucher.lines?.map((l) => (
              <tr key={l.id} className="border-b border-slate-50 dark:border-navy-800/60 last:border-0">
                <td className="px-4 py-3">{l.account ? `${l.account.code} - ${l.account.name_en}` : '—'}</td>
                <td className="px-4 py-3">{l.costCenter ? l.costCenter.name_en : '—'}</td>
                <td className="px-4 py-3">{l.description || '—'}</td>
                <td className="px-4 py-3 text-end">{Number(l.debit) > 0 ? Number(l.debit).toFixed(3) : ''}</td>
                <td className="px-4 py-3 text-end">{Number(l.credit) > 0 ? Number(l.credit).toFixed(3) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        onCancel={() => setConfirmAction(null)}
        onConfirm={act}
        message={confirmAction === 'post' ? t('vouchers.postConfirm') : t('vouchers.cancelConfirm')}
      />
    </div>
  );
}
