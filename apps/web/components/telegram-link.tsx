"use client";

import { type ComponentPropsWithoutRef, useCallback } from "react";

interface TelegramLinkProps extends Omit<ComponentPropsWithoutRef<"a">, "href" | "onClick"> {
  /** Telegram username without @, e.g. "Handyseller_bot" */
  username: string;
  /** Optional UTM/start param for tracking the source */
  source?: string;
}

/**
 * Smart Telegram deep-link button.
 * Tries to open the Telegram app directly (tg:// protocol).
 * If the app is not installed, falls back to the web link after a short delay.
 */
export function TelegramLink({
  username,
  source = "site",
  children,
  className,
  ...rest
}: TelegramLinkProps) {
  const webUrl = `https://t.me/${username}?start=${source}`;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();

      // Attempt to open the Telegram app via the tg:// protocol (works on
      // desktop Telegram and mobile when the app is installed).
      window.location.href = `tg://resolve?domain=${username}&start=${source}`;

      // After 600 ms, if the user is still on the page (app not installed /
      // not opened), fall back to the web version in a new tab.
      setTimeout(() => {
        window.open(webUrl, "_blank", "noopener,noreferrer");
      }, 600);
    },
    [username, source, webUrl],
  );

  return (
    <a
      href={webUrl}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      {...rest}
    >
      {children}
    </a>
  );
}
