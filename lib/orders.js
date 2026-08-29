import { shopifyGraphQL } from './shopify.js';

/**
 * Create a Shopify Draft Order for a B2B customer
 * @param {string} customerId - gid://shopify/Customer/XXXX
 * @param {Array} lineItems - Array of { variantId, quantity, price, warehouse }
 * @param {string} currencyCode - EUR, USD, JPY, etc.
 */
export async function createDraftOrder(customerId, lineItems, currencyCode = 'EUR', note = '', shippingLine = null) {
  const mutation = `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          name
          invoiceUrl
          totalPriceSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const shopifyLineItems = lineItems.map(item => {
    // item.retailPrice = REAL Shopify catalog price; item.price = target B2B price.
    // Shopify IGNORES originalUnitPrice when variantId is set and uses the catalog
    // price, so the discount MUST be (catalog - target). Previously it was computed
    // from a synthetic (WP x 2) retail, overcharging every line (audit 17-08-2026).
    const origPrice = item.retailPrice || item.price;
    const discountVal = Math.max(0, origPrice - item.price);

    const lineItemObj = {
      quantity: item.quantity,
      appliedDiscount: {
        title: `B2B Wholesale Price (${item.discountPercent || 50}% list)`,
        value: parseFloat(discountVal.toFixed(2)),
        valueType: 'FIXED_AMOUNT'
      },
      customAttributes: [
        { key: 'Warehouse', value: item.warehouse || 'Barcelona' },
        ...(item.properties || []).map(p => ({
          key: p.key || p.name,
          value: String(p.value)
        }))
      ]
    };

    if (item.variantId && typeof item.variantId === 'string' && item.variantId.trim().startsWith('gid://shopify/ProductVariant/')) {
      lineItemObj.variantId = item.variantId.trim();
    } else {
      // Custom (non-variant) line: no catalog price exists, so set the unit price
      // directly and drop the discount (origPrice === item.price -> value 0).
      lineItemObj.title = item.productTitle || item.title || 'Custom B2B Item';
      lineItemObj.originalUnitPrice = parseFloat(item.price || 0).toFixed(2);
      if (discountVal === 0) delete lineItemObj.appliedDiscount;
    }

    return lineItemObj;
  });

  const input = {
    customerId: customerId,
    lineItems: shopifyLineItems,
    shippingLine: shippingLine ? {
      title: shippingLine.title || 'Standard B2B Freight',
      price: parseFloat(shippingLine.price || '0').toFixed(2)
    } : undefined,
    useCustomerDefaultAddress: true,
    tags: ['B2B-Order', `Warehouse-${lineItems[0]?.warehouse || 'Barcelona'}`],
    note: note || `Wholesale B2B Order fulfilled from ${lineItems[0]?.warehouse || 'Barcelona'} warehouse.`
  };

  const data = await shopifyGraphQL(mutation, { input });
  
  if (data.draftOrderCreate?.userErrors?.length > 0) {
    throw new Error(data.draftOrderCreate.userErrors.map(e => e.message).join(', '));
  }

  return data.draftOrderCreate.draftOrder;
}

export async function getCustomerOrders(customerId) {
  const numericId = (customerId || '').split('/').pop();
  
  const query = `
    query getCustomerOrders($customerId: ID!, $draftQuery: String) {
      customer(id: $customerId) {
        displayName
        email
        orders(first: 100, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              totalPriceSet {
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
              displayFinancialStatus
              displayFulfillmentStatus
              tags
              lineItems(first: 25) {
                edges {
                  node {
                    title
                    quantity
                    originalUnitPriceSet {
                      presentmentMoney {
                        amount
                      }
                    }
                    discountedUnitPriceSet {
                      presentmentMoney {
                        amount
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      draftOrders(first: 100, query: $draftQuery) {
        edges {
          node {
            id
            name
            createdAt
            invoiceUrl
            status
            tags
            totalPrice
            currencyCode
            customer {
              displayName
              email
            }
            lineItems(first: 25) {
              edges {
                node {
                  title
                  quantity
                  originalUnitPriceSet {
                    presentmentMoney {
                      amount
                    }
                  }
                  discountedUnitPriceSet {
                    presentmentMoney {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { 
    customerId,
    draftQuery: `customer_id:${numericId}`
  });
  
  const customerInfo = {
    name: data.customer?.displayName || '—',
    email: data.customer?.email || '—'
  };

  const completedOrders = data.customer?.orders?.edges.map(e => {
    const o = e.node;
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      total: parseFloat(o.totalPriceSet?.presentmentMoney?.amount || '0'),
      currency: o.totalPriceSet?.presentmentMoney?.currencyCode || 'EUR',
      status: o.displayFinancialStatus,
      fulfillment: o.displayFulfillmentStatus,
      tags: o.tags || [],
      type: 'Completed',
      customer: customerInfo,
      items: (o.lineItems?.edges || []).map(le => ({
        title: le.node.title,
        quantity: le.node.quantity,
        price: parseFloat(le.node.discountedUnitPriceSet?.presentmentMoney?.amount || le.node.originalUnitPriceSet?.presentmentMoney?.amount || '0')
      }))
    };
  }) || [];

  const draftOrders = data.draftOrders?.edges.map(e => {
    const o = e.node;
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      total: parseFloat(o.totalPrice || '0'),
      currency: o.currencyCode || 'EUR',
      status: o.status,
      invoiceUrl: o.invoiceUrl,
      tags: o.tags || [],
      type: 'Draft',
      customer: {
        name: o.customer?.displayName || '—',
        email: o.customer?.email || '—'
      },
      items: (o.lineItems?.edges || []).map(le => ({
        title: le.node.title,
        quantity: le.node.quantity,
        price: parseFloat(le.node.discountedUnitPriceSet?.presentmentMoney?.amount || le.node.originalUnitPriceSet?.presentmentMoney?.amount || '0')
      }))
    };
  }) || [];

  return {
    completedOrders,
    draftOrders
  };
}

export async function getAllB2BOrders() {
  const query = `
    query {
      orders(first: 100, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet {
              presentmentMoney {
                amount
                currencyCode
              }
            }
            displayFinancialStatus
            displayFulfillmentStatus
            tags
            customer {
              displayName
              email
              tags
            }
            lineItems(first: 25) {
              edges {
                node {
                  title
                  quantity
                  originalUnitPriceSet {
                    presentmentMoney {
                      amount
                    }
                  }
                  discountedUnitPriceSet {
                    presentmentMoney {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
      draftOrders(first: 100, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            invoiceUrl
            status
            tags
            totalPrice
            currencyCode
            customer {
              displayName
              email
              tags
            }
            lineItems(first: 25) {
              edges {
                node {
                  title
                  quantity
                  originalUnitPriceSet {
                    presentmentMoney {
                      amount
                    }
                  }
                  discountedUnitPriceSet {
                    presentmentMoney {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query);
  const orders = data.orders?.edges.map(e => e.node) || [];
  const draftOrdersAll = data.draftOrders?.edges.map(e => e.node) || [];

  const isB2BOrder = (o) => {
    const hasB2BOrderTag = o.tags?.some(t => t.toLowerCase() === 'b2b-order');
    const customerHasB2BTag = o.customer?.tags?.some(t => 
      t.toLowerCase().includes('b2b') || t.toLowerCase().includes('wholesale') || t.toLowerCase().includes('partner')
    );
    return hasB2BOrderTag || customerHasB2BTag;
  };

  const b2bOrders = orders.filter(o => isB2BOrder(o) && o.customer?.email);
  const b2bDrafts = draftOrdersAll.filter(d => d.customer?.email); // draft orders with customer email are B2B

  const completedOrders = b2bOrders.map(o => ({
    id: o.id,
    name: o.name,
    createdAt: o.createdAt,
    total: parseFloat(o.totalPriceSet?.presentmentMoney?.amount || '0'),
    currency: o.totalPriceSet?.presentmentMoney?.currencyCode || 'EUR',
    status: o.displayFinancialStatus,
    fulfillment: o.displayFulfillmentStatus,
    tags: o.tags || [],
    type: 'Completed',
    customer: {
      name: o.customer?.displayName || '—',
      email: o.customer?.email || '—',
      tags: o.customer?.tags || []
    },
    items: (o.lineItems?.edges || []).map(le => ({
      title: le.node.title,
      quantity: le.node.quantity,
      price: parseFloat(le.node.discountedUnitPriceSet?.presentmentMoney?.amount || le.node.originalUnitPriceSet?.presentmentMoney?.amount || '0')
    }))
  }));

  const draftOrders = b2bDrafts.map(o => ({
    id: o.id,
    name: o.name,
    createdAt: o.createdAt,
    total: parseFloat(o.totalPriceSet?.presentmentMoney?.amount || o.totalPrice || '0'),
    currency: o.totalPriceSet?.presentmentMoney?.currencyCode || o.currencyCode || 'EUR',
    status: o.status,
    invoiceUrl: o.invoiceUrl,
    tags: o.tags || [],
    type: 'Draft',
    customer: {
      name: o.customer?.displayName || '—',
      email: o.customer?.email || '—',
      tags: o.customer?.tags || []
    },
    items: (o.lineItems?.edges || []).map(le => ({
      title: le.node.title,
      quantity: le.node.quantity,
      price: parseFloat(le.node.discountedUnitPriceSet?.presentmentMoney?.amount || le.node.originalUnitPriceSet?.presentmentMoney?.amount || '0')
    }))
  }));

  return {
    completedOrders,
    draftOrders
  };
}

export async function getAgentOrders(sessionTags = [], sessionEmail = '') {
  const myAgentTags = (sessionTags || [])
    .map(t => t.toLowerCase())
    .filter(t => t.startsWith('agent_'));

  // 1. Resolve which customer EMAILS belong to this agent (match any of their agent_* tags).
  const tagQuery = myAgentTags.map(t => `tag:'${t}'`).join(' OR ') || "tag:'__none__'";
  const q = `
    query GetAgentCustomers($query: String!) {
      customers(first: 250, query: $query) {
        edges { node { email tags } }
      }
    }
  `;
  const data = await shopifyGraphQL(q, { query: tagQuery });
  const myEmails = new Set(
    (data.customers?.edges || [])
      .map(e => (e.node.email || '').toLowerCase())
      .filter(Boolean)
  );
  // Do NOT include the agent's own email — they want their CLIENTS' orders.
  myEmails.delete((sessionEmail || '').toLowerCase());

  if (myEmails.size === 0) {
    return {
      completedOrders: [],
      draftOrders: []
    };
  }

  // 2. Query Shopify scoped to the agent's client emails (orders & draftOrders).
  const ordersEmailQuery = Array.from(myEmails).map(e => `email:'${e}'`).join(' OR ');
  const draftsEmailQuery = Array.from(myEmails).map(e => `'${e}'`).join(' OR ');

  const ordersQuery = `
    query GetAgentOrders($query: String!) {
      orders(first: 100, query: $query, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet {
              presentmentMoney {
                amount
                currencyCode
              }
            }
            displayFinancialStatus
            displayFulfillmentStatus
            tags
            customer {
              displayName
              email
              tags
            }
            lineItems(first: 25) {
              edges {
                node {
                  title
                  quantity
                  originalUnitPriceSet {
                    presentmentMoney {
                      amount
                    }
                  }
                  discountedUnitPriceSet {
                    presentmentMoney {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const draftOrdersQuery = `
    query GetAgentDraftOrders($query: String!) {
      draftOrders(first: 100, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            invoiceUrl
            status
            tags
            totalPrice
            currencyCode
            customer {
              displayName
              email
              tags
            }
            lineItems(first: 25) {
              edges {
                node {
                  title
                  quantity
                  originalUnitPriceSet {
                    presentmentMoney {
                      amount
                    }
                  }
                  discountedUnitPriceSet {
                    presentmentMoney {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const [ordersData, draftsData] = await Promise.all([
    shopifyGraphQL(ordersQuery, { query: ordersEmailQuery }),
    shopifyGraphQL(draftOrdersQuery, { query: draftsEmailQuery })
  ]);

  const rawOrders = ordersData.orders?.edges.map(e => e.node) || [];
  const rawDrafts = draftsData.draftOrders?.edges.map(e => e.node) || [];

  const completedOrders = rawOrders.map(o => ({
    id: o.id,
    name: o.name,
    createdAt: o.createdAt,
    total: parseFloat(o.totalPriceSet?.presentmentMoney?.amount || '0'),
    currency: o.totalPriceSet?.presentmentMoney?.currencyCode || 'EUR',
    status: o.displayFinancialStatus,
    fulfillment: o.displayFulfillmentStatus,
    tags: o.tags || [],
    type: 'Completed',
    customer: {
      name: o.customer?.displayName || '—',
      email: o.customer?.email || '—',
      tags: o.customer?.tags || []
    },
    items: (o.lineItems?.edges || []).map(le => ({
      title: le.node.title,
      quantity: le.node.quantity,
      price: parseFloat(le.node.discountedUnitPriceSet?.presentmentMoney?.amount || le.node.originalUnitPriceSet?.presentmentMoney?.amount || '0')
    }))
  }));

  const draftOrders = rawDrafts.map(o => ({
    id: o.id,
    name: o.name,
    createdAt: o.createdAt,
    total: parseFloat(o.totalPriceSet?.presentmentMoney?.amount || o.totalPrice || '0'),
    currency: o.totalPriceSet?.presentmentMoney?.currencyCode || o.currencyCode || 'EUR',
    status: o.status,
    invoiceUrl: o.invoiceUrl,
    tags: o.tags || [],
    type: 'Draft',
    customer: {
      name: o.customer?.displayName || '—',
      email: o.customer?.email || '—',
      tags: o.customer?.tags || []
    },
    items: (o.lineItems?.edges || []).map(le => ({
      title: le.node.title,
      quantity: le.node.quantity,
      price: parseFloat(le.node.discountedUnitPriceSet?.presentmentMoney?.amount || le.node.originalUnitPriceSet?.presentmentMoney?.amount || '0')
    }))
  }));

  // 3. Post-filter safety net to ensure only the agent's client emails are returned.
  const mine = (arr) => (arr || []).filter(o => myEmails.has((o.customer?.email || '').toLowerCase()));

  return {
    completedOrders: mine(completedOrders),
    draftOrders: mine(draftOrders)
  };
}

export async function getOrderById(id) {
  const numericId = id.replace(/\D/g, '');
  const orderGid = `gid://shopify/Order/${numericId}`;
  const draftOrderGid = `gid://shopify/DraftOrder/${numericId}`;

  const query = `
    query getOrderDetails($orderId: ID!, $draftOrderId: ID!) {
      orderNode: node(id: $orderId) {
        ... on Order {
          id
          name
          createdAt
          totalPriceSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
          totalTaxSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
          displayFinancialStatus
          tags
          customer {
            displayName
            email
          }
          shippingAddress {
            address1
            address2
            city
            province
            zip
            country
          }
          billingAddress {
            name
            company
            address1
            address2
            city
            province
            zip
            country
          }
          metafield(namespace: "b2b_portal", key: "price_overrides") {
            value
          }
          discountMetafield: metafield(namespace: "b2b_portal", key: "order_discount") {
            value
          }
          lineItems(first: 100) {
            edges {
              node {
                title
                sku
                variantTitle
                quantity
                customAttributes {
                  key
                  value
                }
                originalUnitPriceSet {
                  presentmentMoney {
                    amount
                  }
                }
                discountedUnitPriceSet {
                  presentmentMoney {
                    amount
                  }
                }
                variant {
                  id
                  sku
                  title
                  product {
                    id
                    title
                  }
                  inventoryItem {
                    harmonizedSystemCode
                    countryCodeOfOrigin
                  }
                }
              }
            }
          }
        }
      }
      draftOrderNode: node(id: $draftOrderId) {
        ... on DraftOrder {
          id
          name
          createdAt
          invoiceUrl
          status
          tags
          totalPrice
          subtotalPrice
          totalTax
          currencyCode
          appliedDiscount {
            amount
            value
            valueType
            title
          }
          totalPriceSet {
            presentmentMoney {
              amount
              currencyCode
            }
            shopMoney {
              amount
              currencyCode
            }
          }
          customer {
            displayName
            email
          }
          shippingAddress {
            address1
            address2
            city
            province
            zip
            country
          }
          billingAddress {
            name
            company
            address1
            address2
            city
            province
            zip
            country
          }
          lineItems(first: 100) {
            edges {
              node {
                title
                sku
                variantTitle
                quantity
                customAttributes {
                  key
                  value
                }
                originalUnitPriceSet {
                  presentmentMoney {
                    amount
                  }
                }
                discountedUnitPriceSet {
                  presentmentMoney {
                    amount
                  }
                }
                variant {
                  id
                  sku
                  title
                  product {
                    id
                    title
                  }
                  inventoryItem {
                    harmonizedSystemCode
                    countryCodeOfOrigin
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await shopifyGraphQL(query, { orderId: orderGid, draftOrderId: draftOrderGid });
    
    if (data.orderNode) {
      const o = data.orderNode;
      const presAmt = parseFloat(o.totalPriceSet?.presentmentMoney?.amount || '0');
      const shopAmt = parseFloat(o.totalPriceSet?.shopMoney?.amount || o.totalPriceSet?.presentmentMoney?.amount || '1');
      
      let items = (o.lineItems?.edges || []).map(le => {
        const node = le.node;
        const customAttrs = node.customAttributes || [];
        const attrSku = customAttrs.find(a => a.key?.toLowerCase().includes('sku'))?.value;
        const attrColor = customAttrs.find(a => a.key?.toLowerCase().includes('color') || a.key?.toLowerCase().includes('variant'))?.value;

        const vSku = (node.sku && node.sku !== '—' && node.sku !== '')
          ? node.sku
          : (node.variant?.sku || attrSku || '—');
        const vTitle = (node.variantTitle && node.variantTitle !== 'Default Title' && node.variantTitle !== '—')
          ? node.variantTitle
          : (node.variant?.title && node.variant?.title !== 'Default Title')
            ? node.variant.title
            : (attrColor || '—');
        const pTitle = node.title || node.variant?.product?.title || 'Custom Item';

        return {
          title: pTitle,
          sku: vSku,
          variantTitle: vTitle,
          variantId: node.variant?.id || null,
          quantity: node.quantity,
          price: parseFloat(node.discountedUnitPriceSet?.presentmentMoney?.amount || node.originalUnitPriceSet?.presentmentMoney?.amount || '0'),
          hsCode: node.variant?.inventoryItem?.harmonizedSystemCode || '900410',
          origin: node.variant?.inventoryItem?.countryCodeOfOrigin || 'ES',
          customAttributes: customAttrs
        };
      });

      // Parse price overrides metafield if stored
      let subtotal = parseFloat(o.subtotalPriceSet?.presentmentMoney?.amount || o.totalPriceSet.presentmentMoney.amount);
      let total = presAmt;

      if (o.metafield?.value) {
        try {
          const overrides = JSON.parse(o.metafield.value);
          if (Array.isArray(overrides) && overrides.length > 0) {
            items = items.map((item, idx) => {
              const match = overrides[idx] || overrides.find(ov => ov.sku === item.sku || ov.title === item.title);
              if (match) {
                return {
                  ...item,
                  price: match.price !== undefined ? parseFloat(match.price) : item.price,
                  quantity: match.quantity !== undefined ? parseInt(match.quantity) : item.quantity
                };
              }
              return item;
            });
            subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            total = subtotal + parseFloat(o.totalTaxSet?.presentmentMoney?.amount || '0');
          }
        } catch (e) {
          console.error('Error parsing price_overrides metafield:', e);
        }
      }

      let orderDiscount = null;
      if (o.discountMetafield?.value) {
        try {
          orderDiscount = JSON.parse(o.discountMetafield.value);
        } catch (e) {
          console.error('Error parsing order_discount metafield:', e);
        }
      }

      return {
        id: o.id,
        name: o.name,
        createdAt: o.createdAt,
        total: total,
        shopTotal: shopAmt,
        exchangeRate: presAmt / shopAmt,
        subtotal: subtotal,
        tax: parseFloat(o.totalTaxSet?.presentmentMoney?.amount || '0'),
        currency: o.totalPriceSet.presentmentMoney.currencyCode,
        status: o.displayFinancialStatus,
        tags: o.tags || [],
        type: 'Order',
        appliedDiscount: orderDiscount,
        customer: {
          name: o.customer?.displayName || '—',
          email: o.customer?.email || '—'
        },
        shippingAddress: o.shippingAddress ? {
          name: o.shippingAddress.name || '',
          company: o.shippingAddress.company || '',
          address1: o.shippingAddress.address1 || '',
          address2: o.shippingAddress.address2 || '',
          city: o.shippingAddress.city || '',
          province: o.shippingAddress.province || '',
          zip: o.shippingAddress.zip || '',
          country: o.shippingAddress.country || '',
        } : null,
        billingAddress: o.billingAddress ? {
          name: o.billingAddress.name || '',
          company: o.billingAddress.company || '',
          address1: o.billingAddress.address1 || '',
          address2: o.billingAddress.address2 || '',
          city: o.billingAddress.city || '',
          province: o.billingAddress.province || '',
          zip: o.billingAddress.zip || '',
          country: o.billingAddress.country || '',
        } : null,
        items: items
      };
    }

    if (data.draftOrderNode) {
      const o = data.draftOrderNode;
      const presAmt = parseFloat(o.totalPriceSet?.presentmentMoney?.amount || o.totalPrice || '0');
      const shopAmt = parseFloat(o.totalPriceSet?.shopMoney?.amount || o.totalPrice || '1');
      let orderDiscount = null;
      if (o.appliedDiscount) {
        orderDiscount = {
          amount: parseFloat(o.appliedDiscount.amount || '0'),
          value: parseFloat(o.appliedDiscount.value || '0'),
          valueType: o.appliedDiscount.valueType,
          title: o.appliedDiscount.title
        };
      }
      return {
        id: o.id,
        name: o.name,
        createdAt: o.createdAt,
        invoiceUrl: o.invoiceUrl,
        total: presAmt,
        shopTotal: shopAmt,
        exchangeRate: presAmt / shopAmt,
        subtotal: parseFloat(o.subtotalPrice || o.totalPrice || '0'),
        tax: parseFloat(o.totalTax || '0'),
        currency: o.currencyCode || 'EUR',
        status: o.status,
        tags: o.tags || [],
        type: 'Draft',
        appliedDiscount: orderDiscount,
        customer: {
          name: o.customer?.displayName || '—',
          email: o.customer?.email || '—'
        },
        shippingAddress: o.shippingAddress ? {
          name: o.shippingAddress.name || '',
          company: o.shippingAddress.company || '',
          address1: o.shippingAddress.address1 || '',
          address2: o.shippingAddress.address2 || '',
          city: o.shippingAddress.city || '',
          province: o.shippingAddress.province || '',
          zip: o.shippingAddress.zip || '',
          country: o.shippingAddress.country || '',
        } : null,
        billingAddress: o.billingAddress ? {
          name: o.billingAddress.name || '',
          company: o.billingAddress.company || '',
          address1: o.billingAddress.address1 || '',
          address2: o.billingAddress.address2 || '',
          city: o.billingAddress.city || '',
          province: o.billingAddress.province || '',
          zip: o.billingAddress.zip || '',
          country: o.billingAddress.country || '',
        } : null,
        items: (o.lineItems?.edges || []).map(le => {
          const node = le.node;
          const customAttrs = node.customAttributes || [];
          const attrSku = customAttrs.find(a => a.key?.toLowerCase().includes('sku'))?.value;
          const attrColor = customAttrs.find(a => a.key?.toLowerCase().includes('color') || a.key?.toLowerCase().includes('variant'))?.value;

          const vSku = (node.sku && node.sku !== '—' && node.sku !== '')
            ? node.sku
            : (node.variant?.sku || attrSku || '—');
          const vTitle = (node.variantTitle && node.variantTitle !== 'Default Title' && node.variantTitle !== '—')
            ? node.variantTitle
            : (node.variant?.title && node.variant?.title !== 'Default Title')
              ? node.variant.title
              : (attrColor || '—');
          const pTitle = node.title || node.variant?.product?.title || 'Custom Item';

          return {
            title: pTitle,
            sku: vSku,
            variantTitle: vTitle,
            variantId: node.variant?.id || null,
            quantity: node.quantity,
            price: parseFloat(node.discountedUnitPriceSet?.presentmentMoney?.amount || node.originalUnitPriceSet?.presentmentMoney?.amount || '0'),
            hsCode: node.variant?.inventoryItem?.harmonizedSystemCode || '900410',
            origin: node.variant?.inventoryItem?.countryCodeOfOrigin || 'ES',
            customAttributes: customAttrs
          };
        })
      };
    }
  } catch (err) {
    console.error('Error fetching order by ID:', err);
    throw new Error(`Failed to fetch order: ${err.message}`);
  }

  return null;
}

/**
 * Update an existing Shopify Draft Order
 * @param {string} draftOrderId - gid://shopify/DraftOrder/XXXX
 * @param {Array} lineItems - Array of { title, variantId, quantity, price }
 * @param {string} note - Optional order note
 */
export async function updateDraftOrder(draftOrderId, lineItems, note = '', appliedDiscount = null) {
  const mutation = `
    mutation draftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
      draftOrderUpdate(id: $id, input: $input) {
        draftOrder {
          id
          name
          invoiceUrl
          totalPrice
          subtotalPrice
          totalTax
          currencyCode
          totalPriceSet {
            presentmentMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 100) {
            edges {
              node {
                title
                sku
                variantTitle
                quantity
                originalUnitPriceSet {
                  presentmentMoney {
                    amount
                  }
                }
                discountedUnitPriceSet {
                  presentmentMoney {
                    amount
                  }
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const shopifyLineItems = lineItems.map(item => {
    const unitPrice = parseFloat(item.price !== undefined ? item.price : (item.unitPrice || 0));
    const obj = {
      quantity: parseInt(item.quantity) || 1,
      originalUnitPrice: isNaN(unitPrice) ? '0.00' : unitPrice.toFixed(2),
    };
    if (item.variantId && String(item.variantId).startsWith('gid://')) {
      obj.variantId = item.variantId;
    }
    if (item.title) obj.title = item.title;
    if (item.sku && item.sku !== '—') obj.sku = item.sku;

    // Always preserve SKU and Color in customAttributes to guarantee persistence
    const attrsMap = {};
    if (item.customAttributes && Array.isArray(item.customAttributes)) {
      item.customAttributes.forEach(a => { if (a.key && a.value) attrsMap[a.key] = String(a.value); });
    }
    if (item.properties && Array.isArray(item.properties)) {
      item.properties.forEach(a => { if ((a.key || a.name) && a.value) attrsMap[a.key || a.name] = String(a.value); });
    }
    if (item.sku && item.sku !== '—') attrsMap['SKU'] = item.sku;
    if (item.variantTitle && item.variantTitle !== '—') attrsMap['Color'] = item.variantTitle;

    obj.customAttributes = Object.entries(attrsMap).map(([key, value]) => ({ key, value }));
    return obj;
  });

  const input = {
    lineItems: shopifyLineItems,
  };

  if (note) input.note = note;

  if (appliedDiscount && parseFloat(appliedDiscount.value) > 0) {
    input.appliedDiscount = {
      title: appliedDiscount.title || 'Total Order Discount',
      value: parseFloat(appliedDiscount.value),
      valueType: appliedDiscount.valueType === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED_AMOUNT'
    };
  } else if (appliedDiscount && (parseFloat(appliedDiscount.value) === 0 || appliedDiscount.value === '')) {
    input.appliedDiscount = null;
  }

  const data = await shopifyGraphQL(mutation, { id: draftOrderId, input });
  
  if (data.draftOrderUpdate?.userErrors?.length > 0) {
    throw new Error(data.draftOrderUpdate.userErrors.map(e => e.message).join(', '));
  }

  return data.draftOrderUpdate.draftOrder;
}

/**
 * Update line item prices/discounts and quantities on a completed order directly in Shopify using Order Edit API
 * @param {string} orderGid - gid://shopify/Order/XXXX
 * @param {Array} lineItems - Array of { title, sku, variantTitle, quantity, price }
 */
export async function updateCompletedOrderInShopify(orderGid, lineItems) {
  // 1. Begin Order Edit
  const beginMutation = `
    mutation orderEditBegin($id: ID!) {
      orderEditBegin(id: $id) {
        calculatedOrder {
          id
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                sku
                quantity
                originalUnitPriceSet { presentmentMoney { amount currencyCode } }
              }
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const beginRes = await shopifyGraphQL(beginMutation, { id: orderGid });
  
  if (beginRes.orderEditBegin?.userErrors?.length > 0) {
    throw new Error(beginRes.orderEditBegin.userErrors.map(e => e.message).join(', '));
  }

  const calcOrder = beginRes.orderEditBegin?.calculatedOrder;
  if (!calcOrder) {
    throw new Error('Failed to initiate Shopify order edit.');
  }

  const calcOrderId = calcOrder.id;
  const calcLineItems = (calcOrder.lineItems?.edges || []).map(e => e.node);

  // 2. Process Line Items
  for (const item of lineItems) {
    const matchingCalcItem = calcLineItems.find(ci => ci.sku === item.sku || ci.title === item.title);
    if (!matchingCalcItem) continue;

    // Update quantity if changed
    if (item.quantity !== undefined && parseInt(item.quantity) !== matchingCalcItem.quantity) {
      const setQtyMutation = `
        mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
          orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
            userErrors { field message }
          }
        }
      `;
      await shopifyGraphQL(setQtyMutation, {
        id: calcOrderId,
        lineItemId: matchingCalcItem.id,
        quantity: parseInt(item.quantity)
      });
    }

    // Apply unit price discount if price was modified below original price
    const origPrice = parseFloat(matchingCalcItem.originalUnitPriceSet?.presentmentMoney?.amount || '0');
    const newPrice = parseFloat(item.price);

    if (!isNaN(newPrice) && newPrice < origPrice) {
      const discountPerUnit = origPrice - newPrice;
      const totalDiscount = discountPerUnit * (parseInt(item.quantity) || matchingCalcItem.quantity);
      
      const discountMutation = `
        mutation orderEditAddLineItemDiscount($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
          orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
            userErrors { field message }
          }
        }
      `;
      await shopifyGraphQL(discountMutation, {
        id: calcOrderId,
        lineItemId: matchingCalcItem.id,
        discount: {
          description: "B2B Price Adjustment",
          fixedValue: {
            amount: totalDiscount.toFixed(2),
            currencyCode: matchingCalcItem.originalUnitPriceSet?.presentmentMoney?.currencyCode || "EUR"
          }
        }
      });
    }
  }

  // 3. Commit Order Edit
  const commitMutation = `
    mutation orderEditCommit($id: ID!, $notifyCustomer: Boolean) {
      orderEditCommit(id: $id, notifyCustomer: $notifyCustomer) {
        order {
          id
          name
          totalPriceSet { presentmentMoney { amount currencyCode } }
        }
        userErrors { field message }
      }
    }
  `;

  const commitRes = await shopifyGraphQL(commitMutation, { id: calcOrderId, notifyCustomer: false });
  if (commitRes.orderEditCommit?.userErrors?.length > 0) {
    throw new Error(commitRes.orderEditCommit.userErrors.map(e => e.message).join(', '));
  }

  return commitRes.orderEditCommit.order;
}

/**
 * Save custom price & quantity overrides for a completed order via Shopify Order Metafield
 * and attempt live Order Edit sync in Shopify if permissions allow.
 * @param {string} orderGid - gid://shopify/Order/XXXX
 * @param {Array} lineItems - Array of { title, sku, variantTitle, quantity, price }
 */
export async function updateCompletedOrderPrices(orderGid, lineItems, appliedDiscount = null) {
  // 1. Always save to portal order metafield
  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const overrides = lineItems.map(item => ({
    title: item.title,
    sku: item.sku,
    variantTitle: item.variantTitle,
    quantity: parseInt(item.quantity) || 1,
    price: parseFloat(item.price !== undefined ? item.price : 0)
  }));

  const metafieldsList = [
    {
      ownerId: orderGid,
      namespace: "b2b_portal",
      key: "price_overrides",
      value: JSON.stringify(overrides),
      type: "json"
    }
  ];

  if (appliedDiscount !== undefined) {
    metafieldsList.push({
      ownerId: orderGid,
      namespace: "b2b_portal",
      key: "order_discount",
      value: JSON.stringify(appliedDiscount),
      type: "json"
    });
  }

  const data = await shopifyGraphQL(mutation, {
    metafields: metafieldsList
  });

  if (data.metafieldsSet?.userErrors?.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map(e => e.message).join(', '));
  }

  // 2. Try live Shopify Order Edit API sync
  let shopifyOrderEditSynced = false;
  let shopifyOrderEditError = null;

  try {
    await updateCompletedOrderInShopify(orderGid, lineItems);
    shopifyOrderEditSynced = true;
  } catch (err) {
    console.warn('Shopify live order edit API warning:', err.message);
    shopifyOrderEditError = err.message;
  }

  return {
    metafieldSaved: true,
    shopifyOrderEditSynced,
    shopifyOrderEditError
  };
}
