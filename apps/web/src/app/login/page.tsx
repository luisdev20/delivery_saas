'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Loader2, LayoutDashboard } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error('Credenciales incorrectas. Verifique email y contraseña.');
      setIsLoading(false);
      return;
    }
    window.location.href = '/admin';
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center flex-col p-4"
      style={{
        background: 'var(--saas-900)',
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

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-lg"
            style={{ background: 'var(--saas-600)', border: '1px solid #818CF8' }}
          >
            <LayoutDashboard size={28} color="white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Delivery Tracker SaaS</h1>
          <p className="text-sm mt-2" style={{ color: '#A5B4FC' }}>Portal de Acceso B2B</p>
        </div>

        {/* Login card */}
        <div className="bg-white p-10 rounded-2xl shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="form-group">
              <label className="form-label text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }} htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="admin@restaurante.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label className="form-label text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }} htmlFor="password">
                Contraseña
              </label>
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

            <div className="pt-4 border-t" style={{ borderColor: '#F1F5F9' }}>
              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-indigo btn-full btn-lg"
                id="btn-login"
              >
                {isLoading ? (
                  <><div className="spinner" style={{ borderTopColor: 'white' }} /> Ingresando...</>
                ) : (
                  <><LayoutDashboard size={18} /> Ingresar como Administrador</>
                )}
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(165,180,252,0.5)' }}>
          Plataforma B2B SaaS &mdash; Delivery Tracker v2
        </p>
      </div>
    </div>
  );
}
