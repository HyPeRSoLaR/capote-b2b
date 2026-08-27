import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession } from '@/lib/session';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('capote_b2b_session');

    if (!sessionCookie) {
      return NextResponse.json({ authenticated: false });
    }

    const session = decryptSession(sessionCookie.value);
    if (!session) {
      return NextResponse.json({ authenticated: false });
    }

    // Determine discount level from customer tags.
    // Priority: a Distributor-XX tag (distributor pays XX% OFF WHOLESALE, stacked on the
    // standard 50%) overrides the plain B2B-Discount-XX tier.
    let discountPercent = 50; // default 50% discount
    const tags = session.tags || [];
    const distMatch = tags
      .map(t => t.match(/Distributor-(\d+(?:\.\d+)?)/i))
      .find(Boolean);
    if (distMatch) {
      const rate = parseFloat(distMatch[1]) / 100;          // e.g. 0.35
      discountPercent = 100 - 50 * (1 - rate);              // 35 -> 67.5, 30 -> 65
    } else {
      for (const tag of tags) {
        const match = tag.match(/B2B-Discount-(\d+(?:\.\d+)?)/i);
        if (match) {
          discountPercent = parseFloat(match[1]);
          break;
        }
      }
    }

    // Determine currency and warehouse based on country code
    const country = session.countryCode || 'ES';
    let currency = 'EUR';
    let warehouse = 'Barcelona';

    if (country === 'CA') {
      currency = 'CAD';
      warehouse = 'Canada';
    } else if (country === 'JP') {
      currency = 'JPY';
      warehouse = 'Japan';
    } else if (country === 'US') {
      currency = 'USD';
      warehouse = 'Barcelona'; // Sourced from Barcelona, billed in USD
    }

    // Support tag overrides for currency
    for (const tag of tags) {
      const lt = tag.toLowerCase();
      if (lt === 'usd' || lt === 'currency-usd') currency = 'USD';
      else if (lt === 'cad' || lt === 'currency-cad') currency = 'CAD';
      else if (lt === 'jpy' || lt === 'currency-jpy') currency = 'JPY';
      else if (lt === 'eur' || lt === 'currency-eur') currency = 'EUR';
      
      // Sourcing logistics warehouse tag overrides
      if (lt === 'warehouse-barcelona' || lt === 'barcelona') warehouse = 'Barcelona';
      else if (lt === 'warehouse-japan' || lt === 'japan') warehouse = 'Japan';
      else if (lt === 'warehouse-canada' || lt === 'canada') warehouse = 'Canada';
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        email: session.email,
        name: `${session.firstName} ${session.lastName}`.trim() || 'B2B Partner',
        tags: tags,
        impersonatedBy: session.impersonatedBy || null,
        countryCode: country,
        currency,
        warehouse,
      },
      discountPercent,
    });


  } catch (err) {
    console.error('Session API GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred.' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('capote_b2b_session');
    
    return NextResponse.json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (err) {
    console.error('Session API DELETE error:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred.' },
      { status: 500 }
    );
  }
}
