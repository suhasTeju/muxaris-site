/**
 * Display formatting for Indian phone numbers stored as E.164 (`+91XXXXXXXXXX`).
 *
 * Landlines are grouped by their STD code, mobiles as 5 + 5. A landline's subscriber number
 * starts with 2-6, which is what tells `+91 80 4123 4567` (Bengaluru landline) apart from a
 * mobile in the 80xxx series such as `+91 80951 23456`. The STD lists are the codes clinics
 * are likely to use, not the full national plan; an unlisted landline that starts with 6-9
 * falls back to the mobile grouping, and anything else is returned unchanged.
 */

const codes = (...groups: string[]) => new Set(groups.join(" ").split(/\s+/).filter(Boolean));

/** Two-digit metro codes: Delhi, Pune, Mumbai, Kolkata, Hyderabad, Chennai, Ahmedabad, Bengaluru. */
const STD2 = codes("11 20 22 33 40 44 79 80");

/** Three-digit codes for the larger cities. */
const STD3 = codes(
  "816 820 821 824 831 836", // Karnataka
  "120 121 124 129 135 141 145 161 172 175 177 181 183 191 194", // North
  "231 240 253 261 265 281 291 294 832", // West
  "341 343 353 361 364 612 651 657 671 674", // East and North-east
  "413 416 422 427 431 452 462 471 474 477 481 484 487 491 495 497", // Tamil Nadu and Kerala
  "863 866 870 877 883 884 891", // Andhra Pradesh and Telangana
  "512 522 532 542 551 562 581 591 712 721 731 751 755 761 771", // Central
);

/** Four-digit codes for Karnataka district towns. */
const STD4 = codes(
  "8152 8156 8172 8182 8192 8194 8226 8232 8262 8272",
  "8352 8354 8372 8375 8382 8384 8392 8472 8482 8532",
);

const LANDLINE_SUBSCRIBER = /^[2-6]/;

export function formatIndianPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!(digits.length === 12 && digits.startsWith("91") && /^\s*\+?\s*91/.test(raw))) return raw;
  const n = digits.slice(2);

  for (const [len, std] of [
    [4, STD4],
    [3, STD3],
    [2, STD2],
  ] as const) {
    const code = n.slice(0, len);
    const sub = n.slice(len);
    if (!std.has(code) || !LANDLINE_SUBSCRIBER.test(sub)) continue;
    // 8 subscriber digits -> 4 + 4, 7 -> 3 + 4, 6 -> 2 + 4.
    return `+91 ${code} ${sub.slice(0, -4)} ${sub.slice(-4)}`;
  }

  if (/^[6-9]/.test(n)) return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
  return raw;
}
