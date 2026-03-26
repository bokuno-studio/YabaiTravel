/**
 * Currency conversion utilities for JPY ↔ USD display.
 *
 * All costs in the DB are stored in JPY (or the original entry_fee_currency).
 * On English pages we convert to USD using a static rate.
 */

/** Static exchange rate: 1 USD = 150 JPY */
export const JPY_PER_USD = 150

/** Convert various source currencies to JPY */
export const FX_TO_JPY: Record<string, number> = {
  JPY: 1, USD: 150, EUR: 165, GBP: 190, CAD: 110, AUD: 100, NZD: 90,
  PHP: 3, THB: 4, SGD: 112,
}

/** Convert various source currencies to USD */
export const FX_TO_USD: Record<string, number> = {
  USD: 1, JPY: 1 / 150, EUR: 1.1, GBP: 1.27, CAD: 0.73, AUD: 0.67, NZD: 0.6,
  PHP: 0.02, THB: 0.027, SGD: 0.75,
}

/** Convert a JPY amount to USD (rounded) */
export function convertJpyToUsd(amountJpy: number): number {
  return Math.round(amountJpy / JPY_PER_USD)
}

/**
 * Format an amount with the appropriate currency symbol.
 * @param amount  Numeric value
 * @param isEn    true → USD format ($X,XXX), false → JPY format (¥X,XXX)
 */
export function formatCurrency(amount: number, isEn: boolean): string {
  if (isEn) {
    return `$${convertJpyToUsd(amount).toLocaleString()}`
  }
  return `\u00a5${amount.toLocaleString()}`
}

/**
 * Extract a numeric yen value from a cost string like "¥15,000" or
 * "約15,000円～200,000円" and convert to USD display string.
 * Returns the original string if no number is found.
 */
export function costStringToUsd(cost: string | null | undefined): string | null {
  if (!cost) return null
  const match = cost.match(/[\d,]+/)
  if (!match) return cost
  const yen = parseInt(match[0].replace(/,/g, ''), 10)
  if (isNaN(yen) || yen === 0) return cost
  return `$${convertJpyToUsd(yen).toLocaleString()}`
}
