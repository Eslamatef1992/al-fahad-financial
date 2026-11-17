import { fileUrl } from "@/api/client";

const money = (n) => Number(n || 0).toFixed(3);
const fmtDate = (d) => { if (!d) return ""; const [y, m, da] = String(d).slice(0, 10).split("-"); return `${da}/${m}/${y}`; };
const ROWS = 4;

// Printable Receipt Voucher (سند قبض) — A5 landscape, laid out like the company's paper form:
// purple header with logo + address, K.D./Fils amount boxes, handwritten-style fields,
// accounting-direction table and Approved / Received-by signature blocks.
export default function ReceiptVoucherTemplate({ voucher, company }) {
	const lines = voucher.lines || [];
	const total = Number(voucher.total_debit || 0);
	const dinar = Math.floor(total + 1e-9);
	const fils = String(Math.round((total - dinar) * 1000)).padStart(3, "0");
	const creditLine = lines.find((l) => Number(l.credit) > 0 && (l.client || l.supplier)) || lines.find((l) => Number(l.credit) > 0);
	const debitLine = lines.find((l) => Number(l.debit) > 0);
	const party = creditLine?.client || creditLine?.supplier;
	const receivedFrom = party ? [party.name_ar, party.name_en].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" / ") : "";
	const bankName = debitLine?.account ? [debitLine.account.name_ar, debitLine.account.name_en].filter(Boolean).join(" / ") : "";
	const filler = Math.max(0, ROWS - lines.length);

	return (
		<div className="rv-print" dir="ltr">
			<style>{`
				@page { size: A5 landscape; margin: 0; }
				.rv-print { width: 210mm; height: 148mm; box-sizing: border-box; padding: 7mm 8mm; background: #fffde8; color: #1b1b3a; font-family: 'Cairo','Tajawal',Arial,sans-serif; font-size: 11px; position: relative; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
				.rv-print * { box-sizing: border-box; }
				.rv-head { display: flex; gap: 5mm; align-items: stretch; height: 34mm; }
				.rv-brand { width: 74mm; background: #3b3a8f; color: #fff; display: flex; align-items: center; gap: 3mm; padding: 3mm; border-radius: 1mm; }
				.rv-brand .logo { width: 28mm; height: 26mm; background: #fff; border-radius: 1mm; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
				.rv-brand .logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
				.rv-brand .addr { font-size: 8.5px; line-height: 1.5; }
				.rv-brand .addr b { font-size: 10px; display: block; margin-bottom: 1mm; }
				.rv-title { flex: 1; display: flex; flex-direction: column; }
				.rv-bar { background: #3b3a8f; color: #fff; text-align: center; font-weight: 800; font-size: 15px; padding: 1.6mm 0; border-radius: 1mm; display: flex; justify-content: center; gap: 6mm; }
				.rv-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 2.5mm; flex: 1; }
				.rv-no { font-size: 15px; font-weight: 800; color: #c0182b; }
				.rv-amt { display: flex; align-items: stretch; border: 1px solid #3b3a8f; border-radius: 1mm; overflow: hidden; background: #fff; }
				.rv-amt > div { text-align: center; min-width: 26mm; }
				.rv-amt .lbl { background: #3b3a8f; color: #fff; font-size: 9px; font-weight: 700; padding: 0.7mm 0; }
				.rv-amt .val { font-size: 17px; font-weight: 800; padding: 1.4mm 2mm; font-variant-numeric: tabular-nums; }
				.rv-amt > div + div { border-left: 1px solid #3b3a8f; min-width: 18mm; }
				.rv-body { margin-top: 3mm; display: grid; gap: 1.6mm; }
				.rv-row { display: flex; align-items: flex-end; gap: 2mm; min-height: 6.6mm; }
				.rv-row .k { white-space: nowrap; font-weight: 700; font-size: 10.5px; }
				.rv-row .k.ar { direction: rtl; }
				.rv-row .v { flex: 1; border-bottom: 1px dotted #555; min-height: 5.4mm; padding: 0 2mm 0.4mm; font-weight: 700; font-size: 12px; line-height: 1.25; }
				.rv-tbl { margin-top: 3mm; display: flex; gap: 6mm; align-items: flex-start; }
				.rv-tbl table { flex: 1; border-collapse: collapse; }
				.rv-tbl th { background: #3b3a8f; color: #fff; font-size: 9.5px; padding: 1mm 2mm; border: 1px solid #3b3a8f; }
				.rv-tbl td { border: 1px solid #3b3a8f; padding: 0.8mm 2mm; font-size: 10px; height: 5.2mm; background: #fff; }
				.rv-tbl td.n { text-align: right; font-variant-numeric: tabular-nums; width: 24mm; }
				.rv-sign { width: 52mm; display: grid; gap: 7mm; font-size: 10px; font-weight: 700; text-align: center; padding-top: 2mm; }
				.rv-sign div { border-top: 1px solid #444; padding-top: 1mm; }
			`}</style>

			<div className="rv-head">
				<div className="rv-brand">
					<div className="logo">{company?.logo_url ? <img src={fileUrl(company.logo_url)} alt="" /> : <b style={{ color: "#3b3a8f" }}>{company?.name_en}</b>}</div>
					<div className="addr">
						<b>{company?.name_ar || company?.name_en}</b>
						{company?.name_ar && company?.name_en && <div>{company.name_en}</div>}
						<div>P.O.Box 17058 Al-Khalidiya 72451 Kuwait</div>
						<div>HOTLINE : (+965) 22250144</div>
					</div>
				</div>
				<div className="rv-title">
					<div className="rv-bar"><span>Receipt Voucher</span><span>سند قبض</span></div>
					<div className="rv-meta">
						<div>
							<div className="rv-no">{voucher.voucher_no}</div>
							<div style={{ marginTop: "1.5mm", fontWeight: 700 }}>Date / التاريخ : {fmtDate(voucher.date)}</div>
						</div>
						<div className="rv-amt">
							<div><div className="lbl">K.D. دينار</div><div className="val">{dinar}</div></div>
							<div><div className="lbl">Fils فلس</div><div className="val">{fils}</div></div>
						</div>
					</div>
				</div>
			</div>

			<div className="rv-body">
				<div className="rv-row"><span className="k">Received from Mr./Mrs.</span><span className="v">{receivedFrom}</span><span className="k ar">وصلنا من السيد / السادة</span></div>
				<div className="rv-row"><span className="k">The Sum of K.D.</span><span className="v">{voucher.amount_in_words_en}{voucher.amount_in_words_ar ? ` — ${voucher.amount_in_words_ar}` : ""}</span><span className="k ar">مبلغ وقدره</span></div>
				<div className="rv-row"><span className="k">For</span><span className="v">{voucher.description}</span><span className="k ar">وذلك عن</span></div>
				<div className="rv-row">
					<span className="k">Bank</span><span className="v">{bankName}</span><span className="k ar">على بنك</span>
					<span className="k" style={{ marginInlineStart: "3mm" }}>In cash / Cheque No.</span><span className="v" style={{ flex: "0 0 38mm" }}>{voucher.cheque_no || ""}</span><span className="k ar">نقداً / شيك رقم</span>
				</div>
			</div>

			<div className="rv-tbl">
				<table>
					<thead><tr><th>التوجيه المحاسبي / Accounting</th><th>Debit مدين</th><th>Credit دائن</th></tr></thead>
					<tbody>
						{lines.map((l) => (
							<tr key={l.id}>
								<td>{l.account ? `${l.account.code} - ${l.account.name_en}` : ""}</td>
								<td className="n">{Number(l.debit) > 0 ? money(l.debit) : ""}</td>
								<td className="n">{Number(l.credit) > 0 ? money(l.credit) : ""}</td>
							</tr>
						))}
						{Array.from({ length: filler }).map((_, i) => <tr key={`f${i}`}><td /><td className="n" /><td className="n" /></tr>)}
					</tbody>
				</table>
				<div className="rv-sign">
					<div>يعتمد · Approved</div>
					<div>المستلم · Received By</div>
				</div>
			</div>
		</div>
	);
}
