import CrudTable from '../components/CrudTable.jsx';
import { Factory } from 'lucide-react';
import { fmt, good, targetFor, today } from '../factoryUtils.js';

export default function ProductionPanel({ data, settings, role }) {
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
    { key: 'date', label: 'Date', type: 'date', required: true, default: today() },
    { key: 'employee', label: 'Employee', type: 'select', options: empNames, required: true },
    { key: 'shift', label: 'Shift', type: 'select', options: ['Day', 'Night'], required: true },
    { key: 'product', label: 'Product', type: 'select', options: prodNames, required: true },
    { key: 'machine', label: 'Machine', type: 'select', options: machNames },
    { key: 'cartonsMade', label: 'Cartons Made', type: 'number', required: true },
    { key: 'rejects', label: 'Rejects', type: 'number', default: 0 },
    { key: 'good', label: 'Good (auto)', computed: true, render: (it) => fmt(good(it)) },
    { key: 'target', label: 'Target (auto)', computed: true, render: (it) => fmt(targetFor(it.product, data.products.items)) },
    { key: 'rate', label: 'Rate/Carton', computed: true, render: (it) => fmt(rateFor(it.employee)) },
    { key: 'bonus', label: 'Bonus (auto)', computed: true, render: (it) => fmt(bonusFor(it)) },
    { key: 'total', label: 'Total Pay', computed: true, render: (it) => <b>{fmt(good(it) * rateFor(it.employee) + bonusFor(it))}</b> },
  ];

  const targetSummary = data.products.items.map((p) => `${p.name}: ${p.target || 0} cartons/shift`).join(' · ');

  return (
    <CrudTable
      title="Production Log"
      icon={Factory}
      schema={schema}
      collection={data.production}
      role={role}
      note={`Golden offer: each product has its own target — ${targetSummary || 'set targets on the Products page first'}. Every carton above a product's own target earns UGX ${fmt(settings.bonusRate)} bonus, added automatically. Employees who work both shifts just get two rows — one Day, one Night — each judged against its own target.`}
    />
  );
}
