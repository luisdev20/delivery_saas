import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subscription } from '@/lib/supabase/types';
import {
  getSubscriptionSnapshot,
  type BillingTransaction,
  type SubscriptionSnapshot,
} from '@/lib/subscription';

export interface SubscriptionState {
  subscription: Subscription | null;
  lastTransaction: BillingTransaction | null;
  transactionCount: number;
  snapshot: SubscriptionSnapshot;
}

/**
 * Carga la suscripción más reciente y la última transacción de facturación.
 * Debe ejecutarse con el cliente `service_role` (billing_transactions no
 * expone políticas de lectura para usuarios finales).
 */
export async function loadSubscriptionState(
  admin: SupabaseClient,
  tenantId: string
): Promise<SubscriptionState> {
  const [{ data: subscription }, { data: lastTransaction }, { count }] = await Promise.all([
    admin
      .from('subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('billing_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('billing_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
  ]);

  const sub = (subscription as Subscription | null) ?? null;
  const tx = (lastTransaction as BillingTransaction | null) ?? null;

  return {
    subscription: sub,
    lastTransaction: tx,
    transactionCount: count ?? 0,
    snapshot: getSubscriptionSnapshot(sub, tx),
  };
}
