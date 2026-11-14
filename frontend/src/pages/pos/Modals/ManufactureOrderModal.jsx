import { useEffect, useMemo, useRef } from "react";
import { Factory, Paperclip, Upload, X, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { fileUrl } from "@/api/client";

const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];

export default function ManufactureOrderModal({
	open,
	onClose,
	t,
	isManufactureOrder,
	setIsManufactureOrder,
	manufacturerId,
	setManufacturerId,
	manufacturers,
	attachFiles = [],
	setAttachFiles = () => {},
	savedAttachments = [],
	setSavedAttachments = () => {},
}) {
	const inputRef = useRef(null);
	// Object-URL previews for the freshly picked files (revoked when they change).
	const previews = useMemo(
		() => attachFiles.map((f) => ({ file: f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null })),
		[attachFiles],
	);
	useEffect(() => () => previews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previews]);

	if (!open) return null;

	const onPick = (e) => {
		const picked = Array.from(e.target.files || []);
		e.target.value = "";
		const good = [];
		for (const f of picked) {
			if (!OK_TYPES.includes(f.type)) {
				toast.error(`${f.name}: ${t("pos.attachBadType", { defaultValue: "only images (PNG/JPG/WEBP) or PDF are allowed" })}`);
			} else if (f.size > MAX_BYTES) {
				toast.error(`${f.name}: ${t("pos.attachTooBig", { defaultValue: "larger than 10 MB" })}`);
			} else good.push(f);
		}
		const room = MAX_FILES - attachFiles.length - savedAttachments.length;
		if (good.length > room) toast.error(t("pos.attachMax", { defaultValue: "Maximum 10 files per sale" }));
		setAttachFiles([...attachFiles, ...good.slice(0, Math.max(room, 0))]);
	};

	return (
		<>
			<div className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm z-40" onClick={onClose} />
			<div className="fixed z-50 inset-0 flex items-center justify-center p-4">
				<div className="card p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
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
						<div className="space-y-4">
							<div>
								<label className="label">{t("nav.manufacturers")}</label>
								<select className="input" value={manufacturerId} onChange={(e) => setManufacturerId(e.target.value)}>
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

							<div>
								<label className="label !flex items-center gap-1.5">
									<Paperclip size={13} />
									{t("pos.attachments", { defaultValue: "Photos / attachments" })}
								</label>
								<input ref={inputRef} type="file" multiple accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf" className="hidden" onChange={onPick} />
								<button
									type="button"
									onClick={() => inputRef.current?.click()}
									className="w-full rounded-2xl border-2 border-dashed border-slate-200 dark:border-navy-700 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors py-5 flex flex-col items-center gap-1.5 text-sm text-slate-500">
									<Upload size={20} className="text-indigo-500" />
									{t("pos.attachPick", { defaultValue: "Choose files from this computer" })}
									<span className="text-[11px] text-slate-400">
										{t("pos.attachHint", { defaultValue: "PNG, JPG, WEBP or PDF · up to 10 files · 10 MB each" })}
									</span>
								</button>

								{(savedAttachments.length > 0 || previews.length > 0) && (
									<div className="grid grid-cols-3 gap-2 mt-3">
										{savedAttachments.map((a, i) => (
											<div key={a.url} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 dark:border-navy-800 bg-slate-50 dark:bg-navy-800/40 flex items-center justify-center">
												{/\.pdf$/i.test(a.url) ? <FileText size={26} className="text-slate-400" /> : <img src={fileUrl(a.url)} alt="" className="w-full h-full object-cover" />}
												<button
													type="button"
													onClick={() => setSavedAttachments(savedAttachments.filter((_, j) => j !== i))}
													className="absolute top-1 end-1 w-5 h-5 rounded-full bg-white/90 text-red-500 flex items-center justify-center shadow">
													<X size={12} />
												</button>
											</div>
										))}
										{previews.map((p, i) => (
											<div key={`${p.file.name}-${i}`} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 dark:border-navy-800 bg-slate-50 dark:bg-navy-800/40 flex items-center justify-center">
												{p.url ? <img src={p.url} alt="" className="w-full h-full object-cover" /> : (
													<div className="text-center px-1"><FileText size={24} className="mx-auto text-slate-400" /><p className="text-[10px] text-slate-500 truncate">{p.file.name}</p></div>
												)}
												<button
													type="button"
													onClick={() => setAttachFiles(attachFiles.filter((_, j) => j !== i))}
													className="absolute top-1 end-1 w-5 h-5 rounded-full bg-white/90 text-red-500 flex items-center justify-center shadow">
													<X size={12} />
												</button>
											</div>
										))}
									</div>
								)}
							</div>
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
