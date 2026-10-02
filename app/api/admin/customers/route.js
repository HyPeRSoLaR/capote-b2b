import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decryptSession, isAgentSession } from '@/lib/session';
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
  return isAgentSession(session.tags || []);
}

export const maxDuration = 60;

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

    // 2. Fetch B2B clients from Shopify — fully paginated (the store has thousands of B2B accounts;
    // the old single page of 250 hid newer clients such as an agent's recent customers).
    const NODE_FIELDS = `
      id firstName lastName email tags numberOfOrders
      defaultAddress { company city countryCodeV2 }
      passcode: metafield(namespace: "b2b_portal", key: "passcode") { value }
    `;
    const fetchAll = async (searchQuery, maxPages) => {
      const out = [];
      let cursor = null;
      for (let page = 0; page < maxPages; page++) {
        const data = await shopifyGraphQL(
          `query($q: String!, $after: String) {
             customers(first: 250, query: $q, after: $after) {
               edges { node { ${NODE_FIELDS} } }
               pageInfo { hasNextPage endCursor }
             }
           }`,
          { q: searchQuery, after: cursor }
        );
        const conn = data.customers;
        (conn?.edges || []).forEach(e => out.push(edgeToCleanCustomer(e.node)));
        if (!conn?.pageInfo?.hasNextPage) break;
        cursor = conn.pageInfo.endCursor;
      }
      return out;
    };

    let customers;
    if (!isAdmin && isAgent) {
      // Agents: query DIRECTLY by their own agent_* ownership tags (e.g. agent_Edouard).
      // Generic tags like b2b_base are intentionally ignored so agents never see the whole base.
      const myAgentTags = (session.tags || []).filter(t => String(t).toLowerCase().startsWith('agent_'));
      if (myAgentTags.length === 0) {
        return NextResponse.json({
          success: true,
          customers: [],
          warning: 'Your account has no agent_<Name> tag, so no clients are linked to it. Please contact Capote.'
        });
      }
      const tagQuery = myAgentTags.map(t => `tag:'${String(t).replace(/'/g, "\\'")}'`).join(' OR ');
      const found = await fetchAll(tagQuery, 20);
      const myLower = myAgentTags.map(t => t.toLowerCase());
      customers = found
        .filter(c => (c.tags || []).some(ct => myLower.includes(ct.toLowerCase())))
        .filter(c => (c.email || '').toLowerCase() !== (session.email || '').toLowerCase()) // not the agent's own row
        .map(({ passcode, ...rest }) => rest); // never expose stored passcodes to a non-admin session
    } else {
      const b2bQuery = 'tag:b2b_base OR tag:b2b_distributer OR tag:B2B-Partner OR tag:b2b-base OR tag:b2b OR tag:b2b_consignement_1';
      customers = await fetchAll(b2bQuery, 20);
      // Recently created accounts may not be indexed by tag search yet: merge the newest 30.
      const recent = await shopifyGraphQL(
        `query { customers(first: 30, sortKey: CREATED_AT, reverse: true) { edges { node { ${NODE_FIELDS} } } } }`
      );
      const known = new Set(customers.map(c => c.id));
      (recent.customers?.edges || []).forEach(e => {
        const c = edgeToCleanCustomer(e.node);
        const isB2B = (c.tags || []).some(tag => /b2b|wholesale|partner/i.test(tag));
        if (isB2B && !known.has(c.id)) customers.push(c);
      });
    }

    // Alphabetical by display name (company fallback), case/accent-insensitive.
    const label = c => ([c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || c.email || '').toLowerCase();
    customers.sort((x, y) => label(x).localeCompare(label(y), 'fr', { sensitivity: 'base' }));

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
    const { action, customerId, email, firstName, lastName, passcode, discountPercent, company, country } = body;

    // Agents may only act on THEIR OWN customers (carrying one of their agent_* tags),
    // never on admins/agents. Admins are unrestricted.
    const assertCanManage = async (id) => {
      if (isAdmin) return null;
      const d = await shopifyGraphQL(`query($id: ID!){ customer(id:$id){ id tags } }`, { id });
      const tTags = (d.customer?.tags || []).map(t => t.toLowerCase());
      const mine = creatorAgentTags.map(t => t.toLowerCase());
      const privileged = tTags.some(t => t === 'agent' || t === 'admin' || t.startsWith('b2b-admin'));
      const owned = tTags.some(t => t.startsWith('agent_') && mine.includes(t));
      if (!d.customer || privileged || !owned) {
        return NextResponse.json({ error: 'You can only manage your own customers.' }, { status: 403 });
      }
      return null;
    };

    // Support sending native account invite email
    if (action === 'send_invite' && customerId) {
      const denied = await assertCanManage(customerId);
      if (denied) return denied;
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

      if (!isAdmin && creatorAgentTags.length === 0) {
        return NextResponse.json({ error: 'Your account has no agent_<Name> tag, so created customers could not be linked to you. Ask Capote to add it.' }, { status: 400 });
      }
      const pCode = (passcode || '123456').trim();
      let dPercent = discountPercent !== undefined ? parseInt(discountPercent) : 50;
      if (!Number.isFinite(dPercent) || dPercent < 0 || dPercent > 100) dPercent = 50;

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
        // Country drives currency / warehouse / shipping when ordering for this client.
        ...(/^[A-Za-z]{2}$/.test((country || '').trim()) ? {
          addresses: [{
            countryCode: country.trim().toUpperCase(),
            company: (company || '').trim().slice(0, 100),
            firstName: (firstName || '').trim(),
            lastName: (lastName || '').trim()
          }]
        } : {}),
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
    const denied2 = await assertCanManage(customerId);
    if (denied2) return denied2;
    if (discountPercent !== undefined && (!Number.isFinite(parseInt(discountPercent)) || parseInt(discountPercent) < 0 || parseInt(discountPercent) > 100)) {
      return NextResponse.json({ error: 'Invalid discount percentage.' }, { status: 400 });
    }
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
    passcode: node.passcode?.value || '',
    orderCount: Number(node.numberOfOrders) || 0,
    company: node.defaultAddress?.company || '',
    city: node.defaultAddress?.city || '',
    country: node.defaultAddress?.countryCodeV2 || ''
  };
}
