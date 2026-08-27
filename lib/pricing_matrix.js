// Official B2B Wholesale Prices (EUR) for Capote Eyewear (68 Models)
export const MODEL_WHOLESALE_PRICES = {
  // AREA — Titanium
  '825HZ': 185,
  'ACX128': 185,
  'ACX1123': 185,
  'ACX221': 185,
  'ACX223': 185,
  'ACX285': 185,
  'ACX696': 185,
  'ACX662': 185,
  'ACX763': 185,
  'AMOUR': 185,
  'CC011': 185,
  'ACX222': 205,
  'ACX365': 205,
  'ACX777': 205,
  'ACX888': 205,
  'ACX741': 222,
  'ACX650': 235,
  'WALKING': 235,
  'WALKING DREAMS': 235,

  // KAIZEN — Acetate (explicit entry: prevents prefix-collision with 'KENAZ' 260€).
  // WP 115€ CONFIRMED by Franca — email 18-08-2026.
  'KENAZ 987': 115,
  'KENAZ987': 115,

  // Final 4 — WP confirmed by Franca (18-08-2026). Closes the price list.
  // Titanium tier (490€ retail -> 185€ wholesale):
  'ACX0989': 185,
  'ACX1335': 185,
  'INNERX': 185,
  // CC213: 590€ retail -> 235€. Explicit entry REQUIRED so it exact-matches in pass 1
  // instead of falling through to the 'CC21' prefix (which wrongly gave 185€).
  'CC213': 235,

  // ——— New 2026 models — WP confirmed by Franca (email 18-08-2026) ———
  // Titanium tier (490€ retail -> 185€ wholesale)
  'CC34': 185,
  'CC02': 185,
  'CC08': 185,
  'CC144': 185,
  'ACX225': 185,
  'CC417': 185,
  'ECOSX': 185,
  'KUMBH': 185,
  // Acetate tier (299€ retail -> 115€ wholesale)
  'CC1597': 115,
  'CC6765': 115,
  'CS36X': 115,
  'CATX': 115,
  // Special tier (250€ retail)
  'MIAMI ADVICE': 100,
  'MIAMIADVICE': 100,

  // ANIMISM — Titanium
  '226AC': 185,
  'CC21': 185,
  'CC55': 185,
  'CC13': 235,
  'KENAZ999': 235,

  // GINGA — Titanium
  'CACAU': 185,
  'CIPÓ': 185,
  'CIPO': 185,
  'GURI': 185,
  'JACARÉ': 185,
  'JACARE': 185,
  'PACA': 185,
  'PAJÉ': 235,
  'PAJE': 235,

  // ANTHOLOGY — Titanium
  'CC896': 235,

  // ANIMISM — Acetate
  'CC2584': 115,
  'CC377': 115,
  'CC4181': 115,
  'CC963': 115,

  // KAIZEN — Acetate
  'CC610': 115,
  'UKO': 115,
  'SOA': 115,
  'CC432': 115,
  'GUO': 115,

  // PAPER CLIP
  'C001': 165,
  'C002': 165,
  'C003': 165,
  'C004': 165,
  'C005': 165,
  'C006': 165,
  'C007': 165,
  'C008': 165,
  'C009': 165,
  'C10': 165,
  'C010': 165,

  // MEMENTO
  'C393': 220,
  'C396': 220,
  'C399': 220,
  'C397': 260,
  'KENAZ': 260,
  'KENAZ X': 260,

  // BORDERLINE
  '227AC': 185,
  'MAXA24': 185,
  'CC012': 185,
  'CC015': 185,
  'CC017': 185,
  'CC17': 185,
  'CC019': 185,

  // HYBRID
  'CC610X': 165,
  'VIENA X AVIATOR': 167,
  'VIENA': 167,
  'C30': 290,
  'RIMLESS C30': 290,
  'C33': 290,
  'RIMLESS C33': 290,
  'C36': 290,
  'RIMLESS C36': 290,
  'C39': 290,
  'RIMLESS C39': 290,

  // INCUBUS GOGGLES
  'INCUBUS': 235
};

export function getWholesalePrice(productTitle, variantSku) {
  const pTitle = (productTitle || '').trim().toUpperCase();
  const vSku = (variantSku || '').trim().toUpperCase();

  // Exclude POS, cases, accessories, custom items
  if (
    pTitle.includes('POS ') || pTitle.includes(' POS') || pTitle.includes('CASE') ||
    pTitle.includes('BAG') || pTitle.includes('LENSES') || pTitle.includes('CERTIFICATE') ||
    pTitle.includes('TEMPLE') || pTitle.includes('CUSTOM')
  ) {
    return null;
  }

  const sortedKeys = Object.keys(MODEL_WHOLESALE_PRICES).sort((a, b) => b.length - a.length);

  // 1. Direct match on product title or SKU
  for (const k of sortedKeys) {
    const wp = MODEL_WHOLESALE_PRICES[k];
    if (pTitle === k) return wp;
    if (vSku.startsWith(k + '/') || vSku === k) return wp;
  }

  // 2. Contains match
  for (const k of sortedKeys) {
    const wp = MODEL_WHOLESALE_PRICES[k];
    if (pTitle.startsWith(k + ' ') || pTitle.includes(' ' + k)) return wp;
    if (vSku.startsWith(k)) return wp;
  }

  return null;
}
