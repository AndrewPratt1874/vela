export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

// Excel/Sheets/LibreOffice treat a leading =, +, - or @ as a formula, and they
// skip leading whitespace and control characters when deciding, so a title of
// "<tab>=cmd|..." evaluates just like "=cmd|...". Match the whole ignorable
// prefix rather than only character 0, or the guard is trivially bypassed.
const FORMULA_PREFIX = /^[\s\x00-\x1f]*[=+\-@]/

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // Leading apostrophe is the standard mitigation: the cell renders as text.
  const safe = FORMULA_PREFIX.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function useCsvExport() {
  /** Build CSV text (CRLF + BOM — what Excel expects) and trigger a download. */
  function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]) {
    const lines = [
      columns.map((c) => escapeCell(c.header)).join(','),
      ...rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(',')),
    ]
    // The BOM is what makes Excel read the file as UTF-8 rather than ANSI.
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return { downloadCsv }
}
