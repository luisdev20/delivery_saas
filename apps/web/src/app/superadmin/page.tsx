import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import SuperAdminClient from './SuperAdminClient';
import type { Restaurant, Subscription } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'SuperAdmin Console — Delivery Tracker DaaS',
  description: 'Consola global de administración de comercios, suscripciones y configuración de plataforma.',
};

export default async function SuperAdminPage() {
  const session = await getSessionContext();

  // Strict RBAC: Solo superadmin puede ver esta página
  if (session.role !== 'superadmin') {
    redirect(session.tenantSlug ? `/admin/${session.tenantSlug}` : '/login');
  }

  const supabase = await createClient();

  // Cargar todos los comercios
  const { data: restaurants } = await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false });

  // Cargar todas las suscripciones
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('*');

  // Cargar métricas globales de órdenes
  const { data: orders } = await supabase
    .from('orders')
    .select('id, tenant_id, status, total_amount, created_at');

  return (
    <SuperAdminClient
      restaurants={(restaurants || []) as Restaurant[]}
      subscriptions={(subscriptions || []) as Subscription[]}
      orders={orders || []}
    />
  );
}
