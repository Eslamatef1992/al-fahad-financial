import { fileUrl } from "@/api/client";

// Renders the printable A5 cash/credit invoice layout (see the feature spec's
// template appendix) filled with real invoice data. Only ever shown inside
// the browser's print output (`hidden print:block` on its wrapper in
// InvoiceDetailPage) — never part of the normal on-screen page.
//
// Company name/logo are pulled live from the `company` record. The phone
// numbers and website/social links below are static placeholder content
// matching the reference template exactly — the Company model has no fields
// for these yet, so they're the same for every company until that's added.
const TOTAL_ROWS = 10;

const STORE_PHONES_EN = [
	["Dajeej Azizia", "24344490"],
	["Dajeej Boland", "24318294"],
	["Hawally", "22621245"],
	["Fax", "24344491"],
];
const STORE_PHONES_AR = [
	["الضجيج العزيزية", "٢٤٣٤٤٤٩٠"],
	["الضجيج بولند", "٢٤٣١٨٢٩٤"],
	["حولي", "٢٢٦٢١٢٤٥"],
	["فاكس", "٢٤٣٤٤٤٩١"],
];
const STORE_WEBSITE = "www.calicomfort-kw.com";
const STORE_FACEBOOK = "facebook.com/calicomfort.kw";
const STORE_INSTAGRAM = "instagram@calicomfort";

function splitKdFils(amount) {
	const n = Number(amount) || 0;
	const kd = Math.floor(n + 1e-6);
	const fils = Math.round((n - kd) * 1000);
	return { kd, fils };
}

// "INV-000123" -> { prefix: "INV", suffix: "-000123" } so the serial can keep
// the template's two-tone look (plain prefix, accent-colored suffix) even
// though real invoice numbers don't look like the template's "M0026" example.
function splitInvoiceNo(invoiceNo) {
	const idx = (invoiceNo || "").indexOf("-");
	if (idx === -1) return { prefix: invoiceNo || "", suffix: "" };
	return { prefix: invoiceNo.slice(0, idx), suffix: invoiceNo.slice(idx) };
}

export default function InvoicePrintTemplate({ invoice, company }) {
	if (!invoice) return null;
	const client = invoice.client;
	const lines = invoice.lines || [];
	const { prefix, suffix } = splitInvoiceNo(invoice.invoice_no);
	const totalSplit = splitKdFils(invoice.total);

	// More than TOTAL_ROWS real lines: shrink row height/font instead of
	// spilling onto a second page (spec requirement — must stay on one A5 page).
	const overflowFactor =
		lines.length > TOTAL_ROWS ? TOTAL_ROWS / lines.length : 1;
	const rowHeight = Math.max(4.2, 6.6 * overflowFactor);
	const cellFont = Math.max(6.5, 8.5 * overflowFactor);
	const priceFont = Math.max(8, 11 * overflowFactor);
	const padRows = Math.max(0, TOTAL_ROWS - lines.length);

	return (
		<div className="invoice-print">
			<style>{`
        .invoice-print {
          --ink: #2c4b86;
          --ink-dark: #1f2f55;
          --fill: #dde7f2;
          --red: #c8102e;
          --paper: #ffffff;
          --line: 1.4px;
          font-family: 'Open Sans', 'Cairo', Arial, sans-serif;
          color: var(--ink-dark);
          background: var(--paper);
        }
        .invoice-print * { box-sizing: border-box; }
        .invoice-print .ar { font-family: 'Cairo', 'Open Sans', sans-serif; direction: rtl; }
        .invoice-print .sheet {
          position: relative;
          width: 100%;
          min-height: 190mm;
          padding: 9mm 8mm 6mm 10mm;
        }
        .invoice-print .header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 4mm; }
        .invoice-print .company-en h1 { font-size: 11.5px; font-weight: 700; margin-bottom: 2px; }
        .invoice-print .company-ar h1 { font-size: 11px; font-weight: 700; margin-bottom: 1px; }
        .invoice-print .phones { font-size: 8px; font-weight: 600; line-height: 1.5; }
        .invoice-print .phones div { display: grid; grid-template-columns: 22mm auto; }
        .invoice-print .company-ar .phones div { grid-template-columns: 22mm auto; }
        .invoice-print .logo { text-align: center; }
        .invoice-print .logo img { max-width: 34mm; max-height: 24mm; object-fit: contain; }
        .invoice-print .logo .placeholder {
          width: 16mm; height: 16mm; border-radius: 50%; background: var(--ink);
          color: #fff; font-weight: 700; font-size: 16px; display: flex;
          align-items: center; justify-content: center; margin: 0 auto;
        }
        .invoice-print .footer {
          display: flex; justify-content: space-between; align-items: center;
          margin-top: 2.5mm; font-size: 7.5px; font-weight: 600; color: var(--ink-dark);
        }
        .invoice-print .footer span { display: inline-flex; align-items: center; gap: 1mm; }
        .invoice-print .footer svg { width: 9px; height: 9px; flex: none; }
        .invoice-print .title-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; margin-top: 3mm; }
        .invoice-print .serial { font-size: 16px; font-weight: 700; letter-spacing: 1px; }
        .invoice-print .serial span { color: var(--red); font-weight: 400; margin-left: 8px; letter-spacing: 2px; }
        .invoice-print .doc-title { text-align: center; line-height: 1.2; }
        .invoice-print .doc-title .ar { font-size: 11px; font-weight: 700; }
        .invoice-print .doc-title .en { font-size: 11px; font-weight: 700; border-bottom: 1.5px solid var(--ink-dark); padding-bottom: 1px; }
        .invoice-print .field { display: flex; align-items: flex-end; gap: 2mm; font-size: 8.5px; font-weight: 700; white-space: nowrap; }
        .invoice-print .field .dots { flex: 1; border-bottom: 1px dotted var(--ink-dark); height: 9px; }
        .invoice-print .field .filled { flex: 1; border-bottom: 1px dotted var(--ink-dark); height: 9px; font-weight: 600; overflow: hidden; }
        .invoice-print .date-field { justify-self: end; width: 62mm; margin-top: 2mm; font-size: 11px; }
        .invoice-print .date-field .filled, .invoice-print .name-field .filled { height: auto; min-height: 13px; overflow: visible; line-height: 1.3; }
        .invoice-print .name-field { margin: 3mm 0 1.5mm; font-size: 11px; }
        .invoice-print table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .invoice-print table.items th, .invoice-print table.items td { border: var(--line) solid var(--ink); }
        .invoice-print table.items thead th { background: var(--fill); font-weight: 700; font-size: 8.5px; line-height: 1.25; padding: 1.5mm 1mm; vertical-align: middle; }
        .invoice-print table.items thead th .ar { display: block; font-size: 9px; }
        .invoice-print table.items thead tr.sub th { font-size: 6px; padding: 0.6mm 0.3mm; white-space: nowrap; }
        .invoice-print table.items tbody td { height: ${rowHeight}mm; font-size: ${cellFont}px; padding: 0 1mm; }
        .invoice-print table.items tbody td.price-cell { font-size: ${priceFont}px; font-weight: 700; }
        .invoice-print .col-item { width: 15%; } .invoice-print .col-desc { width: 39%; }
        .invoice-print .col-qty { width: 10%; } .invoice-print .col-kd { width: 9.5%; } .invoice-print .col-fils { width: 6.5%; }
        .invoice-print table.items tfoot td { background: var(--fill); height: 8mm; border-width: 2px; }
        .invoice-print .total-label { display: flex; align-items: flex-end; gap: 2mm; padding: 0 1.5mm 1.2mm; font-weight: 700; }
        .invoice-print .total-label .en { font-size: 10px; } .invoice-print .total-label .ar { font-size: 9.5px; }
        .invoice-print .total-words { flex: 1; font-size: 12px; font-weight: 700; text-align: center; }
        .invoice-print .bottom { display: grid; grid-template-columns: 44% 1fr; gap: 1.5mm; margin-top: 1.5mm; }
        .invoice-print .box { border: 2px solid var(--ink); padding: 1.5mm 2mm; }
        .invoice-print .box.shaded { background: var(--fill); }
        .invoice-print .left-col { display: flex; flex-direction: column; gap: 1.5mm; }
        .invoice-print .box .field { font-size: 8.5px; margin: 1.8mm 0; }
        .invoice-print .receipt-note { font-size: 8.5px; font-weight: 700; line-height: 1.5; margin-bottom: 1mm; }
        .invoice-print .blank-line { border-bottom: 1px dotted var(--ink-dark); height: 5.5mm; }
        .invoice-print .two-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
        .invoice-print .remarks { margin-top: 2.5mm; }
        .invoice-print .remarks .field { font-size: 9px; margin-bottom: 1.5mm; }
        @page { size: A5; margin: 0; }
        @media print {
          .invoice-print .sheet { padding: 6mm 6mm 4mm 8mm; }
        }
      `}</style>

			<div className="sheet">
				<header className="header">
					<div className="company-en">
						<h1>{company?.name_en || ""}</h1>
						<div className="phones">
							{STORE_PHONES_EN.map(([label, num]) => (
								<div key={label}>
									<span>{label}</span>
									<span>: {num}</span>
								</div>
							))}
						</div>
					</div>
					<div className="logo">
						{company?.logo_url ? (
							<img src={fileUrl(company.logo_url)} alt={company?.name_en} />
						) : (
							<div className="placeholder">
								{(company?.name_en || "?").trim().charAt(0).toUpperCase()}
							</div>
						)}
					</div>
					<div className="company-ar ar">
						<h1>{company?.name_ar || ""}</h1>
						<div className="phones">
							{STORE_PHONES_AR.map(([label, num]) => (
								<div key={label}>
									<span>{label}</span>
									<span>: {num}</span>
								</div>
							))}
						</div>
					</div>
				</header>

				<div className="title-row">
					<div className="serial">
						{prefix}
						<span>{suffix}</span>
					</div>
					<div className="doc-title">
						<div className="ar">فاتورة نقداً/بالحساب</div>
						<div className="en">Cash/Credit Invoice</div>
					</div>
					<div className="field date-field">
						<span>Date :</span>
						<span className="filled">{invoice.date}</span>
						<span className="ar">: التاريخ</span>
					</div>
				</div>

				<div className="field name-field">
					<span>Name :</span>
					<span className="filled">
						{client
							? `${client.name_en}${client.phone ? " - " + client.phone : ""}`
							: ""}
					</span>
					<span className="ar">: الإسم</span>
				</div>

				<table className="items">
					<colgroup>
						<col className="col-item" />
						<col className="col-desc" />
						<col className="col-qty" />
						<col className="col-kd" />
						<col className="col-fils" />
						<col className="col-kd" />
						<col className="col-fils" />
					</colgroup>
					<thead>
						<tr>
							<th rowSpan={2}>
								<span className="ar">رقم الصنف</span>Item No.
							</th>
							<th rowSpan={2}>
								<span className="ar">البيـــــان</span>Description
							</th>
							<th rowSpan={2}>
								<span className="ar">الكمية</span>Quantity
							</th>
							<th colSpan={2}>
								<span className="ar">سعر الوحدة</span>Unit Price
							</th>
							<th colSpan={2}>
								<span className="ar">سعر الاجمالي</span>Total Amount
							</th>
						</tr>
						<tr className="sub">
							<th>
								K.D. <span className="ar">دينار</span>
							</th>
							<th>
								Fils <span className="ar">فلس</span>
							</th>
							<th>
								K.D. <span className="ar">دينار</span>
							</th>
							<th>
								Fils <span className="ar">فلس</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{lines.map((l, i) => {
							const unit = splitKdFils(l.unit_price);
							const lineTotal = splitKdFils(l.line_total);
							const sku = l.variant?.sku || l.item?.sku || l.item?.code || "";
							const nameAr = l.item?.name_ar || "";
							const nameEn = l.item?.name_en || l.description || "";
							return (
								<tr key={l.id || i}>
									<td>{sku}</td>
									<td>
										{nameAr && (
											<span className="ar" style={{ display: "block" }}>
												{nameAr}
											</span>
										)}
										<span style={{ display: "block" }}>{nameEn}</span>
									</td>
									<td style={{ textAlign: "center" }}>
										{Number(l.quantity).toFixed(2)}
									</td>
									<td className="price-cell" style={{ textAlign: "center" }}>
										{unit.kd}
									</td>
									<td className="price-cell" style={{ textAlign: "center" }}>
										{unit.fils}
									</td>
									<td className="price-cell" style={{ textAlign: "center" }}>
										{lineTotal.kd}
									</td>
									<td className="price-cell" style={{ textAlign: "center" }}>
										{lineTotal.fils}
									</td>
								</tr>
							);
						})}
						{Array.from({ length: padRows }).map((_, i) => (
							<tr key={`pad-${i}`}>
								<td></td>
								<td></td>
								<td></td>
								<td></td>
								<td></td>
								<td></td>
								<td></td>
							</tr>
						))}
					</tbody>
					<tfoot>
						<tr>
							<td colSpan={5}>
								<div className="total-label">
									<span className="en">TOTAL K.D.:</span>
									<span className="total-words">
										{invoice.amount_in_words_ar}
									</span>
									<span className="ar">المجموع د.ك.</span>
								</div>
							</td>
							<td style={{ textAlign: "center", fontWeight: 700 }}>
								{totalSplit.kd}
							</td>
							<td style={{ textAlign: "center", fontWeight: 700 }}>
								{totalSplit.fils}
							</td>
						</tr>
					</tfoot>
				</table>

				<section className="bottom">
					<div className="left-col">
						<div className="box shaded">
							<div className="field ar">
								<span>: توقيع أمين المخزن</span>
								<span className="dots"></span>
							</div>
						</div>
						<div className="box shaded ar">
							<p className="receipt-note">
								أقر أنا الموقع ادناه بإستلام البضاعة بحالة جيدة
							</p>
							<div className="field">
								<span>: إسم المستلم</span>
								<span className="dots"></span>
							</div>
							<div className="field">
								<span>: التاريخ</span>
								<span className="dots"></span>
							</div>
							<div className="field">
								<span>: التوقيع</span>
								<span className="dots"></span>
							</div>
						</div>
					</div>

					<div className="box ar">
						<div className="field">
							<span>: العنوان</span>
							<span className="filled">
								{client?.address || invoice.delivery_address || ""}
							</span>
						</div>
						<div className="blank-line"></div>
						<div className="two-fields">
							<div className="field">
								<span>: تاريخ التسليم</span>
								<span className="filled">{invoice.delivery_date || ""}</span>
							</div>
							<div className="field">
								<span>: الوقت</span>
								<span className="dots"></span>
							</div>
						</div>
						<div className="two-fields">
							<div className="field">
								<span>: توقيع المشتري</span>
								<span className="dots"></span>
							</div>
							<div className="field">
								<span>: توقيع البائع</span>
								<span className="dots"></span>
							</div>
						</div>
					</div>
				</section>

				<section className="remarks">
					<div className="field ar">
						<span>: ملاحظات</span>
						<span className="filled">{invoice.notes || ""}</span>
					</div>
				</section>

				<footer className="footer">
					<span>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<circle cx="12" cy="12" r="11" fill="#2c4b86" />
							<path
								d="M1 12h22M12 1c4 4 4 18 0 22M12 1c-4 4-4 18 0 22"
								stroke="#fff"
								strokeWidth="1.4"
								fill="none"
							/>
						</svg>
						{STORE_WEBSITE}
					</span>
					<span>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<rect width="24" height="24" rx="4" fill="#2c4b86" />
							<path
								d="M15.5 8H14c-.6 0-1 .4-1 1v2h2.5l-.4 2.5H13V20h-2.7v-6.5H8.5V11h1.8V8.8C10.3 6.9 11.4 6 13.1 6h2.4z"
								fill="#fff"
							/>
						</svg>
						{STORE_FACEBOOK}
					</span>
					<span>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<rect
								x="2"
								y="2"
								width="20"
								height="20"
								rx="6"
								fill="none"
								stroke="#2c4b86"
								strokeWidth="2.4"
							/>
							<circle
								cx="12"
								cy="12"
								r="4.5"
								fill="none"
								stroke="#2c4b86"
								strokeWidth="2.4"
							/>
							<circle cx="17.5" cy="6.5" r="1.4" fill="#2c4b86" />
						</svg>
						{STORE_INSTAGRAM}
					</span>
				</footer>
			</div>
		</div>
	);
}
