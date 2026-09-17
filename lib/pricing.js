import { getWholesalePrice } from './pricing_matrix.js';

/**
 * Derives the pricing tier key from customer session tags.
 * Tags starting with 'b2b_distribut' -> 'distributer'
 * Tags starting with 'b2b_consign' -> 'consignment'
 * Otherwise -> 'base'
 *
 * @param {string[]} [tags=[]]
 * @returns {'distributer' | 'consignment' | 'base'}
 */
export function getTierKey(tags = []) {
  const tagList = Array.isArray(tags) ? tags : [];
  for (const rawTag of tagList) {
    const t = String(rawTag).trim().toLowerCase();
    if (t.startsWith('b2b_distribut')) return 'distributer';
    if (t.startsWith('b2b_consign')) return 'consignment';
  }
  return 'base';
}

/**
 * Resolves the B2B wholesale unit price (EUR) for a product variant.
 * 1. Checks variant metafield tierPrices for the customer's tier.
 * 2. If positive number, returns it.
 * 3. Otherwise falls back to getWholesalePrice from the hardcoded pricing matrix.
 * 4. Otherwise returns null.
 *
 * @param {Object} item
 * @param {Object} [item.tierPrices]
 * @param {number|null} [item.tierPrices.base]
 * @param {number|null} [item.tierPrices.distributer]
 * @param {number|null} [item.tierPrices.consignment]
 * @param {string} [item.productTitle]
 * @param {string} [item.sku]
 * @param {string[]} [tags=[]]
 * @returns {number|null}
 */
export function resolveB2BPrice(item = {}, tags = []) {
  const tier = getTierKey(tags);
  const tierPrices = item?.tierPrices;
  if (
    tierPrices &&
    typeof tierPrices[tier] === 'number' &&
    Number.isFinite(tierPrices[tier]) &&
    tierPrices[tier] > 0
  ) {
    return tierPrices[tier];
  }

  const fallback = getWholesalePrice(item?.productTitle, item?.sku);
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }

  return null;
}
