import { useEffect, useState } from 'react';
import FormField from '../components/FormField.jsx';

export default function SettingsPanel({ settings, settingsStore, editable }) {
  const [form, setForm] = useState(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const save = (e) => {
    e.preventDefault();
    settingsStore.save({ ...form, bonusRate: Number(form.bonusRate), vatRate: Number(form.vatRate) });
  };

  return (
    <div className="panel">
      <div className="panel-head"><h2>Settings</h2></div>
      <form className="settings-form" onSubmit={save}>
        <fieldset disabled={!editable}>
          <h3>Company details (used on printed documents)</h3>
          <FormField field={{ label: 'Company Name', type: 'text' }} value={form.companyName} onChange={(next) => setForm({ ...form, companyName: next })} />
          <FormField field={{ label: 'Address', type: 'text' }} value={form.companyAddress} onChange={(next) => setForm({ ...form, companyAddress: next })} />
          <FormField field={{ label: 'Phone', type: 'text' }} value={form.companyPhone} onChange={(next) => setForm({ ...form, companyPhone: next })} />
          <FormField field={{ label: 'TIN (Tax ID)', type: 'text' }} value={form.companyTin} onChange={(next) => setForm({ ...form, companyTin: next })} />

          <h3>Golden offer (bonus scheme)</h3>
          <p className="hint" style={{ marginTop: -4 }}>Each product has its own carton target — set it on the <b>Products</b> page (e.g. Ordinary = 20/shift, Waterproof = 25/shift). This rate applies to every product's extra cartons.</p>
          <FormField field={{ label: 'Bonus per Extra Carton (UGX)', type: 'number' }} value={form.bonusRate} onChange={(next) => setForm({ ...form, bonusRate: next })} />

          <h3>Tax / VAT</h3>
          <FormField field={{ label: 'VAT registered', type: 'checkbox', checkboxLabel: 'VAT registered' }} value={form.vatRegistered} onChange={(next) => setForm({ ...form, vatRegistered: next })} />
          <FormField field={{ label: 'VAT Rate (%)', type: 'number' }} value={form.vatRate} onChange={(next) => setForm({ ...form, vatRate: next })} />

          <button className="btn-primary" type="submit">Save Settings</button>
        </fieldset>
      </form>
      {!editable && <p className="hint">Owner view is read-only. Ask the Manager to change settings.</p>}
    </div>
  );
}
