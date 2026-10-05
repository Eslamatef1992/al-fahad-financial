import { Factory } from "lucide-react";

export default function ManufactureOrderModal({
	open,
	onClose,
	t,
	isManufactureOrder,
	setIsManufactureOrder,
	manufacturerId,
	setManufacturerId,
	manufacturers,
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
						<Factory size={18} />
						{t("pos.railManufactureOrder")}
					</p>
					<label className="flex items-center gap-2 text-sm text-navy-900 dark:text-white mb-3 cursor-pointer">
						<input
							type="checkbox"
							className="rounded"
							checked={isManufactureOrder}
							onChange={(e) => setIsManufactureOrder(e.target.checked)}
						/>
						{t("pos.manufactureOrderCheckbox")}
					</label>
					{isManufactureOrder && (
						<div>
							<label className="label">{t("nav.manufacturers")}</label>
							<select
								className="input"
								value={manufacturerId}
								onChange={(e) => setManufacturerId(e.target.value)}>
								<option value="">{t("common.select")}</option>
								{manufacturers
									.filter((m) => m.is_active)
									.map((m) => (
										<option key={m.id} value={m.id}>
											{m.name_en}
										</option>
									))}
							</select>
						</div>
					)}
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
