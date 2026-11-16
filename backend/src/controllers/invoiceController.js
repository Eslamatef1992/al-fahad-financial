const { Op } = require("sequelize");
const {
	sequelize,
	Invoice,
	InvoiceLine,
	InvoicePayment,
	Client,
	Supplier,
	Account,
	CostCenter,
	Branch,
	Company,
	Voucher,
	Item,
	ItemVariant,
	DiscountCode,
	SalesPerson,
	PaymentMethod,
	User,
} = require("../models");
const invoiceService = require("../services/invoiceService");
const {
	generateInvoicePdf,
	generateAgingPdf,
	generateDeliverySchedulePdf,
} = require("../services/pdfService");
const {
	amountInWordsEn,
	amountInWordsAr,
} = require("../services/numberToWords");
const { exportInvoices } = require("../services/excelService");

const lineInclude = [
	{
		model: InvoiceLine,
		as: "lines",
		include: [
			{ model: Account, as: "account" },
			{ model: Item, as: "item" },
			{ model: ItemVariant, as: "variant" },
			{ model: DiscountCode, as: "discountCode" },
		],
	},
];
// Salesperson snapshot: who created the invoice (POS cashier or backoffice
// user), so it can be printed/reported on. Only the fields the printouts and
// reports actually need are pulled — never password_hash.
const creatorInclude = [
	{ model: User, as: "creator", attributes: ["id", "name", "phone"] },
];
const partyInclude = [
	{ model: Client, as: "client" },
	{ model: Supplier, as: "supplier" },
	{ model: CostCenter, as: "costCenter" },
	{ model: Branch, as: "branch" },
	{ model: DiscountCode, as: "discountCode" },
	{ model: SalesPerson, as: "salesperson", attributes: ["id", "name_en", "name_ar"] },
	...creatorInclude,
];
const paymentInclude = [
	{
		model: InvoicePayment,
		as: "payments",
		include: [
			{
				model: Voucher,
				as: "voucher",
				attributes: ["id", "voucher_no", "status"],
			},
			{
				model: PaymentMethod,
				as: "paymentMethodRef",
				attributes: ["id", "name_en", "name_ar"],
			},
		],
	},
];

// Flat list of invoice payments (back-office + POS) for the Accounting module's
// Transactions pages. ?online=true keeps only electronic tenders (anything that
// is not cash or on-account credit — Knet, cards, Tabby, bank transfer, ...).
exports.listPayments = async (req, res) => {
	const { from, to, online, type } = req.query;
	const where = {};
	if (from || to)
		where.date = { ...(from && { [Op.gte]: from }), ...(to && { [Op.lte]: to }) };
	if (online === "true") where.payment_method = { [Op.notIn]: ["cash", "credit"] };
	const invWhere = { company_id: req.companyId };
	if (type) invWhere.type = type;
	const rows = await InvoicePayment.findAll({
		where,
		include: [{ model: Invoice, where: invWhere, attributes: ["id", "invoice_no", "type", "branch_id"], required: true }],
		order: [["date", "DESC"], ["createdAt", "DESC"]],
	});
	res.json(rows);
};

exports.list = async (req, res) => {
	const { type, status, from, to, party_id, branch_id } = req.query;
	const where = { company_id: req.companyId };
	if (type) where.type = type;
	if (status) where.status = status;
	if (branch_id) where.branch_id = branch_id;
	if (from || to)
		where.date = {
			...(from && { [Op.gte]: from }),
			...(to && { [Op.lte]: to }),
		};
	if (party_id)
		where[Op.or] = [{ client_id: party_id }, { supplier_id: party_id }];

	const invoices = await Invoice.findAll({
		where,
		include: partyInclude,
		order: [
			["date", "DESC"],
			["createdAt", "DESC"],
		],
	});
	res.json(invoices);
};

exports.get = async (req, res) => {
	const invoice = await Invoice.findOne({
		where: { id: req.params.id, company_id: req.companyId },
		include: [...lineInclude, ...partyInclude, ...paymentInclude],
	});
	if (!invoice) return res.status(404).json({ message: "Invoice not found" });
	const data = invoice.toJSON();
	data.amount_in_words_en = amountInWordsEn(
		Number(invoice.total),
		invoice.currency,
	);
	data.amount_in_words_ar = amountInWordsAr(
		Number(invoice.total),
		invoice.currency,
	);
	res.json(data);
};

exports.create = async (req, res) => {
	const invoice = await invoiceService.createInvoice(
		req.companyId,
		req.user.id,
		req.body,
	);
	res.status(201).json(invoice);
};

// One-step "Complete & Pay" — creates the draft, posts it, and settles the
// given payments (Payment Setting Options + Credit), all in one request, so
// the Sales Invoice creation screen can behave exactly like POS checkout.
exports.createAndSettle = async (req, res) => {
	const invoice = await invoiceService.createInvoiceAndSettle(
		req.companyId,
		req.user.id,
		req.body,
	);
	const withPayments = await Invoice.findByPk(invoice.id, {
		include: [...lineInclude, ...partyInclude, ...paymentInclude],
	});
	res.status(201).json(withPayments);
};

// Edits a draft invoice IN PLACE — same id, same invoice_no. Previously this
// destroy()ed the row and recreated it via createInvoice(), which handed out a
// new id (and new invoice_no) on every edit; that broke any reference to the
// old id and made saving the same edit form twice 404 with "Invoice not
// found" once the first save had already replaced the row underneath it.
// See the identical fix applied to voucherController.exports.update.
exports.update = async (req, res) => {
	const {
		client_id,
		supplier_id,
		date,
		due_date,
		cost_center_id,
		branch_id,
		tax_account_id,
		currency,
		notes,
		reference_no,
		lines,
		discount_code,
		delivery_date,
		delivery_address,
	} = req.body;

	if (!Array.isArray(lines) || lines.length === 0) {
		return res
			.status(400)
			.json({ message: "At least one line item is required" });
	}

	const updated = await sequelize.transaction(async (t) => {
		const invoice = await Invoice.findOne({
			where: { id: req.params.id, company_id: req.companyId },
			transaction: t,
			lock: t.LOCK.UPDATE,
		});
		if (!invoice) {
			const e = new Error("Invoice not found");
			e.status = 404;
			throw e;
		}
		if (invoice.status !== "draft") {
			const e = new Error("Only draft invoices can be edited");
			e.status = 400;
			throw e;
		}
		if (invoice.type === "sales" && !client_id) {
			const e = new Error("client_id is required for sales invoices");
			e.status = 400;
			throw e;
		}
		if (invoice.type === "purchase" && !supplier_id) {
			const e = new Error("supplier_id is required for purchase invoices");
			e.status = 400;
			throw e;
		}

		// Same discount resolution path as createInvoice, excluding this
		// invoice's own prior usage so re-saving with the same code it already
		// had never incorrectly trips a usage-limit check.
		const {
			computedLines,
			subtotal,
			tax_total,
			total,
			discountCodeId,
			totalDiscount,
		} = await invoiceService.buildInvoiceLines(
			req.companyId,
			{ lines, discount_code, excludeInvoiceId: invoice.id },
			t,
		);

		await invoice.update(
			{
				client_id: client_id || null,
				supplier_id: supplier_id || null,
				reference_no: reference_no || null,
				date,
				due_date: due_date || null,
				cost_center_id: cost_center_id || null,
				branch_id: branch_id || null,
				tax_account_id: tax_account_id || null,
				currency: currency || invoice.currency,
				notes,
				discount_code_id: discountCodeId,
				discount_amount: totalDiscount,
				subtotal,
				tax_total,
				total,
				delivery_date: delivery_date || null,
				delivery_address: delivery_address || null,
			},
			{ transaction: t },
		);

		await InvoiceLine.destroy({
			where: { invoice_id: invoice.id },
			transaction: t,
		});
		await Promise.all(
			computedLines.map((l, idx) =>
				InvoiceLine.create(
					{
						invoice_id: invoice.id,
						account_id: l.account_id,
						item_id: l.item_id || null,
						variant_id: l.variant_id || null,
						description: l.description || "",
						quantity: l.quantity,
						unit_price: l.unit_price,
						tax_rate: l.tax_rate,
						discount_code_id: l.discount_code_id || null,
						discount_amount: l.discount_amount || 0,
						line_subtotal: l.line_subtotal,
						line_tax: l.line_tax,
						line_total: l.line_total,
						line_order: idx,
						is_booked: !!l.is_booked,
						delivery_date: l.is_booked ? l.delivery_date : null,
					},
					{ transaction: t },
				),
			),
		);

		return invoice;
	});

	res.json(updated);
};

exports.remove = async (req, res) => {
	const invoice = await Invoice.findOne({
		where: { id: req.params.id, company_id: req.companyId },
	});
	if (!invoice) return res.status(404).json({ message: "Invoice not found" });
	if (invoice.status !== "draft")
		return res
			.status(400)
			.json({ message: "Only draft invoices can be deleted" });
	await invoice.destroy(); // InvoiceLine rows cascade-delete with it
	res.json({ message: "Invoice deleted" });
};

exports.post = async (req, res) => {
	const invoice = await invoiceService.postInvoice(
		req.companyId,
		req.params.id,
		req.user.id,
	);
	res.json(invoice);
};

exports.cancel = async (req, res) => {
	const invoice = await invoiceService.cancelInvoice(
		req.companyId,
		req.params.id,
	);
	res.json(invoice);
};

exports.addPayment = async (req, res) => {
	const invoice = await invoiceService.recordPayment(
		req.companyId,
		req.params.id,
		req.user.id,
		req.body,
	);
	const withPayments = await Invoice.findByPk(invoice.id, {
		include: [...lineInclude, ...partyInclude, ...paymentInclude],
	});
	res.status(201).json(withPayments);
};

exports.pdf = async (req, res) => {
	const invoice = await Invoice.findOne({
		where: { id: req.params.id, company_id: req.companyId },
		include: [...lineInclude, ...partyInclude, ...paymentInclude],
	});
	if (!invoice) return res.status(404).json({ message: "Invoice not found" });
	const company = await Company.findByPk(req.companyId);
	generateInvoicePdf(res, invoice, company);
};

exports.exportExcel = async (req, res) => {
	const { type, status, from, to, branch_id } = req.query;
	const where = { company_id: req.companyId, type: type || "sales" };
	if (status) where.status = status;
	if (branch_id) where.branch_id = branch_id;
	if (from || to)
		where.date = {
			...(from && { [Op.gte]: from }),
			...(to && { [Op.lte]: to }),
		};

	const invoices = await Invoice.findAll({
		where,
		include: partyInclude,
		order: [["date", "DESC"]],
	});
	const company = await Company.findByPk(req.companyId);
	await exportInvoices(res, company, invoices, type || "sales");
};

// AR/AP aging: outstanding balance per party, bucketed by days overdue
async function computeAging(companyId, type) {
	const invoiceType = type === "purchase" ? "purchase" : "sales";
	const today = new Date();

	const invoices = await Invoice.findAll({
		where: {
			company_id: companyId,
			type: invoiceType,
			status: { [Op.in]: ["posted", "partially_paid"] },
		},
		include: partyInclude,
	});

	const buckets = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
	const rows = invoices
		.map((inv) => {
			const outstanding = Number(inv.total) - Number(inv.paid_total);
			const dueDate = inv.due_date
				? new Date(inv.due_date)
				: new Date(inv.date);
			const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
			let bucket = "current";
			if (daysOverdue > 90) bucket = "90+";
			else if (daysOverdue > 60) bucket = "61-90";
			else if (daysOverdue > 30) bucket = "31-60";
			else if (daysOverdue > 0) bucket = "1-30";
			buckets[bucket] += outstanding;

			return {
				invoice_no: inv.invoice_no,
				party:
					invoiceType === "sales" ? inv.client?.name_en : inv.supplier?.name_en,
				date: inv.date,
				due_date: inv.due_date,
				total: Number(inv.total),
				paid: Number(inv.paid_total),
				outstanding,
				days_overdue: Math.max(daysOverdue, 0),
				bucket,
			};
		})
		.filter((r) => r.outstanding > 0.001);

	return {
		type: invoiceType,
		as_of: today.toISOString().slice(0, 10),
		rows,
		buckets,
		total_outstanding: Object.values(buckets).reduce((s, v) => s + v, 0),
	};
}

exports.aging = async (req, res) => {
	const aging = await computeAging(req.companyId, req.query.type);
	res.json(aging);
};

exports.agingPdf = async (req, res) => {
	const aging = await computeAging(req.companyId, req.query.type);
	const company = await Company.findByPk(req.companyId);
	generateAgingPdf(res, aging, company);
};

// Delivery Schedule: every sales invoice with a delivery_date set, regardless
// of status or whether any of its lines are formally "booked" — a plain
// on-hand sale can carry a delivery date/address just as well as a booked
// one. One row per invoice, sorted soonest-first, so it reads like a
// dispatcher's route sheet rather than an accounting report.
async function queryDeliverySchedule(
	companyId,
	{ date_from, date_to, status, branch_id } = {},
) {
	const where = {
		company_id: companyId,
		type: "sales",
		delivery_date: { [Op.ne]: null },
	};
	if (status && status !== "all") where.status = status;
	if (branch_id) where.branch_id = branch_id;
	if (date_from || date_to) {
		where.delivery_date = {
			[Op.ne]: null,
			...(date_from && { [Op.gte]: date_from }),
			...(date_to && { [Op.lte]: date_to }),
		};
	}
	return Invoice.findAll({
		where,
		include: partyInclude,
		order: [
			["delivery_date", "ASC"],
			["createdAt", "ASC"],
		],
	});
}

exports.deliverySchedule = async (req, res) => {
	const rows = await queryDeliverySchedule(req.companyId, req.query);
	res.json(rows);
};

exports.deliverySchedulePdf = async (req, res) => {
	const rows = await queryDeliverySchedule(req.companyId, req.query);
	const company = await Company.findByPk(req.companyId);
	generateDeliverySchedulePdf(res, rows, company);
};

// ---- Delivery note (إذن تسليم) workflow ------------------------------------
// 1) deliveryNote: operator prints the delivery note -> status 'note_issued'.
// 2) deliveryDeliver: client received -> every pending booking on the invoice is
//    fulfilled (stock leaves the warehouse, COGS posted). Non-booked lines already
//    left stock when the invoice was posted.
// 3) deliveryCancel: delivery fell through -> pending bookings are released back
//    to available stock; nothing is issued.
async function loadDeliverable(req, res) {
	const inv = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId, type: "sales" } });
	if (!inv) { res.status(404).json({ message: "Invoice not found" }); return null; }
	if (inv.status === "cancelled" || inv.status === "draft") { res.status(400).json({ message: "Only a posted sales invoice can be delivered" }); return null; }
	if (["delivered", "cancelled"].includes(inv.delivery_status)) { res.status(400).json({ message: `Delivery already ${inv.delivery_status}` }); return null; }
	return inv;
}

exports.deliveryNote = async (req, res) => {
	const inv = await loadDeliverable(req, res);
	if (!inv) return;
	if (!inv.delivery_status) await inv.update({ delivery_status: "note_issued", delivery_note_at: new Date() });
	res.json({ id: inv.id, delivery_status: inv.delivery_status });
};

exports.deliveryLines = async (req, res) => {
	const inv = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId, type: "sales" }, include: [{ model: InvoiceLine, as: "lines", include: [{ model: Item, as: "item", attributes: ["id", "code", "name_en", "name_ar"] }] }] });
	if (!inv) return res.status(404).json({ message: "Invoice not found" });
	const { ItemBooking } = require("../models");
	const pend = await ItemBooking.findAll({ where: { invoice_id: inv.id, status: "pending" }, raw: true });
	const lines = (inv.lines || []).map((l) => {
		const delivered = Number(l.delivered_qty || 0);
		const ordered = Number(l.quantity);
		return {
			id: l.id, description: l.description || l.item?.name_en, code: l.item?.code || null,
			ordered, delivered, remaining: Math.max(0, Math.round((ordered - delivered) * 1000) / 1000),
			is_booked: !!l.is_booked, booked_pending: pend.filter((b) => b.invoice_line_id === l.id).reduce((a, b) => a + Number(b.quantity), 0),
		};
	});
	res.json({ invoice_no: inv.invoice_no, delivery_status: inv.delivery_status, lines });
};

exports.deliveryDeliver = async (req, res) => {
	const inv = await loadDeliverable(req, res);
	if (!inv) return;
	const { ItemBooking } = require("../models");
	const bookingService = require("../services/bookingService");
	const date = req.body?.date || new Date().toISOString().slice(0, 10);
	const lines = await InvoiceLine.findAll({ where: { invoice_id: inv.id } });
	// body.lines = [{ line_id, quantity }]; omitted => deliver everything still outstanding.
	const want = new Map((req.body?.lines || []).map((x) => [x.line_id, Number(x.quantity)]));
	let any = false;
	for (const l of lines) {
		const remaining = Math.round((Number(l.quantity) - Number(l.delivered_qty || 0)) * 1000) / 1000;
		let q = req.body?.lines ? (want.get(l.id) || 0) : remaining;
		if (q <= 0) continue;
		if (q > remaining + 0.0005) return res.status(400).json({ message: `Cannot deliver more than the remaining ${remaining} of "${l.description}"` });
		any = true;
		if (l.is_booked) {
			const bks = await ItemBooking.findAll({ where: { invoice_line_id: l.id, company_id: req.companyId, status: "pending" }, order: [["createdAt", "ASC"]] });
			let left = q;
			for (const b of bks) {
				if (left <= 0.0005) break;
				const take = Math.min(left, Number(b.quantity));
				await bookingService.fulfillBooking(req.companyId, b.id, req.user?.id, { date, quantity: take });
				left = Math.round((left - take) * 1000) / 1000;
			}
		}
		await l.update({ delivered_qty: Math.round((Number(l.delivered_qty || 0) + q) * 1000) / 1000 });
	}
	if (!any) return res.status(400).json({ message: "Enter a quantity to deliver" });
	const fresh = await InvoiceLine.findAll({ where: { invoice_id: inv.id } });
	const done = fresh.every((l) => Number(l.delivered_qty || 0) >= Number(l.quantity) - 0.0005);
	await inv.update(done ? { delivery_status: "delivered", delivery_closed_at: new Date() } : { delivery_status: "partial" });
	res.json({ id: inv.id, delivery_status: done ? "delivered" : "partial" });
};

// Cancels what has NOT been delivered yet: pending bookings go back to available.
exports.deliveryCancel = async (req, res) => {
	const inv = await loadDeliverable(req, res);
	if (!inv) return;
	const { ItemBooking } = require("../models");
	const [released] = await ItemBooking.update({ status: "cancelled" }, { where: { invoice_id: inv.id, company_id: req.companyId, status: "pending" } });
	const lines = await InvoiceLine.findAll({ where: { invoice_id: inv.id } });
	const anyDelivered = lines.some((l) => Number(l.delivered_qty || 0) > 0);
	await inv.update({ delivery_status: anyDelivered ? "delivered" : "cancelled", delivery_closed_at: new Date() });
	res.json({ id: inv.id, delivery_status: anyDelivered ? "delivered" : "cancelled", released });
};

// Set/replace the delivery address on any sales invoice (also fills the client's address if it was empty).
exports.setDeliveryAddress = async (req, res) => {
	const inv = await Invoice.findOne({ where: { id: req.params.id, company_id: req.companyId } });
	if (!inv) return res.status(404).json({ message: "Invoice not found" });
	const addr = String(req.body?.delivery_address || "").trim() || null;
	await inv.update({ delivery_address: addr });
	if (addr && inv.client_id) {
		await Client.update({ address: addr }, { where: { id: inv.client_id, company_id: req.companyId, address: { [Op.or]: [null, ""] } } });
	}
	res.json({ id: inv.id, delivery_address: addr });
};
