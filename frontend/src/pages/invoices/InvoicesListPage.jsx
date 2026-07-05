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
  draft: 'bg-slate-100 text-slate-500', posted: 'bg-blue-50 text-blue-600',
  partially_paid: 'bg-amber-50 text-amber-600', paid: 'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-red-50 text-red-500',
};

export default function InvoicesListPage({ type }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const label = type === 'sales' ? t('nav.salesInvoices') : t('nav.purchaseInvoices');
  const partyLabel = type === 'sales' ? t('common.client') : t('common.supplier');

  const load = () => {
    setLoading(true);
    const params = { type };
    if (statusFilter) params.status = statusFilter;
    api.get('/invoices', { params }).then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, statusFilter]);

  const columns = [
    { key: 'invoice_no', label: type === 'sales' ? t('invoices.invoiceNo') : t('invoices.billNo') },
    { key: 'party', label: partyLabel, render: (r) => (type === 'sales' ? r.client?.name_en : r.supplier?.name_en) || '—' },
    { key: 'date', label: t('common.date') },
    { key: 'due_date', label: t('common.dueDate'), render: (r) => r.due_date || '—' },
    { key: 'total', label: t('common.total'), render: (r) => Number(r.total).toFixed(3) },
    { key: 'balance', label: t('common.balanceDue'), render: (r) => (Number(r.total) - Number(r.paid_total)).toFixed(3) },
    { key: 'status', label: t('common.status'), render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLOR[r.status]}`}>{t(`invoices.status.${r.status}`)}</span> },
  ];

  return (
    <div>
      <PageHeader title={label} actions={
        <div className="flex items-center gap-2">
          <select className="input !py-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{t('invoices.allStatuses')}</option>
            <option value="draft">{t('invoices.status.draft')}</option>
            <option value="posted">{t('invoices.status.posted')}</option>
            <option value="partially_paid">{t('invoices.status.partially_paid')}</option>
            <option value="paid">{t('invoices.status.paid')}</option>
            <option value="cancelled">{t('invoices.status.cancelled')}</option>
          </select>
          <button onClick={() => downloadFile('/invoices/excel', { type }, `${type}-invoices.xlsx`)} className="btn-ghost"><Download size={16} /> {t('common.excel')}</button>
          {canCreateEdit && <button onClick={() => navigate(`/invoices/${type}/new`)} className="btn-primary"><Plus size={16} /> {type === 'sales' ? t('invoices.newInvoice') : t('invoices.newBill')}</button>}
        </div>
      } />
      <DataTable columns={columns} data={items} loading={loading} onRowClick={(row) => navigate(`/invoices/${row.id}`)} />
    </div>
  );
}
