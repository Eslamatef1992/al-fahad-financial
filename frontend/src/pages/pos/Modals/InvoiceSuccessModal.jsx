import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Printer, Eye, PlusCircle } from "lucide-react";
import api from "@/api/client";
import InvoicePrintTemplate from "@/components/InvoicePrintTemplate";

const money = (n) => Number(n || 0).toFixed(3);

// Shown right after a POS payment is submitted successfully. Fetches the
// freshly-posted invoice (the POST /pos/sales response is a bare Invoice row
// without lines/client, so it isn't enough to render the print template) and
// offers Print (same window.print() + hidden InvoicePrintTemplate pattern as
// InvoiceDetailPage) plus a link to the full invoice page.
export default function InvoiceSuccessModal({
	invoiceId,
	onClose,
	t,
	activeCompany,
}) {
	const navigate = useNavigate();
	const [invoice, setInvoice] = useState(null);

	useEffect(() => {
		if (!invoiceId) {
			setInvoice(null);
			return;
		}
		api
			.get(`/invoices/${invoiceId}`)
			.then((r) => setInvoice(r.data))
			.catch(() => {});
	}, [invoiceId]);

	if (!invoiceId) return null;

	return (
		<>
			{invoice && (
				<div className="hidden print:block">
					<InvoicePrintTemplate invoice={invoice} company={activeCompany} />
				</div>
			)}
			<div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40 print:hidden" />
			<div className="fixed z-50 inset-0 flex items-center justify-center p-4 print:hidden">
				<div className="card p-0 max-w-sm w-full overflow-hidden">
					<div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-navy-800">
						<div className="flex items-center gap-2 min-w-0">
							<span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center shrink-0">
								<CheckCircle2 size={18} />
							</span>
							<div className="min-w-0">
								<p className="font-bold text-navy-900 dark:text-white leading-tight truncate">
									{t("pos.saleCompleted")}
								</p>
								{invoice && (
									<p className="text-xs text-slate-400 truncate">
										{invoice.invoice_no}
									</p>
								)}
							</div>
						</div>
						<button
							onClick={() => window.print()}
							disabled={!invoice}
							className="btn-primary !px-3 !py-2 flex items-center gap-1.5 text-sm shrink-0 disabled:opacity-50">
							<Printer size={15} />
							{t("common.print")}
						</button>
					</div>

					<div className="px-5 py-4">
						<p className="text-sm text-slate-500 mb-4">
							{t("pos.saleCompletedHint")}
						</p>
						{invoice && (
							<div className="rounded-xl border border-slate-100 dark:border-navy-800 p-3 mb-4 space-y-1.5">
								<div className="flex items-center justify-between text-sm">
									<span className="text-slate-500">{t("common.client")}</span>
									<span className="font-medium text-navy-900 dark:text-white truncate ms-2">
										{invoice.client?.name_en || t("pos.walkIn")}
									</span>
								</div>
								<div className="flex items-center justify-between text-sm">
									<span className="text-slate-500">{t("common.total")}</span>
									<span className="font-bold text-navy-900 dark:text-white">
										{money(invoice.total)}
									</span>
								</div>
							</div>
						)}
						<div className="flex flex-col gap-2">
							<button
								onClick={() => navigate(`/invoices/${invoiceId}`)}
								className="btn-ghost w-full flex items-center justify-center gap-1.5">
								<Eye size={16} />
								{t("pos.viewInvoice")}
							</button>
							<button
								onClick={onClose}
								className="btn-ghost w-full flex items-center justify-center gap-1.5">
								<PlusCircle size={16} />
								{t("pos.newSale")}
							</button>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
