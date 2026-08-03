import { useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { fmt, firstOfMonth, good, inRange, targetFor, today } from '../factoryUtils.js';

export default function PayrollPanel({ data, settings, role }) {
  const [start, setStart] = useState(firstOfMonth());
  const [end, setEnd] = useState(today());
  const editable = role !== 'owner';

  const rows = useMemo(() => data.employees.items.map((emp) => {
    const recs = data.production.items.filter((r) => r.employee === emp.name && inRange(r.date, start, end));
    const dayRecs = recs.filter((r) => r.shift === 'Day');
    const nightRecs = recs.filter((r) => r.shift === 'Night');
    const payFor = (r) => {
      const g = good(r);
      const base = g * (Number(emp.rate) || 0);
      const target = targetFor(r.product, data.products.items);
      const bonus = g > target ? (g - target) * settings.bonusRate : 0;
      return base + bonus;
    };
    const cartonsDay = dayRecs.reduce((s, r) => s + good(r), 0);
    const cartonsNight = nightRecs.reduce((s, r) => s + good(r), 0);
    const payDay = dayRecs.reduce((s, r) => s + payFor(r), 0);
    const payNight = nightRecs.reduce((s, r) => s + payFor(r), 0);
    const totalGross = payDay + payNight;
    const advRec = data.advances.items.find((a) => a.employee === emp.name && a.start === start && a.end === end);
    const advance = advRec ? Number(advRec.amount) || 0 : 0;
    return { emp, cartonsDay, cartonsNight, payDay, payNight, totalGross, advance, advRec, net: totalGross - advance };
  }), [data.advances.items, data.employees.items, data.products.items, data.production.items, end, settings.bonusRate, start]);

  const setAdvance = (row, val) => {
    const amount = Number(val) || 0;
    if (row.advRec) data.advances.update(row.advRec.id, { amount });
    else data.advances.add({ employee: row.emp.name, start, end, amount });
  };

  const totals = useMemo(() => rows.reduce((s, r) => ({ gross: s.gross + r.totalGross, adv: s.adv + r.advance, net: s.net + r.net }), { gross: 0, adv: 0, net: 0 }), [rows]);

  return (
    <div className="panel">
      <div className="panel-head"><Wallet size={19} /><h2>Payroll Summary</h2></div>
      <div className="period-row">
        <label>Period Start <input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>Period End <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th><th>Dept</th><th>Cartons (Day)</th><th>Cartons (Night)</th>
              <th>Pay Day</th><th>Pay Night</th><th>Total Gross</th><th>Advance</th><th>Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td className="empty" colSpan={9}>Add employees first.</td></tr>}
            {rows.map((r) => (
              <tr key={r.emp.id}>
                <td>{r.emp.name}</td><td>{r.emp.dept}</td>
                <td>{fmt(r.cartonsDay)}</td><td>{fmt(r.cartonsNight)}</td>
                <td>{fmt(r.payDay)}</td><td>{fmt(r.payNight)}</td>
                <td><b>{fmt(r.totalGross)}</b></td>
                <td>{editable ? <input className="cell-input" type="number" value={r.advance || ""} onChange={(e) => setAdvance(r, e.target.value)} /> : fmt(r.advance)}</td>
                <td><b>{fmt(r.net)}</b></td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr><td colSpan={6}><b>Totals</b></td><td><b>{fmt(totals.gross)}</b></td><td><b>{fmt(totals.adv)}</b></td><td><b>{fmt(totals.net)}</b></td></tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
