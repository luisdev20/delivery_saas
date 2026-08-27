import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { Order, Restaurant, DriverLocation } from '@/lib/supabase/types';
import TrackingClient from './TrackingClient';

interface Props {
  params: Promise<{ orderId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orderId } = await params;
  return {
    title: `Seguimiento - Orden ${orderId.slice(-8).toUpperCase()}`,
    description: 'Seguimiento de orden en tiempo real.',
  };
}

export default async function TrackingPage({ params }: Props) {
  const { orderId } = await params;
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single();

  if (error || !order) notFound();

  const ord = order as Order;

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', ord.restaurant_id)
    .single();

  if (!restaurant) notFound();

  let driverLocation: DriverLocation | null = null;
  if (ord.driver_id) {
    const { data: loc } = await supabase
      .from('driver_locations')
      .select('*')
      .eq('driver_id', ord.driver_id)
      .single();
    driverLocation = loc as DriverLocation | null;
  }

  return (
    <TrackingClient
      order={ord}
      restaurant={restaurant as Restaurant}
      initialDriverLocation={driverLocation}
    />
  );
}
