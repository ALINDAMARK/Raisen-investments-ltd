import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import FormField from './FormField.jsx';

export default function CrudTable({ title, icon: Icon, schema, collection, role, note }) {
  const { items, add, update, remove } = collection;
  const editable = role !== 'owner';
  const emptyForm = () => Object.fromEntries(schema.filter((f) => !f.computed).map((f) => [f.key, f.default ?? '']));
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    const row = {};
    schema.filter((f) => !f.computed).forEach((f) => {
      row[f.key] = f.type === 'number' ? Number(form[f.key] || 0) : (form[f.key] || '');
    });
    if (editingId) {
      update(editingId, row);
      setEditingId(null);
    } else {
      add(row);
    }
    setForm(emptyForm());
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    const next = {};
    schema.filter((f) => !f.computed).forEach((f) => { next[f.key] = item[f.key]; });
    setForm(next);
  };

  const cancel = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

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
            <button className="btn-primary" type="submit">{editingId ? 'Update' : <><Plus size={14} /> Add</>}</button>
            {editingId && <button type="button" className="btn-ghost" onClick={cancel}>Cancel</button>}
          </div>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr>{schema.map((f) => <th key={f.key}>{f.label}</th>)}{editable && <th className="th-actions"></th>}</tr></thead>
          <tbody>
            {items.length === 0 && <tr><td className="empty" colSpan={schema.length + 1}>No records yet — add the first one above.</td></tr>}
            {[...items].reverse().map((it) => (
              <tr key={it.id}>
                {schema.map((f) => <td key={f.key}>{f.render ? f.render(it) : (f.type === 'number' ? Number(it[f.key] || 0).toLocaleString('en-UG', { maximumFractionDigits: 0 }) : it[f.key])}</td>)}
                {editable && (
                  <td className="row-actions">
                    <button onClick={() => startEdit(it)} title="Edit"><Pencil size={14} /></button>
                    <button onClick={() => remove(it.id)} title="Delete"><Trash2 size={14} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
