import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { decryptSession } from '@/lib/session';

export default async function RootPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('capote_b2b_session');
  
  if (sessionCookie?.value) {
    const session = decryptSession(sessionCookie.value);
    if (session) {
      redirect('/dashboard');
    }
  }
  
  redirect('/auth/login');
}
