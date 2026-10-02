import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession, isAgentSession } from '@/lib/session';
import { getOrderById, getAgentClientEmails, mergeOrderNotes } from '@/lib/orders';
import { getB2BCustomer } from '@/lib/shopify';

const MASTER_ADMIN_EMAILS = ['info@capoteyewear.com', 'deanmoriarty190@gmail.com'];

function hasAdminTag(tags = []) {
  return (tags || []).some(t => ['b2b-admin', 'admin'].includes(String(t).toLowerCase()));
}

// An admin impersonating a customer carries the customer's tags in the session,
// so the admin rights must be re-derived from the impersonator (session.impersonatedBy).
async function isImpersonatingAdmin(session) {
  const by = (session?.impersonatedBy || '').toLowerCase();
  if (!by) return false;
  if (MASTER_ADMIN_EMAILS.includes(by)) return true;
  try {
    const impersonator = await getB2BCustomer(by);
    return hasAdminTag(impersonator?.tags);
  } catch {
    return false;
  }
}

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

    // 3. Verify that the user has permission to see this order
    // - Admin: can see all orders
    // - Customer: can see their own orders
    // - Agent: can see orders belonging to their clients
    const isAdmin = session.tags?.some(t => ['b2b-admin', 'admin'].includes(t.toLowerCase())) ||
      session.email?.toLowerCase() === 'info@capoteyewear.com' ||
      session.email?.toLowerCase() === 'deanmoriarty190@gmail.com';

    if (!isAdmin && order.customer?.email?.toLowerCase() !== session.email?.toLowerCase()) {
      const isAgent = isAgentSession(session.tags || []);

      if (isAgent) {
        const clientEmails = await getAgentClientEmails(session.tags, session.email);
        const orderCustomerEmail = (order.customer?.email || '').toLowerCase();
        if (!clientEmails.has(orderCustomerEmail)) {
          return NextResponse.json({ error: 'Access denied to this order.' }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: 'Access denied to this order.' }, { status: 403 });
      }
    }

    // Order notes can hold internal staff comments: only Capote staff, agents, or a
    // staff member impersonating the customer may see them.
    const canSeeNotes = isAdmin || isAgentSession(session.tags || []) || !!session.impersonatedBy;
    const safeOrder = canSeeNotes ? order : { ...order, note: '' };

    return NextResponse.json({ success: true, order: safeOrder });

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

    const isAdmin = hasAdminTag(session.tags) ||
      MASTER_ADMIN_EMAILS.includes((session.email || '').toLowerCase()) ||
      await isImpersonatingAdmin(session);

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
      // Append the new comment to the existing note instead of overwriting it.
      const mergedNote = note ? mergeOrderNotes(existingOrder.note, note) : '';
      const updatedDraft = await updateDraftOrder(draftOrderGid, items, mergedNote, appliedDiscount);
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
