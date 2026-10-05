import { PauseCircle, X, XCircle } from "lucide-react";

const money = (n) => Number(n || 0).toFixed(3);

export default function HeldSalesModal({
	open,
	onClose,
	t,
	held,
	canVoid,
	resumeHeld,
	setVoidTarget,
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
							<PauseCircle size={16} />
							{t("pos.heldSales")}
						</p>
						<button onClick={onClose}>
							<X size={18} />
						</button>
					</div>
					<div className="space-y-1.5 overflow-y-auto">
						{held.map((h) => (
							<div
								key={h.id}
								className="flex items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-lg px-3 py-2 text-sm">
								<button
									onClick={() => {
										resumeHeld(h);
										onClose();
									}}
									className="font-medium hover:underline text-start">
									{h.invoice_no} — {money(h.total)}
								</button>
								{canVoid && (
									<button onClick={() => setVoidTarget(h)}>
										<XCircle size={14} />
									</button>
								)}
							</div>
						))}
						{!held.length && (
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
