// Built-in avatars users can pick without uploading a photo. Each is a small
// self-contained SVG encoded as a data: URI, so it stores directly in
// `avatar_url` and renders on every client (resolveMediaUrl passes `data:`
// through untouched) — no asset hosting needed.

const COLORS = [
  "#3a76f0", // signal blue
  "#2ecc71", // green
  "#9b59b6", // purple
  "#e67e22", // orange
  "#e74c3c", // red
  "#1abc9c", // teal
  "#f1c40f", // yellow
  "#34495e", // slate
];

function silhouette(bg: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>` +
    `<rect width='100' height='100' fill='${bg}'/>` +
    `<circle cx='50' cy='40' r='17' fill='#ffffff' fill-opacity='0.92'/>` +
    `<path d='M24 84c0-14 12-23 26-23s26 9 26 23z' fill='#ffffff' fill-opacity='0.92'/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const PRESET_AVATARS: string[] = COLORS.map(silhouette);
