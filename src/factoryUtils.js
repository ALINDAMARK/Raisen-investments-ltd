export const fmt = (n) => {
  const v = Number(n);
  if (!isFinite(v)) return '0';
  return v.toLocaleString('en-UG', { maximumFractionDigits: 0 });
};

export const today = () => new Date().toISOString().slice(0, 10);
export const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const inRange = (date, start, end) => (!start || date >= start) && (!end || date <= end);
export const good = (r) => Math.max(0, (Number(r.cartonsMade) || 0) - (Number(r.rejects) || 0));
export const targetFor = (productName, products) => {
  const p = (products || []).find((x) => x.name === productName);
  return p ? Number(p.target) || 0 : 0;
};
export const repaidFor = (ref, repayments) => (repayments || []).filter((r) => r.reference === ref).reduce((s, r) => s + (Number(r.amount) || 0), 0);
export const invoiceTotal = (inv) => {
  const sub = (inv.items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  const vat = inv.vatAmount || 0;
  return sub + vat;
};
export const stockBalance = (material, data) => {
  const received = data.grn.items.filter((g) => g.material === material.name).reduce((s, g) => s + (Number(g.qty) || 0), 0);
  const issued = data.materialIssue.items.filter((m) => m.material === material.name).reduce((s, m) => s + (Number(m.qty) || 0), 0);
  return (Number(material.opening) || 0) + received - issued;
};
