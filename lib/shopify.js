import { getWholesalePrice } from './pricing_matrix.js';

const STORE = process.env.SHOPIFY_STORE || 'capote-eyewear.myshopify.com';
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || '';
const FALLBACK_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const API_VERSION = '2024-10';

// ---------------------------------------------------------------------------
// Dynamic Token Manager with 24-hour Auto-Refresh & Concurrency Lock
// ---------------------------------------------------------------------------
let cachedToken = null;
let tokenExpiresAt = 0;
let tokenFetchPromise = null;

export async function getShopifyToken(forceRefresh = false) {
  const now = Date.now();
  // Return cached token if valid for at least another 2 minutes
  if (!forceRefresh && cachedToken && now < (tokenExpiresAt - 120000)) {
    return cachedToken;
  }

  // Deduplicate concurrent token refresh calls
  if (tokenFetchPromise) {
    return tokenFetchPromise;
  }

  tokenFetchPromise = (async () => {
    try {
      if (CLIENT_ID && CLIENT_SECRET) {
        const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials'
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.access_token) {
            cachedToken = data.access_token;
            // expires_in is in seconds (typically 86400 = 24h)
            tokenExpiresAt = Date.now() + ((data.expires_in || 86400) * 1000);
            return cachedToken;
          }
        } else {
          const errText = await res.text();
          console.error(`Shopify OAuth token fetch failed (${res.status}):`, errText);
        }
      }
    } catch (e) {
      console.error('Error fetching Shopify OAuth access token:', e);
    } finally {
      tokenFetchPromise = null;
    }

    // Fallback to static token if OAuth grant fails
    if (!cachedToken) {
      cachedToken = FALLBACK_TOKEN;
      tokenExpiresAt = Date.now() + (3600 * 1000); // 1h fallback cache
    }
    return cachedToken;
  })();

  return tokenFetchPromise;
}

// ---------------------------------------------------------------------------
// Fetch with timeout — prevents hanging requests on slow Shopify responses
// ---------------------------------------------------------------------------
function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff — handles 429 / THROTTLED / transient errors
// ---------------------------------------------------------------------------
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options);

      // 429 Too Many Requests → wait and retry
      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get('Retry-After') || '2');
        const delayMs = Math.min(retryAfter * 1000, 10000) * Math.pow(2, attempt);
        console.warn(`Shopify 429 rate-limited. Retrying in ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delayMs);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') {
        console.warn(`Shopify request timed out (attempt ${attempt + 1}/${maxRetries})`);
      }
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await sleep(delayMs);
      }
    }
  }
  throw lastError || new Error('Shopify request failed after retries');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Core Shopify GraphQL client — with auto-refreshing token & THROTTLED retry
// ---------------------------------------------------------------------------
export async function shopifyGraphQL(query, variables = {}) {
  const url = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;
  let token = await getShopifyToken();

  const getOptions = (tok) => ({
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': tok,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  let res = await fetchWithRetry(url, getOptions(token));

  // If 401 Unauthorized or Invalid Token, force refresh token and retry
  if (res.status === 401 || res.status === 403) {
    console.warn(`Shopify GraphQL returned HTTP ${res.status}. Refreshing token and retrying...`);
    token = await getShopifyToken(true);
    res = await fetchWithRetry(url, getOptions(token));
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Shopify GraphQL Network Error (${res.status}): ${errorText}`);
  }

  const parsed = await res.json();

  // Handle GraphQL-level errors (Shopify returns HTTP 200 with errors array)
  if (parsed.errors) {
    const errStr = JSON.stringify(parsed.errors);
    const isThrottled = errStr.includes('THROTTLED') || errStr.includes('Throttled');

    if (isThrottled) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const waitMs = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
        console.warn(`Shopify GraphQL THROTTLED. Waiting ${waitMs}ms (attempt ${attempt}/3)...`);
        await sleep(waitMs);
        const retryRes = await fetchWithRetry(url, getOptions(token));
        if (retryRes.ok) {
          const retryParsed = await retryRes.json();
          if (!retryParsed.errors) return retryParsed.data;
        }
      }
      throw new Error(`Shopify GraphQL Error (still throttled after 3 retries): ${JSON.stringify(parsed.errors)}`);
    }

    if (errStr.includes('Invalid API key') || errStr.includes('unrecognized login') || errStr.includes('Access denied')) {
      console.warn('Shopify GraphQL token expired/rejected. Refreshing token and retrying...');
      token = await getShopifyToken(true);
      const retryRes = await fetchWithRetry(url, getOptions(token));
      if (retryRes.ok) {
        const retryParsed = await retryRes.json();
        if (!retryParsed.errors) return retryParsed.data;
        throw new Error(`Shopify GraphQL Error: ${JSON.stringify(retryParsed.errors)}`);
      }
    }

    throw new Error(`Shopify GraphQL Error: ${errStr}`);
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Shopify REST API client
// ---------------------------------------------------------------------------
export async function shopifyREST(method, path, body = null) {
  let token = await getShopifyToken();
  const getOptions = (tok) => {
    const opts = {
      method,
      headers: {
        'X-Shopify-Access-Token': tok,
        'Content-Type': 'application/json',
      },
    };
    if (body) {
      opts.body = JSON.stringify(body);
    }
    return opts;
  };

  let res = await fetchWithRetry(`https://${STORE}/admin/api/${API_VERSION}${path}`, getOptions(token));

  if (res.status === 401 || res.status === 403) {
    console.warn(`Shopify REST returned HTTP ${res.status}. Refreshing token and retrying...`);
    token = await getShopifyToken(true);
    res = await fetchWithRetry(`https://${STORE}/admin/api/${API_VERSION}${path}`, getOptions(token));
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Shopify REST Error (${res.status}): ${errorText}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Find B2B Customer by email and retrieve passcode/tags
// ---------------------------------------------------------------------------
export async function getB2BCustomer(email) {
  const query = `
    query getCustomer($query: String!) {
      customers(first: 1, query: $query) {
        edges {
          node {
            id
            firstName
            lastName
            email
            tags
            defaultAddress {
              countryCode
            }
            passcode: metafield(namespace: "b2b_portal", key: "passcode") {
              value
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { query: `email:${email}` });
  const edges = data.customers?.edges || [];
  if (edges.length === 0) return null;
  return edges[0].node;
}

// ---------------------------------------------------------------------------
// In-memory product catalog cache (5-minute TTL)
// ---------------------------------------------------------------------------
let _catalogCache = null;
let _catalogCacheTime = 0;
const CATALOG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateCatalogCache() {
  _catalogCache = null;
  _catalogCacheTime = 0;
}

const BARCELONA_LOCATION_ID = process.env.BARCELONA_LOCATION_ID || '121073041745';
const CANADA_LOCATION_ID = process.env.CANADA_LOCATION_ID || '118747267409';
const JAPAN_LOCATION_ID = process.env.JAPAN_LOCATION_ID || '121073074513';

// ---------------------------------------------------------------------------
// Fetch all products, variants, images, and inventory — CACHED
// ---------------------------------------------------------------------------
export async function getProductsWithStock() {
  // Return cached data if fresh
  if (_catalogCache && (Date.now() - _catalogCacheTime) < CATALOG_CACHE_TTL) {
    return _catalogCache;
  }

  const query = `
    query getProducts($cursor: String) {
      products(first: 50, after: $cursor, query: "status:active") {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            handle
            productType
            description
            featuredImage {
              url
              altText
            }
            images(first: 5) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 20) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  image {
                    url
                    altText
                  }
                  inventoryItem {
                    id
                    inventoryLevels(first: 10) {
                      edges {
                        node {
                          location {
                            id
                            name
                          }
                          quantities(names: ["available"]) {
                            quantity
                          }
                        }
                      }
                    }
                  }
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  // We loop to handle pagination if there are more than 50 products
  let allProducts = [];
  let hasNext = true;
  let cursor = null;

  try {
  while (hasNext) {
    const data = await shopifyGraphQL(query, { cursor });
    const products = data.products?.edges || [];
    
    for (const pEdge of products) {
      const p = pEdge.node;
      
      // Map variants to extract clean pricing and stock across all warehouses
      const cleanVariants = (p.variants?.edges || []).map(vEdge => {
        const v = vEdge.node;
        
        let stockBarcelona = 0;
        let stockCanada = 0;
        let stockJapan = 0;

        const levels = v.inventoryItem?.inventoryLevels?.edges || [];
        levels.forEach(edge => {
          if (!edge?.node?.location?.id) return;
          const locId = edge.node.location.id.split('/').pop(); // Extract numeric ID
          const qty = edge.node.quantities?.[0]?.quantity ?? 0;

          const positiveQty = qty > 0 ? qty : 0;

          if (locId === BARCELONA_LOCATION_ID) {
            stockBarcelona = positiveQty;
          } else if (locId === CANADA_LOCATION_ID) {
            stockCanada = positiveQty;
          } else if (locId === JAPAN_LOCATION_ID) {
            stockJapan = positiveQty;
          }
        });

        let variantPrice = parseFloat(v.price);
        const lineSheetWP = getWholesalePrice(p.title, v.sku);
        if (lineSheetWP !== null) {
          variantPrice = lineSheetWP * 2;
        }

        return {
          id: v.id,
          title: v.title,
          sku: v.sku,
          price: variantPrice,
          image: v.image?.url || null,
          available: stockBarcelona, // fallback for legacy frontends
          stock: {
            barcelona: stockBarcelona,
            canada: stockCanada,
            japan: stockJapan
          },
          options: (v.selectedOptions || []).reduce((acc, opt) => {
            acc[opt.name.toLowerCase()] = opt.value;
            return acc;
          }, {}),
        };
      });

      // Extract images list
      const imagesList = p.images?.edges.map(e => e.node.url) || [];
      if (p.featuredImage && !imagesList.includes(p.featuredImage.url)) {
        imagesList.unshift(p.featuredImage.url);
      }

      allProducts.push({
        id: p.id,
        title: p.title,
        handle: p.handle,
        type: p.productType,
        description: p.description,
        image: p.featuredImage?.url || '/placeholder.png',
        images: imagesList,
        variants: cleanVariants,
      });
    }

    hasNext = data.products?.pageInfo?.hasNextPage || false;
    cursor = data.products?.pageInfo?.endCursor || null;
    
    // Safety break to prevent infinite loop
    if (allProducts.length > 500) break;
  }
  } catch (err) {
    // Stability fix: if Shopify times out / throttles mid-fetch, serve the last
    // known catalog (even expired) instead of throwing a 500 to the frontend.
    if (_catalogCache) {
      console.warn('Catalog refresh failed, serving stale cache:', err.message);
      return _catalogCache;
    }
    throw err;
  }

  // Cache the result
  _catalogCache = allProducts;
  _catalogCacheTime = Date.now();

  return allProducts;
}

export async function getProductById(productId) {
  const query = `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        productType
        description
        featuredImage {
          url
          altText
        }
        images(first: 10) {
          edges {
            node {
              url
              altText
            }
          }
        }
        variants(first: 50) {
          edges {
            node {
              id
              title
              sku
              price
              image {
                url
                altText
              }
              inventoryItem {
                id
                inventoryLevels(first: 10) {
                  edges {
                    node {
                      location {
                        id
                        name
                      }
                      quantities(names: ["available"]) {
                        quantity
                      }
                    }
                  }
                }
              }
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }
  `;
  
  const pid = String(productId || '');
  const globalId = pid.startsWith('gid://') ? pid : `gid://shopify/Product/${pid}`;
  const data = await shopifyGraphQL(query, { id: globalId });
  const p = data.product;
  if (!p) return null;

  const cleanVariants = (p.variants?.edges || []).map(vEdge => {
    const v = vEdge.node;
    
    let stockBarcelona = 0;
    let stockCanada = 0;
    let stockJapan = 0;

    const levels = v.inventoryItem?.inventoryLevels?.edges || [];
    levels.forEach(edge => {
      if (!edge?.node?.location?.id) return;
      const locId = edge.node.location.id.split('/').pop();
      const qty = edge.node.quantities?.[0]?.quantity ?? 0;
      const positiveQty = qty > 0 ? qty : 0;

      if (locId === BARCELONA_LOCATION_ID) {
        stockBarcelona = positiveQty;
      } else if (locId === CANADA_LOCATION_ID) {
        stockCanada = positiveQty;
      } else if (locId === JAPAN_LOCATION_ID) {
        stockJapan = positiveQty;
      }
    });

    let variantPrice = parseFloat(v.price);
    const lineSheetWP = getWholesalePrice(p.title, v.sku);
    if (lineSheetWP !== null) {
      variantPrice = lineSheetWP * 2;
    }

    return {
      id: v.id,
      title: v.title,
      sku: v.sku,
      price: variantPrice,
      image: v.image?.url || null,
      stock: {
        barcelona: stockBarcelona,
        canada: stockCanada,
        japan: stockJapan
      },
      options: (v.selectedOptions || []).reduce((acc, opt) => {
        acc[opt.name.toLowerCase()] = opt.value;
        return acc;
      }, {}),
    };
  });

  const imagesList = p.images?.edges.map(e => e.node.url) || [];
  if (p.featuredImage && !imagesList.includes(p.featuredImage.url)) {
    imagesList.unshift(p.featuredImage.url);
  }

  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    type: p.productType,
    description: p.description,
    image: p.featuredImage?.url || '/placeholder.png',
    images: imagesList,
    variants: cleanVariants,
  };
}
