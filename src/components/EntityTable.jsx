export default function EntityTable({
  schema,
  items,
  editable,
  onEdit,
  onDelete,
  emptyMessage,
  rowKey = 'id',
  renderCell,
  rowAction,
}) {
  const hasActions = Boolean(editable || onEdit || onDelete || rowAction);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {schema.map((field) => <th key={field.key}>{field.label}</th>)}
            {hasActions && <th className="th-actions"></th>}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td className="empty" colSpan={schema.length + 1}>{emptyMessage}</td></tr>}
          {[...items].reverse().map((item) => (
            <tr key={item[rowKey]}>
              {schema.map((field) => {
                const value = renderCell ? renderCell(item, field) : (field.render ? field.render(item) : (field.type === 'number' ? item[field.key] : item[field.key]));
                return <td key={field.key}>{value}</td>;
              })}
              {hasActions && (
                <td className="row-actions">
                  {editable && onEdit && <button onClick={() => onEdit(item)} title="Edit">Edit</button>}
                  {editable && onDelete && <button onClick={() => onDelete(item)} title="Delete">Delete</button>}
                  {rowAction && rowAction(item)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
