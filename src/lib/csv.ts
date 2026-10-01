export type CsvColumn<T> = {
  label: string;
  value: (row: T) => unknown;
};

export function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]) {
  const header = columns.map((col) => escapeCsv(col.label)).join(',');
  const body = rows.map((row) =>
    columns.map((col) => escapeCsv(col.value(row))).join(','),
  );
  return [header, ...body].join('\n');
}
