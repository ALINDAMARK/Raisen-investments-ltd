import { AlertTriangle, CheckCircle2, LayoutDashboard, Wrench } from 'lucide-react';
import { fmt, good, invoiceTotal, repaidFor, stockBalance, targetFor, today } from '../factoryUtils.js';

export default function DashboardPanel({ data, settings }) {
  const t = today();
  const todaysProduction = data.production.items.filter((r) => r.date === t);
  const todaysAttendance = data.attendance.items.filter((a) => a.date === t && a.status === 'Present');
  const todaysInvoices = data.sales.items.filter((s) => s.date === t);

  const payFor = (r, emp) => {
    const g = good(r);
    const rate = emp ? Number(emp.rate) || 0 : 0;
    const target = targetFor(r.product, data.products.items);
    const bonus = g > target ? (g - target) * settings.bonusRate : 0;
    return g * rate + bonus;
  };

  const empByName = Object.fromEntries(data.employees.items.map((e) => [e.name, e]));
  const stats = {
    todaysGood: todaysProduction.reduce((s, r) => s + good(r), 0),
    todaysWages: todaysProduction.reduce((s, r) => s + payFor(r, empByName[r.employee]), 0),
    presentToday: todaysAttendance.length,
    todaysSales: todaysInvoices.reduce((s, inv) => s + invoiceTotal(inv), 0),
    todaysExpenses: data.expenses.items.filter((e) => e.date === t).reduce((s, e) => s + (Number(e.amount) || 0), 0),
    cashBalance: data.cashbook.items.reduce((s, c) => s + (c.type === 'In' ? Number(c.amount) || 0 : -(Number(c.amount) || 0)), 0),
    loansPayableBalance: data.loans.items.filter((l) => l.type === 'We Owe (Payable)').reduce((s, l) => s + Math.max(0, (Number(l.principal) || 0) - repaidFor(l.reference, data.loanRepayments.items)), 0),
    payablesBalance: data.payables.items.reduce((s, p) => s + Math.max(0, (Number(p.amount) || 0) - (Number(p.amountPaid) || 0)), 0),
    lowStock: data.rawMaterials.items.filter((m) => stockBalance(m, data) < (Number(m.minStock) || 0)),
    machinesDown: data.machines.items.filter((m) => m.status !== 'Running'),
  };

  const Card = ({ label, value, accent }) => (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );

  return (
    <div className="panel">
      <div className="panel-head"><LayoutDashboard size={19} /><h2>Today's Snapshot — {t}</h2></div>
      <div className="stat-grid">
        <Card label="Cartons Produced Today" value={fmt(stats.todaysGood)} />
        <Card label="Wages Today (UGX)" value={fmt(stats.todaysWages)} accent="#1F4E78" />
        <Card label="Employees Present" value={stats.presentToday} />
        <Card label="Sales Today (UGX)" value={fmt(stats.todaysSales)} accent="#2E7D32" />
        <Card label="Expenses Today (UGX)" value={fmt(stats.todaysExpenses)} accent="#B3261E" />
        <Card label="Cash Balance (UGX)" value={fmt(stats.cashBalance)} accent={stats.cashBalance < 0 ? '#B3261E' : '#2E7D32'} />
        <Card label="Loans Owed (UGX)" value={fmt(stats.loansPayableBalance)} accent={stats.loansPayableBalance > 0 ? '#B3261E' : '#2E7D32'} />
        <Card label="Bills Owed to Suppliers (UGX)" value={fmt(stats.payablesBalance)} accent={stats.payablesBalance > 0 ? '#B3261E' : '#2E7D32'} />
      </div>

      <div className="dash-alerts">
        {stats.lowStock.length > 0 && (
          <div className="alert alert-warn">
            <AlertTriangle size={16} />
            <span><b>{stats.lowStock.length}</b> raw material{stats.lowStock.length > 1 ? 's' : ''} below reorder level: {stats.lowStock.map((m) => m.name).join(', ')}</span>
          </div>
        )}
        {stats.machinesDown.length > 0 && (
          <div className="alert alert-warn">
            <Wrench size={16} />
            <span><b>{stats.machinesDown.length}</b> machine{stats.machinesDown.length > 1 ? 's' : ''} not running: {stats.machinesDown.map((m) => m.name).join(', ')}</span>
          </div>
        )}
        {stats.lowStock.length === 0 && stats.machinesDown.length === 0 && (
          <div className="alert alert-ok"><CheckCircle2 size={16} /><span>Stock levels and machines all look normal.</span></div>
        )}
      </div>
    </div>
  );
}
