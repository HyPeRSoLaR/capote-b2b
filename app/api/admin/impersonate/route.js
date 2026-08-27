import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession, encryptSession } from '@/lib/session';
import { shopifyGraphQL } from '@/lib/shopify';

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('capote_b2b_session');

    if (!sessionCookie) {
      return NextResponse.json({ error: 'Access denied. Please log in.' }, { status: 401 });
    }

    const session = decryptSession(sessionCookie.value);
    if (!session) {
      return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
    }

    // Admins may impersonate anyone. Agents may impersonate ONLY their own customers
    // (final ownership check happens after we fetch the target's tags, below).
    const isAdmin = session.tags?.some(t => ['b2b-admin', 'admin'].includes(t.toLowerCase())) ||
      session.email?.toLowerCase() === 'info@capoteyewear.com' ||
      session.email?.toLowerCase() === 'deanmoriarty190@gmail.com';

    const myAgentTags = (session.tags || [])
      .map(t => t.toLowerCase())
      .filter(t => t.startsWith('agent_'));
    const isAgent = !isAdmin && myAgentTags.length > 0;

    if (!isAdmin && !isAgent) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const body = await request.json();
    const { customerId } = body;

    if (!customerId) {
      return NextResponse.json({ error: 'Missing customer ID.' }, { status: 400 });
    }

    // Fetch customer details from Shopify
    const query = `
      query getCustomer($id: ID!) {
        customer(id: $id) {
          id
          email
          firstName
          lastName
          tags
          defaultAddress {
            countryCode
          }
        }
      }
    `;

    const data = await shopifyGraphQL(query, { id: customerId });
    if (!data.customer) {
      return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    }

    const target = data.customer;

    // Agent ownership check: the target must carry one of the agent's agent_* tags,
    // and must NOT itself be an agent or admin account.
    if (!isAdmin) {
      const targetTags = (target.tags || []).map(t => t.toLowerCase());
      const targetIsPrivileged = targetTags.some(t =>
        t === 'agent' || t.startsWith('b2b-admin') || t === 'admin' || t === 'b2b-admin');
      const targetIsMine = targetTags.some(t => t.startsWith('agent_') && myAgentTags.includes(t));
      if (!targetIsMine || targetIsPrivileged) {
        return NextResponse.json(
          { error: 'You can only place orders for your own customers.' },
          { status: 403 }
        );
      }
    }

    // Create session for target customer with impersonation link back to admin
    const sessionUser = {
      id: target.id,
      email: target.email,
      firstName: target.firstName || '',
      lastName: target.lastName || '',
      tags: target.tags || [],
      countryCode: target.defaultAddress?.countryCode || 'ES',
      impersonatedBy: session.email // Stores original admin's email
    };

    const token = encryptSession(sessionUser);

    cookieStore.set('capote_b2b_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/'
    });

    return NextResponse.json({ success: true, user: sessionUser });

  } catch (err) {
    console.error('Impersonate POST error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
