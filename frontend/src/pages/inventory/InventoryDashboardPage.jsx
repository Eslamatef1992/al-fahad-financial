import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Boxes, Wallet, PackageCheck, Lock, AlertTriangle, PackageX, TrendingUp, Building2, FileBarChart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';
import StatCard from '@/components/StatCard';
import PageHeader from '@/components/PageHeader';

const fmt = (n, d = 0) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];

function Panel({ title, icon: Icon, children, action }) {
  return (
    <div className="card-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="card-title flex items-center gap-2">{Icon && <Icon size={16} className="text-slate-400" />}{title}</h3>{action}
      </div>
      {children}
    </div>
  );
}

export default function InventoryDashboardPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const L = (en, ar) => (isAr ? ar : en);
  const activeCompany = useCompanyStore((s) => s.activeCompany);
  const currency = activeCompany?.currency || 'KWD';
  const [days, setDays] = useState(90);
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompany) return;
    setLoading(true);
    api.get('/inventory-reports/dashboard', { params: { days } }).then((r) => setD(r.data)).finally(() => setLoading(false));
  }, [activeCompany, days]);

  const name = (r) => (isAr ? r.name_ar || r.name_en : r.name_en);
  const tt = d?.totals;
  const short = (s) => (s.length > 14 ? `${s.slice(0, 13)}…` : s);

  return (
    <div>
      <PageHeader
        title={L('Inventory', 'المخزون')}
        subtitle={L('Live stock overview', 'نظرة عامة مباشرة على المخزون')}
        actions={<Link to="/inventory/reports" className="btn-primary"><FileBarChart size={16} />{L('Stock reports', 'تقارير المخزون')}</Link>}
      />
      {loading && !d && <p className="text-slate-400 text-sm">…</p>}
      {d && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard variant="tile" label={L('Total products', 'إجمالي الأصناف')} value={fmt(tt.total_products)} icon={Boxes} tone="navy" />
            <StatCard variant="tile" label={L('Stock value', 'قيمة المخزون')} value={fmt(tt.stock_value, 3)} unit={currency} icon={Wallet} tone="green" delay={0.05} />
            <StatCard variant="tile" label={L('Total available', 'إجمالي المتاح')} value={fmt(tt.total_available)} unit={L('units', 'وحدة')} icon={PackageCheck} tone="blue" delay={0.1} />
            <StatCard variant="tile" label={L('Total booked', 'إجمالي المحجوز')} value={fmt(tt.total_booked)} unit={L('units', 'وحدة')} icon={Lock} tone="gold" delay={0.15} />
            <StatCard variant="tile" label={L('Low stock items', 'أصناف منخفضة')} value={fmt(tt.low_stock_count)} icon={AlertTriangle} tone="pink" delay={0.2} />
            <StatCard variant="tile" label={L('Out of stock', 'نفدت من المخزون')} value={fmt(tt.out_of_stock_count)} icon={PackageX} tone="red" delay={0.25} />
            <StatCard variant="tile" label={L('Total quantity', 'إجمالي الكمية')} value={fmt(tt.total_qty)} unit={L('units', 'وحدة')} icon={Boxes} tone="purple" delay={0.3} />
            <StatCard variant="tile" label={L('Branches / stores', 'الفروع / المخازن')} value={fmt(d.stock_per_branch.length)} icon={Building2} tone="navy" delay={0.35} />
          </div>

          <div className="grid lg:grid-cols-2 gap-5 mb-5">
            <Panel title={L('Stock for each item (top 10)', 'المخزون لكل صنف (أعلى 10)')} icon={Boxes}>
              {d.stock_per_item.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={d.stock_per_item.map((r) => ({ ...r, label: short(name(r)) }))} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" /><YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 11 }} orientation={isAr ? 'right' : 'left'} />
                    <Tooltip /><Legend />
                    <Bar dataKey="available" name={L('Available', 'متاح')} stackId="a" fill="#10b981" />
                    <Bar dataKey="booked" name={L('Booked', 'محجوز')} stackId="a" fill="#f59e0b" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-slate-400">{L('No stock yet.', 'لا يوجد مخزون.')}</p>}
            </Panel>

            <Panel
              title={L('Most selling items', 'الأصناف الأكثر مبيعاً')} icon={TrendingUp}
              action={(
                <select className="input !py-1 !w-auto text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {[30, 90, 180, 365].map((x) => <option key={x} value={x}>{L(`Last ${x} days`, `آخر ${x} يوم`)}</option>)}
                </select>
              )}
            >
              {d.most_selling.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={d.most_selling.map((r) => ({ ...r, label: short(name(r)) }))} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" /><YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 11 }} orientation={isAr ? 'right' : 'left'} />
                    <Tooltip />
                    <Bar dataKey="sold" name={L('Units sold', 'الكمية المباعة')} fill="#6366f1" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-slate-400">{L('No sales in this period.', 'لا مبيعات في هذه الفترة.')}</p>}
            </Panel>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Panel title={L('Stock per branch', 'المخزون لكل فرع')} icon={Building2}>
              {d.stock_per_branch.length ? (
                <div className="grid sm:grid-cols-2 gap-4 items-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={d.stock_per_branch.map((b) => ({ name: name(b), value: b.qty }))} dataKey="value" innerRadius={50} outerRadius={85} paddingAngle={3}>
                        {d.stock_per_branch.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="space-y-2 text-sm">
                    {d.stock_per_branch.map((b, i) => (
                      <li key={`${b.branch_id}-${i}`} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 truncate"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />{name(b)}</span>
                        <span className="text-end shrink-0"><b>{fmt(b.qty)}</b> <span className="text-xs text-slate-400">· {fmt(b.value, 3)}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <p className="text-sm text-slate-400">—</p>}
            </Panel>

            <Panel title={L('Low stock', 'مخزون منخفض')} icon={AlertTriangle} action={<Link to="/inventory/reports?r=low-stock" className="text-xs font-semibold text-indigo-600">{L('View all', 'عرض الكل')}</Link>}>
              {d.low_stock.length ? (
                <ul className="divide-y divide-slate-100 dark:divide-navy-800">
                  {d.low_stock.map((r) => (
                    <li key={r.code} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="truncate"><span className="text-slate-400 me-2">{r.code}</span>{name(r)}</span>
                      <span className="shrink-0"><b className="text-rose-600">{fmt(r.qty)}</b> <span className="text-xs text-slate-400">/ {fmt(r.reorder_level)}</span></span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-400">{L('Nothing below its minimum.', 'لا أصناف أقل من الحد الأدنى.')}</p>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
