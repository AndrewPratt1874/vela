/** An "empty" TipTap document is '<p></p>', not ''. Treat such content as blank. */
export function isRichTextEmpty(html: string | null | undefined): boolean {
  if (!html) return true
  return !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

/** Normalise empty rich-text to null for storage. */
export function richTextOrNull(html: string | null | undefined): string | null {
  return isRichTextEmpty(html) ? null : (html as string)
}
