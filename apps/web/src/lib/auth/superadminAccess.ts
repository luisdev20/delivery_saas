import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionContext } from './session';
import { createAdminClient } from '@/lib/supabase/admin';

export interface SuperAdminAccess {
  ok: true;
  userId: string;
  email: string | null;
  admin: SupabaseClient;
}

export interface SuperAdminAccessError {
  ok: false;
  status: number;
  error: string;
}

export async function requireSuperAdmin(): Promise<SuperAdminAccess | SuperAdminAccessError> {
  const session = await getSessionContext();

  if (!session.userId) {
    return { ok: false, status: 401, error: 'No autenticado.' };
  }

  if (session.role !== 'superadmin') {
    return { ok: false, status: 403, error: 'Acceso restringido a Superadministración.' };
  }

  return {
    ok: true,
    userId: session.userId,
    email: session.email,
    admin: createAdminClient(),
  };
}
