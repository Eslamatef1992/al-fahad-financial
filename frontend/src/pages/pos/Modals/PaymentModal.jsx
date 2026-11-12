import { Banknote, Users } from "lucide-react";

const money = (n) => Number(n || 0).toFixed(3);

export default function PaymentModal({
	open,
	onClose,
	t,
	netTotal,
	activePaymentMethods,
	tenderAmounts,
	setTenderAmounts,
	tenderRefs,
	setTenderRefs,
	canCredit,
	creditAmount,
	setCreditAmount,
	clientId,
	tenderTotal,
	paying,
	submitPayment,
}) {
	if (!open) return null;
	return (
		<>
			<div
				className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40"
				onClick={onClose}
			/>
			<div className="fixed z-50 inset-0 flex items-center justify-center p-4">
				<div className="card p-6 max-w-sm w-full">
					<p className="font-bold text-lg text-navy-900 dark:text-white mb-1">
						{t("pos.pay")}
					</p>
					<p className="text-sm text-slate-500 mb-4">
						{t("pos.amountDue", { amount: money(netTotal) })}
					</p>
					<div className="space-y-3">
						{activePaymentMethods.length === 0 && (
							<p className="text-xs text-amber-500">
								{t("pos.noPaymentMethods")}
							</p>
						)}
						{activePaymentMethods.map((pm) => (
							<div key={pm.id}>
								<label className="label !flex items-center gap-1">
									<Banknote size={13} />
									{pm.name_en}
								</label>
								<input
									type="number"
									step="0.001"
									className="input"
									value={tenderAmounts[pm.id] || ""}
									onChange={(e) =>
										setTenderAmounts({
											...tenderAmounts,
											[pm.id]: e.target.value,
										})
									}
								/>
								{Number(tenderAmounts[pm.id]) > 0 && (
									<input
										className="input mt-1.5"
										value={tenderRefs[pm.id] || ""}
										onChange={(e) =>
											setTenderRefs({
												...tenderRefs,
												[pm.id]: e.target.value,
											})
										}
										placeholder={t("pos.referenceOptionalPlaceholder")}
									/>
								)}
							</div>
						))}
						{canCredit && (
							<div>
								<label className="label !flex items-center gap-1">
									<Users size={13} />
									{t("pos.credit")}
								</label>
								<input
									type="number"
									step="0.001"
									className="input"
									value={creditAmount}
									onChange={(e) => setCreditAmount(e.target.value)}
									disabled={!clientId}
								/>
								{!clientId && (
									<p className="text-xs text-amber-500 mt-1">
										{t("pos.creditNeedsClient")}
									</p>
								)}
							</div>
						)}
						<div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100 dark:border-navy-800">
							<span className="text-slate-500">{t("pos.tendered")}</span>
							<span
								className={`font-semibold ${Math.abs(tenderTotal - netTotal) > 0.001 ? "text-red-500" : "text-emerald-500"}`}>
								{money(tenderTotal)}
							</span>
						</div>
					</div>
					<div className="flex items-center justify-end gap-2 mt-6">
						<button onClick={onClose} className="btn-ghost">
							{t("common.cancel")}
						</button>
						<button
							onClick={submitPayment}
							disabled={paying}
							className="btn-primary">
							{paying ? t("common.loading") : t("pos.completeSale")}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
