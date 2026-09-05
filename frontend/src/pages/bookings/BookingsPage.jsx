import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Unlock } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import PageHeader from '@/components/PageHeader';
import DataTable from '@/components/DataTable';
import ConfirmDialog from '@/components/ConfirmDialog';
import usePermissions from '@/hooks/usePermissions';

export default function BookingsPage() {
  const { t } = useTranslation();
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const { canCreateEdit } = usePermissions();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [releaseTarget, setReleaseTarget] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/bookings', { params: { status: statusFilter } }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  };
  useEffect(() => { if (activeCompany) load(); }, [activeCompany, statusFilter]);

  const fulfill = async (row) => {
    await api.post(`/bookings/${row.id}/fulfill`);
    toast.success(t('bookings.fulfilled'));
    load();
  };
  // "Release" clears the reservation without ever touching stock — a booking
  // never removes stock from on-hand in the first place (see items.booked /
  // items.available), so releasing it just stops counting the quantity as
  // held and it goes back to being ordinary, sellable stock. The original
  // sales invoice/line is untouched either way.
  const release = async () => {
    await api.post(`/bookings/${releaseTarget.id}/cancel`);
    toast.success(t('bookings.released'));
    setReleaseTarget(null);
    load();
  };

  const columns = [
    { key: 'item', label: t('items.item'), render: (r) => r.item ? `${r.item.code} - ${r.item.name_en}` : '—' },
    { key: 'variant', label: t('items.variant'), render: (r) => r.variant?.sku || '—' },
    { key: 'client', label: t('common.client'), render: (r) => r.client?.name_en || '—' },
    { key: 'quantity', label: t('common.qty'), render: (r) => Number(r.quantity).toFixed(2) },
    { key: 'branch', label: t('common.branch'), render: (r) => r.branch ? `${r.branch.code} - ${r.branch.name_en}` : t('branches.unbranchedPool') },
    { key: 'delivery_date', label: t('bookings.deliveryDate'), render: (r) => r.delivery_date || '—' },
    { key: 'invoice', label: t('nav.salesInvoices'), render: (r) => r.invoice ? <Link to={`/invoices/${r.invoice.id}`} className="text-blue-500 hover:underline">{r.invoice.invoice_no}</Link> : '—' },
    { key: 'status', label: t('common.status'), render: (r) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
        r.status === 'pending' ? 'bg-amber-50 text-amber-600' : r.status === 'fulfilled' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
      }`}>
        {t(`bookings.status_${r.status}`)}
      </span>
    ) },
  ];

  return (
    <div>
      <PageHeader title={t('nav.bookings')} />
      <p className="text-sm text-slate-500 mb-3 max-w-2xl">{t('bookings.pageHint')}</p>
      <div className="flex items-center gap-2 mb-3">
        {['pending', 'fulfilled', 'cancelled', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900' : 'bg-slate-100 dark:bg-navy-800 text-slate-500'}`}
          >
            {t(`bookings.status_${s}`)}
          </button>
        ))}
      </div>
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        extraActions={(row) => row.status === 'pending' && canCreateEdit ? (
          <>
            <button onClick={() => fulfill(row)} title={t('bookings.fulfill')} className="p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950 text-emerald-500">
              <CheckCircle2 size={15} />
            </button>
            <button onClick={() => setReleaseTarget(row)} title={t('bookings.release')} className="p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950 text-amber-500">
              <Unlock size={15} />
            </button>
          </>
        ) : null}
        pageSize={25}
      />
      <ConfirmDialog
        open={!!releaseTarget}
        onCancel={() => setReleaseTarget(null)}
        onConfirm={release}
        message={t('bookings.confirmRelease')}
        confirmLabel={t('bookings.release')}
        variant="primary"
      />
    </div>
  );
}
