import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { Restaurant, Product } from '@/lib/supabase/types';
import MenuClient from './MenuClient';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  let { data: restaurant } = await supabase
    .from('restaurants')
    .select('name, address')
    .eq('slug', slug)
    .maybeSingle();

  if (!restaurant) {
    const normalized = slug.replace(/^el-/, '');
    const { data: fallback } = await supabase
      .from('restaurants')
      .select('name, address')
      .ilike('slug', `%${normalized}%`)
      .limit(1)
      .maybeSingle();
    restaurant = fallback;
  }

  if (!restaurant) return { title: 'Restaurante no encontrado' };

  return {
    title: `Menú - ${restaurant.name}`,
    description: `Pide directamente desde ${restaurant.name}. Entrega a domicilio en ${restaurant.address}.`,
  };
}

export default async function MenuPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  let { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!restaurant) {
    // Try matching normalized slug without 'el-' or find by name/ilike
    const normalized = slug.replace(/^el-/, '');
    const { data: fallback } = await supabase
      .from('restaurants')
      .select('*')
      .ilike('slug', `%${normalized}%`)
      .limit(1)
      .maybeSingle();
    restaurant = fallback;
  }

  if (!restaurant) {
    notFound();
  }

  const rest = restaurant as Restaurant;
  const dayOfWeek = new Date().getDay();
  const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('restaurant_id', rest.id)
    .eq('is_available', true)
    .contains('available_days', [isoDay])
    .order('sort_order', { ascending: true })
    .order('category', { ascending: true });

  return (
    <MenuClient
      restaurant={rest}
      products={(products as Product[]) || []}
    />
  );
}
