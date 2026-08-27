import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { Product, Restaurant } from '@/lib/supabase/types';
import MenuManagerClient from './MenuManagerClient';

export const metadata: Metadata = {
  title: 'Gestión de Menú',
};

export default async function AdminMenuPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: restaurant } = await supabase
    .from('restaurants').select('*').limit(1).single();

  if (!restaurant) redirect('/admin');

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .order('sort_order', { ascending: true });

  return (
    <MenuManagerClient
      restaurant={restaurant as Restaurant}
      initialProducts={(products as Product[]) || []}
    />
  );
}
