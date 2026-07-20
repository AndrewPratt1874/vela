export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // Excel treats a leading =, +, - or @ as a formula. Prefix with a quote so
  // exported titles can't execute in the recipient's spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
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
