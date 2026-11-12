export default function CloseShiftModal({
	open,
	onClose,
	t,
	countedCash,
	setCountedCash,
	doCloseShift,
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
					<p className="font-bold text-lg text-navy-900 dark:text-white mb-4">
						{t("pos.closeShift")}
					</p>
					<label className="label">{t("pos.countedCash")}</label>
					<input
						type="number"
						step="0.001"
						className="input"
						value={countedCash}
						onChange={(e) => setCountedCash(e.target.value)}
					/>
					<div className="flex items-center justify-end gap-2 mt-6">
						<button onClick={onClose} className="btn-ghost">
							{t("common.cancel")}
						</button>
						<button onClick={doCloseShift} className="btn-primary">
							{t("pos.closeShift")}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
