import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession } from '@/lib/session';
import { getOrderById } from '@/lib/orders';

export async function GET(request, { params }) {
  try {
    // 1. Authenticate Session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('capote_b2b_session');

    if (!sessionCookie) {
      return NextResponse.json({ error: 'Access denied. Please log in.' }, { status: 401 });
    }

    const session = decryptSession(sessionCookie.value);
    if (!session) {
      return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
    }

    const { id: rawId } = await params;
    if (!rawId) {
      return NextResponse.json({ error: 'Missing order ID parameter.' }, { status: 400 });
    }
    const id = decodeURIComponent(rawId);

    // 2. Fetch Order details from Shopify helper
    const order = await getOrderById(id);
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    // 3. Optional: Verify that the user has permission to see this order
    // If the user is NOT admin, they should only see their own orders.
    const isAdmin = session.tags?.some(t => ['b2b-admin', 'admin'].includes(t.toLowerCase())) ||
      session.email?.toLowerCase() === 'info@capoteyewear.com' ||
      session.email?.toLowerCase() === 'deanmoriarty190@gmail.com';

    if (!isAdmin && order.customer?.email?.toLowerCase() !== session.email?.toLowerCase()) {
      return NextResponse.json({ error: 'Access denied to this order.' }, { status: 403 });
    }

    return NextResponse.json({ success: true, order });

  } catch (err) {
    console.error('Order detail GET error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('capote_b2b_session');
    if (!sessionCookie) return NextResponse.json({ error: 'Access denied.' }, { status: 401 });
    const session = decryptSession(sessionCookie.value);
    if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });

    const { id: rawId } = await params;
    if (!rawId) return NextResponse.json({ error: 'Missing order ID.' }, { status: 400 });

    const id = decodeURIComponent(rawId);

    const existingOrder = await getOrderById(id);
    if (!existingOrder) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const isAdmin = session.tags?.some(t => ['b2b-admin', 'admin'].includes(t.toLowerCase())) ||
      session.email?.toLowerCase() === 'info@capoteyewear.com' ||
      session.email?.toLowerCase() === 'deanmoriarty190@gmail.com';

    if (!isAdmin && existingOrder.customer?.email?.toLowerCase() !== session.email?.toLowerCase()) {
      return NextResponse.json({ error: 'Access denied to this order.' }, { status: 403 });
    }

    // Only admins may change prices or discounts. Non-admin owners may edit
    // notes/quantities on their own draft, never unit prices or appliedDiscount.
    if (!isAdmin) {
      const body = await request.clone().json().catch(() => ({}));
      const touchesPricing = body.appliedDiscount !== undefined ||
        (Array.isArray(body.items) && body.items.some(it => it.price !== undefined));
      if (touchesPricing) {
        return NextResponse.json(
          { error: 'Only Capote staff can change prices or discounts on an order.' },
          { status: 403 }
        );
      }
    }

    const body = await request.json();
    const { items, note, currency, appliedDiscount } = body;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid items array.' }, { status: 400 });
    }

    const { updateDraftOrder, updateCompletedOrderPrices } = await import('@/lib/orders');

    const numericId = id.replace(/\D/g, '');

    const isDraft = (existingOrder && existingOrder.type === 'Draft') || 
                    id.toLowerCase().includes('draft') || 
                    id.startsWith('D') || 
                    id.startsWith('#D');

    if (isDraft) {
      const draftOrderGid = `gid://shopify/DraftOrder/${numericId}`;
      const updatedDraft = await updateDraftOrder(draftOrderGid, items, note || '', appliedDiscount);
      return NextResponse.json({ success: true, draftOrder: updatedDraft });
    } else {
      const orderGid = `gid://shopify/Order/${numericId}`;
      const editResult = await updateCompletedOrderPrices(orderGid, items, appliedDiscount);
      return NextResponse.json({
        success: true,
        message: editResult.shopifyOrderEditSynced
          ? 'Order prices & discount updated in Shopify Admin and B2B Portal!'
          : 'Order prices & discount updated in B2B Portal.',
        shopifySynced: editResult.shopifyOrderEditSynced,
        shopifyError: editResult.shopifyOrderEditError
      });
    }
  } catch (err) {
    console.error('Order PUT Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to update order.' }, { status: 500 });
  }
}
