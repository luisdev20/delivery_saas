import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Store, Boxes, ArrowRight, ShieldCheck, Plus, LogOut,
  Truck, ExternalLink, Sparkles, MapPin, Phone,
} from 'lucide-react';
import type { Metadata } from 'next';
import type { Restaurant } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Seleccionar Comercio — Delivery Tracker DaaS',
  description: 'Selecciona el comercio o tenant para ingresar a su consola de despacho independiente.',
};

interface Props {
  searchParams: Promise<{ merchant?: string }>;
}

export default async function AdminHubPage({ searchParams }: Props) {
  const { merchant } = await searchParams;
  if (merchant) {
    redirect(`/admin/${merchant}`);
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Cargar vinculación usuario-restaurante
  const { data: restaurantUser } = await supabase
    .from('restaurant_users')
    .select('restaurant_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  // Cargar todos los comercios
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: true });

  // Si el usuario está asignado a un comercio específico y no es superadmin, redirigir directo a su slug
  if (restaurantUser && restaurantUser.role !== 'superadmin' && restaurantUser.restaurant_id) {
    const matched = restaurants?.find(r => r.id === restaurantUser.restaurant_id);
    if (matched?.slug) {
      redirect(`/admin/${matched.slug}`);
    }
  }

  const merchantList = (restaurants || []) as Restaurant[];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
            <Truck size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-wide uppercase">Delivery Tracker DaaS</h1>
              <span className="text-[10px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                Portal de Acceso
              </span>
            </div>
            <p className="text-xs text-slate-400">Selecciona el comercio para abrir su consola de despacho</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/superadmin"
            className="text-xs bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 px-3.5 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5"
          >
            <ShieldCheck size={14} />
            <span>Portal SuperAdmin</span>
          </Link>

          <Link
            href="/onboarding"
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 shadow-md"
          >
            <Plus size={14} />
            <span>+ Nuevo Comercio</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto w-full px-4 py-10 sm:py-14 flex-1 space-y-8">

        <div className="text-center max-w-xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Comercios &amp; Clientes Activos
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Cada comercio cuenta con su propia consola aislada de pedidos, motorizados y estación de empaque.
          </p>
        </div>

        {/* Merchants Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {merchantList.map(merchant => {
            const isRestaurant = merchant.slug === 'fuego-carbon';
            const isBookstore = merchant.slug === 'libreria-atenea';
            const port = isRestaurant ? '3001' : isBookstore ? '3002' : null;

            return (
              <div
                key={merchant.id}
                className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 flex flex-col justify-between hover:border-indigo-500/50 transition-all shadow-xl space-y-6 group"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg"
                      style={{ background: merchant.brand_color || (isRestaurant ? '#DC2626' : '#0F766E') }}
                    >
                      {isRestaurant ? '🔥' : isBookstore ? '📚' : '🏢'}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                      merchant.is_open
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-red-500/20 text-red-300 border-red-500/30'
                    }`}>
                      {merchant.is_open ? '● Activo' : '○ Pausado'}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-extrabold text-white group-hover:text-indigo-300 transition-colors">
                      {merchant.name}
                    </h3>
                    <p className="font-mono text-xs text-indigo-400 mt-0.5">/admin/{merchant.slug}</p>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-2">
                      <MapPin size={13} className="text-slate-500 shrink-0" />
                      <span className="truncate">{merchant.address || 'Lima, Perú'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-800">
                  <Link
                    href={`/admin/${merchant.slug}`}
                    className="w-full py-3 px-4 rounded-xl text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all hover:opacity-95"
                    style={{ background: merchant.brand_color || '#4F46E5' }}
                  >
                    <span>Abrir Panel de Despacho</span>
                    <ArrowRight size={14} />
                  </Link>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Link
                      href={`/packing/${merchant.slug}`}
                      target="_blank"
                      className="py-2 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold text-[11px] border border-amber-500/30 flex items-center justify-center gap-1 transition-colors"
                    >
                      <Boxes size={12} />
                      <span>Packing ↗</span>
                    </Link>

                    {port ? (
                      <a
                        href={`http://localhost:${port}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] border border-slate-700 flex items-center justify-center gap-1 transition-colors"
                      >
                        <ExternalLink size={12} />
                        <span>Tienda (:{port}) ↗</span>
                      </a>
                    ) : (
                      <div className="py-2 px-3 rounded-lg bg-slate-800/40 text-slate-500 text-[11px] font-semibold text-center">
                        API B2B
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        Delivery Tracker SaaS &bull; Motor Logístico B2B Agnóstico
      </footer>
    </div>
  );
}
