import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession, encryptSession } from '@/lib/session';
import { getB2BCustomer } from '@/lib/shopify';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('capote_b2b_session');

    if (!sessionCookie) {
      return NextResponse.json({ error: 'Access denied. Please log in.' }, { status: 401 });
    }

    const session = decryptSession(sessionCookie.value);
    if (!session || !session.impersonatedBy) {
      return NextResponse.json({ error: 'No active impersonation session found.' }, { status: 400 });
    }

    // Re-fetch original admin details
    const adminEmail = session.impersonatedBy;
    const adminCustomer = await getB2BCustomer(adminEmail);

    if (!adminCustomer) {
      return NextResponse.json({ error: 'Failed to restore admin session.' }, { status: 500 });
    }

    // Create session for admin
    const adminSessionUser = {
      id: adminCustomer.id,
      email: adminCustomer.email,
      firstName: adminCustomer.firstName || '',
      lastName: adminCustomer.lastName || '',
      tags: adminCustomer.tags || [],
    };

    const token = encryptSession(adminSessionUser);

    cookieStore.set('capote_b2b_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 2, // 2 hours
      path: '/'
    });

    return NextResponse.json({ success: true, user: adminSessionUser });

  } catch (err) {
    console.error('Stop impersonate POST error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
