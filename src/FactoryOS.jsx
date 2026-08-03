import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LayoutDashboard, Users, Factory, Wrench, Truck, Receipt, FileText, Package,
  Wallet, Settings as SettingsIcon, LogOut, Plus, Trash2, Printer,
  AlertTriangle, CheckCircle2, Boxes, Building2, ClipboardCheck, ArrowLeftRight,
  BarChart3, X, Menu, Download
} from "lucide-react";
import { fmt, today, firstOfMonth, uid, inRange, good, targetFor, repaidFor, invoiceTotal, stockBalance } from "./factoryUtils.js";
import FormField from "./components/FormField.jsx";
import EntityTable from "./components/EntityTable.jsx";
import LoginCard from "./components/LoginCard.jsx";
import SettingsPanel from "./modules/SettingsPanel.jsx";
import DashboardPanel from "./modules/DashboardPanel.jsx";
import ReportsPanel from "./modules/ReportsPanel.jsx";
import SalesPanel from "./modules/SalesPanel.jsx";
import ProductionPanel from "./modules/ProductionPanel.jsx";
import MachinesPanel from "./modules/MachinesPanel.jsx";
import StoresPanel from "./modules/StoresPanel.jsx";
import LoansPanel from "./modules/LoansPanel.jsx";
import PayrollPanel from "./modules/PayrollPanel.jsx";

export { fmt, inRange, good, targetFor, repaidFor } from "./factoryUtils.js";

const DEFAULT_SETTINGS = {
  companyName: "Raisen Investments Ltd", companyAddress: "", companyPhone: "", companyTin: "",
  bonusRate: 1000,
  vatRegistered: false, vatRate: 18,
  invoiceCounter: 0, deliveryCounter: 0, dispatchCounter: 0, receiptCounter: 0,
};

const AUTH_TOKEN_KEY = "raisen.auth.token";
const LOCAL_DATA_PREFIX = "raisen.local.";

const hasWindow = typeof window !== "undefined";
const storedToken = () => {
  if (!hasWindow) return null;
  try { return window.localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; }
};
const saveToken = (token) => {
  if (!hasWindow) return;
  try {
    if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    else window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore localStorage failures
  }
};
const localDataKey = (key) => `${LOCAL_DATA_PREFIX}${key}`;
const apiRequest = async (path, options = {}) => {
  const token = storedToken();
  const headers = { ...(options.headers || {}) };
  if (!headers["Content-Type"] && options.body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!response.ok) {
    throw new Error((data && data.error) || `Request failed (${response.status})`);
  }
  return data;
};

if (hasWindow && !window.storage) {
  window.storage = {
    async get(key) {
      const localValue = (() => {
        try { return window.localStorage.getItem(localDataKey(key)); } catch { return null; }
      })();

      if (storedToken()) {
        try {
          const data = await apiRequest(`/api/store/${encodeURIComponent(key)}`);
          if ((data?.value === null || data?.value === undefined) && localValue) {
            await apiRequest(`/api/store/${encodeURIComponent(key)}`, {
              method: "PUT",
              body: JSON.stringify({ value: localValue }),
            });
            return { value: localValue };
          }
          return data;
        } catch {
          // fall back to local storage if the API is unavailable
        }
      }

      return localValue === null ? null : { value: localValue };
    },
    async set(key, value) {
      try {
        window.localStorage.setItem(localDataKey(key), value);
      } catch {
        // ignore localStorage failures
      }
      if (storedToken()) {
        await apiRequest(`/api/store/${encodeURIComponent(key)}`, {
          method: "PUT",
          body: JSON.stringify({ value }),
        });
      }
    },
  };

  window.factoryAuth = {
    async login({ name, role, password }) {
      const data = await apiRequest(`/api/auth/login`, {
        method: "POST",
        body: JSON.stringify({ name, role, password }),
      });
      saveToken(data.token);
      return data;
    },
    async me() {
      return apiRequest(`/api/auth/me`);
    },
    logout() {
      saveToken(null);
    },
    token() {
      return storedToken();
    },
  };
}

/* ---------------------------------------------------------------- *
 *  storage hooks - shared so the whole factory & the bosses see one
 *  live dataset from wherever they open this
 * ---------------------------------------------------------------- */
function useCollection(key, enabled = true) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setReady(false);
      setError(false);
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const res = await window.storage.get(key, true);
        if (alive) setItems(res && res.value ? JSON.parse(res.value) : []);
      } catch (e) {
        if (alive) setItems([]);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [enabled, key]);

  const persist = useCallback(async (next) => {
    setItems(next);
    try {
      await window.storage.set(key, JSON.stringify(next), true);
      setError(false);
    } catch (e) {
      setError(true);
    }
  }, [key]);

  const add = useCallback((row) => { const r = { id: uid(), ...row }; persist([...items, r]); return r; }, [items, persist]);
  const update = useCallback((id, patch) => { persist(items.map((it) => (it.id === id ? { ...it, ...patch } : it))); }, [items, persist]);
  const remove = useCallback((id) => { persist(items.filter((it) => it.id !== id)); }, [items, persist]);
  const upsertBy = useCallback((matchFn, row) => {
    const idx = items.findIndex(matchFn);
    if (idx === -1) { persist([...items, { id: uid(), ...row }]); }
    else { persist(items.map((it, i) => (i === idx ? { ...it, ...row } : it))); }
  }, [items, persist]);

  return { items, add, update, remove, upsertBy, persist, ready, error };
}

function useSettingsStore() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await window.storage.get("settings", true);
        if (alive) {
          const loaded = res && res.value ? JSON.parse(res.value) : null;
          setSettings(loaded ? { ...DEFAULT_SETTINGS, ...loaded } : DEFAULT_SETTINGS);
        }
      } catch (e) {
        if (alive) setSettings(DEFAULT_SETTINGS);
      } finally { if (alive) setReady(true); }
    })();
    return () => { alive = false; };
  }, []);
  const save = async (next) => {
    setSettings(next);
    try { await window.storage.set("settings", JSON.stringify(next), true); } catch (e) { /* ignore */ }
  };
  const bump = async (field) => {
    const next = { ...settings, [field]: (settings[field] || 0) + 1 };
    await save(next);
    return next[field];
  };
  return { settings, save, bump, ready };
}

/* ---------------------------------------------------------------- *
 *  roles & navigation
 * ---------------------------------------------------------------- */
const ROLES = [
  { key: "manager", label: "Manager — full access" },
  { key: "owner", label: "Owner / Director — view only" },
  { key: "supervisor", label: "Shift Supervisor" },
  { key: "sales", label: "Sales" },
  { key: "hr", label: "HR" },
  { key: "maintenance", label: "Maintenance" },
];
const canEdit = (role) => role !== "owner";

const NAV = [
  { group: "Overview", tabs: [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "reports", label: "Reports (P&L)", icon: BarChart3 },
  ]},
  { group: "Production", tabs: [
    { key: "attendance", label: "Attendance", icon: ClipboardCheck },
    { key: "production", label: "Production", icon: Factory },
    { key: "payroll", label: "Payroll", icon: Wallet },
  ]},
  { group: "People", tabs: [
    { key: "employees", label: "Employees", icon: Users },
  ]},
  { group: "Maintenance", tabs: [
    { key: "machines", label: "Machines & Maintenance", icon: Wrench },
  ]},
  { group: "Stores", tabs: [
    { key: "stores", label: "Raw Materials & Stock", icon: Boxes },
  ]},
  { group: "Sales & Documents", tabs: [
    { key: "customers", label: "Customers", icon: Building2 },
    { key: "sales", label: "Sales / Invoices", icon: FileText },
    { key: "delivery", label: "Delivery Notes", icon: Truck },
    { key: "dispatch", label: "Dispatch Notes", icon: ArrowLeftRight },
    { key: "receipts", label: "Receipts", icon: Receipt },
  ]},
  { group: "Finance", tabs: [
    { key: "expenses", label: "Expenses", icon: Wallet },
    { key: "cashbook", label: "Cash Book", icon: Wallet },
    { key: "loans", label: "Loans", icon: Wallet },
    { key: "payables", label: "Bills Owed (Payables)", icon: FileText },
    { key: "prepayments", label: "Prepayments", icon: Boxes },
    { key: "suppliers", label: "Suppliers", icon: Package },
    { key: "products", label: "Products", icon: Package },
  ]},
  { group: "System", tabs: [
    { key: "settings", label: "Settings", icon: SettingsIcon },
  ]},
];

const ROLE_TABS = {
  manager: "*",
  owner: ["dashboard", "reports"],
  supervisor: ["attendance", "production"],
  sales: ["dashboard", "customers", "sales", "delivery", "dispatch", "receipts", "products"],
  hr: ["dashboard", "employees", "attendance", "payroll"],
  maintenance: ["dashboard", "machines"],
};

const ALL_TABS = NAV.flatMap((g) => g.tabs);
const allowedTabs = (role) => (ROLE_TABS[role] === "*" ? ALL_TABS.map((t) => t.key) : ROLE_TABS[role] || []);

/* ---------------------------------------------------------------- *
 *  generic CRUD table - used by most master-data & log modules
 * ---------------------------------------------------------------- */
function CrudTable({ title, icon: Icon, schema, collection, role, note }) {
  const { items, add, update, remove } = collection;
  const editable = canEdit(role);
  const emptyForm = () => Object.fromEntries(schema.filter((f) => !f.computed).map((f) => [f.key, f.default ?? ""]));
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    const row = {};
    schema.filter((f) => !f.computed).forEach((f) => {
      row[f.key] = f.type === "number" ? Number(form[f.key] || 0) : (form[f.key] || "");
    });
    if (editingId) { update(editingId, row); setEditingId(null); } else { add(row); }
    setForm(emptyForm());
  };
  const startEdit = (item) => {
    setEditingId(item.id);
    const next = {};
    schema.filter((f) => !f.computed).forEach((f) => { next[f.key] = item[f.key]; });
    setForm(next);
  };
  const cancel = () => { setEditingId(null); setForm(emptyForm()); };

  return (
    <div className="panel">
      <div className="panel-head"><Icon size={19} /><h2>{title}</h2></div>
      {note && <p className="hint">{note}</p>}
      {editable && (
        <form className="crud-form" onSubmit={submit}>
          {schema.filter((f) => !f.computed).map((f) => (
            <FormField key={f.key} field={f} value={form[f.key]} onChange={(next) => setForm({ ...form, [f.key]: next })} />
          ))}
          <div className="field field-btns">
            <button className="btn-primary" type="submit">{editingId ? "Update" : <><Plus size={14} /> Add</>}</button>
            {editingId && <button type="button" className="btn-ghost" onClick={cancel}>Cancel</button>}
          </div>
        </form>
      )}
      <EntityTable
        schema={schema}
        items={items}
        editable={editable}
        onEdit={startEdit}
        onDelete={(item) => remove(item.id)}
        emptyMessage="No records yet — add the first one above."
      />
    </div>
  );
}

/* ---------------------------------------------------------------- *
 *  Dashboard
 * ---------------------------------------------------------------- */
function Dashboard({ data, settings }) {
  const t = today();
  const stats = useMemo(() => {
    const todaysProduction = data.production.items.filter((r) => r.date === t);
    const todaysAttendance = data.attendance.items.filter((a) => a.date === t && a.status === "Present");
    const todaysInvoices = data.sales.items.filter((s) => s.date === t);
    const payFor = (r, emp) => {
      const g = good(r);
      const rate = emp ? Number(emp.rate) || 0 : 0;
      const target = targetFor(r.product, data.products.items);
      const bonus = g > target ? (g - target) * settings.bonusRate : 0;
      return g * rate + bonus;
    };
    const empByName = Object.fromEntries(data.employees.items.map((e) => [e.name, e]));
    const cashBalance = data.cashbook.items.reduce((s, c) => s + (c.type === "In" ? Number(c.amount) || 0 : -(Number(c.amount) || 0)), 0);
    const loansPayableBalance = data.loans.items.filter((l) => l.type === "We Owe (Payable)").reduce((s, l) => s + Math.max(0, (Number(l.principal) || 0) - repaidFor(l.reference, data.loanRepayments.items)), 0);
    const payablesBalance = data.payables.items.reduce((s, p) => s + Math.max(0, (Number(p.amount) || 0) - (Number(p.amountPaid) || 0)), 0);
    return {
      todaysGood: todaysProduction.reduce((s, r) => s + good(r), 0),
      todaysWages: todaysProduction.reduce((s, r) => s + payFor(r, empByName[r.employee]), 0),
      presentToday: todaysAttendance.length,
      todaysSales: todaysInvoices.reduce((s, inv) => s + invoiceTotal(inv), 0),
      todaysExpenses: data.expenses.items.filter((e) => e.date === t).reduce((s, e) => s + (Number(e.amount) || 0), 0),
      cashBalance,
      loansPayableBalance,
      payablesBalance,
      lowStock: data.rawMaterials.items.filter((m) => stockBalance(m, data) < (Number(m.minStock) || 0)),
      machinesDown: data.machines.items.filter((m) => m.status !== "Running"),
    };
  }, [data, settings.bonusRate, t]);

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
        <Card label="Cash Balance (UGX)" value={fmt(stats.cashBalance)} accent={stats.cashBalance < 0 ? "#B3261E" : "#2E7D32"} />
        <Card label="Loans Owed (UGX)" value={fmt(stats.loansPayableBalance)} accent={stats.loansPayableBalance > 0 ? "#B3261E" : "#2E7D32"} />
        <Card label="Bills Owed to Suppliers (UGX)" value={fmt(stats.payablesBalance)} accent={stats.payablesBalance > 0 ? "#B3261E" : "#2E7D32"} />
      </div>

      <div className="dash-alerts">
        {stats.lowStock.length > 0 && (
          <div className="alert alert-warn">
            <AlertTriangle size={16} />
            <span><b>{stats.lowStock.length}</b> raw material{stats.lowStock.length > 1 ? "s" : ""} below reorder level: {stats.lowStock.map((m) => m.name).join(", ")}</span>
          </div>
        )}
        {stats.machinesDown.length > 0 && (
          <div className="alert alert-warn">
            <Wrench size={16} />
            <span><b>{stats.machinesDown.length}</b> machine{stats.machinesDown.length > 1 ? "s" : ""} not running: {stats.machinesDown.map((m) => m.name).join(", ")}</span>
          </div>
        )}
        {stats.lowStock.length === 0 && stats.machinesDown.length === 0 && (
          <div className="alert alert-ok"><CheckCircle2 size={16} /><span>Stock levels and machines all look normal.</span></div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 *  Production
 * ---------------------------------------------------------------- */
function Production({ data, settings, role }) {
  const empNames = data.employees.items.map((e) => e.name);
  const machNames = data.machines.items.map((m) => m.name);
  const prodNames = data.products.items.map((p) => p.name);
  const rateFor = (name) => { const e = data.employees.items.find((x) => x.name === name); return e ? Number(e.rate) || 0 : 0; };
  const bonusFor = (r) => {
    const g = good(r);
    const target = targetFor(r.product, data.products.items);
    return g > target ? (g - target) * settings.bonusRate : 0;
  };

  const schema = [
    { key: "date", label: "Date", type: "date", required: true, default: today() },
    { key: "employee", label: "Employee", type: "select", options: empNames, required: true },
    { key: "shift", label: "Shift", type: "select", options: ["Day", "Night"], required: true },
    { key: "product", label: "Product", type: "select", options: prodNames, required: true },
    { key: "machine", label: "Machine", type: "select", options: machNames },
    { key: "cartonsMade", label: "Cartons Made", type: "number", required: true },
    { key: "rejects", label: "Rejects", type: "number", default: 0 },
    { key: "good", label: "Good (auto)", computed: true, render: (it) => fmt(good(it)) },
    { key: "target", label: "Target (auto)", computed: true, render: (it) => fmt(targetFor(it.product, data.products.items)) },
    { key: "rate", label: "Rate/Carton", computed: true, render: (it) => fmt(rateFor(it.employee)) },
    { key: "bonus", label: "Bonus (auto)", computed: true, render: (it) => fmt(bonusFor(it)) },
    { key: "total", label: "Total Pay", computed: true, render: (it) => <b>{fmt(good(it) * rateFor(it.employee) + bonusFor(it))}</b> },
  ];

  const targetSummary = data.products.items.map((p) => `${p.name}: ${p.target || 0} cartons/shift`).join(" · ");

  return (
    <CrudTable
      title="Production Log"
      icon={Factory}
      schema={schema}
      collection={data.production}
      role={role}
      note={`Golden offer: each product has its own target — ${targetSummary || "set targets on the Products page first"}. Every carton above a product's own target earns UGX ${fmt(settings.bonusRate)} bonus, added automatically. Employees who work both shifts just get two rows — one Day, one Night — each judged against its own target.`}
    />
  );
}

/* ---------------------------------------------------------------- *
 *  Machines & Maintenance
 * ---------------------------------------------------------------- */
function MachinesMaintenance({ data, role }) {
  const [sub, setSub] = useState("machines");
  const machSchema = [
    { key: "name", label: "Machine", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: ["Extruder", "Cutter", "Other"] },
    { key: "status", label: "Status", type: "select", options: ["Running", "Stopped", "Maintenance"], required: true, default: "Running" },
    { key: "operator", label: "Operator", type: "select", options: data.employees.items.map((e) => e.name) },
  ];
  const logSchema = [
    { key: "date", label: "Date", type: "date", required: true, default: today() },
    { key: "machine", label: "Machine", type: "select", options: data.machines.items.map((m) => m.name), required: true },
    { key: "issue", label: "Issue", type: "text", required: true },
    { key: "action", label: "Action Taken", type: "text" },
    { key: "technician", label: "Technician", type: "text" },
    { key: "cost", label: "Cost (UGX)", type: "number", default: 0 },
    { key: "status", label: "Status", type: "select", options: ["Open", "In Progress", "Resolved"], default: "Open" },
  ];
  return (
    <div>
      <div className="subtabs">
        <button className={sub === "machines" ? "active" : ""} onClick={() => setSub("machines")}>Machines</button>
        <button className={sub === "logs" ? "active" : ""} onClick={() => setSub("logs")}>Maintenance Log</button>
      </div>
      {sub === "machines"
        ? <CrudTable title="Machines" icon={Wrench} schema={machSchema} collection={data.machines} role={role} />
        : <CrudTable title="Maintenance Log" icon={Wrench} schema={logSchema} collection={data.maintenance} role={role} />}
    </div>
  );
}

function Stores({ data, role }) {
  const [sub, setSub] = useState("materials");
  const matNames = data.rawMaterials.items.map((m) => m.name);

  const matSchema = [
    { key: "name", label: "Material", type: "text", required: true },
    { key: "unit", label: "Unit", type: "text", default: "KG" },
    { key: "opening", label: "Opening Stock", type: "number", default: 0 },
    { key: "unitCost", label: "Unit Cost (UGX)", type: "number", default: 0 },
    { key: "minStock", label: "Reorder Level", type: "number", default: 0 },
    { key: "balance", label: "Balance (auto)", computed: true, render: (it) => {
        const bal = stockBalance(it, data);
        const low = bal < (Number(it.minStock) || 0);
        return <b style={low ? { color: "#B3261E" } : undefined}>{fmt(bal)} {low ? "⚠" : ""}</b>;
      } },
    { key: "value", label: "Stock Value (auto)", computed: true, render: (it) => fmt(stockBalance(it, data) * (Number(it.unitCost) || 0)) },
  ];
  const grnSchema = [
    { key: "date", label: "Date", type: "date", required: true, default: today() },
    { key: "supplier", label: "Supplier", type: "select", options: data.suppliers.items.map((s) => s.name), required: true },
    { key: "supplierBillNo", label: "Supplier's Bill/Invoice No.", type: "text" },
    { key: "supplierDNNo", label: "Supplier's Delivery Note No.", type: "text" },
    { key: "material", label: "Material", type: "select", options: matNames, required: true },
    { key: "qty", label: "Qty", type: "number", required: true },
    { key: "unitCost", label: "Unit Cost", type: "number" },
    { key: "total", label: "Total (auto)", computed: true, render: (it) => fmt((Number(it.qty) || 0) * (Number(it.unitCost) || 0)) },
  ];
  const issueSchema = [
    { key: "date", label: "Date", type: "date", required: true, default: today() },
    { key: "material", label: "Material", type: "select", options: matNames, required: true },
    { key: "qty", label: "Qty Issued", type: "number", required: true },
    { key: "dept", label: "To Department", type: "select", options: ["Production", "Stores", "Maintenance", "Other"] },
  ];

  return (
    <div>
      <div className="subtabs">
        <button className={sub === "materials" ? "active" : ""} onClick={() => setSub("materials")}>Raw Materials</button>
        <button className={sub === "grn" ? "active" : ""} onClick={() => setSub("grn")}>Goods Received (GRN)</button>
        <button className={sub === "issue" ? "active" : ""} onClick={() => setSub("issue")}>Material Issued</button>
      </div>
      {sub === "materials" && <CrudTable title="Raw Materials" icon={Boxes} schema={matSchema} collection={data.rawMaterials} role={role} note="Balance updates itself from GRN and Material Issued below — don't edit it directly." />}
      {sub === "grn" && <CrudTable title="Goods Received Note (GRN)" icon={Boxes} schema={grnSchema} collection={data.grn} role={role} />}
      {sub === "issue" && <CrudTable title="Material Issued to Production" icon={Boxes} schema={issueSchema} collection={data.materialIssue} role={role} />}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 *  Loans (money the company owes, or is owed) - carried over from
 *  before this system existed, or taken on afterward
 * ---------------------------------------------------------------- */
function Loans({ data, role }) {
  const [sub, setSub] = useState("loans");
  const loanSchema = [
    { key: "reference", label: "Loan Ref", type: "text", required: true },
    { key: "lender", label: "Lender / Borrower", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: ["We Owe (Payable)", "Owed To Us (Receivable)"], required: true },
    { key: "principal", label: "Principal (UGX)", type: "number", required: true },
    { key: "dateTaken", label: "Date Taken", type: "date", required: true, default: today() },
    { key: "interestRate", label: "Interest Rate (%)", type: "number" },
    { key: "notes", label: "Notes", type: "text" },
    { key: "repaid", label: "Repaid So Far (auto)", computed: true, render: (it) => fmt(repaidFor(it.reference, data.loanRepayments.items)) },
    { key: "balance", label: "Balance (auto)", computed: true, render: (it) => {
        const bal = (Number(it.principal) || 0) - repaidFor(it.reference, data.loanRepayments.items);
        return <b style={bal > 0 ? { color: "#B3261E" } : { color: "#2E7D32" }}>{fmt(bal)}</b>;
      } },
  ];
  const repaySchema = [
    { key: "date", label: "Date", type: "date", required: true, default: today() },
    { key: "reference", label: "Loan Ref", type: "select", options: data.loans.items.map((l) => l.reference), required: true },
    { key: "amount", label: "Amount (UGX)", type: "number", required: true },
    { key: "notes", label: "Notes", type: "text" },
  ];
  return (
    <div>
      <div className="subtabs">
        <button className={sub === "loans" ? "active" : ""} onClick={() => setSub("loans")}>Loans</button>
        <button className={sub === "repay" ? "active" : ""} onClick={() => setSub("repay")}>Repayments</button>
      </div>
      {sub === "loans"
        ? <CrudTable title="Loans" icon={Wallet} schema={loanSchema} collection={data.loans} role={role}
            note="Old loans the factory already had before this system existed belong here too — just enter the original Date Taken and Principal, even if that date is in the past. The balance works itself out from any repayments logged below." />
        : <CrudTable title="Loan Repayments" icon={Wallet} schema={repaySchema} collection={data.loanRepayments} role={role} />}
    </div>
  );
}

function DocHeader({ settings, docType, docNo, date }) {
  return (
    <div className="doc-header">
      <div>
        <div className="doc-company">{settings.companyName || "Your Factory Name"}</div>
        {settings.companyAddress && <div className="doc-meta">{settings.companyAddress}</div>}
        <div className="doc-meta">
          {settings.companyPhone}{settings.companyPhone && settings.companyTin ? " · " : ""}
          {settings.companyTin ? `TIN ${settings.companyTin}` : ""}
        </div>
      </div>
      <div className="doc-title-block">
        <div className="doc-title">{docType}</div>
        <div className="doc-meta">No: <b>{docNo}</b></div>
        <div className="doc-meta">Date: {date}</div>
      </div>
    </div>
  );
}

const DOC_STANDALONE_CSS = `
body{ font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#232323; padding:36px 40px; max-width:680px; margin:0 auto; }
.doc-header{ display:flex; justify-content:space-between; border-bottom:2px solid #1F4E78; padding-bottom:14px; margin-bottom:18px; }
.doc-company{ font-family:Georgia, serif; font-size:19px; font-weight:700; color:#1F4E78; }
.doc-meta{ font-size:12px; color:#555; }
.doc-title-block{ text-align:right; }
.doc-title{ font-size:16px; font-weight:700; letter-spacing:.05em; color:#BF8F00; }
.doc-party{ margin-bottom:14px; font-size:13.5px; }
.doc-table{ width:100%; border-collapse:collapse; margin-bottom:14px; }
.doc-table th{ background:#F1EEE4; text-align:left; }
.doc-table td, .doc-table th{ border:1px solid #E4E0D6; padding:7px 9px; font-size:13px; }
.doc-k{ font-weight:600; width:160px; background:#FAF8F3; }
.doc-totals{ margin-left:auto; max-width:260px; font-size:13.5px; display:flex; flex-direction:column; gap:3px; }
.doc-grand{ font-weight:700; font-size:15.5px; border-top:1px solid #232323; padding-top:5px; margin-top:3px; }
.doc-footnote{ font-size:10.5px; color:#999; margin-top:14px; font-style:italic; }
.doc-sign-row{ display:flex; justify-content:space-between; margin-top:46px; font-size:12.5px; }
`;

function PrintModal({ children, onClose, filename = "document" }) {
  const areaRef = useRef(null);

  const download = () => {
    const inner = areaRef.current ? areaRef.current.innerHTML : "";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title><style>${DOC_STANDALONE_CSS}</style></head><body>${inner}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${filename}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="print-overlay">
      <div className="print-toolbar no-print">
        <button className="btn-primary" onClick={() => window.print()}><Printer size={15} /> Print / Save as PDF</button>
        <button className="btn-ghost" onClick={download}><Download size={15} /> Download</button>
        <button className="btn-ghost" onClick={onClose}><X size={15} /> Close</button>
      </div>
      <div className="print-area" ref={areaRef}>{children}</div>
    </div>
  );
}

function Sales({ data, settings, settingsStore, role }) {
  const editable = canEdit(role);
  const blankLine = () => ({ product: "", qty: 1, unitPrice: 0 });
  const [customer, setCustomer] = useState("");
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState([blankLine()]);
  const [amountPaid, setAmountPaid] = useState(0);
  const [viewDoc, setViewDoc] = useState(null);

  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const vatAmount = settings.vatRegistered ? Math.round(subtotal * (Number(settings.vatRate) || 0) / 100) : 0;
  const total = subtotal + vatAmount;

  const updateLine = (i, patch) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines([...lines, blankLine()]);
  const removeLine = (i) => setLines(lines.filter((_, idx) => idx !== i));

  const productPrice = (name) => { const p = data.products.items.find((x) => x.name === name); return p ? Number(p.unitPrice) || 0 : 0; };

  const saveInvoice = async (e) => {
    e.preventDefault();
    const n = await settingsStore.bump("invoiceCounter");
    const invoiceNo = `INV-${String(n).padStart(4, "0")}`;
    data.sales.add({ invoiceNo, date, customer, items: lines, vatAmount, amountPaid: Number(amountPaid) || 0 });
    setCustomer(""); setLines([blankLine()]); setAmountPaid(0); setDate(today());
  };

  const statusOf = (inv) => {
    const bal = invoiceTotal(inv) - (Number(inv.amountPaid) || 0);
    if (bal <= 0) return "Paid";
    if ((Number(inv.amountPaid) || 0) === 0) return "Unpaid";
    return "Partial";
  };

  return (
    <div className="panel">
      <div className="panel-head"><FileText size={19} /><h2>Sales / Invoices</h2></div>
      {settings.vatRegistered
        ? <p className="hint">VAT-registered: invoices apply {settings.vatRate}% VAT and are formatted EFRIS-ready. Not yet transmitted to URA live.</p>
        : <p className="hint">Not VAT-registered. Turn this on in Settings once you register for VAT / EFRIS.</p>}

      {editable && (
        <form className="crud-form" onSubmit={saveInvoice} style={{ flexWrap: "wrap" }}>
          <FormField field={{ label: "Customer", type: "select", required: true, options: data.customers.items.map((c) => c.name) }} value={customer} onChange={setCustomer} />
          <FormField field={{ label: "Date", type: "date" }} value={date} onChange={setDate} />
          <FormField field={{ label: "Amount Paid Now", type: "number" }} value={amountPaid} onChange={setAmountPaid} />
        </form>
      )}

      {editable && (
        <div className="line-items">
          <table>
            <thead><tr><th>Product</th><th>Qty (Cartons)</th><th>Unit Price</th><th>Line Total</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <select value={l.product} onChange={(e) => updateLine(i, { product: e.target.value, unitPrice: productPrice(e.target.value) || l.unitPrice })}>
                      <option value="">Select…</option>
                      {data.products.items.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </td>
                  <td><input type="number" value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></td>
                  <td><input type="number" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })} /></td>
                  <td>{fmt((Number(l.qty) || 0) * (Number(l.unitPrice) || 0))}</td>
                  <td>{lines.length > 1 && <button type="button" onClick={() => removeLine(i)}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn-ghost" onClick={addLine}><Plus size={14} /> Add line</button>
          <div className="totals-box">
            <div>Subtotal: <b>{fmt(subtotal)}</b></div>
            {settings.vatRegistered && <div>VAT ({settings.vatRate}%): <b>{fmt(vatAmount)}</b></div>}
            <div>Total: <b>{fmt(total)}</b></div>
            <button className="btn-primary" onClick={saveInvoice}>Save Invoice</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Invoice No</th><th>Date</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.sales.items.length === 0 && <tr><td className="empty" colSpan={8}>No invoices yet.</td></tr>}
            {[...data.sales.items].reverse().map((inv) => {
              const tot = invoiceTotal(inv); const bal = tot - (Number(inv.amountPaid) || 0); const st = statusOf(inv);
              return (
                <tr key={inv.id}>
                  <td>{inv.invoiceNo}</td><td>{inv.date}</td><td>{inv.customer}</td>
                  <td>{fmt(tot)}</td><td>{fmt(inv.amountPaid)}</td><td>{fmt(bal)}</td>
                  <td><span className={`pill pill-${st.toLowerCase()}`}>{st}</span></td>
                  <td><button onClick={() => setViewDoc(inv)}><Printer size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {viewDoc && (
        <PrintModal onClose={() => setViewDoc(null)} filename={viewDoc.invoiceNo}>
          <DocHeader settings={settings} docType={settings.vatRegistered ? "TAX INVOICE" : "INVOICE"} docNo={viewDoc.invoiceNo} date={viewDoc.date} />
          <div className="doc-party"><b>Bill To:</b> {viewDoc.customer}</div>
          <table className="doc-table">
            <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
            <tbody>
              {(viewDoc.items || []).map((l, i) => (
                <tr key={i}><td>{l.product}</td><td>{fmt(l.qty)}</td><td>{fmt(l.unitPrice)}</td><td>{fmt((Number(l.qty) || 0) * (Number(l.unitPrice) || 0))}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="doc-totals">
            <div>Subtotal: {fmt((viewDoc.items || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0))}</div>
            {settings.vatRegistered && <div>VAT ({settings.vatRate}%): {fmt(viewDoc.vatAmount)}</div>}
            <div className="doc-grand">Total: {fmt(invoiceTotal(viewDoc))}</div>
            <div>Amount Paid: {fmt(viewDoc.amountPaid)}</div>
            <div>Balance Due: {fmt(invoiceTotal(viewDoc) - (Number(viewDoc.amountPaid) || 0))}</div>
          </div>
          {settings.vatRegistered && <div className="doc-footnote">EFRIS-ready format — not yet linked live to URA.</div>}
          <div className="doc-sign-row"><div>Prepared by: ___________________</div><div>Received by: ___________________</div></div>
        </PrintModal>
      )}
    </div>
  );
}

function DocumentModule({ title, icon, docType, prefix, counterField, fields, data, settings, settingsStore, role, collection }) {
  const editable = canEdit(role);
  const emptyForm = () => Object.fromEntries(fields.map((f) => [f.key, f.default ?? ""]));
  const [form, setForm] = useState(emptyForm());
  const [viewDoc, setViewDoc] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    const n = await settingsStore.bump(counterField);
    const docNo = `${prefix}-${String(n).padStart(4, "0")}`;
    collection.add({ docNo, ...form });
    setForm(emptyForm());
  };

  return (
    <div className="panel">
      <div className="panel-head">{icon}<h2>{title}</h2></div>
      {editable && (
        <form className="crud-form" onSubmit={save}>
          {fields.map((f) => (
            <FormField key={f.key} field={f} value={form[f.key]} onChange={(next) => setForm({ ...form, [f.key]: next })} />
          ))}
          <div className="field field-btns"><button className="btn-primary" type="submit"><Plus size={14} /> Save</button></div>
        </form>
      )}
      <EntityTable
        schema={[{ key: 'docNo', label: 'No.' }, ...fields]}
        items={collection.items}
        editable={false}
        rowAction={(item) => <button onClick={() => setViewDoc(item)}><Printer size={14} /></button>}
        emptyMessage="None recorded yet."
        renderCell={(item, field) => {
          if (field.key === 'docNo') return <b>{item.docNo}</b>;
          return field.type === 'number' ? fmt(item[field.key]) : item[field.key];
        }}
      />
      {viewDoc && (
        <PrintModal onClose={() => setViewDoc(null)} filename={viewDoc.docNo}>
          <DocHeader settings={settings} docType={docType} docNo={viewDoc.docNo} date={viewDoc.date} />
          <table className="doc-table">
            <tbody>
              {fields.filter((f) => f.key !== "date").map((f) => (
                <tr key={f.key}><td className="doc-k">{f.label}</td><td>{f.type === "number" ? fmt(viewDoc[f.key]) : viewDoc[f.key]}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="doc-sign-row"><div>Issued by: ___________________</div><div>Received by: ___________________</div></div>
        </PrintModal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 *  Reports (Profit & Loss)
 * ---------------------------------------------------------------- */
function Reports({ data, settings }) {
  const [start, setStart] = useState(firstOfMonth());
  const [end, setEnd] = useState(today());

  const salesRevenue = data.sales.items.filter((s) => inRange(s.date, start, end)).reduce((s, inv) => s + invoiceTotal(inv), 0);
  const wages = data.production.items.filter((r) => inRange(r.date, start, end)).reduce((s, r) => {
    const emp = data.employees.items.find((e) => e.name === r.employee);
    const g = good(r); const base = g * (emp ? Number(emp.rate) || 0 : 0);
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
    <div className={`pl-row${bold ? " pl-bold" : ""}`}><span>{label}</span><span>{fmt(value)}</span></div>
  );

  return (
    <div className="panel">
      <div className="panel-head"><BarChart3 size={19} /><h2>Profit &amp; Loss</h2></div>
      <div className="period-row">
        <label>Period Start <input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>Period End <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
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

/* ---------------------------------------------------------------- *
 *  App shell
 * ---------------------------------------------------------------- */
export default function FactoryOS() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 880) {
        document.body.classList.remove("workspace-nav-open");
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (window.factoryAuth?.token()) {
          const session = await window.factoryAuth.me();
          if (alive) setUser(session.user);
        }
      } catch {
        window.factoryAuth?.logout?.();
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => { alive = false; };
  }, []);
  if (booting) {
    return (
      <Shell>
        <div className="login-screen">
          <div className="login-card">
            <div className="login-brand">FACTORY<span>OS</span></div>
            <p className="login-sub">Loading secure session…</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (!user) return <Shell><LoginCard roles={ROLES} onLogin={setUser} /></Shell>;

  return <Workspace user={user} onLogout={() => setUser(null)} />;
}

function Workspace({ user, onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const tabs = allowedTabs(user.role);
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const settingsStore = useSettingsStore();
  const data = {
    employees: useCollection("employees", ["dashboard", "attendance", "production", "payroll", "employees"].includes(activeTab)),
    attendance: useCollection("attendance", ["dashboard", "attendance"].includes(activeTab)),
    production: useCollection("production", ["dashboard", "production", "payroll"].includes(activeTab)),
    advances: useCollection("advances", ["payroll"].includes(activeTab)),
    machines: useCollection("machines", ["dashboard", "machines", "stores"].includes(activeTab)),
    maintenance: useCollection("maintenance", ["machines"].includes(activeTab)),
    rawMaterials: useCollection("rawMaterials", ["dashboard", "stores"].includes(activeTab)),
    grn: useCollection("grn", ["stores"].includes(activeTab)),
    materialIssue: useCollection("materialIssue", ["stores"].includes(activeTab)),
    customers: useCollection("customers", ["dashboard", "customers", "sales", "delivery", "receipts"].includes(activeTab)),
    suppliers: useCollection("suppliers", ["dashboard", "payables", "suppliers"].includes(activeTab)),
    products: useCollection("products", ["dashboard", "production", "sales", "products"].includes(activeTab)),
    sales: useCollection("sales", ["dashboard", "sales", "receipts"].includes(activeTab)),
    delivery: useCollection("delivery", ["delivery"].includes(activeTab)),
    dispatch: useCollection("dispatch", ["dispatch"].includes(activeTab)),
    receipts: useCollection("receipts", ["receipts"].includes(activeTab)),
    expenses: useCollection("expenses", ["dashboard", "expenses"].includes(activeTab)),
    cashbook: useCollection("cashbook", ["dashboard", "cashbook"].includes(activeTab)),
    loans: useCollection("loans", ["dashboard", "loans"].includes(activeTab)),
    loanRepayments: useCollection("loanRepayments", ["dashboard", "loans"].includes(activeTab)),
    payables: useCollection("payables", ["dashboard", "payables"].includes(activeTab)),
    prepayments: useCollection("prepayments", ["prepayments"].includes(activeTab)),
  };

  useEffect(() => {
    document.body.classList.toggle("workspace-nav-open", navOpen);
    return () => document.body.classList.remove("workspace-nav-open");
  }, [navOpen]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 880) setNavOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (data.products.ready && data.products.items.length === 0) {
      data.products.persist([
        { id: uid(), name: "Ordinary", unitPrice: 0, target: 20 },
        { id: uid(), name: "Water Bags (Hard)", unitPrice: 0, target: 25 },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.products.ready]);

  const attendanceSchema = [
    { key: "date", label: "Date", type: "date", required: true, default: today() },
    { key: "employee", label: "Employee", type: "select", options: data.employees.items.map((e) => e.name), required: true },
    { key: "shift", label: "Shift", type: "select", options: ["Day", "Night"], required: true },
    { key: "status", label: "Status", type: "select", options: ["Present", "Absent", "On Leave"], required: true, default: "Present" },
  ];
  const employeeSchema = [
    { key: "name", label: "Full Name", type: "text", required: true },
    { key: "dept", label: "Department", type: "select", options: ["Production", "Stores", "Sales", "Accounts", "Management", "Maintenance"] },
    { key: "shift", label: "Usual Shift", type: "select", options: ["Day", "Night", "Both"] },
    { key: "rate", label: "Rate/Carton (UGX)", type: "number", required: true },
    { key: "phone", label: "Phone", type: "text" },
    { key: "status", label: "Status", type: "select", options: ["Active", "Inactive"], default: "Active" },
  ];
  const customerSchema = [
    { key: "name", label: "Customer Name", type: "text", required: true },
    { key: "contact", label: "Contact", type: "text" },
    { key: "tin", label: "TIN", type: "text" },
    { key: "address", label: "Address", type: "text" },
  ];
  const supplierSchema = [
    { key: "name", label: "Supplier Name", type: "text", required: true },
    { key: "contact", label: "Contact", type: "text" },
    { key: "tin", label: "TIN", type: "text" },
    { key: "address", label: "Address", type: "text" },
  ];
  const productSchema = [
    { key: "name", label: "Product Name", type: "text", required: true },
    { key: "unitPrice", label: "Unit Price (UGX)", type: "number", default: 0 },
    { key: "target", label: "Carton Target / Shift", type: "number", default: 0 },
  ];
  const expenseSchema = [
    { key: "date", label: "Date", type: "date", required: true, default: today() },
    { key: "category", label: "Category", type: "text", required: true },
    { key: "description", label: "Description", type: "text", required: true },
    { key: "amount", label: "Amount (UGX)", type: "number", required: true },
    { key: "paidBy", label: "Paid By", type: "text" },
  ];
  const cashSchema = [
    { key: "date", label: "Date", type: "date", required: true, default: today() },
    { key: "description", label: "Description", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: ["In", "Out"], required: true },
    { key: "amount", label: "Amount (UGX)", type: "number", required: true },
  ];
  const payablesSchema = [
    { key: "billNo", label: "Supplier's Bill No.", type: "text" },
    { key: "supplier", label: "Supplier", type: "select", options: data.suppliers.items.map((s) => s.name), required: true },
    { key: "date", label: "Bill Date", type: "date", required: true, default: today() },
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "description", label: "Description", type: "text" },
    { key: "amount", label: "Amount (UGX)", type: "number", required: true },
    { key: "amountPaid", label: "Amount Paid (UGX)", type: "number", default: 0 },
    { key: "balance", label: "Balance (auto)", computed: true, render: (it) => fmt((Number(it.amount) || 0) - (Number(it.amountPaid) || 0)) },
    { key: "status", label: "Status (auto)", computed: true, render: (it) => {
        const bal = (Number(it.amount) || 0) - (Number(it.amountPaid) || 0);
        const st = bal <= 0 ? "Paid" : (Number(it.amountPaid) || 0) === 0 ? "Unpaid" : "Partial";
        return <span className={`pill pill-${st.toLowerCase()}`}>{st}</span>;
      } },
  ];
  const prepaymentsSchema = [
    { key: "paidTo", label: "Paid To", type: "text", required: true },
    { key: "date", label: "Date Paid", type: "date", required: true, default: today() },
    { key: "amount", label: "Amount (UGX)", type: "number", required: true },
    { key: "purpose", label: "Purpose / Period Covered", type: "text" },
    { key: "status", label: "Status", type: "select", options: ["Active", "Fully Used"], default: "Active" },
    { key: "notes", label: "Notes", type: "text" },
  ];

  const renderTab = () => {
    switch (activeTab) {
      case "dashboard": return <DashboardPanel data={data} settings={settingsStore.settings} />;
      case "reports": return <ReportsPanel data={data} settings={settingsStore.settings} />;
      case "attendance": return <CrudTable title="Attendance" icon={ClipboardCheck} schema={attendanceSchema} collection={data.attendance} role={user.role} />;
      case "production": return <ProductionPanel data={data} settings={settingsStore.settings} role={user.role} />;
      case "payroll": return <PayrollPanel data={data} settings={settingsStore.settings} role={user.role} />;
      case "employees": return <CrudTable title="Employees" icon={Users} schema={employeeSchema} collection={data.employees} role={user.role} />;
      case "machines": return <MachinesPanel data={data} role={user.role} />;
      case "stores": return <StoresPanel data={data} role={user.role} />;
      case "customers": return <CrudTable title="Customers" icon={Building2} schema={customerSchema} collection={data.customers} role={user.role} />;
      case "suppliers": return <CrudTable title="Suppliers" icon={Package} schema={supplierSchema} collection={data.suppliers} role={user.role} />;
      case "products": return <CrudTable title="Products" icon={Package} schema={productSchema} collection={data.products} role={user.role} />;
      case "sales": return <SalesPanel data={data} settings={settingsStore.settings} settingsStore={settingsStore} editable={canEdit(user.role)} />;
      case "delivery": return (
        <DocumentModule
          title="Delivery Notes" icon={<Truck size={19} />} docType="DELIVERY NOTE" prefix="DN" counterField="deliveryCounter"
          collection={data.delivery} data={data} settings={settingsStore.settings} settingsStore={settingsStore} role={user.role}
          fields={[
            { key: "date", label: "Date", type: "date", required: true, default: today() },
            { key: "customer", label: "Customer", type: "select", options: data.customers.items.map((c) => c.name), required: true },
            { key: "items", label: "Items Delivered", type: "text", required: true },
            { key: "vehicle", label: "Vehicle No.", type: "text" },
            { key: "driver", label: "Driver", type: "text" },
          ]}
        />
      );
      case "dispatch": return (
        <DocumentModule
          title="Dispatch Notes" icon={<ArrowLeftRight size={19} />} docType="DISPATCH NOTE" prefix="DP" counterField="dispatchCounter"
          collection={data.dispatch} data={data} settings={settingsStore.settings} settingsStore={settingsStore} role={user.role}
          fields={[
            { key: "date", label: "Date", type: "date", required: true, default: today() },
            { key: "product", label: "Product / Batch", type: "text", required: true },
            { key: "qty", label: "Qty (Cartons)", type: "number", required: true },
            { key: "destination", label: "Destination", type: "text", required: true },
            { key: "vehicle", label: "Vehicle No.", type: "text" },
            { key: "driver", label: "Driver", type: "text" },
          ]}
        />
      );
      case "receipts": return (
        <DocumentModule
          title="Receipts" icon={<Receipt size={19} />} docType="RECEIPT" prefix="RCT" counterField="receiptCounter"
          collection={data.receipts} data={data} settings={settingsStore.settings} settingsStore={settingsStore} role={user.role}
          fields={[
            { key: "date", label: "Date", type: "date", required: true, default: today() },
            { key: "receivedFrom", label: "Received From", type: "select", options: data.customers.items.map((c) => c.name), required: true },
            { key: "amount", label: "Amount (UGX)", type: "number", required: true },
            { key: "forInvoice", label: "For Invoice No.", type: "select", options: data.sales.items.map((s) => s.invoiceNo) },
            { key: "method", label: "Payment Method", type: "select", options: ["Cash", "Mobile Money", "Bank Transfer", "Cheque"], required: true },
            { key: "receivedBy", label: "Received By", type: "text" },
          ]}
        />
      );
      case "expenses": return <CrudTable title="Expenses" icon={Wallet} schema={expenseSchema} collection={data.expenses} role={user.role} />;
      case "cashbook": {
        const withBalance = [...data.cashbook.items].sort((a, b) => (a.date > b.date ? 1 : -1));
        let running = 0;
        const balances = {};
        withBalance.forEach((c) => { running += c.type === "In" ? Number(c.amount) || 0 : -(Number(c.amount) || 0); balances[c.id] = running; });
        const cashSchemaWithBalance = [...cashSchema, { key: "balance", label: "Running Balance", computed: true, render: (it) => <b>{fmt(balances[it.id] ?? 0)}</b> }];
        return <CrudTable title="Cash Book" icon={Wallet} schema={cashSchemaWithBalance} collection={data.cashbook} role={user.role} />;
      }
      case "loans": return <LoansPanel data={data} role={user.role} />;
      case "payables": return <CrudTable title="Bills Owed (Payables)" icon={FileText} schema={payablesSchema} collection={data.payables} role={user.role} note="Supplier bills you haven't fully paid yet — including any that were already outstanding before this system started. Use the same Bill Date as the real paper bill." />;
      case "prepayments": return <CrudTable title="Prepayments" icon={Boxes} schema={prepaymentsSchema} collection={data.prepayments} role={user.role} note="Money already paid out for something not yet used up — e.g. 6 months rent paid in advance. Mark it Fully Used once it's consumed." />;
      case "settings": return <SettingsPanel settings={settingsStore.settings} settingsStore={settingsStore} editable={canEdit(user.role)} />;
      default: return null;
    }
  };

  return (
    <Shell>
      <div className={`app-shell ${navOpen ? "nav-open" : ""}`}>
        {navOpen && <button type="button" aria-label="Close navigation" className="sidebar-backdrop no-print" onClick={() => setNavOpen(false)} />}
        <aside className="sidebar no-print">
          <div className="brand">FACTORY<span>OS</span></div>
          {NAV.map((g) => {
            const visible = g.tabs.filter((t) => tabs.includes(t.key));
            if (visible.length === 0) return null;
            return (
              <div className="nav-group" key={g.group}>
                <div className="nav-group-label">{g.group}</div>
                {visible.map((t) => (
                  <button key={t.key} className={`nav-item ${activeTab === t.key ? "active" : ""}`} onClick={() => { setTab(t.key); setNavOpen(false); }}>
                    <t.icon size={16} /> {t.label}
                  </button>
                ))}
              </div>
            );
          })}
          <div className="sidebar-foot">
            <div className="user-chip">{user.name}<span>{ROLES.find((r) => r.key === user.role)?.label}</span></div>
            <button className="nav-item" onClick={() => setUser(null)}><LogOut size={16} /> Switch User</button>
          </div>
        </aside>
        <button className="mobile-toggle no-print" onClick={() => setNavOpen(!navOpen)}><Menu size={18} /></button>
        <main className="content">{renderTab()}</main>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="factoryos-root">
      <style>{CSS}</style>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 *  styles
 * ---------------------------------------------------------------- */
const CSS = `
.factoryos-root{
  --navy:#1F4E78; --navy-dark:#153552; --gold:#BF8F00; --cream:#FAF7EF;
  --ink:#232323; --border:#E4E0D6; --green:#2E7D32; --red:#B3261E;
  font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--ink); background: var(--cream); min-height: 100vh;
}
.factoryos-root *{ box-sizing: border-box; }
html{ scroll-behavior:smooth; }
body.workspace-nav-open{ overflow:hidden; }

.login-screen{ min-height: 100vh; display:flex; align-items:center; justify-content:center; background: linear-gradient(160deg, var(--navy-dark), var(--navy)); padding:20px; }
.login-card{ background:#fff; border-radius:14px; padding:34px 30px; width:100%; max-width:380px; box-shadow:0 20px 50px rgba(0,0,0,.25); }
.login-brand{ font-family: Georgia, serif; font-weight:700; font-size:26px; color:var(--navy); letter-spacing:.5px; }
.login-brand span{ color:var(--gold); }
.login-sub{ color:#666; font-size:13px; margin:4px 0 22px; }
.login-error{ margin-top:12px; color:#B3261E; font-size:12.5px; }
.login-note{ font-size:11.5px; color:#888; margin-top:16px; line-height:1.5; }

.app-shell{ display:flex; min-height:100vh; }
.sidebar{ width:250px; flex-shrink:0; background:var(--navy-dark); color:#fff; padding:18px 12px; display:flex; flex-direction:column; position:sticky; top:0; height:100vh; overflow-y:auto; }
.brand{ font-family: Georgia, serif; font-weight:700; font-size:19px; padding:6px 10px 18px; letter-spacing:.5px; }
.brand span{ color:var(--gold); }
.nav-group{ margin-bottom:10px; }
.nav-group-label{ font-size:10.5px; text-transform:uppercase; letter-spacing:.08em; color:#93a8bc; padding:8px 10px 4px; }
.nav-item{ display:flex; align-items:center; gap:9px; width:100%; text-align:left; background:none; border:none; color:#dce7f0; padding:9px 10px; border-radius:7px; font-size:13.5px; cursor:pointer; }
.nav-item, .btn-primary, .btn-ghost, .mobile-toggle, .subtabs button{ touch-action:manipulation; }
.nav-item:hover{ background:rgba(255,255,255,.08); }
.nav-item.active{ background:rgba(191,143,0,.18); color:#fff; box-shadow:inset 3px 0 0 var(--gold); }
.sidebar-foot{ margin-top:auto; padding-top:14px; border-top:1px solid rgba(255,255,255,.12); }
.user-chip{ font-size:12.5px; padding:8px 10px; color:#fff; display:flex; flex-direction:column; gap:2px; }
.user-chip span{ font-size:10.5px; color:#9db3c7; }
.mobile-toggle{ display:none; }
.sidebar-backdrop{ display:none; }

.content{ flex:1; padding:22px 26px; min-width:0; }
.panel{ background:#fff; border:1px solid var(--border); border-radius:12px; padding:20px 22px; margin-bottom:20px; }
.panel-head{ display:flex; align-items:center; gap:9px; margin-bottom:6px; color:var(--navy); }
.panel-head h2{ font-family: Georgia, serif; font-size:19px; margin:0; }
.hint{ font-size:12.5px; color:#7a7a72; margin:2px 0 14px; }

.crud-form{ display:flex; flex-wrap:wrap; gap:12px; align-items:end; background:var(--cream); border:1px solid var(--border); border-radius:9px; padding:14px; margin-bottom:16px; }
.field{ display:flex; flex-direction:column; gap:4px; min-width:130px; }
.field label{ font-size:11.5px; font-weight:600; color:#555; }
.field .req{ color:var(--red); margin-left:2px; }
.field input, .field select{ padding:7px 9px; border:1px solid #cfcac0; border-radius:6px; font-size:13px; background:#fff; }
.field-btns{ flex-direction:row; gap:8px; align-self:flex-end; }
.field-checkbox label{ display:flex; align-items:center; gap:6px; font-weight:600; color:#333; }

.btn-primary{ background:var(--navy); color:#fff; border:none; padding:8px 16px; border-radius:7px; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
.btn-primary:hover{ background:var(--navy-dark); }
.btn-ghost{ background:none; border:1px solid #cfcac0; padding:7px 14px; border-radius:7px; font-size:13px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
.btn-full{ width:100%; justify-content:center; margin-top:6px; }

.table-wrap{ overflow-x:auto; }
table{ width:100%; border-collapse:collapse; font-size:13px; }
th{ text-align:left; background:#F1EEE4; color:var(--navy-dark); padding:8px 10px; font-size:11.5px; text-transform:uppercase; letter-spacing:.04em; border-bottom:2px solid var(--border); white-space:nowrap; }
td{ padding:8px 10px; border-bottom:1px solid var(--border); white-space:nowrap; }
.th-actions{ width:70px; }
.row-actions{ display:flex; gap:6px; }
.row-actions button{ background:none; border:1px solid var(--border); border-radius:6px; padding:5px; cursor:pointer; color:#555; }
.row-actions button:hover{ background:#f2efe6; }
.empty{ text-align:center; color:#999; padding:20px; font-style:italic; }

.subtabs{ display:flex; gap:6px; margin-bottom:14px; }
.subtabs button{ background:#fff; border:1px solid var(--border); padding:7px 14px; border-radius:20px; font-size:12.5px; cursor:pointer; }
.subtabs button.active{ background:var(--navy); color:#fff; border-color:var(--navy); }

.stat-grid{ display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:12px; margin:14px 0; }
.stat-card{ background:var(--cream); border:1px solid var(--border); border-radius:10px; padding:14px; }
.stat-label{ font-size:11.5px; color:#7a7a72; margin-bottom:4px; }
.stat-value{ font-size:22px; font-weight:700; color:var(--navy); font-family: Georgia, serif; }
.dash-alerts{ display:flex; flex-direction:column; gap:8px; margin-top:8px; }
.alert{ display:flex; align-items:center; gap:8px; padding:10px 12px; border-radius:8px; font-size:13px; }
.alert-warn{ background:#FDF2E3; color:#8a5a00; }
.alert-ok{ background:#E9F5E9; color:#2E7D32; }

.period-row{ display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap; }
.period-row label{ font-size:12px; font-weight:600; color:#555; display:flex; flex-direction:column; gap:4px; }
.period-row input{ padding:7px 9px; border:1px solid #cfcac0; border-radius:6px; }
.cell-input{ width:90px; padding:5px 7px; border:1px solid #cfcac0; border-radius:5px; }

.line-items{ margin-bottom:16px; }
.line-items table{ margin-bottom:8px; }
.line-items select, .line-items input{ padding:6px 7px; border:1px solid #cfcac0; border-radius:5px; font-size:12.5px; width:100%; }
.totals-box{ margin-top:10px; display:flex; gap:18px; align-items:center; font-size:13.5px; background:var(--cream); padding:10px 14px; border-radius:8px; flex-wrap:wrap; }

.pill{ padding:3px 9px; border-radius:20px; font-size:11px; font-weight:700; }
.pill-paid{ background:#E3F3E3; color:#2E7D32; }
.pill-partial{ background:#FDF2E3; color:#8a5a00; }
.pill-unpaid{ background:#FBE7E5; color:#B3261E; }

.settings-form h3{ font-size:13.5px; color:var(--navy); margin:16px 0 8px; font-family:Georgia, serif; }
.settings-form fieldset{ border:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; }
.settings-form .field{ max-width:340px; }

.pl-box{ max-width:460px; }
.pl-row{ display:flex; justify-content:space-between; padding:8px 4px; border-bottom:1px solid var(--border); font-size:14px; }
.pl-bold{ font-weight:700; font-size:16px; border-top:2px solid var(--navy); border-bottom:none; margin-top:6px; padding-top:10px; color:var(--navy); }

.print-overlay{ position:fixed; inset:0; background:rgba(20,20,20,.55); z-index:50; display:flex; align-items:flex-start; justify-content:center; overflow:auto; padding:30px 14px; }
.print-toolbar{ position:fixed; top:16px; right:16px; display:flex; gap:8px; }
.print-area{ background:#fff; width:100%; max-width:680px; padding:36px 40px; border-radius:4px; }
.doc-header{ display:flex; justify-content:space-between; border-bottom:2px solid var(--navy); padding-bottom:14px; margin-bottom:18px; }
.doc-company{ font-family:Georgia, serif; font-size:19px; font-weight:700; color:var(--navy); }
.doc-meta{ font-size:12px; color:#555; }
.doc-title-block{ text-align:right; }
.doc-title{ font-size:16px; font-weight:700; letter-spacing:.05em; color:var(--gold); }
.doc-party{ margin-bottom:14px; font-size:13.5px; }
.doc-table{ width:100%; border-collapse:collapse; margin-bottom:14px; }
.doc-table th{ background:#F1EEE4; }
.doc-table td, .doc-table th{ border:1px solid var(--border); padding:7px 9px; font-size:13px; }
.doc-k{ font-weight:600; width:160px; background:#FAF8F3; }
.doc-totals{ margin-left:auto; max-width:260px; font-size:13.5px; display:flex; flex-direction:column; gap:3px; }
.doc-grand{ font-weight:700; font-size:15.5px; border-top:1px solid var(--ink); padding-top:5px; margin-top:3px; }
.doc-footnote{ font-size:10.5px; color:#999; margin-top:14px; font-style:italic; }
.doc-sign-row{ display:flex; justify-content:space-between; margin-top:46px; font-size:12.5px; }

@media (max-width: 880px){
  .sidebar{ position:fixed; left:0; z-index:40; transform:translateX(-105%); transition:transform .22s ease; box-shadow:2px 0 16px rgba(0,0,0,.24); width:min(82vw, 320px); }
  .nav-open .sidebar{ transform:translateX(0); }
  .sidebar-backdrop{ display:block; position:fixed; inset:0; z-index:39; border:none; background:rgba(15,20,28,.42); backdrop-filter:blur(2px); }
  .mobile-toggle{ display:flex; position:fixed; top:14px; left:14px; z-index:41; background:var(--navy); color:#fff; border:none; padding:9px; border-radius:8px; box-shadow:0 8px 20px rgba(0,0,0,.18); }
  .content{ padding:64px 12px 20px; }
  .panel{ padding:16px 14px; }
  .crud-form{ padding:12px; }
  .field{ min-width:0; flex:1 1 180px; }
  .field input, .field select{ width:100%; }
  .period-row{ gap:12px; }
  .print-area{ padding:24px 18px; }
}

@media (max-width: 640px){
  .login-card{ padding:28px 20px; border-radius:12px; }
  .login-brand{ font-size:24px; }
  .content{ padding-left:10px; padding-right:10px; }
  .panel-head h2{ font-size:17px; }
  .stat-grid{ grid-template-columns:repeat(auto-fit, minmax(130px,1fr)); }
  .stat-value{ font-size:19px; }
  .subtabs{ overflow-x:auto; padding-bottom:2px; }
  .subtabs button{ white-space:nowrap; }
  .line-items{ overflow-x:auto; }
  .doc-header{ flex-direction:column; align-items:flex-start; gap:10px; }
  .doc-title-block{ text-align:left; }
  .doc-sign-row{ flex-direction:column; gap:18px; margin-top:28px; }
  .print-overlay{ padding:18px 10px; }
  .print-toolbar{ position:sticky; top:10px; right:auto; left:auto; flex-wrap:wrap; justify-content:flex-end; margin-bottom:10px; }
}

@media print{
  body *{ visibility:hidden; }
  .print-area, .print-area *{ visibility:visible; }
  .print-area{ position:absolute; top:0; left:0; width:100%; padding:0; }
  .no-print{ display:none !important; }
}
`;
