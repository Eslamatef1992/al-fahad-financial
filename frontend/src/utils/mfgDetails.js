// Shared formatter for made-to-order line details ({ size, height, color, notes }).
export function mfgDetailParts(d, isAr = false) {
  if (!d) return [];
  const lab = isAr ? { size: 'المقاس', height: 'الارتفاع', color: 'اللون', notes: 'تفاصيل إضافية' } : { size: 'Size', height: 'Height', color: 'Color', notes: 'Extra details' };
  return ['size', 'height', 'color', 'notes'].filter((k) => d[k]).map((k) => `${lab[k]}: ${d[k]}`);
}
