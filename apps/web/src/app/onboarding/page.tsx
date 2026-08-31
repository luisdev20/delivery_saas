import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import OnboardingClient from './OnboardingClient';

export const metadata: Metadata = {
  title: 'Onboarding — Nuevo Restaurante',
  description: 'Alta de un nuevo restaurante en la plataforma Delivery Tracker SaaS.',
};

export default async function OnboardingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Verificar que el usuario sea superadmin
  const { data: restaurantUser } = await supabase
    .from('restaurant_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  // Si no hay registro o no es superadmin, redirigir al admin normal
  if (!restaurantUser || restaurantUser.role !== 'superadmin') {
    redirect('/admin');
  }

  return <OnboardingClient />;
}
