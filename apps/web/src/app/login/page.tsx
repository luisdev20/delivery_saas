'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Truck, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      toast.error('Por favor ingrese su correo y contraseña.');
      setIsLoading(false);
      return;
    }

    try {
      let targetRole = 'owner';
      let targetTenant = 'libreria-atenea';
      let targetRedirect = '/admin/libreria-atenea';

      // 1. Autenticación real contra Supabase Auth: aquí se valida la contraseña.
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authError || !authData.user) {
        toast.error('Usuario o contraseña no válidos.');
        setIsLoading(false);
        return;
      }

      // 2. El rol y el comercio se derivan SIEMPRE del perfil del usuario autenticado
      //    (tenant_users). No existen cuentas "preconfiguradas" por correo.
      const { data: userProfile } = await supabase
        .from('tenant_users')
        .select('role, tenant_id, tenants(slug)')
        .eq('user_id', authData.user.id)
        .maybeSingle();

      if (!userProfile) {
        await supabase.auth.signOut();
        toast.error('Tu cuenta no tiene un comercio asignado. Contacta al administrador.');
        setIsLoading(false);
        return;
      }

      targetRole = userProfile.role;
      const restaurantSlug = (userProfile.tenants as { slug?: string } | null)?.slug || 'libreria-atenea';

      if (userProfile.role === 'superadmin') {
        targetTenant = 'all';
        targetRedirect = '/superadmin';
      } else if (userProfile.role === 'packing') {
        targetTenant = restaurantSlug;
        targetRedirect = `/packing/${restaurantSlug}`;
      } else {
        targetTenant = restaurantSlug;
        targetRedirect = `/admin/${restaurantSlug}`;
      }

      // Configurar cookies de sesión
      document.cookie = `dtk_role=${targetRole}; path=/; max-age=86400; SameSite=Lax`;
      document.cookie = `dtk_tenant=${targetTenant}; path=/; max-age=86400; SameSite=Lax`;

      try {
        localStorage.setItem('dtk_user_email', cleanEmail);
        localStorage.setItem('dtk_role', targetRole);
        localStorage.setItem('dtk_tenant', targetTenant);
      } catch {}

      toast.success('Iniciando sesión...');

      setTimeout(() => {
        window.location.href = targetRedirect;
      }, 350);
    } catch {
      toast.error('Error al procesar el inicio de sesión.');
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center flex-col p-4 bg-slate-50 relative"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {/* Subtle architectural grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.08) 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-fade-in space-y-6">
        {/* Brand header alineado a Landing */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-slate-900 text-emerald-400 shadow-sm ring-1 ring-slate-900/10">
            <Truck size={23} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Delivery Tracker
            </h1>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Consola logística B2B · Inicia sesión con tu cuenta
            </p>
          </div>
        </div>

        {/* Login card */}
        <div className="bg-white p-7 sm:p-8 rounded-2xl border border-slate-200/90 shadow-sm">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="form-group">
              <label className="form-label text-xs font-semibold text-slate-700" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="usuario@comercio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold text-slate-700" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-2xs cursor-pointer disabled:opacity-60"
                id="btn-login"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Iniciando sesión...</span>
                  </>
                ) : (
                  <>
                    <span>Iniciar Sesión</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-400">
          Acceso seguro para comercios, estación KDS y consola de plataforma.
        </p>
      </div>
    </div>
  );
}
