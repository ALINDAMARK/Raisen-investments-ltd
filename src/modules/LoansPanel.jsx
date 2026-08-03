import { useState } from 'react';
import { Wallet } from 'lucide-react';
import CrudTable from '../components/CrudTable.jsx';
import { fmt, repaidFor, today } from '../factoryUtils.js';

export default function LoansPanel({ data, role }) {
  const [sub, setSub] = useState('loans');
  const loanSchema = [
    { key: 'reference', label: 'Loan Ref', type: 'text', required: true },
    { key: 'lender', label: 'Lender / Borrower', type: 'text', required: true },
    { key: 'type', label: 'Type', type: 'select', options: ['We Owe (Payable)', 'Owed To Us (Receivable)'], required: true },
    { key: 'principal', label: 'Principal (UGX)', type: 'number', required: true },
    { key: 'dateTaken', label: 'Date Taken', type: 'date', required: true, default: today() },
    { key: 'interestRate', label: 'Interest Rate (%)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'text' },
    { key: 'repaid', label: 'Repaid So Far (auto)', computed: true, render: (it) => fmt(repaidFor(it.reference, data.loanRepayments.items)) },
    { key: 'balance', label: 'Balance (auto)', computed: true, render: (it) => {
        const bal = (Number(it.principal) || 0) - repaidFor(it.reference, data.loanRepayments.items);
        return <b style={bal > 0 ? { color: '#B3261E' } : { color: '#2E7D32' }}>{fmt(bal)}</b>;
      } },
  ];
  const repaySchema = [
    { key: 'date', label: 'Date', type: 'date', required: true, default: today() },
    { key: 'reference', label: 'Loan Ref', type: 'select', options: data.loans.items.map((l) => l.reference), required: true },
    { key: 'amount', label: 'Amount (UGX)', type: 'number', required: true },
    { key: 'notes', label: 'Notes', type: 'text' },
  ];

  return (
    <div>
      <div className="subtabs">
        <button className={sub === 'loans' ? 'active' : ''} onClick={() => setSub('loans')}>Loans</button>
        <button className={sub === 'repay' ? 'active' : ''} onClick={() => setSub('repay')}>Repayments</button>
      </div>
      {sub === 'loans'
        ? <CrudTable title="Loans" icon={Wallet} schema={loanSchema} collection={data.loans} role={role}
            note="Old loans the factory already had before this system existed belong here too — just enter the original Date Taken and Principal, even if that date is in the past. The balance works itself out from any repayments logged below." />
        : <CrudTable title="Loan Repayments" icon={Wallet} schema={repaySchema} collection={data.loanRepayments} role={role} />}
    </div>
  );
}
