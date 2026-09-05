import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import api, { printFile } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';

export default function DeliverySchedulePage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('all');

  const params = () => ({
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    ...(status !== 'all' ? { status } : {}),
  });

  const load = () => {
    setLoading(true);
    api.get('/invoices/delivery-schedule', { params: params() }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany]);

  const print = () => printFile('/invoices/delivery-schedule/pdf', params());

  const columns = [
    { key: 'delivery_date', label: t('invoices.deliveryDate'), render: (r) => r.delivery_date },
    { key: 'invoice_no', label: t('invoices.invoiceNo'), render: (r) => <Link to={`/invoices/${r.id}`} className="text-blue-500 hover:underline font-medium">{r.invoice_no}</Link> },
    { key: 'client', label: t('common.client'), render: (r) => r.client?.name_en || '—' },
    { key: 'phone', label: t('common.phone'), render: (r) => r.client?.phone || '—' },
    { key: 'address', label: t('invoices.deliveryAddress'), render: (r) => <span className="whitespace-normal">{r.delivery_address || r.client?.address || '—'}</span> },
    { key: 'branch', label: t('common.branch'), render: (r) => r.branch ? `${r.branch.code} - ${r.branch.name_en}` : '—' },
    { key: 'total', label: t('common.total'), render: (r) => Number(r.total).toFixed(3) },
    { key: 'status', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
        r.status === 'cancelled' ? 'bg-slate-100 text-slate-400' : r.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
      }`}>
        {t(`invoices.status.${r.status}`)}
      </span>
    ) },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.deliverySchedule')}
        actions={<button onClick={print} className="btn-ghost flex items-center gap-1.5"><Printer size={16} />{t('common.print')}</button>}
      />
      <p className="text-sm text-slate-500 mb-3 max-w-2xl flex items-center gap-1.5"><Truck size={14} className="shrink-0" />{t('deliverySchedule.pageHint')}</p>

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label className="label">{t('common.from')}</label>
          <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('common.to')}</label>
          <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('common.status')}</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            <option value="draft">{t('invoices.status.draft')}</option>
            <option value="posted">{t('invoices.status.posted')}</option>
            <option value="partially_paid">{t('invoices.status.partially_paid')}</option>
            <option value="paid">{t('invoices.status.paid')}</option>
            <option value="cancelled">{t('invoices.status.cancelled')}</option>
          </select>
        </div>
        <button onClick={load} className="btn-primary">{t('common.applyFilters')}</button>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} pageSize={25} />
    </div>
  );
}
