'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Building2, Loader2, MapPin, Phone, Save, ShieldCheck, Store } from 'lucide-react';
import type { Restaurant } from '@/lib/supabase/types';

interface Props {
  tenant: Restaurant;
  onUpdated: (tenant: Restaurant) => void;
}

interface FormState {
  name: string;
  phone: string;
  address: string;
  ruc: string;
}

export default function BusinessSettingsPanel({ tenant, onUpdated }: Props) {
  const [form, setForm] = useState<FormState>({
    name: tenant.name,
    phone: tenant.phone,
    address: tenant.address,
    ruc: tenant.ruc || '',
  });
  const [isOpen, setIsOpen] = useState(tenant.is_open !== false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/admin/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          name: form.name,
          phone: form.phone,
          address: form.address,
          ruc: form.ruc,
          isOpen,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración.');
      onUpdated(data.tenant as Restaurant);
      toast.success('Configuración del negocio actualizada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleOpen = async () => {
    const nextValue = !isOpen;
    setToggling(true);
    setIsOpen(nextValue);
    try {
      const response = await fetch('/api/admin/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: tenant.id, isOpen: nextValue }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cambiar el estado del local.');
      onUpdated(data.tenant as Restaurant);
      toast.success(
        nextValue
          ? 'Local abierto: recepción global de pedidos habilitada'
          : 'Local pausado: no se recibirán nuevos pedidos'
      );
    } catch (error) {
      setIsOpen(!nextValue);
      toast.error(error instanceof Error ? error.message : 'Error al cambiar el estado del local.');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
          Configuración del Negocio
        </h2>
        <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
          Datos fiscales y operativos del comercio
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <form
          onSubmit={handleSave}
          className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4"
          id="business-settings-form"
        >
          <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-3">
            <Building2 size={18} className="text-indigo-600" />
            <h3 className="font-bold text-sm">Identidad fiscal y operativa</h3>
          </div>

          <div className="form-group">
            <label className="form-label text-xs font-semibold uppercase">
              Nombre Comercial / Razón Social
            </label>
            <div className="relative">
              <Store size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="form-input pl-9"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                maxLength={100}
                required
                id="settings-name"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label text-xs font-semibold uppercase">
                Teléfono de Contacto
              </label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="form-input pl-9"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="987654321"
                  required
                  id="settings-phone"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold uppercase">
                Identificador Fiscal (RUC / DNI)
              </label>
              <div className="relative">
                <ShieldCheck
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="form-input pl-9 font-mono"
                  inputMode="numeric"
                  value={form.ruc}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, ruc: e.target.value.replace(/\D/g, '') }))
                  }
                  maxLength={11}
                  placeholder="20123456789 / 12345678"
                  id="settings-ruc"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">RUC de 11 dígitos o DNI de 8 dígitos.</p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label text-xs font-semibold uppercase">
              Dirección del Centro de Despacho
            </label>
            <div className="relative">
              <MapPin size={15} className="absolute left-3 top-3 text-slate-400" />
              <textarea
                className="form-input pl-9"
                rows={2}
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Av. Ejemplo 123, Distrito, Lima"
                required
                id="settings-address"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <p className="text-[11px] text-slate-400 font-mono">
              Slug: /admin/{tenant.slug}
            </p>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-indigo text-xs sm:text-sm py-2 px-4 flex items-center gap-1.5"
              id="btn-save-business"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Guardando…
                </>
              ) : (
                <>
                  <Save size={14} /> Guardar cambios
                </>
              )}
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Recepción de pedidos
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p
                  className={`text-sm font-black ${
                    isOpen ? 'text-slate-800' : 'text-red-700'
                  }`}
                >
                  {isOpen ? 'Pedidos habilitados' : 'Pedidos pausados'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isOpen
                    ? 'El local acepta pedidos manuales y vía API.'
                    : 'Se bloquean nuevos pedidos hasta reanudar.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isOpen}
                onClick={handleToggleOpen}
                disabled={toggling}
                className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
                  isOpen ? 'bg-emerald-500' : 'bg-slate-300'
                } ${toggling ? 'opacity-60' : ''}`}
                id="settings-open-toggle"
                title={isOpen ? 'Pausar recepción de pedidos' : 'Reanudar recepción de pedidos'}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    isOpen ? 'left-6' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
              Datos del onboarding
            </p>
            <dl className="mt-2 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-indigo-500">Tipo de negocio</dt>
                <dd className="font-bold text-indigo-900 text-right">
                  {tenant.business_type || 'LOGISTICA_GENERAL'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-indigo-500">Identificador fiscal</dt>
                <dd className="font-mono font-bold text-indigo-900 text-right">
                  {tenant.ruc || 'No registrado'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-indigo-500">Comercio</dt>
                <dd className="font-bold text-indigo-900 text-right truncate max-w-[150px]">
                  {tenant.slug}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
