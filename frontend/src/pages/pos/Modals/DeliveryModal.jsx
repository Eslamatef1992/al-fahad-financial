import { CalendarClock } from "lucide-react";

export default function DeliveryModal({
	open,
	onClose,
	t,
	deliveryDate,
	setDeliveryDate,
	deliveryAddress,
	setDeliveryAddress,
	todayStr,
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
					<p className="font-bold text-lg text-navy-900 dark:text-white mb-4 flex items-center gap-2">
						<CalendarClock size={18} />
						{t("invoices.deliveryDate")}
					</p>
					<label className="label">{t("invoices.deliveryDate")}</label>
					<input
						type="date"
						min={todayStr()}
						className="input mb-3"
						value={deliveryDate}
						onChange={(e) => setDeliveryDate(e.target.value)}
					/>
					<label className="label">{t("invoices.deliveryAddress")}</label>
					<textarea
						className="input"
						rows={3}
						value={deliveryAddress}
						onChange={(e) => setDeliveryAddress(e.target.value)}
						placeholder={t("invoices.deliveryAddressHint")}
					/>
					<div className="flex items-center justify-end gap-2 mt-6">
						<button onClick={onClose} className="btn-primary">
							{t("common.done")}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
