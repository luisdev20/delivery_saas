import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionContext } from '@/lib/auth/session';
import { loadSubscriptionState } from '@/lib/server/subscription';
import type { BillingTransaction } from '@/lib/subscription';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import AdminDashboardClient from '../AdminDashboardClient';
import type { Driver, Order, Restaurant, Subscription } from '@/lib/supabase/types';

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

  if (!restaurant) return { title: 'Panel de Despacho' };

  return {
    title: `Despacho & Logística - ${restaurant.name}`,
    description: `Consola de administración de pedidos y motorizados para ${restaurant.name}`,
  };
}

export default async function AdminMerchantPage({ params }: Props) {
  const { slug } = await params;

  // Rol y comercio desde la sesión real (no de cookies del cliente)
  const session = await getSessionContext();
  if (!session.userId) redirect('/login');

  const userRole = session.role ?? 'owner';
  const userTenant = session.tenantSlug;

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

  // Cargar todos los comercios para switcher (solo visible para superadmin)
  const { data: allRestaurants } = await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: true });

  const restaurant = allRestaurants?.find((r) => r.slug === slug || r.id === slug) as
    | Restaurant
    | null;

  if (!restaurant) notFound();

  // Cargar motorizados del comercio específico
  const { data: drivers } = await supabase
    .from('drivers')
    .select('*')
    .eq('tenant_id', restaurant.id);

  // Cargar órdenes recientes del comercio
  const { data: initialOrders } = await supabase
    .from('orders')
    .select('*, driver:drivers(*)')
    .eq('tenant_id', restaurant.id)
    .order('created_at', { ascending: false })
    .limit(100);

  // La suscripción y la auditoría financiera se leen con service_role:
  // billing_transactions no expone sus comprobantes a usuarios finales.
  let subscription: Subscription | null = null;
  let lastTransaction: BillingTransaction | null = null;
  let billingTransactions: BillingTransaction[] = [];

  try {
    const admin = createAdminClient();
    const state = await loadSubscriptionState(admin, restaurant.id);
    subscription = state.subscription;
    lastTransaction = state.lastTransaction;

    const { data: transactions } = await admin
      .from('billing_transactions')
      .select('*')
      .eq('tenant_id', restaurant.id)
      .order('created_at', { ascending: false })
      .limit(50);

    billingTransactions = (transactions ?? []) as BillingTransaction[];
  } catch (error) {
    console.error('No se pudo cargar la suscripción del comercio:', error);
  }

  return (
    <AdminDashboardClient
      restaurant={restaurant}
      allRestaurants={userRole === 'superadmin' ? (allRestaurants as Restaurant[]) || [] : []}
      drivers={(drivers as Driver[]) || []}
      subscription={subscription}
      lastTransaction={lastTransaction}
      billingTransactions={billingTransactions}
      initialOrders={(initialOrders as Order[]) || []}
      userRole={userRole}
      userEmail={session.email}
    />
  );
}
