'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  AlertTriangle, ChefHat, KeyRound, Loader2, MessageSquare, Phone,
  Plus, ShieldAlert, Trash2, Truck, UserCheck, Users, X,
} from 'lucide-react';
import type { Driver } from '@/lib/supabase/types';
import type { SubscriptionSnapshot } from '@/lib/subscription';

interface KdsAccount {
  tenantUserId: string;
  userId: string;
  name: string;
  email: string;
  createdAt: string;
}

interface Props {
  tenantId: string;
  initialDrivers: Driver[];
  snapshot: SubscriptionSnapshot;
  onDriversChanged: (drivers: Driver[]) => void;
  onOpenBilling: () => void;
}

type PasswordTarget =
  | { type: 'DRIVER'; driver: Driver }
  | { type: 'KDS'; account: KdsAccount }
  | null;

export default function OperationalAccountsPanel({
  tenantId,
  initialDrivers,
  snapshot,
  onDriversChanged,
  onOpenBilling,
}: Props) {
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers);
  const [kdsAccounts, setKdsAccounts] = useState<KdsAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Alta de repartidor
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [driverForm, setDriverForm] = useState({ name: '', phone: '', password: '' });
  const [savingDriver, setSavingDriver] = useState(false);

  // Alta de cuenta KDS
  const [showKdsModal, setShowKdsModal] = useState(false);
  const [kdsForm, setKdsForm] = useState({ name: '', email: '', password: '' });
  const [savingKds, setSavingKds] = useState(false);

  // Contraseña / resolución de cupo
  const [passwordTarget, setPasswordTarget] = useState<PasswordTarget>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [keepDriverIds, setKeepDriverIds] = useState<string[]>([]);
  const [resolvingQuota, setResolvingQuota] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/operational-accounts?tenantId=${encodeURIComponent(tenantId)}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar el personal operativo.');
      const nextDrivers = (data.drivers ?? []) as Driver[];
      setDrivers(nextDrivers);
      setKdsAccounts((data.kds ?? []) as KdsAccount[]);
      onDriversChanged(nextDrivers);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Error al cargar el personal operativo.'
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId, onDriversChanged]);

  useEffect(() => {
    let cancelled = false;

    const loadInitialAccounts = async () => {
      try {
        const response = await fetch(
          `/api/admin/operational-accounts?tenantId=${encodeURIComponent(tenantId)}`,
          { cache: 'no-store' }
        );
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(data.error || 'No se pudo cargar el personal operativo.');
        }
        const nextDrivers = (data.drivers ?? []) as Driver[];
        setDrivers(nextDrivers);
        setKdsAccounts((data.kds ?? []) as KdsAccount[]);
        onDriversChanged(nextDrivers);
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : 'Error al cargar el personal operativo.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadInitialAccounts();
    return () => {
      cancelled = true;
    };
  }, [tenantId, onDriversChanged]);

  const activeDrivers = drivers.filter((driver) => driver.is_active && !driver.deleted_at);
  const visibleDrivers = drivers.filter((driver) => !driver.deleted_at);
  const overQuota = snapshot.hasSubscription && activeDrivers.length > snapshot.maxDrivers;
  const quotaFull = activeDrivers.length >= snapshot.maxDrivers;
  const readOnly = snapshot.readOnly;

  useEffect(() => {
    if (!overQuota) return;
    // Inicializa la selección sugerida al entrar en sobrecupo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKeepDriverIds(activeDrivers.slice(0, snapshot.maxDrivers).map((driver) => driver.id));
    // Solo se recalcula al entrar en sobrecupo o cambiar el límite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overQuota, snapshot.maxDrivers]);

  const handleCreateDriver = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingDriver(true);
    try {
      const response = await fetch('/api/admin/operational-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DRIVER',
          tenantId,
          name: driverForm.name,
          phone: driverForm.phone,
          password: driverForm.password,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar al repartidor.');
      toast.success(`Repartidor ${data.driver.name} registrado con su contraseña`);
      setShowDriverModal(false);
      setDriverForm({ name: '', phone: '', password: '' });
      await loadAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al registrar al repartidor.');
    } finally {
      setSavingDriver(false);
    }
  };

  const handleCreateKds = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingKds(true);
    try {
      const response = await fetch('/api/admin/operational-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'KDS',
          tenantId,
          name: kdsForm.name,
          email: kdsForm.email,
          password: kdsForm.password,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo crear la cuenta KDS.');
      toast.success(`Cuenta KDS ${kdsForm.email} creada con acceso a /packing`);
      setShowKdsModal(false);
      setKdsForm({ name: '', email: '', password: '' });
      await loadAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al crear la cuenta KDS.');
    } finally {
      setSavingKds(false);
    }
  };

  const handleToggleDriver = async (driver: Driver) => {
    setBusyId(driver.id);
    try {
      const response = await fetch('/api/admin/operational-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DRIVER',
          tenantId,
          id: driver.id,
          isActive: !driver.is_active,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar al repartidor.');
      const nextDrivers = drivers.map((item) =>
        item.id === driver.id ? (data.driver as Driver) : item
      );
      setDrivers(nextDrivers);
      onDriversChanged(nextDrivers);
      toast.success(
        data.driver.is_active
          ? `${data.driver.name} activado`
          : `${data.driver.name} desactivado`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar al repartidor.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteDriver = async (driver: Driver) => {
    if (
      !confirm(
        `¿Dar de baja a "${driver.name}"?\n\nSe eliminarán su teléfono y su acceso de login. Su historial de entregas se conservará. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setBusyId(driver.id);
    try {
      const response = await fetch(
        `/api/admin/operational-accounts?type=DRIVER&id=${encodeURIComponent(
          driver.id
        )}&tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo dar de baja al repartidor.');
      const nextDrivers = drivers.filter((item) => item.id !== driver.id);
      setDrivers(nextDrivers);
      onDriversChanged(nextDrivers);
      toast.success(
        data.releasedOrders > 0
          ? `${driver.name} dado de baja · ${data.releasedOrders} pedido(s) liberado(s)`
          : `${driver.name} dado de baja`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al dar de baja al repartidor.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeKds = async (account: KdsAccount) => {
    if (
      !confirm(
        `¿Revocar el acceso de "${account.name}" (${account.email})?\n\nLa cuenta perderá el acceso a la estación KDS. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setBusyId(account.userId);
    try {
      const response = await fetch(
        `/api/admin/operational-accounts?type=KDS&id=${encodeURIComponent(
          account.tenantUserId
        )}&tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo revocar el acceso KDS.');
      setKdsAccounts((prev) => prev.filter((item) => item.tenantUserId !== account.tenantUserId));
      toast.success(`Acceso KDS revocado para ${account.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al revocar el acceso KDS.');
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordTarget) return;
    if (newPassword.trim().length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setSavingPassword(true);
    try {
      if (passwordTarget.type === 'DRIVER') {
        const { data, error } = await supabase.rpc('set_driver_password', {
          p_driver_id: passwordTarget.driver.id,
          p_password: newPassword.trim(),
        });
        const result = (data || null) as { success?: boolean; error?: string } | null;
        if (error || !result?.success) {
          throw new Error(result?.error || error?.message || 'No se pudo actualizar la contraseña.');
        }
        toast.success(`Contraseña actualizada para ${passwordTarget.driver.name}`);
      } else {
        const response = await fetch('/api/admin/operational-accounts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'KDS',
            tenantId,
            id: passwordTarget.account.tenantUserId,
            password: newPassword.trim(),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo actualizar la contraseña KDS.');
        toast.success(`Contraseña actualizada para ${passwordTarget.account.name}`);
      }
      setPasswordTarget(null);
      setNewPassword('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar la contraseña.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleResolveQuota = async () => {
    if (keepDriverIds.length !== snapshot.maxDrivers) {
      toast.error(`Selecciona exactamente ${snapshot.maxDrivers} motorizados para mantener el acceso.`);
      return;
    }

    setResolvingQuota(true);
    try {
      const response = await fetch('/api/admin/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve_quota',
          tenantId,
          keepDriverIds,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo resolver el cupo de motorizados.');
      const nextDrivers = drivers.map((driver) =>
        activeDrivers.some((active) => active.id === driver.id) &&
        !keepDriverIds.includes(driver.id)
          ? { ...driver, is_active: false }
          : driver
      );
      setDrivers(nextDrivers);
      onDriversChanged(nextDrivers);
      toast.success(
        `${data.deactivated} motorizado(s) pasaron a estado inactivo. Se conserva su historial.`
      );
      await loadAccounts();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Error al resolver el cupo de motorizados.'
      );
    } finally {
      setResolvingQuota(false);
    }
  };

  const toggleKeep = (driverId: string) => {
    setKeepDriverIds((prev) => {
      if (prev.includes(driverId)) return prev.filter((id) => id !== driverId);
      if (prev.length >= snapshot.maxDrivers) return prev;
      return [...prev, driverId];
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
              Personal Operativo
            </h2>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
              Repartidores + KDS
            </span>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
            Cuentas con acceso a la app móvil y a la estación de preparación
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowKdsModal(true)}
            disabled={readOnly}
            className="btn btn-secondary text-xs sm:text-sm py-2 px-3.5 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            id="btn-new-kds"
          >
            <ChefHat size={15} /> Cuenta KDS
          </button>
          <button
            type="button"
            onClick={() => setShowDriverModal(true)}
            disabled={readOnly || quotaFull}
            className="btn btn-indigo text-xs sm:text-sm py-2 px-3.5 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            id="btn-new-driver"
            title={
              readOnly
                ? 'Suscripción vencida: renueva para habilitar el alta'
                : quotaFull
                  ? 'Límite de motorizados activos alcanzado'
                  : undefined
            }
          >
            <Plus size={15} /> Nuevo Repartidor
          </button>
        </div>
      </header>

      {/* Resumen de cupos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Motorizados activos
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {activeDrivers.length}
            <span className="text-sm font-bold text-slate-400"> / {snapshot.maxDrivers}</span>
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                quotaFull ? 'bg-amber-500' : 'bg-indigo-600'
              }`}
              style={{
                width: `${Math.min(
                  100,
                  (activeDrivers.length / Math.max(1, snapshot.maxDrivers)) * 100
                )}%`,
              }}
            />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Cuentas KDS
          </p>
          <p className="mt-1 text-2xl font-black text-slate-900">{kdsAccounts.length}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Acceso exclusivo a la estación de preparación
          </p>
        </div>
        <div
          className={`rounded-xl border p-4 shadow-xs ${
            readOnly
              ? 'bg-rose-50 border-rose-200'
              : quotaFull
                ? 'bg-amber-50 border-amber-200'
                : 'bg-emerald-50 border-emerald-200'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Estado del cupo
          </p>
          <p
            className={`mt-1 text-sm font-black ${
              readOnly ? 'text-rose-700' : quotaFull ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {readOnly
              ? 'Solo lectura por vencimiento'
              : quotaFull
                ? 'Límite de flota alcanzado'
                : 'Cupo disponible'}
          </p>
          <p className="mt-1 text-[11px] text-slate-600 leading-snug">
            {readOnly
              ? 'Renueva tu suscripción para volver a administrar personal.'
              : quotaFull
                ? 'Mejora tu suscripción para ampliar tu flota.'
                : `Puedes agregar ${snapshot.maxDrivers - activeDrivers.length} motorizado(s) más.`}
          </p>
        </div>
      </div>

      {quotaFull && !overQuota && !readOnly && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 flex items-start gap-2">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />
          Has alcanzado el límite de motorizados activos de tu plan. Mejora tu suscripción para
          ampliar tu flota.
        </div>
      )}

      {/* Repartidores */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
            <Truck size={16} className="text-indigo-600" /> Motorizados
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {visibleDrivers.length}
            </span>
          </h3>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
            <Loader2 size={22} className="animate-spin mx-auto mb-2" />
            <p className="text-xs font-semibold">Cargando personal operativo…</p>
          </div>
        ) : visibleDrivers.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
            <Users size={30} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-slate-600">Aún no hay repartidores</p>
            <p className="text-xs mt-1">Registra el primero para asignar despachos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleDrivers.map((driver) => (
              <div
                key={driver.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-600 text-base shrink-0">
                      {driver.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-800 text-sm truncate">{driver.name}</h4>
                      <a
                        href={`tel:${driver.phone}`}
                        className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 mt-0.5"
                      >
                        <Phone size={12} /> {driver.phone || 'Sin teléfono'}
                      </a>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      driver.is_active
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {driver.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleDriver(driver)}
                    disabled={readOnly || busyId === driver.id || (!driver.is_active && quotaFull)}
                    title={
                      !driver.is_active && quotaFull
                        ? 'No hay cupo disponible en el plan'
                        : undefined
                    }
                    className={`text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${
                      driver.is_active
                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {busyId === driver.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : driver.is_active ? (
                      'Desactivar'
                    ) : (
                      'Activar'
                    )}
                  </button>
                  <a
                    href={`https://wa.me/51${driver.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Escribir por WhatsApp"
                    className="text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-1"
                  >
                    <MessageSquare size={13} /> WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordTarget({ type: 'DRIVER', driver });
                      setNewPassword('');
                    }}
                    disabled={readOnly}
                    className="text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    <KeyRound size={13} /> Contraseña
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDriver(driver)}
                    disabled={readOnly || busyId === driver.id}
                    title="Dar de baja (conserva su historial de entregas)"
                    className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    <Trash2 size={13} /> Baja
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* KDS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
            <ChefHat size={16} className="text-emerald-600" /> Cocina / Despacho (KDS)
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {kdsAccounts.length}
            </span>
          </h3>
        </div>

        {kdsAccounts.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
            <ChefHat size={30} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-slate-600">Sin cuentas KDS</p>
            <p className="text-xs mt-1">
              Crea una cuenta para que el equipo de cocina vea el Kanban sin acceder a la
              administración general.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {kdsAccounts.map((account) => (
              <div
                key={account.tenantUserId}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 text-base shrink-0">
                      {account.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-800 text-sm truncate">{account.name}</h4>
                      <p className="text-xs text-slate-500 truncate">{account.email}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    KDS
                  </span>
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <UserCheck size={12} /> Acceso exclusivo a /packing · sin panel administrativo
                </p>
                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordTarget({ type: 'KDS', account });
                      setNewPassword('');
                    }}
                    disabled={readOnly}
                    className="text-xs font-semibold px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    <KeyRound size={13} /> Contraseña
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevokeKds(account)}
                    disabled={readOnly || busyId === account.userId}
                    className="text-xs font-semibold px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                  >
                    {busyId === account.userId ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <>
                        <Trash2 size={13} /> Revocar
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODAL: alta de repartidor */}
      {showDriverModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                <Truck size={18} className="text-indigo-600" /> Registrar Repartidor
              </h3>
              <button
                onClick={() => setShowDriverModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-[11px] text-indigo-700">
              Cupo del plan: {activeDrivers.length} / {snapshot.maxDrivers} motorizados activos.
            </div>
            <form onSubmit={handleCreateDriver} className="space-y-3 sm:space-y-4">
              <div className="form-group">
                <label className="form-label">Nombre completo</label>
                <input
                  className="form-input"
                  placeholder="Ej. Carlos Rodríguez"
                  value={driverForm.name}
                  onChange={(e) => setDriverForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp / Teléfono</label>
                <input
                  className="form-input"
                  type="tel"
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="987654321"
                  value={driverForm.phone}
                  onChange={(e) =>
                    setDriverForm((prev) => ({
                      ...prev,
                      phone: e.target.value.replace(/\D/g, ''),
                    }))
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Contraseña de acceso</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Mínimo 6 caracteres"
                  value={driverForm.password}
                  onChange={(e) => setDriverForm((prev) => ({ ...prev, password: e.target.value }))}
                  minLength={6}
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  El repartidor ingresa con su teléfono y esta contraseña en la app.
                </p>
              </div>
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDriverModal(false)}
                  className="btn btn-secondary flex-1 text-xs sm:text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingDriver}
                  className="btn btn-indigo flex-1 text-xs sm:text-sm flex items-center justify-center gap-2"
                >
                  {savingDriver ? <Loader2 size={14} className="animate-spin" /> : null}
                  {savingDriver ? 'Guardando…' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: alta KDS */}
      {showKdsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
                <ChefHat size={18} className="text-emerald-600" /> Nueva Cuenta KDS
              </h3>
              <button
                onClick={() => setShowKdsModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              La cuenta solo podrá iniciar sesión en la estación de preparación (Kanban), no en el
              panel de administración.
            </p>
            <form onSubmit={handleCreateKds} className="space-y-3 sm:space-y-4">
              <div className="form-group">
                <label className="form-label">Nombre del responsable / turno</label>
                <input
                  className="form-input"
                  placeholder="Ej. Cocina Turno Mañana"
                  value={kdsForm.name}
                  onChange={(e) => setKdsForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Correo de acceso</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="cocina@comercio.com"
                  value={kdsForm.email}
                  onChange={(e) => setKdsForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Contraseña</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Mínimo 6 caracteres"
                  value={kdsForm.password}
                  onChange={(e) => setKdsForm((prev) => ({ ...prev, password: e.target.value }))}
                  minLength={6}
                  required
                />
              </div>
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowKdsModal(false)}
                  className="btn btn-secondary flex-1 text-xs sm:text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingKds}
                  className="btn bg-emerald-600 hover:bg-emerald-700 text-white flex-1 text-xs sm:text-sm flex items-center justify-center gap-2"
                >
                  {savingKds ? <Loader2 size={14} className="animate-spin" /> : null}
                  {savingKds ? 'Creando…' : 'Crear cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: contraseña */}
      {passwordTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base sm:text-lg font-bold text-slate-800">
                Contraseña de{' '}
                {passwordTarget.type === 'DRIVER'
                  ? passwordTarget.driver.name
                  : passwordTarget.account.name}
              </h3>
              <button
                onClick={() => setPasswordTarget(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdatePassword} className="space-y-3 sm:space-y-4">
              <div className="form-group">
                <label className="form-label">Nueva contraseña</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {passwordTarget.type === 'DRIVER'
                    ? `Se usará junto al teléfono ${passwordTarget.driver.phone || '(sin teléfono)'} en la app móvil.`
                    : `Se usará con el correo ${passwordTarget.account.email} para ingresar a /packing.`}
                </p>
              </div>
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPasswordTarget(null)}
                  className="btn btn-secondary flex-1 text-xs sm:text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="btn btn-indigo flex-1 text-xs sm:text-sm"
                >
                  {savingPassword ? 'Guardando…' : 'Guardar contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL BLOQUEANTE: resolución de cupo tras downgrade */}
      {overQuota && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-100 bg-amber-50">
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle size={20} />
                <h3 className="font-black text-base">Resolución obligatoria de cupo</h3>
              </div>
              <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                Tu plan actual solo permite <strong>{snapshot.maxDrivers}</strong> motorizados
                activos simultáneos. Selecciona cuáles <strong>{snapshot.maxDrivers}</strong>{' '}
                mantendrán acceso; los restantes pasarán a estado inactivo.
              </p>
              <p className="mt-1 text-[11px] text-amber-700">
                Ningún registro se elimina: se conserva la integridad del historial de despachos.
              </p>
            </div>

            <div className="p-5 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span>Motorizados activos: {activeDrivers.length}</span>
                <span>
                  Seleccionados: {keepDriverIds.length} / {snapshot.maxDrivers}
                </span>
              </div>
              {activeDrivers.map((driver) => {
                const checked = keepDriverIds.includes(driver.id);
                return (
                  <label
                    key={driver.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                      checked
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKeep(driver.id)}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{driver.name}</p>
                      <p className="text-[11px] text-slate-500">{driver.phone}</p>
                    </div>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        checked
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {checked ? 'Mantiene acceso' : 'Pasará a inactivo'}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="px-5 pb-5 flex flex-col sm:flex-row gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={onOpenBilling}
                className="btn btn-secondary flex-1 text-xs sm:text-sm"
              >
                Cambiar de plan
              </button>
              <button
                type="button"
                onClick={handleResolveQuota}
                disabled={resolvingQuota || keepDriverIds.length !== snapshot.maxDrivers}
                className="btn bg-amber-500 hover:bg-amber-600 text-white flex-1 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {resolvingQuota ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirmar selección
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
