const CANONICAL_HOST = "meatup.club";
const LEGACY_HOST = "www.meatup.club";

export function getCanonicalRedirectUrl(requestUrl: string): string | null {
  const url = new URL(requestUrl);

  if (url.hostname !== LEGACY_HOST && url.protocol === "https:") {
    return null;
  }

  url.hostname = CANONICAL_HOST;
  url.protocol = "https:";
  return url.toString();
}
