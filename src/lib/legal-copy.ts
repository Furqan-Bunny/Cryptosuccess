// Policy wording shared by the pricing FAQ, the Terms of Service and the Privacy
// Policy. These pages must say the same thing, so the sentences live here once
// instead of being copied (and drifting) between them.

/** Refund window for a first Pro payment, in days. */
export const REFUND_DAYS = 14;

/** How crypto payments are refunded. */
export const CRYPTO_REFUND_TERMS =
  'Refunds for cryptocurrency payments are paid in cryptocurrency to an address you provide, for the original USD amount, less any network fees.';

/** Which signals enter the scored, anchored track record (and which do not). */
export const TRACK_RECORD_SCOPE =
  'Every signal generated on the website, and every Telegram call from a linked account whose price levels can be recorded, is scored and kept in the track record. Telegram reads from unlinked chats and daily alert digests are not recorded.';

/** How a recorded signal is scored. */
export const SCORING_METHOD =
  'A signal is scored once, against the market price when it is checked 24 hours or more after it was made. Price moves during that time are not counted, so a stop-loss touched earlier and then recovered is not scored as a loss.';
