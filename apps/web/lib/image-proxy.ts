/**
 * Returns a server-proxied URL for external marketplace images.
 *
 * This bypasses CORS and hotlink-protection headers that WB/Ozon CDNs
 * may set, ensuring images always render in the browser regardless of
 * origin policies. The proxy endpoint is /api/media/proxy (NestJS).
 *
 * Pattern used by Notion, Linear, Figma and other mature SaaS products.
 */
export function proxyImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  // Already a relative/local URL — no proxy needed
  if (url.startsWith('/')) return url;
  // Already proxied
  if (url.includes('/api/media/proxy')) return url;
  return `/api/media/proxy?url=${encodeURIComponent(url)}`;
}
