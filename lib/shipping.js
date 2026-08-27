/**
 * Calculate shipping cost based on warehouse, destination country, and total items (weight)
 * Weight estimate: ~0.25 kg per frame / item
 */

// National (Spain / Portugal) Rates (in EUR)
const SPAIN_PORTUGAL_RATES = {
  ES: [ // Spain Mainland (Peninsular)
    { maxKg: 1, cost: 3.68 },
    { maxKg: 2, cost: 3.96 },
    { maxKg: 3, cost: 4.45 },
    { maxKg: 4, cost: 4.67 },
    { maxKg: 5, cost: 5.08 },
    { maxKg: 6, cost: 5.57 },
    { maxKg: 7, cost: 6.06 },
    { maxKg: 8, cost: 6.53 },
    { maxKg: 9, cost: 7.02 },
    { maxKg: 10, cost: 7.51 },
  ],
  PT: [ // Portugal
    { maxKg: 1, cost: 4.97 },
    { maxKg: 2, cost: 5.36 },
    { maxKg: 3, cost: 5.89 },
    { maxKg: 4, cost: 6.67 },
    { maxKg: 5, cost: 7.33 },
    { maxKg: 6, cost: 8.22 },
    { maxKg: 7, cost: 9.13 },
    { maxKg: 8, cost: 10.00 },
    { maxKg: 9, cost: 10.90 },
    { maxKg: 10, cost: 11.79 },
  ]
};

// EU Terrestre (UPS) Zones
const EU_ZONE_MAP = {
  DE: 'A', FR: 'A', IT: 'A',
  BE: 'B', LU: 'B', NL: 'B', MC: 'B',
  CZ: 'C', PL: 'C',
  AT: 'D', BG: 'D', HR: 'D', DK: 'D', SK: 'D', SI: 'D', EE: 'D', FI: 'D', GR: 'D', HU: 'D', IE: 'D', LV: 'D', LT: 'D', RO: 'D', SE: 'D',
  GB: 'E'
};

const EU_RATES = {
  A: [ { maxKg: 1, cost: 12.79 }, { maxKg: 2, cost: 14.22 }, { maxKg: 3, cost: 14.20 }, { maxKg: 4, cost: 16.23 }, { maxKg: 5, cost: 16.21 }, { maxKg: 10, cost: 21.71 } ],
  B: [ { maxKg: 1, cost: 13.98 }, { maxKg: 2, cost: 16.45 }, { maxKg: 3, cost: 16.45 }, { maxKg: 4, cost: 18.49 }, { maxKg: 5, cost: 18.49 }, { maxKg: 10, cost: 23.91 } ],
  C: [ { maxKg: 1, cost: 12.79 }, { maxKg: 2, cost: 14.20 }, { maxKg: 3, cost: 14.22 }, { maxKg: 4, cost: 16.24 }, { maxKg: 5, cost: 16.23 }, { maxKg: 10, cost: 22.64 } ],
  D: [ { maxKg: 1, cost: 14.41 }, { maxKg: 2, cost: 16.92 }, { maxKg: 3, cost: 16.92 }, { maxKg: 4, cost: 19.96 }, { maxKg: 5, cost: 19.96 }, { maxKg: 10, cost: 28.92 } ],
  E: [ { maxKg: 1, cost: 17.04 }, { maxKg: 2, cost: 18.46 }, { maxKg: 3, cost: 18.49 }, { maxKg: 4, cost: 19.78 }, { maxKg: 5, cost: 19.74 }, { maxKg: 10, cost: 25.84 } ]
};

// Worldwide Aéreo Zones
const WORLD_ZONE_MAP = {
  US: 'H1',
  CA: 'H', AD: 'H', MX: 'H', PR: 'H',
  CH: 'F', NO: 'F', LI: 'F', SM: 'F', TR: 'F', GI: 'F',
  CN: 'J', HK: 'J',
  AU: 'K', JP: 'K', AE: 'K', IN: 'K', IL: 'K', SG: 'K', KR: 'K', NZ: 'K', SA: 'K', TH: 'K', TW: 'K',
  BR: 'I', AR: 'I', CO: 'I', CL: 'I', PE: 'I', EC: 'I', CR: 'I', DO: 'I', VE: 'I', GT: 'I', UY: 'I'
};

const WORLD_RATES = {
  H1: [ { maxKg: 1, cost: 24.08 }, { maxKg: 2, cost: 31.11 }, { maxKg: 3, cost: 37.68 }, { maxKg: 4, cost: 49.15 }, { maxKg: 5, cost: 51.58 } ],
  H:  [ { maxKg: 1, cost: 28.51 }, { maxKg: 2, cost: 36.77 }, { maxKg: 3, cost: 55.03 }, { maxKg: 4, cost: 55.03 }, { maxKg: 5, cost: 55.01 } ],
  F:  [ { maxKg: 1, cost: 25.51 }, { maxKg: 2, cost: 32.26 }, { maxKg: 3, cost: 46.92 }, { maxKg: 4, cost: 46.90 }, { maxKg: 5, cost: 46.87 } ],
  J:  [ { maxKg: 1, cost: 34.20 }, { maxKg: 2, cost: 45.22 }, { maxKg: 3, cost: 67.73 }, { maxKg: 4, cost: 67.70 }, { maxKg: 5, cost: 67.71 } ],
  K:  [ { maxKg: 1, cost: 35.13 }, { maxKg: 2, cost: 47.09 }, { maxKg: 3, cost: 70.55 }, { maxKg: 4, cost: 70.57 }, { maxKg: 5, cost: 70.58 } ],
  I:  [ { maxKg: 1, cost: 35.13 }, { maxKg: 2, cost: 47.09 }, { maxKg: 3, cost: 70.55 }, { maxKg: 4, cost: 70.57 }, { maxKg: 5, cost: 70.58 } ]
};

export function calculateShippingCost({ warehouse = 'barcelona', countryCode = 'ES', totalQuantity = 1 }) {
  const estKg = Math.max(0.5, totalQuantity * 0.25);
  const cc = (countryCode || 'ES').toUpperCase();

  // Canada warehouse rates (in CAD)
  if (warehouse.toLowerCase() === 'canada') {
    if (cc === 'CA') return { cost: 15.00, currency: 'CAD', carrier: 'Canada Post / FedEx', estKg };
    return { cost: 25.00, currency: 'CAD', carrier: 'FedEx International', estKg };
  }

  // Barcelona warehouse rates (in EUR)
  let ratesTier = null;

  if (SPAIN_PORTUGAL_RATES[cc]) {
    ratesTier = SPAIN_PORTUGAL_RATES[cc];
  } else if (EU_ZONE_MAP[cc]) {
    const zone = EU_ZONE_MAP[cc];
    ratesTier = EU_RATES[zone];
  } else if (WORLD_ZONE_MAP[cc]) {
    const zone = WORLD_ZONE_MAP[cc];
    ratesTier = WORLD_RATES[zone];
  } else {
    ratesTier = WORLD_RATES['I'];
  }

  let cost = 35.00;
  for (const tier of ratesTier) {
    if (estKg <= tier.maxKg) {
      cost = tier.cost;
      break;
    }
  }

  if (estKg > ratesTier[ratesTier.length - 1].maxKg) {
    cost = ratesTier[ratesTier.length - 1].cost;
  }

  return {
    cost,
    currency: 'EUR',
    carrier: cc === 'ES' || cc === 'PT' ? 'MRW / Nacex' : 'UPS / DHL Express',
    estKg
  };
}
