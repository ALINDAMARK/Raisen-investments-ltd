import { useState } from 'react';
import { Boxes } from 'lucide-react';
import CrudTable from '../components/CrudTable.jsx';
import { fmt, stockBalance, today } from '../factoryUtils.js';

export default function StoresPanel({ data, role }) {
  const [sub, setSub] = useState('materials');
  const matNames = data.rawMaterials.items.map((m) => m.name);

  const matSchema = [
    { key: 'name', label: 'Material', type: 'text', required: true },
    { key: 'unit', label: 'Unit', type: 'text', default: 'KG' },
    { key: 'opening', label: 'Opening Stock', type: 'number', default: 0 },
    { key: 'unitCost', label: 'Unit Cost (UGX)', type: 'number', default: 0 },
    { key: 'minStock', label: 'Reorder Level', type: 'number', default: 0 },
    { key: 'balance', label: 'Balance (auto)', computed: true, render: (it) => {
        const bal = stockBalance(it, data);
        const low = bal < (Number(it.minStock) || 0);
        return <b style={low ? { color: '#B3261E' } : undefined}>{fmt(bal)} {low ? '⚠' : ''}</b>;
      } },
    { key: 'value', label: 'Stock Value (auto)', computed: true, render: (it) => fmt(stockBalance(it, data) * (Number(it.unitCost) || 0)) },
  ];
  const grnSchema = [
    { key: 'date', label: 'Date', type: 'date', required: true, default: today() },
    { key: 'supplier', label: 'Supplier', type: 'select', options: data.suppliers.items.map((s) => s.name), required: true },
    { key: 'supplierBillNo', label: "Supplier's Bill/Invoice No.", type: 'text' },
    { key: 'supplierDNNo', label: "Supplier's Delivery Note No.", type: 'text' },
    { key: 'material', label: 'Material', type: 'select', options: matNames, required: true },
    { key: 'qty', label: 'Qty', type: 'number', required: true },
    { key: 'unitCost', label: 'Unit Cost', type: 'number' },
    { key: 'total', label: 'Total (auto)', computed: true, render: (it) => fmt((Number(it.qty) || 0) * (Number(it.unitCost) || 0)) },
  ];
  const issueSchema = [
    { key: 'date', label: 'Date', type: 'date', required: true, default: today() },
    { key: 'material', label: 'Material', type: 'select', options: matNames, required: true },
    { key: 'qty', label: 'Qty Issued', type: 'number', required: true },
    { key: 'dept', label: 'To Department', type: 'select', options: ['Production', 'Stores', 'Maintenance', 'Other'] },
  ];

  return (
    <div>
      <div className="subtabs">
        <button className={sub === 'materials' ? 'active' : ''} onClick={() => setSub('materials')}>Raw Materials</button>
        <button className={sub === 'grn' ? 'active' : ''} onClick={() => setSub('grn')}>Goods Received (GRN)</button>
        <button className={sub === 'issue' ? 'active' : ''} onClick={() => setSub('issue')}>Material Issued</button>
      </div>
      {sub === 'materials' && <CrudTable title="Raw Materials" icon={Boxes} schema={matSchema} collection={data.rawMaterials} role={role} note="Balance updates itself from GRN and Material Issued below — don't edit it directly." />}
      {sub === 'grn' && <CrudTable title="Goods Received Note (GRN)" icon={Boxes} schema={grnSchema} collection={data.grn} role={role} />}
      {sub === 'issue' && <CrudTable title="Material Issued to Production" icon={Boxes} schema={issueSchema} collection={data.materialIssue} role={role} />}
    </div>
  );
}
