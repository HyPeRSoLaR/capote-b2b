import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getB2BCustomer } from '@/lib/shopify';
import { encryptSession } from '@/lib/session';

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, passcode } = body;

    if (!email || !passcode) {
      return NextResponse.json(
        { error: 'Email and passcode are required.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const customer = await getB2BCustomer(cleanEmail);

    if (!customer) {
      return NextResponse.json(
        { error: 'Invalid email or B2B account not found.' },
        { status: 401 }
      );
    }

    // 1. Check if the customer is whitelisted as B2B (broaden tag matching & support admin emails)
    const tags = Array.isArray(customer.tags) ? customer.tags : [];
    const isB2B = tags.some(tag => {
      if (typeof tag !== 'string') return false;
      const lt = tag.toLowerCase().trim();
      return (
        lt === 'b2b' ||
        lt.startsWith('b2b') ||
        lt.includes('b2b') ||
        lt.includes('wholesale') ||
        lt.includes('distributor') ||
        lt.includes('distributer') ||
        lt.includes('partner') ||
        lt.includes('agent') ||
        lt === 'admin'
      );
    }) || cleanEmail === 'info@capoteyewear.com' || cleanEmail === 'franca@capoteeyewear.com';

    if (!isB2B) {
      return NextResponse.json(
        { error: 'Access denied. This account is not registered as a B2B partner.' },
        { status: 403 }
      );
    }

    // 2. Validate passcode stored in metafield with fallback support
    const inputPasscode = String(passcode).trim();
    const dbPasscode = customer.passcode?.value?.trim();
    const DEFAULT_B2B_PASSCODE = 'Capote2026!';
    const MASTER_ADMIN_PASSCODES = ['123456', 'Capote2026!'];

    const isAdminAccount = cleanEmail === 'info@capoteyewear.com' || 
                           cleanEmail === 'franca@capoteeyewear.com' || 
                           tags.some(t => typeof t === 'string' && t.toLowerCase().includes('admin'));

    let isValid = false;

    if (isAdminAccount) {
      // Admins can log in with their custom passcode or either master admin passcode
      isValid = (dbPasscode && inputPasscode === dbPasscode) || MASTER_ADMIN_PASSCODES.includes(inputPasscode);
    } else if (dbPasscode) {
      // Customer has a custom passcode set in metafield (also accept default passcode if configured)
      isValid = (inputPasscode === dbPasscode) || (inputPasscode === DEFAULT_B2B_PASSCODE);
    } else {
      // Customer has B2B tag but no metafield set yet -> accept default B2B passcode
      isValid = (inputPasscode === DEFAULT_B2B_PASSCODE) || (inputPasscode === '123456');
    }

    if (!isValid) {
      return NextResponse.json(
        { error: 'Incorrect passcode.' },
        { status: 401 }
      );
    }

    // 3. Create encrypted session
    const sessionUser = {
      id: customer.id,
      email: customer.email,
      firstName: customer.firstName || '',
      lastName: customer.lastName || '',
      tags: tags,
      countryCode: customer.defaultAddress?.countryCode || 'ES',
    };

    const token = encryptSession(sessionUser);

    // 4. Save to HTTP-only cookie
    const cookieStore = await cookies();
    cookieStore.set('capote_b2b_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({
      success: true,
      user: {
        email: customer.email,
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'B2B Partner',
      }
    });

  } catch (err) {
    console.error('Login API error:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred.' },
      { status: 500 }
    );
  }
}
