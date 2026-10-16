import { createClient } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { Restaurant, Order } from '@/lib/supabase/types';
import PackingClient from './PackingClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: restaurant } = await supabase
    .from('tenants')
    .select('name')
    .eq('slug', slug)
    .maybeSingle();

  if (!restaurant) return { title: 'Estación de Empaque (Packing)' };

  return {
    title: `Estación de Empaque & Fulfillment - ${restaurant.name}`,
    description: `Monitor de preparación, armado y despacho en tiempo real para ${restaurant.name}`,
  };
}

export default async function PackingPage({ params }: Props) {
  const { slug } = await params;

  // Rol y comercio desde la sesión real (no de cookies del cliente)
  const session = await getSessionContext();
  if (!session.userId) redirect('/login');

  const userRole = session.role ?? 'owner';
  const userTenant = session.tenantSlug;

  // Packing Security Guard: requires packing/owner/superadmin for the tenant
  if (userRole !== 'superadmin' && userRole !== 'packing' && userRole !== 'owner') {
    redirect('/packing');
  }
  if (userRole !== 'superadmin' && userTenant && userTenant !== slug && userTenant !== 'all') {
    redirect(`/packing/${userTenant}`);
  }

  const supabase = await createClient();

  const { data: restaurant } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!restaurant) notFound();

  // Cargar órdenes activas de empaque y preparación de este comercio
  const { data: initialOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', restaurant.id)
    .in('status', ['RECIBIDO', 'EN_PREPARACION', 'LISTO'])
    .order('created_at', { ascending: true });

  return (
    <PackingClient
      restaurant={restaurant as Restaurant}
      initialOrders={(initialOrders || []) as Order[]}
    />
  );
}
