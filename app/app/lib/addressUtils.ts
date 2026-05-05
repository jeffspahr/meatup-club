// US states + DC + populated territories. Restricting to this list avoids
// false positives on two-letter country codes like "UK" or "DE".
const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR", "VI", "GU", "AS", "MP",
]);

const STATE_REGEX = /^([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/;

export interface CityState {
  city: string;
  state: string;
}

/**
 * Parse a Google-formatted address string into city + state. Returns null
 * when the address cannot be confidently parsed (non-US, missing parts, etc.)
 * so callers can render blank cells.
 */
export function parseCityState(address: string | null | undefined): CityState | null {
  if (!address) return null;

  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i--) {
    const match = parts[i].match(STATE_REGEX);
    if (match && US_STATES.has(match[1]) && i > 0) {
      const city = parts[i - 1];
      if (city) {
        return { city, state: match[1] };
      }
    }
  }

  return null;
}
