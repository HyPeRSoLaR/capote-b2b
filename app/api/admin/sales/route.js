import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession } from '@/lib/session';
import { shopifyGraphQL, getProductsWithStock } from '@/lib/shopify';

const ADMIN_EMAILS = ['info@capoteyewear.com', 'deanmoriarty190@gmail.com'];

export async function GET(request) {
  try {
    // 1. Authenticate Admin Session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('capote_b2b_session');

    if (!sessionCookie) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 401 });
    }

    const session = decryptSession(sessionCookie.value);
    if (!session) {
      return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
    }

    const isAdmin = session.tags?.some(t => t.toLowerCase() === 'b2b-admin') || ADMIN_EMAILS.includes(session.email.toLowerCase());
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    // Parse date range parameter
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'all';

    // 2. Fetch all completed orders and draft orders from Shopify
    // Querying first 100 orders and draft orders to compute statistics
    const query = `
      query getSalesData {
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
              customer {
                email
                firstName
                lastName
                tags
              }
              tags
            }
          }
        }
        draftOrders(first: 100) {
          edges {
            node {
              id
              name
              createdAt
              status
              totalPriceSet {
                presentmentMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                email
                firstName
                lastName
              }
              tags
            }
          }
        }
      }
    `;

    const data = await shopifyGraphQL(query);

    const orders = data.orders?.edges.map(e => e.node) || [];
    const draftOrders = data.draftOrders?.edges.map(e => e.node) || [];

    // Filter to keep only B2B orders
    // An order is B2B if:
    //   1. It is tagged with "B2B-Order"
    //   2. OR the customer has a B2B tag (covers orders placed before portal tagging)
    //   3. OR it's a draft order (draft orders are always B2B wholesale)
    const isB2BOrder = (o) => {
      const hasB2BOrderTag = o.tags?.some(t => t.toLowerCase() === 'b2b-order');
      const customerHasB2BTag = o.customer?.tags?.some(t => 
        t.toLowerCase().includes('b2b') || t.toLowerCase().includes('wholesale') || t.toLowerCase().includes('partner')
      );
      return hasB2BOrderTag || customerHasB2BTag;
    };

    const b2bOrdersAll = orders.filter(o => isB2BOrder(o) && o.customer?.email);
    const b2cOrdersAll = orders.filter(o => !isB2BOrder(o) && o.customer?.email);

    const b2bDraftsAll = draftOrders.filter(d => d.customer?.email);

    // Apply Date Range Filter
    const now = new Date();
    const filterByDate = (item) => {
      const itemDate = new Date(item.createdAt);
      if (isNaN(itemDate.getTime())) return false;

      if (range === '30') {
        const limit = new Date();
        limit.setDate(now.getDate() - 30);
        return itemDate >= limit;
      }
      if (range === '90') {
        const limit = new Date();
        limit.setDate(now.getDate() - 90);
        return itemDate >= limit;
      }
      if (range === 'this_month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return itemDate >= start;
      }
      if (range === 'last_month') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return itemDate >= start && itemDate <= end;
      }
      if (range === 'ytd') {
        const start = new Date(now.getFullYear(), 0, 1);
        return itemDate >= start;
      }
      return true;
    };

    const b2bOrders = b2bOrdersAll.filter(filterByDate);
    const b2cOrders = b2cOrdersAll.filter(filterByDate);
    const b2bDrafts = b2bDraftsAll.filter(filterByDate);

    // 3. Compute Key Metrics
    let b2bRevenueEUR = 0;
    let b2bRevenueCAD = 0;
    let b2bRevenueJPY = 0;
    let b2bCount = 0;

    let b2cRevenueEUR = 0;
    let b2cRevenueCAD = 0;
    let b2cRevenueJPY = 0;
    let b2cCount = 0;

    let pendingValueEUR = 0;
    let pendingValueCAD = 0;
    let pendingValueJPY = 0;
    let pendingCount = 0;

    // Convert everything to a base currency (EUR) for consolidated display, but track native too
    // Simple approximate conversions for dashboard summary (1 CAD = 0.68 EUR, 1 JPY = 0.006 EUR)
    const toEUR = (amount, currency) => {
      const val = parseFloat(amount || '0');
      if (currency === 'CAD') return val * 0.68;
      if (currency === 'JPY') return val * 0.006;
      return val;
    };

    const customerSales = {}; // email -> { name, totalB2B, totalB2C, countB2B, countB2C }

    b2bOrders.forEach(o => {
      const amount = parseFloat(o.totalPriceSet?.presentmentMoney?.amount || '0');
      const currency = o.totalPriceSet?.presentmentMoney?.currencyCode || 'EUR';
      
      if (currency === 'EUR') b2bRevenueEUR += amount;
      else if (currency === 'CAD') b2bRevenueCAD += amount;
      else if (currency === 'JPY') b2bRevenueJPY += amount;
      b2bCount++;

      // Track by customer
      const email = o.customer?.email || 'unknown@capoteyewear.com';
      const name = `${o.customer?.firstName || ''} ${o.customer?.lastName || ''}`.trim() || email;
      if (!customerSales[email]) {
        customerSales[email] = { name, totalB2B: 0, totalB2C: 0, countB2B: 0, countB2C: 0 };
      }
      customerSales[email].totalB2B += toEUR(amount, currency);
      customerSales[email].countB2B++;
    });

    b2cOrders.forEach(o => {
      const amount = parseFloat(o.totalPriceSet?.presentmentMoney?.amount || '0');
      const currency = o.totalPriceSet?.presentmentMoney?.currencyCode || 'EUR';
      
      if (currency === 'EUR') b2cRevenueEUR += amount;
      else if (currency === 'CAD') b2cRevenueCAD += amount;
      else if (currency === 'JPY') b2cRevenueJPY += amount;
      b2cCount++;

      // Track by customer
      const email = o.customer?.email || 'unknown@capoteyewear.com';
      const name = `${o.customer?.firstName || ''} ${o.customer?.lastName || ''}`.trim() || email;
      if (!customerSales[email]) {
        customerSales[email] = { name, totalB2B: 0, totalB2C: 0, countB2B: 0, countB2C: 0 };
      }
      customerSales[email].totalB2C += toEUR(amount, currency);
      customerSales[email].countB2C++;
    });

    b2bDrafts.forEach(d => {
      const amount = parseFloat(d.totalPriceSet?.presentmentMoney?.amount || '0');
      const currency = d.totalPriceSet?.presentmentMoney?.currencyCode || 'EUR';
      
      if (d.status === 'OPEN') {
        if (currency === 'EUR') pendingValueEUR += amount;
        else if (currency === 'CAD') pendingValueCAD += amount;
        else if (currency === 'JPY') pendingValueJPY += amount;
        pendingCount++;
      }
    });

    const consolidatedB2BRevenue = b2bRevenueEUR + (b2bRevenueCAD * 0.68) + (b2bRevenueJPY * 0.006);
    const consolidatedB2CRevenue = b2cRevenueEUR + (b2cRevenueCAD * 0.68) + (b2cRevenueJPY * 0.006);
    const consolidatedRevenue = consolidatedB2BRevenue + consolidatedB2CRevenue;
    const consolidatedPending = pendingValueEUR + (pendingValueCAD * 0.68) + (pendingValueJPY * 0.006);
    const aovB2B = b2bCount > 0 ? consolidatedB2BRevenue / b2bCount : 0;

    // 4. Compute Monthly & Quarterly Breakdowns for B2B only (consolidated in EUR)
    const monthlySalesB2B = {}; 
    const quarterlySalesB2B = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };

    b2bOrders.forEach(o => {
      const isB2B = o.tags?.some(t => t.toLowerCase() === 'b2b-order') || 
                    o.customer?.tags?.some(t => t.toLowerCase().includes('b2b'));
      if (!isB2B) return; // Skip B2C retail orders for main chart

      const amount = parseFloat(o.totalPriceSet?.presentmentMoney?.amount || '0');
      const currency = o.totalPriceSet?.presentmentMoney?.currencyCode || 'EUR';
      const eurVal = toEUR(amount, currency);
      
      const date = new Date(o.createdAt);
      if (isNaN(date.getTime())) return;
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      
      monthlySalesB2B[key] = (monthlySalesB2B[key] || 0) + eurVal;

      // Quarter
      const monthNum = date.getMonth() + 1;
      if (monthNum <= 3) quarterlySalesB2B.Q1 += eurVal;
      else if (monthNum <= 6) quarterlySalesB2B.Q2 += eurVal;
      else if (monthNum <= 9) quarterlySalesB2B.Q3 += eurVal;
      else quarterlySalesB2B.Q4 += eurVal;
    });

    // Format monthly sales as sorted array
    const sortedMonths = Object.entries(monthlySalesB2B)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, val]) => ({ month, amount: Math.round(val) }))
      .slice(-12);

    // Format top customers list
    const topCustomers = Object.entries(customerSales)
      .map(([email, info]) => ({
        email,
        name: info.name,
        totalB2B: Math.round(info.totalB2B),
        totalB2C: Math.round(info.totalB2C),
        countB2B: info.countB2B,
        countB2C: info.countB2C
      }))
      .sort((a, b) => b.totalB2B - a.totalB2B)
      .slice(0, 10);

    // 1. Fetch products & variants count
    const allProds = await getProductsWithStock();
    const productCount = allProds.length;
    const variantCount = allProds.reduce((sum, p) => sum + (p.variants?.length || 0), 0);

    // 2. Fetch customers count (those with tag "b2b*")
    const customersQuery = `
      query {
        customers(first: 250, query: "tag:b2b*") {
          edges {
            node {
              id
            }
          }
        }
      }
    `;
    const customersData = await shopifyGraphQL(customersQuery);
    const customerCount = customersData.customers?.edges?.length || 0;

    // 3. Map recent B2B orders and B2B draft orders
    const allB2B = [
      ...b2bOrdersAll.map(o => ({
        id: o.id,
        name: o.name,
        customerName: `${o.customer?.firstName || ''} ${o.customer?.lastName || ''}`.trim() || o.customer?.email || '—',
        total: parseFloat(o.totalPriceSet?.presentmentMoney?.amount || '0'),
        currency: o.totalPriceSet?.presentmentMoney?.currencyCode || 'EUR',
        status: o.displayFinancialStatus || 'Paid',
        createdAt: o.createdAt
      })),
      ...b2bDraftsAll.map(d => ({
        id: d.id,
        name: d.name,
        customerName: `${d.customer?.firstName || ''} ${d.customer?.lastName || ''}`.trim() || d.customer?.email || '—',
        total: parseFloat(d.totalPriceSet?.presentmentMoney?.amount || '0'),
        currency: d.totalPriceSet?.presentmentMoney?.currencyCode || 'EUR',
        status: d.status || 'Open',
        createdAt: d.createdAt
      }))
    ];

    // Sort by date descending
    const recentOrders = allB2B
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);

    return NextResponse.json({
      metrics: {
        b2bRevenueEUR: Math.round(b2bRevenueEUR),
        b2bRevenueCAD: Math.round(b2bRevenueCAD),
        b2bRevenueJPY: Math.round(b2bRevenueJPY),
        consolidatedB2BRevenue: Math.round(consolidatedB2BRevenue),
        b2bCount,
        b2cRevenueEUR: Math.round(b2cRevenueEUR),
        b2cRevenueCAD: Math.round(b2cRevenueCAD),
        b2cRevenueJPY: Math.round(b2cRevenueJPY),
        consolidatedB2CRevenue: Math.round(consolidatedB2CRevenue),
        b2cCount,
        consolidatedRevenue: Math.round(consolidatedRevenue),
        pendingValueEUR: Math.round(pendingValueEUR),
        pendingValueCAD: Math.round(pendingValueCAD),
        pendingValueJPY: Math.round(pendingValueJPY),
        consolidatedPending: Math.round(consolidatedPending),
        pendingCount,
        aovB2B: Math.round(aovB2B)
      },
      monthlyBreakdown: sortedMonths,
      quarterlyBreakdown: [
        { quarter: 'Q1 (Jan-Mar)', amount: Math.round(quarterlySalesB2B.Q1) },
        { quarter: 'Q2 (Apr-Jun)', amount: Math.round(quarterlySalesB2B.Q2) },
        { quarter: 'Q3 (Jul-Sep)', amount: Math.round(quarterlySalesB2B.Q3) },
        { quarter: 'Q4 (Oct-Dec)', amount: Math.round(quarterlySalesB2B.Q4) }
      ],
      topCustomers,
      productCount,
      variantCount,
      customerCount,
      lastSync: new Date().toISOString(),
      recentOrders
    });

  } catch (err) {
    console.error('Admin sales metrics GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error occurred.' },
      { status: 500 }
    );
  }
}
