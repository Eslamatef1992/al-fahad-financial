import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Download } from 'lucide-react';
import api, { downloadFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import usePermissions from '@/hooks/usePermissions';

const STATUS_COLOR = {
  draft: 'bg-slate-100 text-slate-500', converted: 'bg-emerald-50 text-emerald-600', cancelled: 'bg-red-50 text-red-500',
};

export default function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const load = () => {
    setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    api.get('/purchase-orders', { params }).then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, statusFilter]);

  const columns = [
    { key: 'po_no', label: t('purchaseOrders.poNo') },
    { key: 'supplier', label: t('common.supplier'), render: (r) => r.supplier?.name_en || '—' },
    { key: 'date', label: t('common.date') },
    { key: 'expected_date', label: t('purchaseOrders.expectedDate'), render: (r) => r.expected_date || '—' },
    { key: 'total', label: t('common.total'), render: (r) => Number(r.total).toFixed(3) },
    { key: 'bill', label: t('purchaseOrders.bill'), render: (r) => r.convertedInvoice?.invoice_no || '—' },
    { key: 'status', label: t('common.status'), render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLOR[r.status]}`}>{t(`purchaseOrders.status.${r.status}`)}</span> },
  ];

  return (
    <div>
      <PageHeader title={t('nav.purchaseOrders')} actions={
        <div className="flex items-center gap-2">
          <select className="input !py-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('invoices.allStatuses')}</option>
            <option value="draft">{t('purchaseOrders.status.draft')}</option>
            <option value="converted">{t('purchaseOrders.status.converted')}</option>
            <option value="cancelled">{t('purchaseOrders.status.cancelled')}</option>
          </select>
          <button onClick={() => downloadFile('/purchase-orders/excel', {}, 'purchase-orders.xlsx')} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
          {canCreateEdit && <button onClick={() => navigate('/purchase-orders/new')} className="btn-primary"><Plus size={16} /> {t('purchaseOrders.newPo')}</button>}
        </div>
      } />
      <DataTable columns={columns} data={items} loading={loading} onRowClick={(row) => navigate(`/purchase-orders/${row.id}`)} pageSize={25} />
    </div>
  );
}
