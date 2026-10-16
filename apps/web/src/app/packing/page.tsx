import { getSessionContext } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PackingIndexPage() {
  const session = await getSessionContext();

  if (session.role === 'packing' && session.tenantSlug) {
    redirect(`/packing/${session.tenantSlug}`);
  }

  redirect('/login');
}
