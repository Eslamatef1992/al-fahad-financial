import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
	Search,
	Plus,
	Minus,
	Trash2,
	ShoppingCart,
	PauseCircle,
	Lock,
	Unlock,
	CreditCard,
	Users,
	CalendarClock,
	RotateCcw,
	UserPlus,
	X,
	FileText,
	Boxes,
	Factory,
	Ticket,
	PieChart,
	Tag,
	History,
} from "lucide-react";
import api, { printFile } from "@/api/client";
import { useCompanyStore } from "@/store/companyStore";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import useFinancialDefaults from "@/hooks/useFinancialDefaults";
import InventorySearchModal from "./Modals/InventorySearchModal";
import HeldSalesModal from "./Modals/HeldSalesModal";
import DeliveryModal from "./Modals/DeliveryModal";
import ManufactureOrderModal from "./Modals/ManufactureOrderModal";
import CouponsModal from "./Modals/CouponsModal";
import PaymentModal from "./Modals/PaymentModal";
import CloseShiftModal from "./Modals/CloseShiftModal";
import NewClientModal from "./Modals/NewClientModal";
import HistoryModal from "./Modals/HistoryModal";
import RefundModal from "./Modals/RefundModal";
import InvoiceSuccessModal from "./Modals/InvoiceSuccessModal";

const money = (n) => Number(n || 0).toFixed(3);

// Icon on top in a colored rounded chip, label below. Each rail action gets
// its own accent color so the rail reads at a glance instead of being a wall
// of identical navy icons.
const RAIL_COLORS = {
	sky: "bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-400",
	violet:
		"bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
	rose: "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
	amber: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
	emerald:
		"bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
	indigo:
		"bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
	fuchsia:
		"bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950 dark:text-fuchsia-400",
	orange:
		"bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
	cyan: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400",
	slate: "bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-300",
};

function RailButton({ icon: Icon, label, onClick, badge, color = "slate" }) {
	return (
		<button
			onClick={onClick}
			className="relative card p-3 flex flex-col items-center justify-center gap-1.5 hover:shadow-md hover:-translate-y-0.5 transition-all text-center">
			<span
				className={`w-10 h-10 rounded-xl flex items-center justify-center ${RAIL_COLORS[color] || RAIL_COLORS.slate}`}>
				<Icon size={20} strokeWidth={2} />
			</span>
			<span className="text-[11px] font-semibold text-navy-900 dark:text-white leading-tight">
				{label}
			</span>
			{!!badge && (
				<span className="absolute top-1.5 end-1.5 bg-red-500 text-white text-[10px] leading-none rounded-full min-w-[18px] min-h-[18px] flex items-center justify-center px-1">
					{badge}
				</span>
			)}
		</button>
	);
}

export default function PosPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const activeCompany = useCompanyStore((s) => s.activeCompany);
	const financialDefaults = useFinancialDefaults();

	const [access, setAccess] = useState(null); // { level, posPermissions, shift }
	const [loadingAccess, setLoadingAccess] = useState(true);
	const [branches, setBranches] = useState([]);
	const [clients, setClients] = useState([]);
	const [manufacturers, setManufacturers] = useState([]);
	const [manufactureOrderOpen, setManufactureOrderOpen] = useState(false);
	const [isManufactureOrder, setIsManufactureOrder] = useState(false);
	const [manufacturerId, setManufacturerId] = useState("");

	const [openFloat, setOpenFloat] = useState("");
	const [openBranch, setOpenBranch] = useState("");

	const [query, setQuery] = useState("");
	const [products, setProducts] = useState([]);
	const [cart, setCart] = useState([]); // { item, quantity, unit_price }
	const [clientId, setClientId] = useState("");
	const [clientSearch, setClientSearch] = useState("");
	const [deliveryDate, setDeliveryDate] = useState("");
	const [deliveryAddress, setDeliveryAddress] = useState("");
	const [newClientOpen, setNewClientOpen] = useState(false);
	const [newClient, setNewClient] = useState({ name_en: "", phone: "" });
	const [savingClient, setSavingClient] = useState(false);
	const [held, setHeld] = useState([]);
	const [payOpen, setPayOpen] = useState(false);
	const [paying, setPaying] = useState(false);
	// Dynamic tender: one amount (+ optional reference) per active Payment
	// Setting Option, keyed by that method's id, plus Credit as its own
	// special case (settles into AR via credit-limit logic, not a GL account).
	const [paymentMethods, setPaymentMethods] = useState([]);
	const [tenderAmounts, setTenderAmounts] = useState({});
	const [tenderRefs, setTenderRefs] = useState({});
	const [creditAmount, setCreditAmount] = useState("");
	const [closeOpen, setCloseOpen] = useState(false);
	const [countedCash, setCountedCash] = useState("");
	const [voidTarget, setVoidTarget] = useState(null);
	const [completedInvoiceId, setCompletedInvoiceId] = useState(null);

	const [historyOpen, setHistoryOpen] = useState(false);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [historyRows, setHistoryRows] = useState([]);
	const [historyFilters, setHistoryFilters] = useState({
		date_from: "",
		date_to: "",
		q: "",
	});
	const [refundTarget, setRefundTarget] = useState(null);
	const [refundReason, setRefundReason] = useState("");
	const [refunding, setRefunding] = useState(false);

	// Redesigned rail: main area now shows the invoice line-items table instead
	// of a product grid. Items get added either by typing/scanning a code into
	// the always-visible box below, or via the Inventory icon's search popup.
	const [codeEntry, setCodeEntry] = useState("");
	const [codeSuggestions, setCodeSuggestions] = useState([]);
	const codeInputRef = useRef(null);
	const [inventoryOpen, setInventoryOpen] = useState(false);
	// 'branch' = only this shift's branch stock, 'main' = company-wide across
	// every branch. Defaults to the cashier's own branch since that's what
	// they're actually standing in front of.
	const [inventoryTab, setInventoryTab] = useState("branch");
	const [heldOpen, setHeldOpen] = useState(false);
	const [deliveryOpen, setDeliveryOpen] = useState(false);
	const [couponsOpen, setCouponsOpen] = useState(false);
	const [discountCodes, setDiscountCodes] = useState([]);
	const [discountCode, setDiscountCode] = useState("");
	const [discountPreview, setDiscountPreview] = useState(null);
	const [discountError, setDiscountError] = useState("");
	const [applyingDiscount, setApplyingDiscount] = useState(false);

	const loadAccess = () => {
		setLoadingAccess(true);
		api
			.get("/pos/me")
			.then((r) => setAccess(r.data))
			.finally(() => setLoadingAccess(false));
	};
	const loadHeld = () =>
		api
			.get("/pos/sales/held")
			.then((r) => setHeld(r.data))
			.catch(() => {});

	useEffect(() => {
		if (!activeCompany) return;
		loadAccess();
		api
			.get("/branches")
			.then((r) => setBranches(r.data))
			.catch(() => {});
		api
			.get("/clients")
			.then((r) => setClients(r.data))
			.catch(() => {});
		api
			.get("/manufacturers")
			.then((r) => setManufacturers(r.data))
			.catch(() => {});
		api
			.get("/payment-methods")
			.then((r) => setPaymentMethods(r.data))
			.catch(() => {});
		loadHeld();
	}, [activeCompany]);

	const branchScope =
		inventoryTab === "branch" ? access?.shift?.branch_id || null : null;

	useEffect(() => {
		if (!access?.shift) return;
		const handle = setTimeout(() => {
			const params = {
				...(query ? { q: query } : {}),
				...(branchScope ? { branch_id: branchScope } : {}),
			};
			api.get("/items", { params }).then((r) => {
				const sorted = [...r.data].sort((a, b) =>
					(a.code || "").localeCompare(b.code || "", undefined, {
						numeric: true,
					}),
				);
				setProducts(sorted.slice(0, 40));
			});
		}, 200);
		return () => clearTimeout(handle);
	}, [query, access?.shift, branchScope]);

	// Live suggestions for the quick code-entry box: matches by code, SKU or
	// name as soon as a couple of characters are typed, so the cashier can pick
	// from a list instead of needing the exact code and pressing Enter blind.
	useEffect(() => {
		if (!access?.shift || !codeEntry.trim()) {
			setCodeSuggestions([]);
			return;
		}
		const handle = setTimeout(() => {
			const params = {
				q: codeEntry.trim(),
				...(branchScope ? { branch_id: branchScope } : {}),
			};
			api
				.get("/items", { params })
				.then((r) =>
					setCodeSuggestions(
						r.data.filter((p) => Number(p.available_quantity) > 0).slice(0, 8),
					),
				)
				.catch(() => {});
		}, 150);
		return () => clearTimeout(handle);
	}, [codeEntry, access?.shift, branchScope]);

	const total = useMemo(
		() =>
			cart.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0),
		[cart],
	);
	const netTotal = discountPreview
		? Math.max(total - Number(discountPreview.discount_amount || 0), 0)
		: total;
	const canCredit =
		access?.level === "operator" ||
		access?.posPermissions?.includes("credit_sale");
	const canVoid =
		access?.level === "operator" || access?.posPermissions?.includes("void");
	const canRefund =
		access?.level === "operator" || access?.posPermissions?.includes("refund");

	const filteredClients = useMemo(() => {
		if (!clientSearch) return clients;
		const q = clientSearch.toLowerCase();
		return clients.filter(
			(c) =>
				c.name_en?.toLowerCase().includes(q) ||
				c.name_ar?.includes(q) ||
				c.phone?.includes(clientSearch),
		);
	}, [clients, clientSearch]);

	// Enter in the customer search box: pick the top match if there is one,
	// otherwise open the New Customer modal prefilled from what was typed —
	// digits go to Phone, anything else goes to Name (the other field stays
	// required so the cashier still fills it in before saving).
	const handleClientSearchKeyDown = (e) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		if (filteredClients.length) {
			pickClient(filteredClients[0].id);
			setClientSearch("");
			return;
		}
		const q = clientSearch.trim();
		if (!q) return;
		const isNumeric = /\d/.test(q) && /^[0-9+\-\s]+$/.test(q);
		setNewClient({ name_en: isNumeric ? "" : q, phone: isNumeric ? q : "" });
		setNewClientOpen(true);
	};

	const createQuickClient = async () => {
		if (!newClient.name_en.trim() || !newClient.phone.trim()) {
			toast.error(t("pos.quickClientRequired"));
			return;
		}
		setSavingClient(true);
		try {
			const { data } = await api.post("/clients", {
				name_en: newClient.name_en.trim(),
				name_ar: newClient.name_en.trim(),
				phone: newClient.phone.trim(),
				parent_account_id: financialDefaults.client_parent_account_id || null,
			});
			setClients((prev) => [...prev, data]);
			setClientId(data.id);
			setClientSearch("");
			setNewClient({ name_en: "", phone: "" });
			setNewClientOpen(false);
			toast.success(t("pos.customerAdded"));
		} catch (e) {
			/* toast handled globally */
		} finally {
			setSavingClient(false);
		}
	};

	const loadHistory = () => {
		setHistoryLoading(true);
		const params = {};
		if (historyFilters.date_from) params.date_from = historyFilters.date_from;
		if (historyFilters.date_to) params.date_to = historyFilters.date_to;
		if (historyFilters.q) params.q = historyFilters.q;
		api
			.get("/pos/sales/history", { params })
			.then((r) => setHistoryRows(r.data))
			.finally(() => setHistoryLoading(false));
	};
	const openHistory = () => {
		setHistoryOpen(true);
		loadHistory();
	};
	const todayStr = () => new Date().toISOString().slice(0, 10);
	const printHistoryInvoice = (row) => {
		if (row.date !== todayStr()) {
			toast.error(t("pos.printTodayOnly"));
			return;
		}
		printFile(`/invoices/${row.id}/pdf`, {});
	};

	const confirmRefund = async () => {
		setRefunding(true);
		try {
			await api.post(`/pos/sales/${refundTarget.id}/refund`, {
				reason: refundReason || undefined,
			});
			toast.success(t("pos.refunded"));
			setRefundTarget(null);
			setRefundReason("");
			loadHistory();
		} catch (e) {
			/* toast handled globally */
		} finally {
			setRefunding(false);
		}
	};

	const addToCart = (item) => {
		if (Number(item.available_quantity) <= 0)
			return toast.error(t("pos.outOfStock"));
		setCart((prev) => {
			const existing = prev.find((l) => l.item.id === item.id);
			if (existing) {
				if (Number(existing.quantity) + 1 > Number(item.available_quantity)) {
					toast.error(t("pos.outOfStock"));
					return prev;
				}
				return prev.map((l) =>
					l.item.id === item.id ? { ...l, quantity: l.quantity + 1 } : l,
				);
			}
			return [
				...prev,
				{ item, quantity: 1, unit_price: Number(item.selling_price || 0) },
			];
		});
	};
	const changeQty = (itemId, delta) => {
		setCart((prev) =>
			prev
				.map((l) => {
					if (l.item.id !== itemId) return l;
					const next = l.quantity + delta;
					if (next > Number(l.item.available_quantity)) {
						toast.error(t("pos.outOfStock"));
						return l;
					}
					return { ...l, quantity: next };
				})
				.filter((l) => l.quantity > 0),
		);
	};
	const removeLine = (itemId) =>
		setCart((prev) => prev.filter((l) => l.item.id !== itemId));
	const clearCart = () => {
		setCart([]);
		setClientId("");
		setDeliveryDate("");
		setDeliveryAddress("");
		setDiscountCode("");
		setDiscountPreview(null);
		setDiscountError("");
		setCodeEntry("");
		setIsManufactureOrder(false);
		setManufacturerId("");
	};
	// "Invoice" rail icon — starts a fresh blank sale.
	const newInvoice = () => clearCart();

	// Quick code/barcode entry: typed into the always-visible box above the
	// invoice table, or scanned. Looks for an exact code/sku match first (what
	// a barcode scan produces); falls back to the first search result so a
	// partial code still finds something.
	const addByCode = async () => {
		const code = codeEntry.trim();
		if (!code) return;
		try {
			const { data } = await api.get("/items", {
				params: { q: code, ...(branchScope ? { branch_id: branchScope } : {}) },
			});
			if (!data.length) {
				toast.error(t("pos.itemNotFound"));
				return;
			}
			const exact = data.find(
				(p) =>
					p.code?.toLowerCase() === code.toLowerCase() ||
					p.sku?.toLowerCase() === code.toLowerCase(),
			);
			addToCart(exact || data[0]);
			setCodeEntry("");
			setCodeSuggestions([]);
			// Keep the cursor in the code box so the cashier can immediately type
			// (or scan) the next item — Enter effectively "goes to a new line".
			setTimeout(() => codeInputRef.current?.focus(), 0);
		} catch (e) {
			/* toast handled globally */
		}
	};
	const pickSuggestion = (item) => {
		addToCart(item);
		setCodeEntry("");
		setCodeSuggestions([]);
		setTimeout(() => codeInputRef.current?.focus(), 0);
	};

	const loadDiscountCodes = () =>
		api
			.get("/discount-codes")
			.then((r) => setDiscountCodes(r.data))
			.catch(() => {});
	const applyDiscount = async (codeOverride) => {
		const code = (codeOverride || discountCode).trim().toUpperCase();
		if (!code) return;
		setApplyingDiscount(true);
		try {
			const { data } = await api.post("/discount-codes/preview", {
				code,
				base_amount: total,
				scope: "invoice",
			});
			setDiscountCode(code);
			setDiscountPreview(data);
			setDiscountError("");
			setCouponsOpen(false);
		} catch (err) {
			setDiscountPreview(null);
			setDiscountError(err.response?.data?.message || t("common.error"));
		} finally {
			setApplyingDiscount(false);
		}
	};
	const removeDiscount = () => {
		setDiscountCode("");
		setDiscountPreview(null);
		setDiscountError("");
	};

	// Picking a client prefills the delivery address from their record, but
	// never overwrites an address already typed for this sale.
	const pickClient = (id) => {
		const client = clients.find((c) => c.id === id);
		setClientId(id);
		setDeliveryAddress((prev) =>
			!prev && client?.address ? client.address : prev,
		);
	};

	const openShift = async () => {
		try {
			await api.post("/pos/shift/open", {
				branch_id: openBranch || null,
				opening_float: Number(openFloat || 0),
			});
			toast.success(t("pos.shiftOpened"));
			loadAccess();
		} catch (e) {
			/* toast handled globally */
		}
	};

	const doCloseShift = async () => {
		try {
			await api.post(`/pos/shift/${access.shift.id}/close`, {
				counted_cash: Number(countedCash || 0),
			});
			toast.success(t("pos.shiftClosed"));
			setCloseOpen(false);
			setCountedCash("");
			loadAccess();
		} catch (e) {
			/* toast handled globally */
		}
	};

	const buildLines = () =>
		cart.map((l) => ({
			account_id: l.item.income_account_id,
			item_id: l.item.id,
			description: l.item.name_en,
			quantity: l.quantity,
			unit_price: l.unit_price,
		}));

	const hold = async () => {
		if (!cart.length) return;
		try {
			await api.post("/pos/sales", {
				client_id: clientId || null,
				action: "hold",
				lines: buildLines(),
				delivery_date: deliveryDate || null,
				delivery_address: deliveryAddress || null,
				discount_code: discountCode || undefined,
				is_manufacture_order: isManufactureOrder,
				manufacturer_id: isManufactureOrder ? manufacturerId || null : null,
			});
			toast.success(t("pos.saleHeld"));
			clearCart();
			loadHeld();
		} catch (e) {
			/* toast handled globally */
		}
	};

	const resumeHeld = (sale) => {
		setCart(
			sale.lines.map((l) => ({
				item: {
					id: l.item_id,
					name_en: l.description,
					income_account_id: l.account_id,
					selling_price: l.unit_price,
					available_quantity: 999999,
				},
				quantity: Number(l.quantity),
				unit_price: Number(l.unit_price),
			})),
		);
		setClientId(sale.client_id || "");
		setDeliveryDate(sale.delivery_date || "");
		setDeliveryAddress(sale.delivery_address || "");
		voidHeldSilently(sale.id);
	};
	const voidHeldSilently = async (id) => {
		try {
			await api.post(`/pos/sales/${id}/void`);
			loadHeld();
		} catch (e) {}
	};

	const activePaymentMethods = paymentMethods.filter((pm) => pm.is_active);
	const tenderTotal =
		Object.values(tenderAmounts).reduce((s, v) => s + Number(v || 0), 0) +
		Number(creditAmount || 0);
	const resetTender = () => {
		setTenderAmounts({});
		setTenderRefs({});
		setCreditAmount("");
	};
	const submitPayment = async () => {
		if (Math.abs(tenderTotal - netTotal) > 0.001)
			return toast.error(t("pos.tenderMismatch"));
		setPaying(true);
		try {
			const payments = [];
			activePaymentMethods.forEach((pm) => {
				const amt = Number(tenderAmounts[pm.id] || 0);
				if (amt > 0)
					payments.push({
						method: pm.name_en,
						amount: amt,
						account_id: pm.account_id,
						payment_method_id: pm.id,
						reference: (tenderRefs[pm.id] || "").trim() || undefined,
					});
			});
			if (Number(creditAmount) > 0)
				payments.push({ method: "credit", amount: Number(creditAmount) });
			const { data } = await api.post("/pos/sales", {
				client_id: clientId || null,
				action: "complete",
				lines: buildLines(),
				payments,
				delivery_date: deliveryDate || null,
				delivery_address: deliveryAddress || null,
				discount_code: discountCode || undefined,
				is_manufacture_order: isManufactureOrder,
				manufacturer_id: isManufactureOrder ? manufacturerId || null : null,
			});
			toast.success(t("pos.saleCompleted"));
			setPayOpen(false);
			resetTender();
			clearCart();
			setCompletedInvoiceId(data.id);
		} catch (e) {
			/* toast handled globally */
		} finally {
			setPaying(false);
		}
	};

	const confirmVoid = async () => {
		try {
			await api.post(`/pos/sales/${voidTarget.id}/void`);
			toast.success(t("pos.saleVoided"));
			loadHeld();
		} catch (e) {
			/* toast handled globally */
		}
		setVoidTarget(null);
	};

	if (loadingAccess)
		return (
			<div className="p-8 text-center text-slate-400">
				{t("common.loading")}
			</div>
		);
	if (!access?.level) {
		return (
			<div>
				<PageHeader title={t("nav.pos")} />
				<div className="card p-8 text-center text-slate-500">
					{t("pos.noAccess")}
				</div>
			</div>
		);
	}

	if (!access.shift) {
		return (
			<div className="max-w-md mx-auto mt-10">
				<div className="card p-8 text-center">
					<div className="w-14 h-14 rounded-2xl bg-navy-900 text-white dark:bg-white dark:text-navy-900 flex items-center justify-center mx-auto mb-4">
						<Unlock size={24} />
					</div>
					<h2 className="font-bold text-lg text-navy-900 dark:text-white mb-1">
						{t("pos.openShiftTitle")}
					</h2>
					<p className="text-sm text-slate-500 mb-6">
						{t("pos.openShiftHint")}
					</p>
					<div className="space-y-3 text-start">
						<div>
							<label className="label">{t("common.branch")}</label>
							<select
								className="input"
								value={openBranch}
								onChange={(e) => setOpenBranch(e.target.value)}>
								<option value="">{t("common.select")}</option>
								{branches.map((b) => (
									<option key={b.id} value={b.id}>
										{b.name_en}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="label">{t("pos.openingFloat")}</label>
							<input
								type="number"
								step="0.001"
								className="input"
								value={openFloat}
								onChange={(e) => setOpenFloat(e.target.value)}
								placeholder="0.000"
							/>
						</div>
					</div>
					<button onClick={openShift} className="btn-primary w-full mt-6">
						{t("pos.openShift")}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div>
			<PageHeader
				title={t("nav.pos")}
				subtitle={t("pos.shiftInfo", {
					branch:
						branches.find((b) => b.id === access.shift.branch_id)?.name_en ||
						t("branches.unbranchedPool"),
					float: money(access.shift.opening_float),
				})}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-[1fr_120px] gap-3">
				{/* Invoice */}
				<div className="space-y-3 min-w-0">
					{/* Header strip: client, quick code entry, coupon, total, hold/pay */}
					<div className="card p-4 sm:p-5">
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
							<div className="rounded-xl border border-slate-100 dark:border-navy-800 p-3 bg-sky-50/40 dark:bg-sky-950/10">
								<div className="flex items-center justify-between mb-2">
									<label className="flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide">
										<Users size={13} />
										{t("common.client")}
									</label>
									{!clientId && (
										<button
											type="button"
											onClick={() => setNewClientOpen(true)}
											className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1 hover:underline">
											<UserPlus size={13} />
											{t("pos.newCustomer")}
										</button>
									)}
								</div>
								{clientId ? (
									<div className="flex items-center justify-between gap-2 input text-sm py-2">
										<span className="truncate">
											{clients.find((c) => c.id === clientId)?.name_en}
											{clients.find((c) => c.id === clientId)?.phone
												? ` — ${clients.find((c) => c.id === clientId).phone}`
												: ""}
										</span>
										<button
											type="button"
											onClick={() => {
												setClientId("");
												setClientSearch("");
											}}
											className="text-xs font-semibold text-slate-400 hover:text-red-500 shrink-0">
											{t("common.change")}
										</button>
									</div>
								) : (
									<div className="relative">
										<Search
											size={14}
											className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400"
										/>
										<input
											className="input !ps-8 text-sm py-2"
											placeholder={t("pos.searchCustomerHint")}
											value={clientSearch}
											onChange={(e) => setClientSearch(e.target.value)}
											onKeyDown={handleClientSearchKeyDown}
										/>
										{clientSearch.trim() && filteredClients.length > 0 && (
											<div className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-900 shadow-lg">
												{filteredClients.map((c, i) => (
													<button
														type="button"
														key={c.id}
														onClick={() => {
															pickClient(c.id);
															setClientSearch("");
														}}
														className={`w-full text-start px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors ${i === 0 ? "bg-slate-100 dark:bg-navy-800" : "hover:bg-slate-50 dark:hover:bg-navy-800"}`}>
														<span className="truncate">{c.name_en}</span>
														<span className="text-xs text-slate-400 shrink-0">
															{c.phone || "-"}
														</span>
													</button>
												))}
											</div>
										)}
										{clientSearch.trim() && filteredClients.length === 0 && (
											<div className="absolute z-10 mt-1 w-full rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
												<p className="text-xs text-amber-600">
													{t("pos.noMatchesCreateNew")}
												</p>
											</div>
										)}
									</div>
								)}
							</div>
							<div className="rounded-xl border border-slate-100 dark:border-navy-800 p-3 bg-violet-50/40 dark:bg-violet-950/10">
								<label className="flex items-center gap-1.5 text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide mb-2">
									<CalendarClock size={13} />
									{t("invoices.deliveryDate")}
								</label>
								<input
									type="date"
									min={todayStr()}
									className="input text-sm py-2"
									value={deliveryDate}
									onChange={(e) => setDeliveryDate(e.target.value)}
								/>
							</div>
							<div className="rounded-xl border border-slate-100 dark:border-navy-800 p-3 bg-indigo-50/40 dark:bg-indigo-950/10 sm:col-span-2">
								<label className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide mb-2">
									<FileText size={13} />
									{t("pos.quickAddByCode")}
								</label>
								<div className="relative">
									<Search
										size={14}
										className="absolute top-1/2 -translate-y-1/2 start-3 text-slate-400"
									/>
									<input
										ref={codeInputRef}
										autoFocus
										className="input !ps-8 text-sm py-2"
										placeholder={t("pos.quickAddByCodeHint")}
										value={codeEntry}
										onChange={(e) => setCodeEntry(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												addByCode();
											}
										}}
									/>
									{!!codeEntry.trim() && !!codeSuggestions.length && (
										<div className="absolute z-30 top-full mt-1 start-0 end-0 card p-1.5 max-h-56 overflow-y-auto shadow-lg">
											{codeSuggestions.map((p) => (
												<button
													key={p.id}
													onMouseDown={() => pickSuggestion(p)}
													disabled={Number(p.available_quantity) <= 0}
													className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-navy-900 text-start disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
													<div className="min-w-0">
														<p className="text-sm font-medium text-navy-900 dark:text-white truncate">
															{p.name_en}
														</p>
														<p className="text-[11px] text-slate-400">
															{p.code}
														</p>
													</div>
													<div className="text-end shrink-0">
														<p className="text-sm font-semibold text-navy-900 dark:text-white">
															{money(p.selling_price)}
														</p>
														<p className="text-[11px] text-slate-400">
															{Number(p.available_quantity)}{" "}
															{t("pos.available")}
														</p>
													</div>
												</button>
											))}
										</div>
									)}
								</div>

								{discountPreview ? (
									<div className="flex items-center justify-between mt-2 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950 rounded-lg px-2 py-1.5">
										<span className="flex items-center gap-1">
											<Tag size={12} />
											{discountPreview.code} —{" "}
											{t("invoices.discountAppliedAmount", {
												amount: money(discountPreview.discount_amount),
											})}
										</span>
										<button onClick={removeDiscount} className="text-red-500">
											<X size={13} />
										</button>
									</div>
								) : discountError ? (
									<p className="text-xs text-red-500 mt-2">{discountError}</p>
								) : null}
								{!!deliveryAddress && (
									<p className="flex items-start gap-1.5 mt-2 text-xs text-slate-500">
										<CalendarClock size={13} className="shrink-0 mt-0.5" />
										<span className="truncate">
											{deliveryDate ? `${deliveryDate} — ` : ""}
											{deliveryAddress}
										</span>
									</p>
								)}

								{isManufactureOrder && (
									<p className="flex items-center gap-1.5 mt-2 text-xs font-medium text-amber-600">
										<Factory size={13} className="shrink-0" />
										<span className="truncate">
											{t("pos.railManufactureOrder")}
											{manufacturerId
												? ` — ${manufacturers.find((m) => m.id === manufacturerId)?.name_en || ""}`
												: ""}
										</span>
									</p>
								)}
							</div>
						</div>

						<div className="flex-1 overflow-y-auto max-h-[45vh] mb-3 border border-slate-100 dark:border-navy-800 rounded-xl">
							<table className="w-full text-sm">
								<thead>
									<tr className="bg-slate-50 dark:bg-navy-900 text-[11px] uppercase tracking-wide text-slate-500 sticky top-0">
										<th className="text-start py-2.5 px-3 font-bold">
											{t("pos.colCode")}
										</th>
										<th className="text-start py-2.5 px-3 font-bold">
											{t("pos.colDescription")}
										</th>
										<th className="text-center py-2.5 px-3 font-bold">
											{t("pos.colQty")}
										</th>
										<th className="text-end py-2.5 px-3 font-bold">
											{t("pos.colPrice")}
										</th>
										<th className="text-end py-2.5 px-3 font-bold">
											{t("pos.colTotal")}
										</th>
										<th className="py-2.5 px-2"></th>
									</tr>
								</thead>
								<tbody>
									{cart.map((l) => (
										<tr
											key={l.item.id}
											className="border-t border-slate-100 dark:border-navy-800 hover:bg-slate-50/70 dark:hover:bg-navy-900/50 transition-colors">
											<td className="py-2 px-3 text-slate-400 whitespace-nowrap">
												{l.item.code}
											</td>
											<td className="py-2 px-3 min-w-0">
												<p className="truncate font-medium text-navy-900 dark:text-white leading-tight">
													{l.item.name_en}
												</p>
											</td>
											<td className="py-2 px-3">
												<div className="flex items-center gap-1 justify-center">
													<button
														onClick={() => changeQty(l.item.id, -1)}
														className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-navy-700 transition-colors">
														<Minus size={11} />
													</button>
													<span className="w-7 text-center font-semibold">
														{l.quantity}
													</span>
													<button
														onClick={() => changeQty(l.item.id, 1)}
														className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-navy-700 transition-colors">
														<Plus size={11} />
													</button>
												</div>
											</td>
											<td className="py-2 px-3 text-end whitespace-nowrap text-slate-500">
												{money(l.unit_price)}
											</td>
											<td className="py-2 px-3 text-end font-bold text-navy-900 dark:text-white whitespace-nowrap">
												{money(l.quantity * l.unit_price)}
											</td>
											<td className="py-2 px-2">
												<button
													onClick={() => removeLine(l.item.id)}
													className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-950 text-red-500 hover:bg-red-100 dark:hover:bg-red-900 transition-colors">
													<Trash2 size={13} />
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
							{!cart.length && (
								<div className="text-center py-12">
									<ShoppingCart
										size={28}
										className="mx-auto text-slate-300 dark:text-navy-700 mb-2"
									/>
									<p className="text-sm text-slate-400">{t("pos.emptyCart")}</p>
								</div>
							)}
						</div>

						<div className="flex flex-wrap items-center justify-between gap-3 pt-1">
							<div>
								{discountPreview && (
									<p className="text-xs text-slate-400 line-through">
										{money(total)}
									</p>
								)}
								<div className="flex items-baseline gap-2">
									<span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
										{t("common.total")}
									</span>
									<span className="font-extrabold text-2xl text-navy-900 dark:text-white">
										{money(netTotal)}
									</span>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<button
									onClick={hold}
									disabled={!cart.length}
									className="btn-ghost flex items-center justify-center gap-1.5 text-sm py-2.5 px-4 disabled:opacity-40">
									<PauseCircle size={16} />
									{t("pos.hold")}
								</button>
								<button
									onClick={() => setPayOpen(true)}
									disabled={!cart.length}
									className="btn-primary flex items-center justify-center gap-1.5 text-sm py-2.5 px-6 font-bold shadow-md hover:shadow-lg transition-shadow disabled:opacity-40">
									<CreditCard size={16} />
									{t("pos.pay")}
								</button>
							</div>
						</div>
					</div>
				</div>

				{/* Action rail */}
				<div className="grid grid-cols-3 lg:grid-cols-1 gap-2 content-start">
					<RailButton
						icon={FileText}
						label={t("pos.railInvoice")}
						onClick={newInvoice}
						color="sky"
					/>
					<RailButton
						icon={Boxes}
						label={t("pos.railInventory")}
						onClick={() => setInventoryOpen(true)}
						color="indigo"
					/>
					<RailButton
						icon={History}
						label={t("pos.invoiceHistory")}
						onClick={openHistory}
						color="cyan"
					/>
					{canRefund && (
						<RailButton
							icon={RotateCcw}
							label={t("pos.refund")}
							onClick={openHistory}
							color="rose"
						/>
					)}
					<RailButton
						icon={Lock}
						label={t("pos.closeShift")}
						onClick={() => setCloseOpen(true)}
						color="slate"
					/>
					<RailButton
						icon={PauseCircle}
						label={t("pos.railHoldInvoices")}
						onClick={() => setHeldOpen(true)}
						badge={held.length || null}
						color="amber"
					/>
					<RailButton
						icon={Factory}
						label={t("pos.railManufactureOrder")}
						onClick={() => setManufactureOrderOpen(true)}
						badge={isManufactureOrder ? "✓" : null}
						color="orange"
					/>
					<RailButton
						icon={CalendarClock}
						label={t("invoices.deliveryDate")}
						onClick={() => setDeliveryOpen(true)}
						color="violet"
					/>
					<RailButton
						icon={Ticket}
						label={t("pos.railCoupons")}
						onClick={() => {
							setCouponsOpen(true);
							loadDiscountCodes();
						}}
						color="fuchsia"
					/>
					<RailButton
						icon={PieChart}
						label={t("nav.reports")}
						onClick={() => navigate("/reports")}
						color="emerald"
					/>
				</div>
			</div>
			<InventorySearchModal
				open={inventoryOpen}
				onClose={() => setInventoryOpen(false)}
				t={t}
				inventoryTab={inventoryTab}
				setInventoryTab={setInventoryTab}
				query={query}
				setQuery={setQuery}
				products={products}
				addToCart={addToCart}
			/>
			<HeldSalesModal
				open={heldOpen}
				onClose={() => setHeldOpen(false)}
				t={t}
				held={held}
				canVoid={canVoid}
				resumeHeld={resumeHeld}
				setVoidTarget={setVoidTarget}
			/>
			<DeliveryModal
				open={deliveryOpen}
				onClose={() => setDeliveryOpen(false)}
				t={t}
				deliveryDate={deliveryDate}
				setDeliveryDate={setDeliveryDate}
				deliveryAddress={deliveryAddress}
				setDeliveryAddress={setDeliveryAddress}
				todayStr={todayStr}
			/>
			<ManufactureOrderModal
				open={manufactureOrderOpen}
				onClose={() => setManufactureOrderOpen(false)}
				t={t}
				isManufactureOrder={isManufactureOrder}
				setIsManufactureOrder={setIsManufactureOrder}
				manufacturerId={manufacturerId}
				setManufacturerId={setManufacturerId}
				manufacturers={manufacturers}
			/>
			<CouponsModal
				open={couponsOpen}
				onClose={() => setCouponsOpen(false)}
				t={t}
				discountCode={discountCode}
				setDiscountCode={setDiscountCode}
				applyDiscount={applyDiscount}
				applyingDiscount={applyingDiscount}
				discountError={discountError}
				discountCodes={discountCodes}
			/>
			<PaymentModal
				open={payOpen}
				onClose={() => setPayOpen(false)}
				t={t}
				netTotal={netTotal}
				activePaymentMethods={activePaymentMethods}
				tenderAmounts={tenderAmounts}
				setTenderAmounts={setTenderAmounts}
				tenderRefs={tenderRefs}
				setTenderRefs={setTenderRefs}
				canCredit={canCredit}
				creditAmount={creditAmount}
				setCreditAmount={setCreditAmount}
				clientId={clientId}
				tenderTotal={tenderTotal}
				paying={paying}
				submitPayment={submitPayment}
			/>
			<CloseShiftModal
				open={closeOpen}
				onClose={() => setCloseOpen(false)}
				t={t}
				countedCash={countedCash}
				setCountedCash={setCountedCash}
				doCloseShift={doCloseShift}
			/>
			<ConfirmDialog
				open={!!voidTarget}
				onCancel={() => setVoidTarget(null)}
				onConfirm={confirmVoid}
				message={t("pos.confirmVoid")}
				confirmLabel={t("pos.void")}
			/>
			<NewClientModal
				open={newClientOpen}
				onClose={() => setNewClientOpen(false)}
				t={t}
				newClient={newClient}
				setNewClient={setNewClient}
				savingClient={savingClient}
				createQuickClient={createQuickClient}
			/>
			<HistoryModal
				open={historyOpen}
				onClose={() => setHistoryOpen(false)}
				t={t}
				historyFilters={historyFilters}
				setHistoryFilters={setHistoryFilters}
				loadHistory={loadHistory}
				historyLoading={historyLoading}
				historyRows={historyRows}
				canRefund={canRefund}
				printHistoryInvoice={printHistoryInvoice}
				setRefundTarget={setRefundTarget}
				todayStr={todayStr}
			/>
			<RefundModal
				refundTarget={refundTarget}
				onClose={() => setRefundTarget(null)}
				t={t}
				refundReason={refundReason}
				setRefundReason={setRefundReason}
				confirmRefund={confirmRefund}
				refunding={refunding}
			/>
			<InvoiceSuccessModal
				invoiceId={completedInvoiceId}
				onClose={() => setCompletedInvoiceId(null)}
				t={t}
				activeCompany={activeCompany}
			/>
		</div>
	);
}
