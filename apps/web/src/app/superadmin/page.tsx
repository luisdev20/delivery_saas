import { getSessionContext } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadSuperAdminData } from '@/lib/server/superadmin';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import SuperAdminClient from './SuperAdminClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Consola de Plataforma — DeliveryOS',
  description:
    'Cartera de comercios, cobranza de suscripciones y gobierno de datos de la plataforma.',
};

export default async function SuperAdminPage() {
  const session = await getSessionContext();

  if (session.role !== 'superadmin') {
    redirect(session.tenantSlug ? `/admin/${session.tenantSlug}` : '/login');
  }

  const admin = createAdminClient();
  const data = await loadSuperAdminData(admin);

  return <SuperAdminClient data={data} email={session.email} />;
}
