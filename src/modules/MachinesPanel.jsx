import { useState } from 'react';
import { Wrench } from 'lucide-react';
import CrudTable from '../components/CrudTable.jsx';
import { today } from '../factoryUtils.js';

export default function MachinesPanel({ data, role }) {
  const [sub, setSub] = useState('machines');
  const machSchema = [
    { key: 'name', label: 'Machine', type: 'text', required: true },
    { key: 'type', label: 'Type', type: 'select', options: ['Extruder', 'Cutter', 'Other'] },
    { key: 'status', label: 'Status', type: 'select', options: ['Running', 'Stopped', 'Maintenance'], required: true, default: 'Running' },
    { key: 'operator', label: 'Operator', type: 'select', options: data.employees.items.map((e) => e.name) },
  ];
  const logSchema = [
    { key: 'date', label: 'Date', type: 'date', required: true, default: today() },
    { key: 'machine', label: 'Machine', type: 'select', options: data.machines.items.map((m) => m.name), required: true },
    { key: 'issue', label: 'Issue', type: 'text', required: true },
    { key: 'action', label: 'Action Taken', type: 'text' },
    { key: 'technician', label: 'Technician', type: 'text' },
    { key: 'cost', label: 'Cost (UGX)', type: 'number', default: 0 },
    { key: 'status', label: 'Status', type: 'select', options: ['Open', 'In Progress', 'Resolved'], default: 'Open' },
  ];

  return (
    <div>
      <div className="subtabs">
        <button className={sub === 'machines' ? 'active' : ''} onClick={() => setSub('machines')}>Machines</button>
        <button className={sub === 'logs' ? 'active' : ''} onClick={() => setSub('logs')}>Maintenance Log</button>
      </div>
      {sub === 'machines'
        ? <CrudTable title="Machines" icon={Wrench} schema={machSchema} collection={data.machines} role={role} />
        : <CrudTable title="Maintenance Log" icon={Wrench} schema={logSchema} collection={data.maintenance} role={role} />}
    </div>
  );
}
