import type { ReactNode } from "react";

export type AdminDataTableColumn<T> = {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

export function AdminDataTable<T>({
  ariaLabel,
  columns,
  minWidth = "760px",
  rowKey,
  rows
}: {
  ariaLabel: string;
  columns: AdminDataTableColumn<T>[];
  minWidth?: string;
  rowKey: (row: T) => string;
  rows: T[];
}) {
  return (
    <div className="overflow-x-auto">
      <table
        aria-label={ariaLabel}
        className="w-full border-collapse text-left text-sm"
        style={{ minWidth }}
      >
        <thead>
          <tr className="border-b border-radar-line text-xs uppercase tracking-normal text-radar-muted">
            {columns.map((column) => (
              <th
                className={`py-2.5 pr-4 font-semibold ${column.className ?? ""}`}
                key={column.header}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-radar-line last:border-0" key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  className={`py-2.5 pr-4 align-top ${column.className ?? ""}`}
                  key={column.header}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
