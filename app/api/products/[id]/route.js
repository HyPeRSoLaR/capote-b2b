import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession } from '@/lib/session';
import { getProductById } from '@/lib/shopify';
import { resolveB2BPrice } from '@/lib/pricing';

export async function GET(request, { params }) {
  try {
    const { id } = await params;

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

    // 2. Fetch product by ID
    const product = await getProductById(id);
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found.' },
        { status: 404 }
      );
    }

    const sessionTags = session.tags || [];

    // Compute b2bPrice per variant and strip raw tierPrices
    const sanitizedProduct = {
      ...product,
      variants: (product.variants || []).map(v => {
        const b2bPrice = resolveB2BPrice(
          { tierPrices: v.tierPrices, productTitle: product.title, sku: v.sku },
          sessionTags
        );
        const { tierPrices, ...restVariant } = v;
        return {
          ...restVariant,
          b2bPrice
        };
      })
    };

    return NextResponse.json({
      success: true,
      product: sanitizedProduct
    });

  } catch (err) {
    console.error('Single product fetch API error:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred while retrieving product details.' },
      { status: 500 }
    );
  }
}
