import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession } from '@/lib/session';
import { getCustomerOrders, getAllB2BOrders, getAgentOrders } from '@/lib/orders';

export async function GET() {
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

    // 2. Determine user role and fetch orders
    const isAdmin = session.tags?.some(t => ['b2b-admin', 'admin'].includes(t.toLowerCase())) ||
      session.email?.toLowerCase() === 'info@capoteyewear.com' ||
      session.email?.toLowerCase() === 'deanmoriarty190@gmail.com';

    const isAgent = !isAdmin &&
      (session.tags || []).some(t => t.toLowerCase().startsWith('agent_') || t.toLowerCase() === 'agent');

    const ordersData = isAdmin
      ? await getAllB2BOrders()
      : isAgent
        ? await getAgentOrders(session.tags || [], session.email || '')
        : await getCustomerOrders(session.id);

    return NextResponse.json({
      success: true,
      ...ordersData
    });

  } catch (err) {
    console.error('Order History GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error occurred.' },
      { status: 500 }
    );
  }
}
