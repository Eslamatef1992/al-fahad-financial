import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { History, X, Printer, RotateCcw } from "lucide-react";

const money = (n) => Number(n || 0).toFixed(3);

export default function HistoryModal({
	open,
	onClose,
	t,
	historyFilters,
	setHistoryFilters,
	loadHistory,
	historyLoading,
	historyRows,
	canRefund,
	printHistoryInvoice,
	setRefundTarget,
	todayStr,
}) {
	const navigate = useNavigate();
	// Live search: reload shortly after the filters change (no need to press Apply).
	useEffect(() => {
		if (!open) return undefined;
		const h = setTimeout(() => loadHistory(historyFilters), 350);
		return () => clearTimeout(h);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, historyFilters.q, historyFilters.date_from, historyFilters.date_to]);
	const hasFilters = !!(historyFilters.q || historyFilters.date_from || historyFilters.date_to);
	const clearFilters = () => {
		const empty = { date_from: "", date_to: "", q: "" };
		setHistoryFilters(empty);
		loadHistory(empty);
	};
	if (!open) return null;
	return (
		<>
			<div
				className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40"
				onClick={onClose}
			/>
			<div className="fixed z-50 inset-0 flex items-center justify-center p-4">
				<div className="card p-6 max-w-3xl w-full max-h-[85vh] flex flex-col">
					<div className="flex items-center justify-between mb-4">
						<p className="font-bold text-lg text-navy-900 dark:text-white flex items-center gap-2">
							<History size={18} />
							{t("pos.invoiceHistory")}
						</p>
						<button onClick={onClose}>
							<X size={18} />
						</button>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.4fr_auto_auto] gap-2 mb-4">
						<input
							type="date"
							className="input"
							value={historyFilters.date_from}
							onChange={(e) =>
								setHistoryFilters({
									...historyFilters,
									date_from: e.target.value,
								})
							}
						/>
						<input
							type="date"
							className="input"
							value={historyFilters.date_to}
							onChange={(e) =>
								setHistoryFilters({
									...historyFilters,
									date_to: e.target.value,
								})
							}
						/>
						<input
							className="input sm:col-span-1"
							placeholder={t("pos.historySearchPlaceholder")}
							value={historyFilters.q}
							onChange={(e) =>
								setHistoryFilters({ ...historyFilters, q: e.target.value })
							}
							onKeyDown={(e) => { if (e.key === "Enter") loadHistory(historyFilters); }}
						/>
						<button onClick={() => loadHistory(historyFilters)} className="btn-primary">
							{t("common.applyFilters")}
						</button>
						<button type="button" onClick={clearFilters} disabled={!hasFilters} className="btn-ghost disabled:opacity-40">
							{t("common.clearFilters", { defaultValue: "Clear" })}
						</button>
					</div>
					<div className="flex-1 overflow-y-auto space-y-2">
						{historyLoading && (
							<p className="text-center text-sm text-slate-400 py-6">
								{t("common.loading")}
							</p>
						)}
						{!historyLoading && !historyRows.length && (
							<p className="text-center text-sm text-slate-400 py-6">
								{t("common.noData")}
							</p>
						)}
						{!historyLoading &&
							historyRows.map((row) => (
								<div
									key={row.id}
									className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-navy-800 pb-2 text-sm">
									<div
										className="min-w-0 flex-1 cursor-pointer rounded-lg hover:bg-slate-50 dark:hover:bg-navy-800/50 transition-colors -mx-1 px-1"
										title={t("pos.viewInvoice")}
										onClick={() => { onClose(); navigate(`/invoices/${row.id}`); }}>
										<p className="font-medium text-navy-900 dark:text-white">
											{row.invoice_no} — {row.date}
										</p>
										<p className="text-xs text-slate-400 truncate">
											{row.client
												? `${row.client.name_en}${row.client.phone ? " — " + row.client.phone : ""}`
												: t("pos.walkIn")}
										</p>
										{row.delivery_date && (
											<p className="text-xs text-amber-500 truncate">
												{t("invoices.deliveryDate")}: {row.delivery_date}
											</p>
										)}
									</div>
									<div className="flex items-center gap-3 shrink-0">
										<span className="font-semibold text-navy-900 dark:text-white">
											{money(row.total)}
										</span>
										<span
											className={`text-[11px] px-1.5 py-0.5 rounded-full ${row.status === "cancelled" ? "bg-slate-100 text-slate-400" : row.status === "paid" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
											{t(`pos.status_${row.status}`)}
										</span>
										<button
											onClick={() => printHistoryInvoice(row)}
											disabled={row.date !== todayStr()}
											title={
												row.date === todayStr()
													? t("common.print")
													: t("pos.printTodayOnly")
											}
											className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent">
											<Printer size={14} />
										</button>
										{canRefund &&
											["paid", "partially_paid"].includes(row.status) && (
												<button
													onClick={() => setRefundTarget(row)}
													title={t("pos.refund")}
													className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-500">
													<RotateCcw size={14} />
												</button>
											)}
									</div>
								</div>
							))}
					</div>
				</div>
			</div>
		</>
	);
}
