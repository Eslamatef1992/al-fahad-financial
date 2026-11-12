import { Ticket, X } from "lucide-react";

const money = (n) => Number(n || 0).toFixed(3);

export default function CouponsModal({
	open,
	onClose,
	t,
	discountCode,
	setDiscountCode,
	applyDiscount,
	applyingDiscount,
	discountError,
	discountCodes,
}) {
	if (!open) return null;
	return (
		<>
			<div
				className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40"
				onClick={onClose}
			/>
			<div className="fixed z-50 inset-0 flex items-center justify-center p-4">
				<div className="card p-4 max-w-md w-full max-h-[80vh] flex flex-col">
					<div className="flex items-center justify-between mb-3">
						<p className="font-bold text-navy-900 dark:text-white flex items-center gap-2">
							<Ticket size={16} />
							{t("pos.railCoupons")}
						</p>
						<button onClick={onClose}>
							<X size={18} />
						</button>
					</div>
					<div className="flex items-center gap-2 mb-3">
						<input
							className="input text-sm"
							placeholder={t("invoices.discountCodePlaceholder")}
							value={discountCode}
							onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
						/>
						<button
							onClick={() => applyDiscount()}
							disabled={applyingDiscount || !discountCode.trim()}
							className="btn-primary shrink-0">
							{t("invoices.applyDiscount")}
						</button>
					</div>
					{discountError && (
						<p className="text-xs text-red-500 mb-2">{discountError}</p>
					)}
					<div className="space-y-1.5 overflow-y-auto">
						{discountCodes
							.filter((c) => c.is_active)
							.map((c) => (
								<button
									key={c.id}
									onClick={() => applyDiscount(c.code)}
									className="w-full flex items-center justify-between gap-2 border border-slate-100 dark:border-navy-800 rounded-lg px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-navy-900 text-start">
									<div className="min-w-0">
										<p className="font-semibold text-navy-900 dark:text-white">
											{c.code}
										</p>
										{c.description && (
											<p className="text-xs text-slate-400 truncate">
												{c.description}
											</p>
										)}
									</div>
									<span className="text-xs font-semibold text-emerald-600 shrink-0">
										{c.type === "percentage"
											? `${Number(c.value)}%`
											: money(c.value)}
									</span>
								</button>
							))}
						{!discountCodes.length && (
							<p className="text-center text-sm text-slate-400 py-6">
								{t("common.noData")}
							</p>
						)}
					</div>
				</div>
			</div>
		</>
	);
}
