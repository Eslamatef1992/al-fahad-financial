import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit } = usePermissions();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const label = type === 'sales' ? 'Sales Invoices' : 'Purchase Bills';
  const partyLabel = type === 'sales' ? 'Client' : 'Supplier';

  const load = () => {
    setLoading(true);
    const params = { type };
    if (statusFilter) params.status = statusFilter;
    api.get('/invoices', { params }).then((r) => setItems(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, statusFilter]);

  const columns = [
    { key: 'invoice_no', label: type === 'sales' ? 'Invoice No.' : 'Bill No.' },
    { key: 'party', label: partyLabel, render: (r) => (type === 'sales' ? r.client?.name_en : r.supplier?.name_en) || '—' },
    { key: 'date', label: 'Date' },
    { key: 'due_date', label: 'Due Date', render: (r) => r.due_date || '—' },
    { key: 'total', label: 'Total', render: (r) => Number(r.total).toFixed(3) },
    { key: 'balance', label: 'Balance Due', render: (r) => (Number(r.total) - Number(r.paid_total)).toFixed(3) },
    { key: 'status', label: 'Status', render: (r) => <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLOR[r.status]}`}>{r.status.replace('_', ' ')}</span> },
  ];

  return (
    <div>
      <PageHeader title={label} actions={
        <div className="flex items-center gap-2">
          <select className="input !py-2" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={() => downloadFile('/invoices/excel', { type }, `${type}-invoices.xlsx`)} className="btn-ghost"><Download size={16} /> Excel</button>
          {canCreateEdit && <button onClick={() => navigate(`/invoices/${type}/new`)} className="btn-primary"><Plus size={16} /> New {type === 'sales' ? 'Invoice' : 'Bill'}</button>}
        </div>
      } />
      <DataTable columns={columns} data={items} loading={loading} onRowClick={(row) => navigate(`/invoices/${row.id}`)} />
    </div>
  );
}
