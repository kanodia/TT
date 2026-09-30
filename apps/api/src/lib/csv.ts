import ExcelJS from 'exceljs';

/** RFC 4180 CSV: quoted fields may contain commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

/** First worksheet of an .xlsx file as rows of strings. */
export async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow((r) => {
    const values = (r.values as unknown[]).slice(1).map((v) => {
      if (v == null) return '';
      if (typeof v === 'object' && v && 'text' in v) return String((v as { text: unknown }).text);
      if (typeof v === 'object' && v && 'result' in v) return String((v as { result: unknown }).result);
      return String(v);
    });
    if (values.some((c) => c.trim())) rows.push(values.map((c) => c.trim()));
  });
  return rows;
}

/** Drops a header row if its first cell matches. */
export function withoutHeader(rows: string[][], firstColumn: string) {
  return rows.length && rows[0][0]?.toLowerCase() === firstColumn ? rows.slice(1) : rows;
}
