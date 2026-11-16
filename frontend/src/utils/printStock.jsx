import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import api, { fileUrl } from '@/api/client';
import { useCompanyStore } from '@/store/companyStore';

const q = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
const th = { border: '1px solid #999', padding: '4px 6px', background: '#eef2f7', textAlign: 'start', fontWeight: 700 };
const td = { border: '1px solid #bbb', padding: '3px 6px' };
const num = { ...td, textAlign: 'end', fontVariantNumeric: 'tabular-nums' };

// Stock sheet: every item with what is physically in stock, what is booked for clients (not yet
// delivered) and what is still free to sell.   On hand = Booked + Available, until delivery.
function StockSheet({ rows, company, branchName }) {
  const tot = rows.reduce((s, r) => ({ on: s.on + Number(r.total_quantity_on_hand || 0), bk: s.bk + Number(r.booked_quantity || 0), av: s.av + Number(r.available_quantity || 0) }), { on: 0, bk: 0, av: 0 });
  return (
    <div style={{ width: '190mm', margin: '0 auto', padding: '8mm', fontFamily: 'Arial, sans-serif', fontSize: 10.5, color: '#111', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #111', paddingBottom: 6, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {company?.logo_url && <img src={fileUrl(company.logo_url)} alt="" style={{ height: 34 }} />}
          <b style={{ fontSize: 14 }}>{company?.name_en}</b>
        </div>
        <div style={{ textAlign: 'end' }}>
          <b style={{ fontSize: 15 }}>STOCK REPORT / تقرير المخزون</b><br />
          <span>{new Date().toLocaleString()}{branchName ? ` · ${branchName}` : ''}</span>
        </div>
      </div>
      <p style={{ margin: '0 0 6px', fontSize: 9.5, color: '#444' }}>
        On hand = Booked + Available (booked units stay in stock until delivery is confirmed) · المخزون = المحجوز + المتاح (يبقى المحجوز في المخزون حتى تأكيد التسليم)
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>#</th><th style={th}>Item no. / رقم الصنف</th><th style={th}>Name / الاسم</th><th style={th}>Unit / الوحدة</th>
            <th style={{ ...th, textAlign: 'end' }}>On hand / المخزون</th><th style={{ ...th, textAlign: 'end' }}>Booked / المحجوز</th><th style={{ ...th, textAlign: 'end' }}>Available / المتاح</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td style={td}>{i + 1}</td><td style={td}>{r.code}</td><td style={td}>{r.name_en}{r.name_ar && r.name_ar !== r.name_en ? ` — ${r.name_ar}` : ''}</td><td style={td}>{r.unit_name || r.unit || ''}</td>
              <td style={num}>{q(r.total_quantity_on_hand)}</td>
              <td style={{ ...num, color: Number(r.booked_quantity) > 0 ? '#b45309' : '#111' }}>{q(r.booked_quantity)}</td>
              <td style={{ ...num, fontWeight: 700, color: Number(r.available_quantity) <= 0 ? '#c0172b' : '#111' }}>{q(r.available_quantity)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#eef2f7', fontWeight: 700 }}>
            <td style={td} colSpan={4}>TOTAL / الإجمالي ({rows.length})</td>
            <td style={num}>{q(tot.on)}</td><td style={num}>{q(tot.bk)}</td><td style={num}>{q(tot.av)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export async function printStock({ branch_id, branchName } = {}) {
  const { data } = await api.get('/items', { params: { ...(branch_id ? { branch_id } : {}) } });
  const rows = [...data].sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true }));
  const company = useCompanyStore.getState().activeCompany;
  const host = document.createElement('div');
  host.id = 'inv-print-host'; host.style.display = 'none';
  const style = document.createElement('style');
  style.textContent = '@media print { body > *:not(#inv-print-host) { display: none !important; } #inv-print-host { display: block !important; } #inv-print-host, #inv-print-host * { visibility: visible !important; } @page { size: A4; margin: 8mm; } tr { page-break-inside: avoid; } thead { display: table-header-group; } }';
  document.body.append(style, host);
  const root = createRoot(host);
  flushSync(() => root.render(<StockSheet rows={rows} company={company} branchName={branchName} />));
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all([...host.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  const cleanup = () => { root.unmount(); host.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
