import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession } from '@/lib/session';
import { shopifyGraphQL, shopifyREST } from '@/lib/shopify';
import { sendB2BPasscodeEmail } from '@/lib/email';

// Helper to verify admin privileges
function isAdminUser(session) {
  if (!session) return false;
  const email = session.email?.toLowerCase();
  if (email === 'info@capoteyewear.com' || email === 'deanmoriarty190@gmail.com') return true; // master admin fallback
  const tags = session.tags || [];
  return tags.some(t => t.toLowerCase() === 'b2b-admin');
}

function isAgentUser(session) {
  if (!session) return false;
  const tags = (session.tags || []).map(t => t.toLowerCase());
  // Only real agent roles pass. No generic-substring or single-name special cases.
  return tags.some(t => t.startsWith('agent_') || t === 'agent' || t === 'b2b-admin-agent');
}

export async function GET() {
  try {
    // 1. Authenticate B2B Session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('capote_b2b_session');

    if (!sessionCookie) {
      return NextResponse.json({ error: 'Access denied. Please log in.' }, { status: 401 });
    }

    const session = decryptSession(sessionCookie.value);
    const isAdmin = isAdminUser(session);
    const isAgent = isAgentUser(session);

    if (!isAdmin && !isAgent) {
      return NextResponse.json({ error: 'Access denied. Administrator or agent privileges required.' }, { status: 403 });
    }

    // 2. Fetch B2B clients from Shopify
    // We execute two queries in parallel:
    // - b2bSearch: finds all indexed customers with B2B tags (up to 250 items).
    // - recentCreated: pulls the 30 most recently created customers (bypassing search indexing lag).
    // We then merge these two lists in memory.
    const query = `
      query {
        b2bSearch: customers(first: 250, query: "tag:b2b_base OR tag:b2b_distributer OR tag:B2B-Partner OR tag:b2b-base OR tag:b2b OR tag:b2b_consignement_1") {
          edges {
            node {
              id
              firstName
              lastName
              email
              tags
              passcode: metafield(namespace: "b2b_portal", key: "passcode") {
                value
              }
            }
          }
        }
        recentCreated: customers(first: 30, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              firstName
              lastName
              email
              tags
              passcode: metafield(namespace: "b2b_portal", key: "passcode") {
                value
              }
            }
          }
        }
      }
    `;

    const data = await shopifyGraphQL(query);
    const b2bList = data.b2bSearch?.edges.map(e => edgeToCleanCustomer(e.node)) || [];
    const recentList = data.recentCreated?.edges.map(e => edgeToCleanCustomer(e.node)) || [];

    const mergedMap = new Map();
    b2bList.forEach(c => mergedMap.set(c.id, c));
    
    recentList.forEach(c => {
      const isB2B = c.tags?.some(tag => 
        tag.toLowerCase().includes('b2b') || 
        tag.toLowerCase().includes('wholesale') || 
        tag.toLowerCase().includes('partner')
      );
      if (isB2B) {
        mergedMap.set(c.id, c);
      }
    });

    let customers = Array.from(mergedMap.values());

    if (!isAdmin && isAgent) {
      // Match ONLY the agent's own agent_* ownership tags (e.g. agent_Kostas).
      // The agent's client accounts carry the SAME agent_* tag. Generic tags like
      // b2b_base are intentionally ignored so agents never see the whole base.
      const myAgentTags = (session.tags || [])
        .map(t => t.toLowerCase())
        .filter(t => t.startsWith('agent_'));

      customers = customers.filter(c => {
        const cTags = (c.tags || []).map(t => t.toLowerCase());
        const isMine = cTags.some(ct => ct.startsWith('agent_') && myAgentTags.includes(ct));
        const isSelf = (c.email || '').toLowerCase() === (session.email || '').toLowerCase();
        return isMine && !isSelf; // show the agent's clients, not the agent's own row
      });

      // Never expose stored passcodes to a non-admin session.
      customers = customers.map(({ passcode, ...rest }) => rest);
    }

    return NextResponse.json({
      success: true,
      customers
    });

  } catch (err) {
    console.error('Admin customers GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    // 1. Authenticate B2B Session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('capote_b2b_session');

    if (!sessionCookie) {
      return NextResponse.json({ error: 'Access denied. Please log in.' }, { status: 401 });
    }

    const session = decryptSession(sessionCookie.value);
    const isAdmin = isAdminUser(session);
    const isAgent = isAgentUser(session);
    if (!isAdmin && !isAgent) {
      return NextResponse.json({ error: 'Access denied. Administrator or agent privileges required.' }, { status: 403 });
    }
    // The agent's own ownership tags, used to auto-link any customer they create.
    const creatorAgentTags = isAdmin
      ? []
      : (session.tags || []).map(t => t).filter(t => t.toLowerCase().startsWith('agent_'));

    // 2. Parse payload
    const body = await request.json();
    const { action, customerId, email, firstName, lastName, passcode, discountPercent } = body;

    // Support sending native account invite email
    if (action === 'send_invite' && customerId) {
      const numericId = customerId.split('/').pop();
      try {
        await shopifyREST('POST', `/customers/${numericId}/send_invite.json`, {
          customer_invite: {
            custom_message: 'Welcome to the Capote Eyewear B2B Wholesale Portal. Please click below to activate your account and access wholesale ordering.'
          }
        });
        return NextResponse.json({
          success: true,
          message: 'Account activation invite email sent successfully.'
        });
      } catch (inviteErr) {
        return NextResponse.json({
          error: `Failed to send invite: ${inviteErr.message}`
        }, { status: 500 });
      }
    }

    if (action === 'create' || !customerId) {
      if (!email) {
        return NextResponse.json({ error: 'Email is required for creating a customer.' }, { status: 400 });
      }

      const pCode = (passcode || '123456').trim();
      const dPercent = discountPercent !== undefined ? parseInt(discountPercent) : 50;

      const createMutation = `
        mutation customerCreate($input: CustomerInput!) {
          customerCreate(input: $input) {
            customer {
              id
              email
              firstName
              lastName
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const input = {
        email: email.trim(),
        firstName: (firstName || '').trim(),
        lastName: (lastName || '').trim(),
        tags: ['B2B-Partner', 'b2b_base', `B2B-Discount-${dPercent}`, ...creatorAgentTags],
        metafields: [
          {
            namespace: "b2b_portal",
            key: "passcode",
            value: pCode,
            type: "single_line_text_field"
          }
        ]
      };

      const createData = await shopifyGraphQL(createMutation, { input });
      if (createData.customerCreate?.userErrors?.length > 0) {
        return NextResponse.json({ error: createData.customerCreate.userErrors.map(e => e.message).join(', ') }, { status: 400 });
      }

      const newCustomer = createData.customerCreate.customer;

      try {
        const clientName = `${newCustomer.firstName || ''} ${newCustomer.lastName || ''}`.trim() || 'B2B Partner';
        await sendB2BPasscodeEmail(newCustomer.email, clientName, pCode);
      } catch (emailErr) {
        console.error('Failed to send B2B passcode email:', emailErr);
      }

      return NextResponse.json({
        success: true,
        message: 'B2B partner customer created successfully.',
        customer: newCustomer
      });
    }

    // 3. First fetch the customer to see their current tags and details for email routing
    const getCustomerQuery = `
      query getCustomer($id: ID!) {
        customer(id: $id) {
          id
          email
          firstName
          lastName
          tags
        }
      }
    `;
    const getCustomerData = await shopifyGraphQL(getCustomerQuery, { id: customerId });
    const customer = getCustomerData.customer;


    if (!customer) {
      return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    }

    // Build metafields to update
    const metafields = [];
    if (passcode !== undefined) {
      metafields.push({
        namespace: "b2b_portal",
        key: "passcode",
        value: passcode.trim(),
        type: "single_line_text_field"
      });
    }

    // Build tags to update (replace B2B-Discount-XX tag and ensure B2B-Partner tag exists)
    let currentTags = customer.tags || [];
    if (discountPercent !== undefined) {
      // Remove old discount tags
      currentTags = currentTags.filter(t => !t.match(/B2B-Discount-\d+/i));
      // Add new discount tag
      currentTags.push(`B2B-Discount-${discountPercent}`);
    }
    
    // Ensure it has B2B-Partner tag so they are recognized by the login flow
    if (!currentTags.some(t => t.toLowerCase() === 'b2b-partner')) {
      currentTags.push('B2B-Partner');
    }

    const updateMutation = `
      mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const input = {
      id: customerId,
      tags: Array.from(new Set(currentTags)),
    };
    if (metafields.length > 0) {
      input.metafields = metafields;
    }

    const updateData = await shopifyGraphQL(updateMutation, { input });
    if (updateData.customerUpdate?.userErrors?.length > 0) {
      return NextResponse.json({ error: updateData.customerUpdate.userErrors.map(e => e.message).join(', ') }, { status: 400 });
    }

    // 5. Send Email Passcode Notification if updated
    if (passcode !== undefined) {
      try {
        const clientName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'B2B Partner';
        await sendB2BPasscodeEmail(customer.email, clientName, passcode.trim());
      } catch (emailErr) {
        console.error('Failed to send B2B passcode email:', emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'B2B partner credentials updated successfully.'
    });

  } catch (err) {
    console.error('Admin customers POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error.' }, { status: 500 });
  }
}

// Helper to parse B2B tags and metafields
function edgeToCleanCustomer(node) {
  let discountPercent = 50;
  const tags = node.tags || [];
  for (const tag of tags) {
    const match = tag.match(/B2B-Discount-(\d+)/i);
    if (match) {
      discountPercent = parseInt(match[1]);
      break;
    }
  }

  return {
    id: node.id,
    firstName: node.firstName || '',
    lastName: node.lastName || '',
    email: node.email || 'N/A',
    tags: tags,
    discountPercent,
    passcode: node.passcode?.value || ''
  };
}
