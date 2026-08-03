export default function FormField({ field, value, onChange }) {
  const inputType = field.inputType || (field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'password' ? 'password' : 'text');

  return (
    <div className="field">
      <label>{field.label}{field.required && <span className="req">*</span>}</label>
      {field.type === 'select' ? (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} required={field.required}>
          <option value="">Select…</option>
          {(field.options || []).map((option) => {
            const optionValue = typeof option === 'object' ? option.value : option;
            const optionLabel = typeof option === 'object' ? option.label : option;
            return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
          })}
        </select>
      ) : field.type === 'checkbox' ? (
        <label className="field-check">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{field.checkboxLabel || field.label}</span>
        </label>
      ) : (
        <input
          type={inputType}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      )}
    </div>
  );
}
