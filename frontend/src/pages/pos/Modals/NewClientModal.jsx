import { UserPlus, X } from "lucide-react";

export default function NewClientModal({
	open,
	onClose,
	t,
	newClient,
	setNewClient,
	savingClient,
	createQuickClient,
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
					<div className="flex items-center justify-between mb-4">
						<p className="font-bold text-lg text-navy-900 dark:text-white flex items-center gap-2">
							<UserPlus size={18} />
							{t("pos.newCustomer")}
						</p>
						<button onClick={onClose}>
							<X size={18} />
						</button>
					</div>
					<div className="space-y-3">
						<div>
							<label className="label">{t("common.nameEn")}</label>
							<input
								className="input"
								value={newClient.name_en}
								onChange={(e) =>
									setNewClient({ ...newClient, name_en: e.target.value })
								}
							/>
						</div>
						<div>
							<label className="label">{t("common.phone")}</label>
							<input
								className="input"
								value={newClient.phone}
								onChange={(e) =>
									setNewClient({ ...newClient, phone: e.target.value })
								}
								placeholder={t("pos.phoneRequiredHint")}
							/>
						</div>
					</div>
					<div className="flex items-center justify-end gap-2 mt-6">
						<button onClick={onClose} className="btn-ghost">
							{t("common.cancel")}
						</button>
						<button
							onClick={createQuickClient}
							disabled={savingClient}
							className="btn-primary">
							{savingClient ? t("common.loading") : t("common.save")}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
