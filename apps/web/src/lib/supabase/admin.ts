import { createClient } from '@supabase/supabase-js';

/**
 * Cliente con `service_role` para operaciones privilegiadas de servidor
 * (facturación, cuentas KDS, consultas de auditoría). Nunca debe importarse
 * desde un componente de cliente.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || serviceKey === 'tu-service-role-key-aqui') {
    throw new Error('Falta configurar NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
