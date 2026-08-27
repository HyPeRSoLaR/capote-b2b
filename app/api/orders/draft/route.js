import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession, resolveWarehouse, isAdminSession } from '@/lib/session';
import { createDraftOrder } from '@/lib/orders';
import { shopifyGraphQL } from '@/lib/shopify';
import { calculateShippingCost } from '@/lib/shipping';
import { getWholesalePrice } from '@/lib/pricing_matrix';

export async function POST(request) {
  try {
    // 1. Authenticate B2B Session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('capote_b2b_session');

    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Access denied. Please log in.' },
        { status: 401 }
      );
    }

    const session = decryptSession(sessionCookie.value);
    if (!session) {
      return NextResponse.json(
        { error: 'Session expired. Please log in again.' },
        { status: 401 }
      );
    }

    // 2. Determine B2B discount tier from session customer tags
    let discountPercent = 50; // default
    const distMatch = (session.tags || [])
      .map(t => t.match(/Distributor-(\d+(?:\.\d+)?)/i))
      .find(Boolean);
    if (distMatch) {
      const rate = parseFloat(distMatch[1]) / 100;
      discountPercent = 100 - 50 * (1 - rate);
    } else {
      for (const tag of (session.tags || [])) {
        const match = tag.match(/B2B-Discount-(\d+(?:\.\d+)?)/i);
        if (match) {
          discountPercent = parseFloat(match[1]);
          break;
        }
      }
    }

    // 3. Parse request body
    const body = await request.json();
    const items = body.items || body.lineItems;
    const warehouse = body.warehouse;

    if (!items || !Array.isArray(items) || items.length === 0 || !warehouse) {
      return NextResponse.json(
        { error: 'Invalid order payload or warehouse missing.' },
        { status: 400 }
      );
    }

    // 3b. Enforce regional sourcing server-side: non-admin accounts may only
    // order from their assigned regional warehouse, regardless of what the
    // client sends. Admins (not impersonating) may source from any warehouse.
    const assignedWarehouse = resolveWarehouse(session);
    if (!isAdminSession(session) && String(warehouse).toLowerCase() !== assignedWarehouse.toLowerCase()) {
      return NextResponse.json(
        { error: `Orders for your account are fulfilled exclusively from the ${assignedWarehouse} warehouse.` },
        { status: 403 }
      );
    }

    // Determine currency based on customer session location & tag overrides
    const country = session.countryCode || 'ES';
    let currencyCode = 'EUR';
    if (country === 'CA') {
      currencyCode = 'CAD';
    } else if (country === 'JP') {
      currencyCode = 'JPY';
    } else if (country === 'US') {
      currencyCode = 'USD';
    }

    // Support tag overrides for currency
    const sessionTags = session.tags || [];
    for (const tag of sessionTags) {
      const lt = tag.toLowerCase();
      if (lt === 'usd' || lt === 'currency-usd') currencyCode = 'USD';
      else if (lt === 'cad' || lt === 'currency-cad') currencyCode = 'CAD';
      else if (lt === 'jpy' || lt === 'currency-jpy') currencyCode = 'JPY';
      else if (lt === 'eur' || lt === 'currency-eur') currencyCode = 'EUR';
    }

    // 4. Resolve prices securely from Shopify (do not trust frontend-provided prices)
    const validVariantIds = Array.from(new Set(
      items
        .map(item => item.variantId)
        .filter(id => typeof id === 'string' && id.trim().length > 0 && id.startsWith('gid://shopify/ProductVariant/'))
    ));
    
    let resolvedVariants = [];
    if (validVariantIds.length > 0) {
      const variantsQuery = `
        query getVariants($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant {
              id
              price
              sku
              title
              product {
                title
              }
            }
          }
        }
      `;
      const queryData = await shopifyGraphQL(variantsQuery, { ids: validVariantIds });
      resolvedVariants = (queryData.nodes || []).filter(n => n && n.id);
    }

    // Map variant prices and calculate wholesale overrides
    const orderLineItems = [];
    for (const item of items) {
      const dbVariant = resolvedVariants.find(v => v.id === item.variantId);

      // Calculate customization markups
      let customizationMarkup = 0;
      const properties = item.properties || item.customAttributes || [];
      const rates = {
        EUR: { optical: -10, handPainted: 50, handCrafted: 50 },
        USD: { optical: -10, handPainted: 50, handCrafted: 50 },
        CAD: { optical: -15, handPainted: 75, handCrafted: 75 },
        JPY: { optical: -1500, handPainted: 7500, handCrafted: 7500 }
      };
      
      const currencyRates = rates[currencyCode] || rates.EUR;
      
      properties.forEach(prop => {
        const keyName = (prop.key || prop.name || '').toLowerCase();
        if (keyName.includes('optical')) {
          customizationMarkup += currencyRates.optical;
        } else if (keyName.includes('painted')) {
          customizationMarkup += currencyRates.handPainted;
        } else if (keyName.includes('crafted')) {
          customizationMarkup += currencyRates.handCrafted;
        }
      });

      const productTitle = dbVariant?.product?.title || '';
      const variantSku = dbVariant?.sku || item.sku || ''; // real SKU (was: variant title — broke matrix matching)
      const shopifyPrice = dbVariant ? parseFloat(dbVariant.price) : parseFloat(item.price || 0);

      const lineSheetWP = getWholesalePrice(productTitle, variantSku);

      // Target unit price the partner pays (store currency, EUR).
      // FIX: previously the discount was derived from a synthetic retail (WP x 2),
      // but Shopify applies it against the REAL catalog price when variantId is set,
      // so every draft charged ~2x wholesale (see audit 17-08-2026, draft #D1068).
      let priceNeedsReview = false;
      let targetPrice;
      if (lineSheetWP !== null) {
        // Tier 50 -> WP exactly; other tiers scale relative to the 50% base list.
        targetPrice = lineSheetWP * ((100 - discountPercent) / 50);
      } else {
        // Model missing from the B2B price list: legacy fallback, flagged for manual review.
        targetPrice = shopifyPrice * (1 - discountPercent / 100);
        priceNeedsReview = true;
      }
      targetPrice += customizationMarkup;
      // Clamp: never negative, never above the catalog price.
      const discountedPrice = Math.min(Math.max(targetPrice, 0), shopifyPrice);
      // NOTE: hardcoded FX (x170 JPY / x1.5 CAD / x1.1 USD) removed — drafts are created
      // in the store currency (EUR). Multi-currency requires official per-currency
      // price lists + presentmentCurrencyCode, not client-side multipliers.

      // Normalize properties to { key, value } structure for Shopify customAttributes
      const shopifyProperties = properties.map(prop => ({
        key: prop.key || prop.name,
        value: String(prop.value)
      }));

      orderLineItems.push({
        variantId: item.variantId,
        quantity: parseInt(item.quantity, 10) || 1,
        price: discountedPrice,
        retailPrice: shopifyPrice, // REAL catalog price — the discount is derived from this
        discountPercent: discountPercent,
        warehouse: warehouse,
        properties: priceNeedsReview
          ? [...shopifyProperties, { key: 'PRICE', value: 'TBC — model missing from B2B price list' }]
          : shopifyProperties
      });
    }

    // 5. Calculate estimated shipping cost based on customer country and total frames count
    const totalQuantity = orderLineItems.reduce((sum, item) => sum + parseInt(item.quantity, 10), 0);
    const shippingCalc = calculateShippingCost({
      warehouse: warehouse,
      countryCode: country,
      totalQuantity: totalQuantity
    });

    const shippingLine = {
      title: `Freight Shipping (${shippingCalc.carrier} - ${shippingCalc.estKg.toFixed(1)}kg)`,
      price: shippingCalc.cost
    };

    // 6. Create Draft Order in Shopify
    let note = body.note || '';
    // Distributor flag: distributors get the normal B2B price here; staff apply the
    // negotiated extra discount manually in Shopify. Stamp a reminder on the draft.
    const isDistributor = (session.tags || [])
      .some(t => t.toLowerCase().replace(/-/g, '_') === 'b2b_distributer'
              || t.toLowerCase().replace(/-/g, '_') === 'b2b_distributor');
    if (isDistributor) {
      const flag = '⚠️ DISTRIBUTOR ACCOUNT — apply negotiated extra discount before invoicing.';
      note = note ? `${flag}\n\n${note}` : flag;
    }
    const draftOrder = await createDraftOrder(session.id, orderLineItems, currencyCode, note, shippingLine);

    return NextResponse.json({
      success: true,
      draftOrderId: draftOrder.id,
      name: draftOrder.name,
      total: parseFloat(draftOrder.totalPriceSet.presentmentMoney.amount),
      currency: draftOrder.totalPriceSet.presentmentMoney.currencyCode,
      invoiceUrl: draftOrder.invoiceUrl,
      shippingCost: shippingCalc.cost
    });

  } catch (err) {
    console.error('Draft Order API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error occurred.' },
      { status: 500 }
    );
  }
}
