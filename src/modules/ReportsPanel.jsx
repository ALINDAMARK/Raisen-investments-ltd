import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { fmt, good, inRange, invoiceTotal, targetFor, today, firstOfMonth } from '../factoryUtils.js';

export default function ReportsPanel({ data, settings }) {
  const [start, setStart] = useState(firstOfMonth());
  const [end, setEnd] = useState(today());

  const salesRevenue = data.sales.items.filter((s) => inRange(s.date, start, end)).reduce((s, inv) => s + invoiceTotal(inv), 0);
  const wages = data.production.items.filter((r) => inRange(r.date, start, end)).reduce((s, r) => {
    const emp = data.employees.items.find((e) => e.name === r.employee);
    const g = good(r);
    const base = g * (emp ? Number(emp.rate) || 0 : 0);
    const target = targetFor(r.product, data.products.items);
    const bonus = g > target ? (g - target) * settings.bonusRate : 0;
    return s + base + bonus;
  }, 0);
  const rmCost = data.materialIssue.items.filter((m) => inRange(m.date, start, end)).reduce((s, m) => {
    const mat = data.rawMaterials.items.find((x) => x.name === m.material);
    return s + (Number(m.qty) || 0) * (mat ? Number(mat.unitCost) || 0 : 0);
  }, 0);
  const expenses = data.expenses.items.filter((e) => inRange(e.date, start, end)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const net = salesRevenue - wages - rmCost - expenses;

  const Row = ({ label, value, bold }) => (
    <div className={`pl-row${bold ? ' pl-bold' : ''}`}><span>{label}</span><span>{fmt(value)}</span></div>
  );

  return (
    <div className="panel">
      <div className="panel-head"><BarChart3 size={19} /><h2>Profit &amp; Loss</h2></div>
      <div className="period-row">
        <label>Start <input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>End <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <div className="pl-box">
        <Row label="Sales Revenue" value={salesRevenue} />
        <Row label="Less: Direct Labor (Wages incl. bonus)" value={-wages} />
        <Row label="Less: Raw Materials Used" value={-rmCost} />
        <Row label="Less: Operating Expenses" value={-expenses} />
        <Row label="NET PROFIT / (LOSS)" value={net} bold />
      </div>
    </div>
  );
}
