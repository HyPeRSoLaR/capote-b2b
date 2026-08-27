import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession } from '@/lib/session';
import { shopifyGraphQL } from '@/lib/shopify';

const DEFAULT_MAPPINGS = [
  { id: '1', baseCode: '90041000', country: 'France (FR)', nationalCode: '9004.10.00', description: 'N/A', nationalLabel: 'N/A' },
  { id: '2', baseCode: '90041000', country: 'Italy (IT)', nationalCode: '9004.10.00', description: 'N/A', nationalLabel: 'HS Code' },
  { id: '3', baseCode: '90041000', country: 'Morocco (MA)', nationalCode: '9004.10.00', description: 'N/A', nationalLabel: 'HS Code' },
  { id: '4', baseCode: '90041000', country: 'Monaco (MC)', nationalCode: '9004.10.00', description: 'N/A', nationalLabel: 'HS Code' }
];

async function getSessionUser() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('capote_b2b_session');
    if (!sessionCookie) return null;
    return decryptSession(sessionCookie.value);
  } catch {
    return null;
  }
}

function isAdmin(session) {
  if (!session) return false;
  const isAdminTag = session.tags?.some(t => ['b2b-admin', 'admin'].includes(t.toLowerCase()));
  const isAdminEmail = session.email?.toLowerCase() === 'info@capoteyewear.com' || session.email?.toLowerCase() === 'deanmoriarty190@gmail.com';
  return isAdminTag || isAdminEmail;
}

// Fetch shop ID and metafield
async function fetchShopMetafield() {
  const query = `
    query {
      shop {
        id
        metafield(namespace: "b2b_portal", key: "hs_codes") {
          value
        }
      }
    }
  `;
  const data = await shopifyGraphQL(query);
  return {
    shopId: data.shop?.id,
    value: data.shop?.metafield?.value
  };
}

// Set shop metafield
async function setShopMetafield(shopId, mappings) {
  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const result = await shopifyGraphQL(mutation, {
    metafields: [
      {
        ownerId: shopId,
        namespace: "b2b_portal",
        key: "hs_codes",
        value: JSON.stringify(mappings),
        type: "json"
      }
    ]
  });
  if (result.metafieldsSet?.userErrors?.length > 0) {
    throw new Error(result.metafieldsSet.userErrors.map(e => e.message).join(', '));
  }
}

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const { shopId, value } = await fetchShopMetafield();
    let mappings = [];
    if (!value) {
      // Initialize with default values
      mappings = DEFAULT_MAPPINGS;
      await setShopMetafield(shopId, mappings);
    } else {
      try {
        mappings = JSON.parse(value);
      } catch {
        mappings = DEFAULT_MAPPINGS;
      }
    }

    return NextResponse.json({ success: true, mappings });
  } catch (err) {
    console.error('HS codes GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getSessionUser();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const body = await request.json();
    const { baseCode, country, nationalCode, description, nationalLabel } = body;

    if (!baseCode || !country || !nationalCode) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const { shopId, value } = await fetchShopMetafield();
    let mappings = [];
    if (value) {
      try { mappings = JSON.parse(value); } catch {}
    }

    const newMapping = {
      id: String(Date.now()),
      baseCode,
      country,
      nationalCode,
      description: description || 'N/A',
      nationalLabel: nationalLabel || 'N/A'
    };

    mappings.push(newMapping);
    await setShopMetafield(shopId, mappings);

    return NextResponse.json({ success: true, mapping: newMapping });
  } catch (err) {
    console.error('HS codes POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getSessionUser();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const body = await request.json();
    const { id, baseCode, country, nationalCode, description, nationalLabel } = body;

    if (!id || !baseCode || !country || !nationalCode) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const { shopId, value } = await fetchShopMetafield();
    let mappings = [];
    if (value) {
      try { mappings = JSON.parse(value); } catch {}
    }

    const index = mappings.findIndex(m => m.id === id);
    if (index === -1) {
      return NextResponse.json({ error: 'Mapping not found.' }, { status: 404 });
    }

    mappings[index] = {
      id,
      baseCode,
      country,
      nationalCode,
      description: description || 'N/A',
      nationalLabel: nationalLabel || 'N/A'
    };

    await setShopMetafield(shopId, mappings);

    return NextResponse.json({ success: true, mapping: mappings[index] });
  } catch (err) {
    console.error('HS codes PUT error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getSessionUser();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing ID parameter.' }, { status: 400 });
    }

    const { shopId, value } = await fetchShopMetafield();
    let mappings = [];
    if (value) {
      try { mappings = JSON.parse(value); } catch {}
    }

    const updated = mappings.filter(m => m.id !== id);
    await setShopMetafield(shopId, updated);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('HS codes DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
  }
}
