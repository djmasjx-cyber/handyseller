/** Согласовано с cron `marketplace-token-rotation` и ops-алертами. */
export const MARKETPLACE_TOKEN_EXPIRING_SOON_DAYS = 7;

export type MarketplaceTokenExpiryStatus = 'ok' | 'expiring' | 'expired' | 'unknown';

export function classifyMarketplaceTokenExpiry(expiresAt: Date | null): {
  status: MarketplaceTokenExpiryStatus;
  expiresAtIso: string | null;
  daysRemaining: number | null;
} {
  if (!expiresAt) {
    return { status: 'unknown', expiresAtIso: null, daysRemaining: null };
  }
  const ms = expiresAt.getTime() - Date.now();
  const daysRemaining = Math.ceil(ms / 86_400_000);
  const expiresAtIso = expiresAt.toISOString();
  if (ms < 0) {
    return { status: 'expired', expiresAtIso, daysRemaining };
  }
  if (daysRemaining <= MARKETPLACE_TOKEN_EXPIRING_SOON_DAYS) {
    return { status: 'expiring', expiresAtIso, daysRemaining };
  }
  return { status: 'ok', expiresAtIso, daysRemaining };
}
