import { useState } from 'react';
import { FileText, Plus, Printer, Trash2 } from 'lucide-react';
import FormField from '../components/FormField.jsx';
import PrintModal, { DocHeader } from '../components/PrintDocument.jsx';
import { fmt, invoiceTotal, today } from '../factoryUtils.js';

export default function SalesPanel({ data, settings, settingsStore, editable }) {
  const blankLine = () => ({ product: '', qty: 1, unitPrice: 0 });
  const [customer, setCustomer] = useState('');
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
    const n = await settingsStore.bump('invoiceCounter');
    const invoiceNo = `INV-${String(n).padStart(4, '0')}`;
    data.sales.add({ invoiceNo, date, customer, items: lines, vatAmount, amountPaid: Number(amountPaid) || 0 });
    setCustomer('');
    setLines([blankLine()]);
    setAmountPaid(0);
    setDate(today());
  };

  const statusOf = (inv) => {
    const bal = invoiceTotal(inv) - (Number(inv.amountPaid) || 0);
    if (bal <= 0) return 'Paid';
    if ((Number(inv.amountPaid) || 0) === 0) return 'Unpaid';
    return 'Partial';
  };

  return (
    <div className="panel">
      <div className="panel-head"><FileText size={19} /><h2>Sales / Invoices</h2></div>
      {settings.vatRegistered
        ? <p className="hint">VAT-registered: invoices apply {settings.vatRate}% VAT and are formatted EFRIS-ready. Not yet transmitted to URA live.</p>
        : <p className="hint">Not VAT-registered. Turn this on in Settings once you register for VAT / EFRIS.</p>}

      {editable && (
        <form className="crud-form" onSubmit={saveInvoice} style={{ flexWrap: 'wrap' }}>
          <FormField field={{ label: 'Customer', type: 'select', required: true, options: data.customers.items.map((c) => c.name) }} value={customer} onChange={setCustomer} />
          <FormField field={{ label: 'Date', type: 'date' }} value={date} onChange={setDate} />
          <FormField field={{ label: 'Amount Paid Now', type: 'number' }} value={amountPaid} onChange={setAmountPaid} />
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
          <DocHeader settings={settings} docType={settings.vatRegistered ? 'TAX INVOICE' : 'INVOICE'} docNo={viewDoc.invoiceNo} date={viewDoc.date} />
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
