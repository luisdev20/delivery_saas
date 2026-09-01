import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PackingIndexPage() {
  const cookieStore = await cookies();
  const userRole = cookieStore.get('dtk_role')?.value;
  const userTenant = cookieStore.get('dtk_tenant')?.value;

  if (userRole === 'packing' && userTenant) {
    redirect(`/packing/${userTenant}`);
  }

  redirect('/login');
}
