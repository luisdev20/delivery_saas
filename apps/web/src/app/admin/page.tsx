import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import AdminDashboardClient from './AdminDashboardClient';
import type { Driver, Restaurant, Subscription } from '@/lib/supabase/types';

export const metadata: Metadata = {
  title: 'Panel de Despacho',
  description: 'Panel de control de órdenes y despacho en tiempo real.',
};

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Cargar vinculación usuario-restaurante
  const { data: restaurantUser } = await supabase
    .from('restaurant_users')
    .select('restaurant_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  let restaurant: Restaurant | null = null;

  if (restaurantUser) {
    // Multi-tenant: cargar el restaurante vinculado al usuario
    const { data } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', restaurantUser.restaurant_id)
      .single();
    restaurant = data as Restaurant | null;
  } else {
    // Fallback para compatibilidad: si no hay registro en restaurant_users, tomar el primero
    const { data } = await supabase
      .from('restaurants')
      .select('*')
      .limit(1)
      .single();
    restaurant = data as Restaurant | null;
  }

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
    .eq('restaurant_id', restaurant.id);

  // Cargar suscripción activa
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .eq('is_active', true)
    .maybeSingle();

  return (
    <AdminDashboardClient
      restaurant={restaurant}
      drivers={(drivers as Driver[]) || []}
      subscription={subscription as Subscription | null}
      userRole={restaurantUser?.role || 'owner'}
    />
  );
}
