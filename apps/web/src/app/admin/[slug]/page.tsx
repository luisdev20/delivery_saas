import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import AdminDashboardClient from '../AdminDashboardClient';
import type { Driver, Restaurant, Subscription } from '@/lib/supabase/types';

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

  if (!restaurant) return { title: 'Panel de Despacho' };

  return {
    title: `Despacho & Logística - ${restaurant.name}`,
    description: `Consola de administración de pedidos y motorizados para ${restaurant.name}`,
  };
}

export default async function AdminMerchantPage({ params }: Props) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const userRole = cookieStore.get('dtk_role')?.value || 'owner';
  const userTenant = cookieStore.get('dtk_tenant')?.value;

  // Role Guard: Si es usuario de empaque, redirigir a su estación de empaque
  if (userRole === 'packing') {
    redirect(`/packing/${userTenant || slug}`);
  }

  // Multi-Tenant RBAC Security Guard:
  // Si el usuario no es superadmin y no coincide con el slug del comercio en URL, bloquear acceso
  if (userRole !== 'superadmin' && userTenant && userTenant !== slug && userTenant !== 'all') {
    redirect(`/admin/${userTenant}`);
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !userTenant) redirect('/login');

  // Cargar todos los comercios para switcher (solo visible para superadmin)
  const { data: allRestaurants } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: true });

  const restaurant = allRestaurants?.find(r => r.slug === slug || r.id === slug) as Restaurant | null;

  if (!restaurant) notFound();

  // Cargar motorizados del comercio específico
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
      allRestaurants={userRole === 'superadmin' ? ((allRestaurants as Restaurant[]) || []) : []}
      drivers={(drivers as Driver[]) || []}
      subscription={subscription as Subscription | null}
      userRole={userRole}
    />
  );
}
