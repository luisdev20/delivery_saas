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
      className="min-h-screen flex items-center justify-center flex-col p-4 relative"
      style={{
        backgroundColor: 'var(--saas-900)',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Dot pattern overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.08) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-fade-in space-y-6">
        {/* Brand header */}
        <div className="text-center">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center shadow-xl text-white"
            style={{ background: 'var(--saas-600)', border: '1px solid rgba(165,180,252,0.3)' }}
          >
            <Truck size={28} color="white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Delivery Tracker
          </h1>
          <p className="text-sm mt-1" style={{ color: '#A5B4FC' }}>
            Portal de Acceso
          </p>
        </div>

        {/* Login card */}
        <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="form-group">
              <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-600" htmlFor="email">
                Correo Electrónico
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
              <div className="flex justify-between items-center">
                <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-600" htmlFor="password">
                  Contraseña
                </label>
              </div>
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
                className="btn btn-indigo btn-full btn-lg font-bold text-sm shadow-md"
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
      </div>
    </div>
  );
}
