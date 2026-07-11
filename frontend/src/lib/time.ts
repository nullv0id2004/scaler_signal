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

/** Disappearing-message timer options shown in the conversation info drawer. */
export const DISAPPEARING_OPTIONS: { label: string; seconds: number | null }[] = [
  { label: "Off", seconds: null },
  { label: "30 seconds", seconds: 30 },
  { label: "5 minutes", seconds: 300 },
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86400 },
  { label: "1 week", seconds: 604800 },
];

/** Compact label for a disappearing-message duration, e.g. "5m", "1h". Used in the Header badge. */
export function formatDisappearingLabel(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)}d`;
  return `${Math.round(seconds / 604800)}w`;
}

/** Compact remaining-time label for a message's expires_at, e.g. "23h left". Null once expired. */
export function formatExpiresIn(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const seconds = Math.ceil(ms / 1000);
  const label = formatDisappearingLabel(seconds) ?? `${seconds}s`;
  return `${label} left`;
}
