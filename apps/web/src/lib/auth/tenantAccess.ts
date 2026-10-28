import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type AdminRole = 'superadmin' | 'owner' | 'manager' | 'dispatcher' | 'packing';

export interface TenantAccess {
  ok: true;
  userId: string;
  email: string | null;
  role: AdminRole;
  tenantId: string;
  /** Cliente con la sesión del usuario (respeta RLS). */
  supabase: SupabaseClient;
  /** Cliente service_role para operaciones privilegiadas. */
  admin: SupabaseClient;
}

export type TenantAccessError = {
  ok: false;
  status: number;
  error: string;
};

const WRITE_ROLES: AdminRole[] = ['owner', 'manager', 'superadmin'];

/**
 * Resuelve el comercio activo desde Supabase Auth + `tenant_users`.
 * Un superadmin puede operar sobre el `tenant_id` solicitado; el resto
 * queda estrictamente limitado a su propio comercio.
 */
export async function requireTenantAccess(
  requestedTenantId?: string | null
): Promise<TenantAccess | TenantAccessError> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: 'No autenticado.' };
  }

  const { data: profile } = await supabase
    .from('tenant_users')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile?.tenant_id) {
    return { ok: false, status: 403, error: 'Tu cuenta no tiene un comercio asignado.' };
  }

  const role = profile.role as AdminRole;
  if (!['superadmin', 'owner', 'manager', 'dispatcher', 'packing'].includes(role)) {
    return { ok: false, status: 403, error: 'Rol no autorizado.' };
  }

  if (role === 'packing') {
    return {
      ok: false,
      status: 403,
      error: 'La cuenta KDS solo puede acceder a la estación de preparación (/packing).',
    };
  }

  const isSuperadmin = role === 'superadmin';
  const tenantId = isSuperadmin && requestedTenantId ? requestedTenantId : profile.tenant_id;

  if (!isSuperadmin && requestedTenantId && requestedTenantId !== profile.tenant_id) {
    return { ok: false, status: 403, error: 'No tienes acceso a este comercio.' };
  }

  return {
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    role,
    tenantId,
    supabase,
    admin: createAdminClient(),
  };
}

export function canWrite(role: AdminRole): boolean {
  return WRITE_ROLES.includes(role);
}

export function assertCanWrite(role: AdminRole): TenantAccessError | null {
  if (!canWrite(role)) {
    return {
      ok: false,
      status: 403,
      error: 'Tu rol permite consultar el panel, pero no administrar esta sección.',
    };
  }
  return null;
}
