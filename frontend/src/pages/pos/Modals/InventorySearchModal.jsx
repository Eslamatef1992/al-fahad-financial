import { Search, X, Boxes } from "lucide-react";

const money = (n) => Number(n || 0).toFixed(3);

export default function InventorySearchModal({
	open,
	onClose,
	t,
	inventoryTab,
	setInventoryTab,
	query,
	setQuery,
	products,
	addToCart,
}) {
	if (!open) return null;
	return (
		<>
			<div
				className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40"
				onClick={onClose}
			/>
			<div className="fixed z-50 inset-0 flex items-center justify-center p-4">
				<div className="card p-4 max-w-4xl w-full max-h-[85vh] flex flex-col">
					<div className="flex items-center justify-between mb-3">
						<p className="font-bold text-navy-900 dark:text-white flex items-center gap-2">
							<Boxes size={16} />
							{t("pos.searchFullInventory")}
						</p>
						<button onClick={onClose}>
							<X size={18} />
						</button>
					</div>
					<div className="flex gap-1.5 mb-3">
						<button
							onClick={() => setInventoryTab("branch")}
							className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${inventoryTab === "branch" ? "bg-navy-900 text-white dark:bg-white dark:text-navy-900" : "bg-slate-100 dark:bg-navy-800 text-slate-500"}`}>
							{t("pos.tabBranchInventory")}
						</button>
						<button
							onClick={() => setInventoryTab("main")}
							className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${inventoryTab === "main" ? "bg-navy-900 text-white dark:bg-white dark:text-navy-900" : "bg-slate-100 dark:bg-navy-800 text-slate-500"}`}>
							{t("pos.tabMainInventory")}
						</button>
					</div>
					<div className="relative mb-3">
						<Search
							size={14}
							className="absolute top-1/2 -translate-y-1/2 start-2.5 text-slate-400"
						/>
						<input
							className="input !ps-8 text-sm"
							placeholder={t("pos.searchProducts")}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							autoFocus
						/>
					</div>
					<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5 overflow-y-auto pe-1">
						{products.map((p) => (
							<button
								key={p.id}
								onClick={() => addToCart(p)}
								disabled={Number(p.available_quantity) <= 0}
								className="card p-1.5 text-start hover:shadow-md transition-shadow disabled:opacity-40 disabled:cursor-not-allowed">
								<p className="font-semibold text-xs text-navy-900 dark:text-white truncate leading-tight">
									{p.name_en}
								</p>
								<p className="text-[10px] text-slate-400 truncate">{p.code}</p>
								<div className="flex items-center justify-between mt-1">
									<span className="font-bold text-xs text-navy-900 dark:text-white">
										{money(p.selling_price)}
									</span>
									<span
										className={`text-[9px] px-1 py-0.5 rounded-full ${Number(p.available_quantity) > 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
										{Number(p.available_quantity)} {t("pos.available")}
									</span>
								</div>
								{Number(p.booked_quantity) > 0 && (
									<p className="text-[9px] text-amber-500 mt-0.5">
										{Number(p.booked_quantity)} {t("items.booked")}
									</p>
								)}
							</button>
						))}
						{!products.length && (
							<p className="col-span-full text-center text-sm text-slate-400 py-8">
								{t("pos.noProducts")}
							</p>
						)}
					</div>
				</div>
			</div>
		</>
	);
}
