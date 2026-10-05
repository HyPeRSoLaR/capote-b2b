import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession, isAgentSession } from '@/lib/session';
import { getOrderById, getAgentClientEmails, mergeOrderNotes, sanitizeLineProperties } from '@/lib/orders';
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

    // A staff member impersonating a customer may only edit THAT customer's drafts.
    // Protects against a stale "editing #D…" flag left in the browser from another client
    // overwriting the wrong draft.
    if (session.impersonatedBy && existingOrder.customer?.email?.toLowerCase() !== session.email?.toLowerCase()) {
      return NextResponse.json({
        error: `Order ${existingOrder.name} belongs to another customer — edit cancelled.`,
        code: 'EDIT_OWNER_MISMATCH'
      }, { status: 409 });
    }

    // Non-admins (customers, agents) may never change prices, discounts or completed orders.
    // They can only edit quantities / notes of lines that ALREADY exist on their own draft;
    // prices are always taken from the stored draft, never from the request.
    if (!isAdmin) {
      const isDraftOrder = existingOrder.type === 'Draft';
      if (!isDraftOrder) {
        return NextResponse.json({ error: 'Only Capote staff can edit a confirmed order.' }, { status: 403 });
      }
    }

    const body = await request.json();

    // Note-only update (no line or price changes): append the text to the draft's note.
    if (body.noteOnly) {
      if (existingOrder.type !== 'Draft') {
        return NextResponse.json({ error: 'Notes can only be added to draft orders.' }, { status: 400 });
      }
      const text = String(body.note || '').trim().slice(0, 2000);
      if (!text) return NextResponse.json({ error: 'Empty note.' }, { status: 400 });
      const { updateDraftOrderNote } = await import('@/lib/orders');
      const merged = mergeOrderNotes(existingOrder.note, text);
      const numeric = id.replace(/\D/g, '');
      await updateDraftOrderNote(`gid://shopify/DraftOrder/${numeric}`, merged);
      return NextResponse.json({ success: true, note: merged });
    }

    // Stale-page guard: a page/cart loaded BEFORE the draft last changed (another tab,
    // a fix, someone else's edit) would write back outdated prices and lines
    // (D1119, 5 Oct 2026: stale page re-sent retail prices after the repricing fix).
    if (body.baseUpdatedAt && existingOrder.type === 'Draft' && existingOrder.updatedAt) {
      const base = Date.parse(body.baseUpdatedAt);
      const current = Date.parse(existingOrder.updatedAt);
      if (Number.isFinite(base) && Number.isFinite(current) && current - base > 1000) {
        return NextResponse.json({
          error: `${existingOrder.name} was modified since you opened it. Open the order again (reload with Cmd/Ctrl+Shift+R) to see the latest prices, then redo your change.`,
          code: 'STALE_DRAFT'
        }, { status: 409 });
      }
    }

    const { note, currency } = body;
    let { items, appliedDiscount } = body;
    if (!isAdmin) {
      appliedDiscount = undefined;
      if (Array.isArray(items)) {
        const stored = existingOrder.items || [];
        const matched = [];
        for (const it of items) {
          const m = stored.find(e => (it.variantId && e.variantId && it.variantId === e.variantId) ||
            (!it.variantId && it.sku && e.sku === it.sku && (e.title === it.title)));
          if (!m) {
            return NextResponse.json({ error: 'Adding new items to an existing order is handled by Capote staff. Please create a new order or contact us.' }, { status: 403 });
          }
          const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
          matched.push({ ...it, quantity: qty, price: m.price, unitPrice: undefined });
        }
        items = matched;
      }
    }

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
      // Client may only send per-line Note (+ keep Warehouse); everything else is rebuilt server-side.
      const safeItems = items.map(it => ({
        ...it,
        properties: sanitizeLineProperties([...(it.properties || []), ...(it.customAttributes || [])], { allowWarehouse: true }),
        customAttributes: []
      }));
      const updatedDraft = await updateDraftOrder(draftOrderGid, safeItems, mergedNote, appliedDiscount);
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
