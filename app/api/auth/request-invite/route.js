import { NextResponse } from 'next/server';
import { shopifyGraphQL, shopifyREST } from '@/lib/shopify';

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Find customer in Shopify
    const query = `
      query getCustomer($query: String!) {
        customers(first: 5, query: $query) {
          edges {
            node {
              id
              email
              tags
            }
          }
        }
      }
    `;

    const data = await shopifyGraphQL(query, { query: `email:${cleanEmail}` });
    const cust = data.customers?.edges?.[0]?.node;

    // Send the invite ONLY if the customer actually exists — but do NOT reveal that
    // outcome to the caller (prevents email enumeration).
    if (cust) {
      const numericId = cust.id.split('/').pop();
      try {
        await shopifyREST('POST', `/customers/${numericId}/send_invite.json`, {
          customer_invite: {
            custom_message: 'Welcome to the Capote Eyewear B2B Wholesale Portal. Please click below to activate your account and access wholesale ordering.'
          }
        });
      } catch (inviteErr) {
        console.error('send_invite failed:', inviteErr?.message);
      }
    }

    // Identical response in all cases.
    return NextResponse.json({
      success: true,
      message: 'If this email is registered as a B2B account, an activation link has been sent. Please check your inbox.'
    });

  } catch (err) {
    console.error('Error sending account invite:', err);
    return NextResponse.json({
      error: 'If this email is registered as a B2B account, an activation link has been sent.'
    }, { status: 500 });
  }
}
