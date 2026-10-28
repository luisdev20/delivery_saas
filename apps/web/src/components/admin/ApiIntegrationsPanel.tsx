'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  Copy,
  Key,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type { TenantApiKey } from '@/lib/supabase/types';

interface Props {
  tenantId: string;
  tenantName: string;
  readOnly: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return 'Sin uso';
  return new Date(value).toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function ApiIntegrationsPanel({
  tenantId,
  tenantName,
  readOnly,
}: Props) {
  const [keys, setKeys] = useState<TenantApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rawKey, setRawKey] = useState<{ rawKey: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const apiUrl = `/api/v1/keys?tenantId=${encodeURIComponent(tenantId)}`;

  const fetchKeys = useCallback(async () => {
    const response = await fetch(apiUrl, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las claves.');
    return (data.keys || []) as TenantApiKey[];
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;

    fetchKeys()
      .then((nextKeys) => {
        if (cancelled) return;
        setKeys(nextKeys);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : 'No se pudieron cargar las claves.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchKeys]);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setKeys(await fetchKeys());
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'No se pudieron cargar las claves.'
      );
    } finally {
      setLoading(false);
    }
  }, [fetchKeys]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName.trim() || 'Integración producción' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo generar la clave.');

      setKeys((prev) => [data.key as TenantApiKey, ...prev]);
      setRawKey({ rawKey: data.raw_key, name: data.key.name });
      setShowCreate(false);
      setKeyName('');
      toast.success('Clave API generada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar la clave.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (key: TenantApiKey) => {
    setBusyId(key.id);
    try {
      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key.id, isActive: !key.is_active }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar la clave.');

      setKeys((prev) =>
        prev.map((item) => (item.id === key.id ? (data.key as TenantApiKey) : item))
      );
      toast.success(data.key.is_active ? 'Clave activada' : 'Clave pausada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo actualizar la clave.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (key: TenantApiKey) => {
    if (
      !confirm(
        `¿Revocar la clave "${key.name}"? Los sistemas que la usen dejarán de poder crear despachos.`
      )
    ) {
      return;
    }

    setBusyId(key.id);
    try {
      const response = await fetch(`${apiUrl}&id=${encodeURIComponent(key.id)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo revocar la clave.');

      setKeys((prev) => prev.filter((item) => item.id !== key.id));
      toast.success('Clave revocada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo revocar la clave.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async () => {
    if (!rawKey) return;
    try {
      await navigator.clipboard.writeText(rawKey.rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      toast.success('Clave copiada');
    } catch {
      toast.error('No se pudo copiar la clave. Selecciónala manualmente.');
    }
  };

  const apiBase = 'https://tu-dominio.com';

  return (
    <section
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4"
      id="api-integrations"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Key size={18} />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-800">Integraciones API</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Conecta {tenantName} con tu e-commerce o ERP. Solo el owner puede administrar
              estas claves.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          disabled={readOnly}
          title={
            readOnly
              ? 'Suscripción vencida: renueva tu plan para generar nuevas claves'
              : undefined
          }
          className="btn btn-indigo text-xs py-2 px-3.5 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          id="btn-create-api-key"
        >
          <Plus size={15} /> Generar clave
        </button>
      </div>

      {readOnly && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          La suscripción está vencida. Puedes revocar claves existentes, pero no generar
          nuevas hasta renovar el plan.
        </p>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">
          <Loader2 size={20} className="animate-spin mx-auto mb-2" />
          <p className="text-xs font-semibold">Cargando claves…</p>
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700 flex items-start justify-between gap-3">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => {
              setLoadError(null);
              setLoading(true);
              void loadKeys();
            }}
            className="font-bold shrink-0"
          >
            Reintentar
          </button>
        </div>
      ) : keys.length === 0 ? (
        <div className="py-8 text-center text-slate-400">
          <Key size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm font-semibold text-slate-600">Sin claves de API</p>
          <p className="text-xs mt-1">
            Genera una clave para conectar un sistema externo a este comercio.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {keys.map((key) => (
            <div
              key={key.id}
              className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm text-slate-800 truncate">{key.name}</p>
                  {!key.is_active && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      Pausada
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                  {key.key_prefix} · Creada {formatDate(key.created_at)}
                </p>
                <p className="text-[11px] text-slate-400">
                  Último uso: {formatDate(key.last_used_at)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleToggle(key)}
                  disabled={busyId === key.id}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                    key.is_active
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  {busyId === key.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : key.is_active ? (
                    'Pausar'
                  ) : (
                    'Activar'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(key)}
                  disabled={busyId === key.id}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <Trash2 size={13} /> Revocar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
        <summary className="cursor-pointer text-xs font-bold text-slate-600">
          Ver ejemplo de integración
        </summary>
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-slate-500">
            Reemplaza <code className="font-mono">https://tu-dominio.com</code> por la URL de
            tu instalación y envía la clave desde tu servidor, nunca desde el navegador.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200">
{`curl -X POST "${apiBase}/api/v1/orders" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: dtk_live_TU_CLAVE" \\
  -d '{
    "external_order_id": "ORD-001",
    "customer": {
      "name": "Cliente",
      "phone": "+51987654321",
      "address": "Av. Principal 123, Lima",
      "lat": -12.0464,
      "lng": -77.0428
    },
    "payment": { "method": "YAPE", "total_amount": 45.00 }
  }'`}
          </pre>
        </div>
      </details>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-600">
                <Key size={18} />
                <h3 className="font-bold text-sm text-slate-900">Generar clave API</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="form-group">
                <label className="form-label text-xs font-semibold uppercase">
                  Nombre de la integración
                </label>
                <input
                  className="form-input"
                  placeholder="Ej. Shopify producción / ERP"
                  value={keyName}
                  onChange={(event) => setKeyName(event.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              <p className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed">
                <ShieldCheck size={14} className="shrink-0 mt-0.5 text-emerald-600" />
                La clave tendrá acceso de escritura para crear despachos. Se mostrará una
                sola vez.
              </p>

              <div className="flex gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="btn btn-secondary flex-1 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-indigo flex-1 text-xs font-bold"
                >
                  {creating ? 'Generando…' : 'Generar clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {rawKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-600">
                <ShieldCheck size={19} />
                <h3 className="font-bold text-sm text-slate-900">Clave API generada</h3>
              </div>
              <button
                type="button"
                onClick={() => setRawKey(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={17} />
              </button>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 leading-relaxed">
              <strong>Importante:</strong> copia esta clave ahora. Por seguridad no volverá
              a mostrarse completa.
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold uppercase text-slate-500">
                Token secreto ({rawKey.name})
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={rawKey.rawKey}
                  className="form-input font-mono text-xs bg-slate-50 text-indigo-900 select-all"
                />
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="btn btn-indigo text-xs py-2 px-3 shrink-0 flex items-center gap-1"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setRawKey(null)}
              className="btn btn-secondary w-full text-xs font-bold"
            >
              He guardado la clave
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
