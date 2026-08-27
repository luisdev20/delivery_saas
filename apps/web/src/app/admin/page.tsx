import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import AdminDashboardClient from './AdminDashboardClient';
import type { Driver, Restaurant } from '@/lib/supabase/types';

export const metadata: Metadata = {
  title: 'Panel de Despacho',
  description: 'Panel de control de órdenes y despacho en tiempo real.',
};

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .limit(1)
    .single();

  if (!restaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center">
          <p className="font-semibold">No hay restaurante configurado</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Contacte al administrador del sistema
          </p>
        </div>
      </div>
    );
  }

  const { data: drivers } = await supabase
    .from('drivers')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .eq('is_active', true);

  return (
    <AdminDashboardClient
      restaurant={restaurant as Restaurant}
      drivers={(drivers as Driver[]) || []}
    />
  );
}
