import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { Restaurant, Order } from '@/lib/supabase/types';
import KdsClient from './KdsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  let { data: restaurant } = await supabase
    .from('restaurants')
    .select('name')
    .eq('slug', slug)
    .maybeSingle();

  if (!restaurant) {
    const normalized = slug.replace(/^el-/, '');
    const { data: fallback } = await supabase
      .from('restaurants')
      .select('name')
      .ilike('slug', `%${normalized}%`)
      .limit(1)
      .maybeSingle();
    restaurant = fallback;
  }

  if (!restaurant) return { title: 'Monitor KDS' };

  return {
    title: `KDS Cocina - ${restaurant.name}`,
    description: `Pantalla de cocina en tiempo real para ${restaurant.name}`,
  };
}

export default async function KdsPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  let { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!restaurant) {
    const normalized = slug.replace(/^el-/, '');
    const { data: fallback } = await supabase
      .from('restaurants')
      .select('*')
      .ilike('slug', `%${normalized}%`)
      .limit(1)
      .maybeSingle();
    restaurant = fallback;
  }

  if (!restaurant) notFound();

  // Load active orders for KDS (RECIBIDO, EN_PREPARACION, LISTO)
  const { data: initialOrders } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('restaurant_id', restaurant.id)
    .in('status', ['RECIBIDO', 'EN_PREPARACION', 'LISTO'])
    .order('created_at', { ascending: true });

  return (
    <KdsClient
      restaurant={restaurant as Restaurant}
      initialOrders={(initialOrders || []) as Order[]}
    />
  );
}
