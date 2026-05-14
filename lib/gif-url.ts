const ALLOWED_HOSTS = new Set([
  "giphy.com", "media.giphy.com", "i.giphy.com",
  "tenor.com", "media.tenor.com", "c.tenor.com",
]);

export function isValidGifUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    if (u.pathname.toLowerCase().endsWith(".gif")) return true;
    return ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}
