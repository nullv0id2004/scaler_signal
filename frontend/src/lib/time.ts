import {
  format,
  isToday,
  isYesterday,
  isThisYear,
  formatDistanceToNowStrict,
} from "date-fns";

/** Short timestamp for message bubbles, e.g. "3:41 PM". */
export function formatTime(iso: string): string {
  return format(new Date(iso), "h:mm a");
}

/** Conversation-list preview timestamp: time today, "Yesterday", weekday, or date. */
export function formatListTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  if (isThisYear(d)) return format(d, "MMM d");
  return format(d, "MM/dd/yyyy");
}

/** Day divider label in the message list. */
export function formatDayDivider(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisYear(d)) return format(d, "EEEE, MMMM d");
  return format(d, "MMMM d, yyyy");
}

export function dayKey(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}

/** "last seen 5 minutes ago" style presence text. */
export function formatLastSeen(iso: string | null): string {
  if (!iso) return "offline";
  return `last seen ${formatDistanceToNowStrict(new Date(iso), { addSuffix: true })}`;
}
