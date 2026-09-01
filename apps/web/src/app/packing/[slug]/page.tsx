import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
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
    .from('restaurants')
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
  const cookieStore = await cookies();
  const userRole = cookieStore.get('dtk_role')?.value || 'owner';
  const userTenant = cookieStore.get('dtk_tenant')?.value;

  // Tenant Security Guard:
  if (userRole !== 'superadmin' && userTenant && userTenant !== slug && userTenant !== 'all') {
    redirect(`/packing/${userTenant}`);
  }

  const supabase = await createClient();

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!restaurant) notFound();

  // Cargar órdenes activas de empaque y preparación de este comercio
  const { data: initialOrders } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('restaurant_id', restaurant.id)
    .in('status', ['RECIBIDO', 'EN_PREPARACION', 'LISTO'])
    .order('created_at', { ascending: true });

  return (
    <PackingClient
      restaurant={restaurant as Restaurant}
      initialOrders={(initialOrders || []) as Order[]}
    />
  );
}
