/**
 * Returns the image URL ready for use in an <img> tag.
 *
 * WB (wbbasket.ru) and Ozon CDN images load fine directly in browsers —
 * they don't use hotlink protection that would block <img> requests.
 * CORS only applies to fetch/XHR, not to <img> tags.
 *
 * Server proxy is kept for use cases where headers must be controlled,
 * but default display goes direct to avoid Docker-networking issues.
 */
export function proxyImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  return url;
}

/** Explicit server proxy — use only when direct load fails */
export function serverProxyImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('/')) return url;
  return `/api/media/proxy?url=${encodeURIComponent(url)}`;
}
