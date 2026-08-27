import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession } from '@/lib/session';
import { shopifyGraphQL } from '@/lib/shopify';
import { sendB2BPasscodeEmail } from '@/lib/email';

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

    // 2. Query customer profile and default address from Shopify
    const query = `
      query getProfile($id: ID!) {
        customer(id: $id) {
          id
          firstName
          lastName
          email
          tags
          defaultAddress {
            address1
            address2
            city
            province
            zip
            country
          }
        }
      }
    `;

    const data = await shopifyGraphQL(query, { id: session.id });
    const customer = data.customer;

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer profile not found on Shopify.' },
        { status: 404 }
      );
    }

    // Determine B2B discount tier
    let discountPercent = 50;
    const tags = customer.tags || [];
    for (const tag of tags) {
      const match = tag.match(/B2B-Discount-(\d+)/i);
      if (match) {
        discountPercent = parseInt(match[1]);
        break;
      }
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: customer.id,
        firstName: customer.firstName || '',
        lastName: customer.lastName || '',
        email: customer.email,
        tags: tags,
        discountPercent,
        defaultAddress: customer.defaultAddress || null
      }
    });

  } catch (err) {
    console.error('Account profile GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error occurred.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
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

    // 2. Parse request body
    const body = await request.json();
    const { passcode } = body;

    if (!passcode || passcode.trim().length < 4) {
      return NextResponse.json(
        { error: 'Passcode must be at least 4 characters long.' },
        { status: 400 }
      );
    }

    // 3. Update metafield passcode in Shopify
    const updateMutation = `
      mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const input = {
      id: session.id,
      metafields: [
        {
          namespace: "b2b_portal",
          key: "passcode",
          value: passcode.trim(),
          type: "single_line_text_field"
        }
      ]
    };

    const data = await shopifyGraphQL(updateMutation, { input });
    if (data.customerUpdate?.userErrors?.length > 0) {
      return NextResponse.json(
        { error: data.customerUpdate.userErrors.map(e => e.message).join(', ') },
        { status: 400 }
      );
    }

    // 4. Send Confirmation Email to user
    try {
      const clientName = `${session.firstName || ''} ${session.lastName || ''}`.trim() || 'B2B Partner';
      await sendB2BPasscodeEmail(session.email, clientName, passcode.trim());
    } catch (emailErr) {
      console.error('Failed to send account passcode confirmation email:', emailErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Passcode updated successfully.'
    });

  } catch (err) {
    console.error('Account profile PATCH error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error occurred.' },
      { status: 500 }
    );
  }
}
