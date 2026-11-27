const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const BASE = ALPHABET.length;
const MIN_CHAR = ALPHABET[0]!;
const MAX_CHAR = ALPHABET[BASE - 1]!;
const MID_CHAR = ALPHABET[Math.floor(BASE / 2)]!;

function charIndex(ch: string): number {
  const idx = ALPHABET.indexOf(ch);
  if (idx === -1) {
    throw new Error(`Invalid lexorank character: "${ch}"`);
  }
  return idx;
}

/**
 * Generates a lexicographically ordered key strictly between `prev` and `next`
 * (using base-36 lowercase `[0-9a-z]`).
 */
export function rankBetween(
  prev?: string | null,
  next?: string | null,
): string {
  const left = prev ?? "";
  const right = next ?? "";

  if (left && right && left >= right) {
    throw new Error(`Invalid rank bounds: "${left}" >= "${right}"`);
  }

  let result = "";
  let i = 0;

  while (true) {
    const leftCode = i < left.length ? charIndex(left[i]!) : 0;
    const rightCode = i < right.length ? charIndex(right[i]!) : BASE;

    if (rightCode - leftCode > 1) {
      const mid = Math.floor((leftCode + rightCode) / 2);
      result += ALPHABET[mid]!;
      return result;
    }

    if (i < left.length) {
      result += left[i]!;
    } else if (i < right.length) {
      // Prefix of right is shorter; append MIN_CHAR so we stay < right,
      // wait: if left ended (leftCode = 0) and right[i] is '1' (rightCode = 1),
      // appending '0' makes result start with '0' < '1', then on next step we pick midpoint above 0.
      result += MIN_CHAR;
    } else {
      result += MID_CHAR;
      return result;
    }

    i++;
  }
}

export function rankAfter(prev?: string | null): string {
  if (!prev) return MID_CHAR;
  const last = prev[prev.length - 1]!;
  if (last === MAX_CHAR) {
    return `${prev}${MID_CHAR}`;
  }
  return rankBetween(prev, null);
}

export function rankBefore(next?: string | null): string {
  if (!next) return MID_CHAR;
  return rankBetween(null, next);
}
