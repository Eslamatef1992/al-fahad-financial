export default function RefundModal({
	refundTarget,
	onClose,
	t,
	refundReason,
	setRefundReason,
	confirmRefund,
	refunding,
}) {
	if (!refundTarget) return null;
	return (
		<>
			<div
				className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40"
				onClick={onClose}
			/>
			<div className="fixed z-50 inset-0 flex items-center justify-center p-4">
				<div className="card p-6 max-w-sm w-full">
					<p className="font-bold text-lg text-navy-900 dark:text-white mb-2">
						{t("pos.refund")}
					</p>
					<p className="text-sm text-slate-500 mb-4">
						{t("pos.confirmRefund", { invoice: refundTarget.invoice_no })}
					</p>
					<label className="label">{t("pos.refundReason")}</label>
					<textarea
						className="input"
						rows={2}
						value={refundReason}
						onChange={(e) => setRefundReason(e.target.value)}
					/>
					<div className="flex items-center justify-end gap-2 mt-6">
						<button onClick={onClose} className="btn-ghost">
							{t("common.cancel")}
						</button>
						<button
							onClick={confirmRefund}
							disabled={refunding}
							className="btn-primary">
							{refunding ? t("common.loading") : t("pos.refund")}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
