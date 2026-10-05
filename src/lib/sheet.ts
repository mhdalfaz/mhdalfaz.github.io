/**
 * Google Sheets (gviz) reader.
 *
 * The project data lives in a published Google Sheet. We read it over the
 * public `gviz` endpoint, which returns JSONP-ish output:
 *
 *   /*O_o*\/ google.visualization.Query.setResponse({...});
 *
 * Two details matter and both bit us before:
 *
 * 1. The wrapping prefix length is NOT stable. The old code did
 *    `data.substr(47)`, which only worked for one exact response shape.
 *    We instead slice from the first `{` to the last `}`.
 * 2. Empty cells are present in the row but are `null`, not missing, so we
 *    cannot index positionally without null checks.
 */

export interface SheetColumn {
  id: string;
  label: string;
  type: string;
}

export interface SheetCell {
  v?: string | number | null;
  /** Formatted value. Needed because numeric cells can arrive as 4.22176687E8. */
  f?: string | null;
}

export interface SheetRow {
  c?: (SheetCell | null)[];
}

export interface SheetResponse {
  table?: {
    cols?: SheetColumn[];
    rows?: SheetRow[];
  };
}

/** Column label -> row value, as a flat string map. */
export type SheetRecord = Record<string, string>;

/**
 * The published-sheet URL. Kept in one place so it is obvious what the
 * single external dependency of this site is.
 */
export const SHEET_ID = '1BwKhsJY7Awg7OPXUg8JK9liv-6ZyljiyQ-a4B_KJ4U8';

export function sheetUrl(sheetId: string = SHEET_ID): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
}

/** Strip the gviz callback wrapper and parse the JSON payload. */
export function parseGviz(raw: string): SheetResponse {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Unexpected gviz response: no JSON object found.');
  }
  return JSON.parse(raw.slice(start, end + 1)) as SheetResponse;
}

/**
 * Convert the positional gviz rows into label-keyed records.
 *
 * We key by the sheet's own header labels rather than by column index so
 * that reordering or inserting columns in the sheet can never silently shift
 * every value into the wrong field.
 */
export function toRecords(response: SheetResponse): SheetRecord[] {
  const cols = response.table?.cols ?? [];
  const rows = response.table?.rows ?? [];

  return rows.map((row) => {
    const record: SheetRecord = {};
    cols.forEach((col, index) => {
      const cell = row.c?.[index];
      if (!cell) return;
      const value = cell.f ?? cell.v;
      if (value === null || value === undefined) return;
      const text = String(value).trim();
      if (text !== '') record[col.label] = text;
    });
    return record;
  });
}

/** Fetch and flatten the sheet in one step. */
export async function fetchSheetRecords(
  options: { sheetId?: string; init?: RequestInit } = {},
): Promise<SheetRecord[]> {
  const { sheetId = SHEET_ID, init } = options;
  const response = await fetch(sheetUrl(sheetId), init);
  if (!response.ok) {
    throw new Error(`Google Sheets responded with ${response.status} ${response.statusText}`);
  }
  const raw = await response.text();
  return toRecords(parseGviz(raw));
}