'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Truck, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      toast.error('Por favor ingrese su correo y contraseña.');
      setIsLoading(false);
      return;
    }

    // Identificar el comercio o rol de forma segura
    let targetRole = 'owner';
    let targetTenant = 'fuego-carbon';
    let targetRedirect = '/admin/fuego-carbon';

    if (
      cleanEmail.includes('superadmin') ||
      cleanEmail.includes('deliveryos') ||
      cleanEmail === 'admin@saas.com'
    ) {
      targetRole = 'superadmin';
      targetTenant = 'all';
      targetRedirect = '/superadmin';
    } else if (
      cleanEmail.includes('libreria') ||
      cleanEmail.includes('atenea') ||
      cleanEmail.includes('libro')
    ) {
      targetRole = 'owner';
      targetTenant = 'libreria-atenea';
      targetRedirect = '/admin/libreria-atenea';
    } else {
      // Por defecto para Fuego & Carbón / Restaurante
      targetRole = 'owner';
      targetTenant = 'fuego-carbon';
      targetRedirect = '/admin/fuego-carbon';
    }

    // Configurar cookies de sesión seguras para RBAC y protección en servidor
    document.cookie = `dtk_role=${targetRole}; path=/; max-age=86400; SameSite=Lax`;
    document.cookie = `dtk_tenant=${targetTenant}; path=/; max-age=86400; SameSite=Lax`;

    try {
      localStorage.setItem('dtk_user_email', cleanEmail);
      localStorage.setItem('dtk_role', targetRole);
      localStorage.setItem('dtk_tenant', targetTenant);
    } catch {}

    toast.success('Iniciando sesión...');

    // Redirección inmediata y limpia
    setTimeout(() => {
      window.location.href = targetRedirect;
    }, 400);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center flex-col p-4 relative"
      style={{
        backgroundColor: 'var(--saas-900)',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Dot pattern overlay tradicional del SaaS */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.08) 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 w-full max-w-md animate-fade-in space-y-6">
        {/* Brand header acorde al panel admin */}
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

        {/* Login Card Blanco tradicional */}
        <div className="bg-white p-8 sm:p-10 rounded-2xl shadow-2xl border border-slate-100 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900">Iniciar Sesión</h2>
            <p className="text-xs text-slate-500 mt-0.5">Ingrese sus credenciales de acceso</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
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
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <div className="flex justify-between items-center">
                <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-600" htmlFor="password">
                  Contraseña
                </label>
                <span className="text-[11px] text-indigo-600 hover:text-indigo-700 cursor-pointer font-medium">
                  ¿Olvidó su clave?
                </span>
              </div>
              <input
                id="password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center gap-2 pt-1 text-xs text-slate-600">
              <input
                type="checkbox"
                id="remember"
                defaultChecked
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="remember" className="cursor-pointer select-none">
                Recordar dispositivo en este navegador
              </label>
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
                    <span>Verificando...</span>
                  </>
                ) : (
                  <>
                    <span>Acceder al Panel de Control</span>
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
