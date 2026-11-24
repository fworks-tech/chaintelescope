const publishedFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** "2026-10-26T12:00:00.000Z" -> "Oct 26, 2026, 12:00"; garbage passes through. */
export function formatPublished(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : `${publishedFormat.format(parsed)} UTC`;
}

/** "https://www.coindesk.com/rss" -> "www.coindesk.com"; garbage passes through. */
export function hostOf(source: string): string {
  try {
    return new URL(source).hostname || source;
  } catch {
    return source;
  }
}
