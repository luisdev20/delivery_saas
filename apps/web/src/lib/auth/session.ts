import { createClient } from '@/lib/supabase/server';

export type AppRole = 'superadmin' | 'owner' | 'manager' | 'dispatcher' | 'packing';

export interface SessionContext {
  userId: string | null;
  email: string | null;
  role: AppRole | null;
  tenantId: string | null;
  tenantSlug: string | null;
}

const EMPTY: SessionContext = {
  userId: null,
  email: null,
  role: null,
  tenantId: null,
  tenantSlug: null,
};

/**
 * Contexto de sesión de CONFIANZA (lado servidor).
 *
 * Deriva el rol y el comercio desde Supabase Auth + `tenant_users`.
 * No confía en las cookies `dtk_role` / `dtk_tenant` (que el cliente puede
 * escribir): esas cookies solo se usan como apoyo de navegación, nunca
 * para autorizar.
 */
export async function getSessionContext(): Promise<SessionContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return EMPTY;

  const { data } = await supabase
    .from('tenant_users')
    .select('role, tenant_id, tenants(slug)')
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    role: (data?.role as AppRole) ?? null,
    tenantId: data?.tenant_id ?? null,
    tenantSlug: (data?.tenants as { slug?: string } | null)?.slug ?? null,
  };
}
