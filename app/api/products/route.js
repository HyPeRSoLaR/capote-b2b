import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession } from '@/lib/session';
import { getProductsWithStock } from '@/lib/shopify';

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

    // 2. Fetch products for all warehouses
    const products = await getProductsWithStock();


    return NextResponse.json({
      success: true,
      products
    });

  } catch (err) {
    console.error('Products fetch API error:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred while retrieving catalog.' },
      { status: 500 }
    );
  }
}
