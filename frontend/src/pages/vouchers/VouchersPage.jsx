import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';
import api, { downloadFile } from '@/api/client';
import usePermissions from '@/hooks/usePermissions';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';

const STATUS_COLOR = { draft: 'bg-slate-100 text-slate-500', posted: 'bg-emerald-50 text-emerald-600', cancelled: 'bg-red-50 text-red-500' };
const TYPE_COLOR = { receipt: 'bg-blue-50 text-blue-600', payment: 'bg-orange-50 text-orange-600', journal: 'bg-purple-50 text-purple-600' };

export default function VouchersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => { setLoading(true); api.get('/vouchers').then((r) => setItems(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const columns = [
    { key: 'voucher_no', label: t('vouchers.voucherNo') },
    { key: 'voucher_type', label: t('vouchers.voucherType'), render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${TYPE_COLOR[r.voucher_type]}`}>{t(`vouchers.${r.voucher_type}`)}</span> },
    { key: 'date', label: t('common.date') },
    { key: 'description', label: t('common.description') },
    { key: 'total_debit', label: t('common.total'), render: (r) => Number(r.total_debit).toFixed(3) },
    { key: 'status', label: t('common.status'), render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLOR[r.status]}`}>{t(`vouchers.status.${r.status}`)}</span> },
  ];

  return (
    <div>
      <PageHeader title={t('nav.vouchers')} actions={
        <div className="flex items-center gap-2">
          <button onClick={() => downloadFile('/vouchers/excel', {}, 'vouchers.xlsx')} className="btn-ghost"><Download size={16} /> Excel</button>
          {canCreateEdit && <button onClick={() => navigate('/vouchers/new')} className="btn-primary"><Plus size={16} /> {t('vouchers.newVoucher')}</button>}
        </div>
      } />
      <DataTable columns={columns} data={items} loading={loading} onRowClick={(row) => navigate(`/vouchers/${row.id}`)} pageSize={25} />
    </div>
  );
}
