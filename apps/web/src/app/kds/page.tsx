import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function KdsRootPage() {
  const supabase = await createClient();
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('slug')
    .limit(1)
    .maybeSingle();

  if (restaurant?.slug) {
    redirect(`/kds/${restaurant.slug}`);
  }

  redirect('/kds/rincon-criollo');
}
