import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Plus, Pencil, Trash2, Landmark } from 'lucide-react';

export default function CostCenterTreeNode({ node, depth = 0, onAddChild, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children?.length > 0;

  return (
    <div>
      <div className="group flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-800/50 transition-colors" style={{ paddingInlineStart: depth * 22 + 8 }}>
        <button onClick={() => setExpanded((e) => !e)} className={`p-0.5 ${hasChildren ? '' : 'opacity-0 pointer-events-none'}`}>
          <motion.span animate={{ rotate: expanded ? 90 : 0 }} className="inline-block"><ChevronRight size={14} /></motion.span>
        </button>
        <Landmark size={14} className="text-navy-500 shrink-0" />
        <span className="text-xs font-mono text-slate-400 w-16 shrink-0">{node.code}</span>
        <span className="text-sm font-medium truncate flex-1">{node.name_en} <span className="text-slate-400">/ {node.name_ar}</span></span>
        {!node.is_active && <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 shrink-0">inactive</span>}
        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
          <button onClick={() => onAddChild(node)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-navy-700 text-slate-500"><Plus size={14} /></button>
          <button onClick={() => onEdit(node)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-navy-700 text-slate-500"><Pencil size={14} /></button>
          <button onClick={() => onDelete(node)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-red-500"><Trash2 size={14} /></button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded && hasChildren && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            {node.children.map((child) => (
              <CostCenterTreeNode key={child.id} node={child} depth={depth + 1} onAddChild={onAddChild} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
