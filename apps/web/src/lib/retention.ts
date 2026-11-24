import type { Subscription } from '@/lib/supabase/types';
import {
  addDaysUtc,
  addMonthsUtc,
  formatDatePen,
  parseCycleStart,
  type BillingTransaction,
} from '@/lib/subscription';

/**
 * Política de retención de datos.
 *
 * El servicio se suspende al vencer el ciclo facturado y la cuenta
 * permanece en modo solo lectura. Cumplido el plazo de gracia se
 * elimina de forma definitiva, con un aviso previo al propietario.
 *
 * Los valores viven aquí (y no en variables de entorno) para que el
 * banner del comercio, la consola de superadmin y el trabajo de purga
 * compartan exactamente el mismo cronograma.
 */
export const RETENTION_POLICY = {
  /** Días de conservación de datos tras el vencimiento. */
  graceDays: 30,
  /** Antelación del primer aviso de eliminación. */
  noticeDays: 7,
  /** Antelación del último aviso antes de la purga. */
  finalNoticeDays: 2,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RetentionStage =
  | 'ACTIVE'
  | 'GRACE'
  | 'NOTICE'
  | 'FINAL_NOTICE'
  | 'DUE'
  | 'HOLD';

export const RETENTION_STAGE_LABELS: Record<RetentionStage, string> = {
  ACTIVE: 'Activo',
  GRACE: 'En gracia',
  NOTICE: 'Aviso de eliminación',
  FINAL_NOTICE: 'Último aviso',
  DUE: 'Purga pendiente',
  HOLD: 'Cuenta resguardada',
};

export interface RetentionInfo {
  stage: RetentionStage;
  stageLabel: string;
  /** Fin del ciclo facturado. */
  periodEnd: string;
  /** Fecha en que se ejecuta la purga definitiva. */
  purgeAt: string;
  /** Días restantes hasta la purga (0 cuando ya venció). */
  daysUntilPurge: number;
  /** Hay una eliminación programada y activa. */
  isScheduledForDeletion: boolean;
  headline: string;
  detail: string;
}

export interface RetentionInput {
  createdAt: string;
  subscription: Subscription | null;
  lastTransaction: Pick<BillingTransaction, 'payment_method'> | null;
  /** Prórroga manual otorgada por superadmin. */
  extendedUntil?: string | null;
  /** Excluye la cuenta de la purga automática. */
  hold?: boolean;
  now?: Date;
}

/** Fin del ciclo facturado. Sin suscripción, se toma el alta del comercio. */
export function retentionPeriodEnd(input: RetentionInput): Date {
  const { subscription, lastTransaction } = input;

  if (!subscription) {
    const created = new Date(input.createdAt);
    return Number.isNaN(created.getTime()) ? new Date(0) : created;
  }

  const isTrial =
    lastTransaction?.payment_method === 'TRIAL' && subscription.plan === 'STARTER';
  const start = parseCycleStart(subscription.billing_cycle_start);

  return isTrial ? addDaysUtc(start, 14) : addMonthsUtc(start, 1);
}

/**
 * Deriva el estado de retención de una cuenta.
 *
 * No consulta la base de datos: recibe suscripción, última transacción
 * y metadatos del comercio, de modo que sirve igual en servidor y en
 * cliente.
 */
export function getRetentionInfo(input: RetentionInput): RetentionInfo {
  const now = input.now ?? new Date();
  const periodEnd = retentionPeriodEnd(input);
  const contractualPurgeAt = addDaysUtc(periodEnd, RETENTION_POLICY.graceDays);

  const extended = input.extendedUntil ? new Date(input.extendedUntil) : null;
  const purgeAt =
    extended && !Number.isNaN(extended.getTime()) && extended > contractualPurgeAt
      ? extended
      : contractualPurgeAt;

  const daysUntilPurge = Math.max(
    0,
    Math.ceil((purgeAt.getTime() - now.getTime()) / DAY_MS)
  );

  let stage: RetentionStage;
  if (input.hold) {
    stage = 'HOLD';
  } else if (now.getTime() < periodEnd.getTime()) {
    stage = 'ACTIVE';
  } else if (now.getTime() >= purgeAt.getTime()) {
    stage = 'DUE';
  } else if (daysUntilPurge <= RETENTION_POLICY.finalNoticeDays) {
    stage = 'FINAL_NOTICE';
  } else if (daysUntilPurge <= RETENTION_POLICY.noticeDays) {
    stage = 'NOTICE';
  } else {
    stage = 'GRACE';
  }

  const purgeDateLabel = formatDatePen(purgeAt);
  const daysLabel = `${daysUntilPurge} día${daysUntilPurge === 1 ? '' : 's'}`;

  let headline = 'Servicio activo';
  let detail = 'La cuenta se encuentra dentro de su ciclo contratado.';

  if (stage === 'GRACE') {
    headline = 'Servicio suspendido';
    detail = `Los datos se conservan hasta el ${purgeDateLabel}. Reactiva un plan antes de esa fecha para evitar la eliminación definitiva de la cuenta.`;
  } else if (stage === 'NOTICE') {
    headline = 'Eliminación programada';
    detail = `La cuenta y todos sus datos se eliminarán definitivamente el ${purgeDateLabel}. Quedan ${daysLabel} para reactivar el servicio.`;
  } else if (stage === 'FINAL_NOTICE') {
    headline = 'Último aviso de eliminación';
    detail = `La eliminación definitiva se ejecutará el ${purgeDateLabel}. Reactiva un plan hoy para conservar la información del comercio.`;
  } else if (stage === 'DUE') {
    headline = 'Eliminación pendiente';
    detail = `El plazo de retención venció el ${purgeDateLabel}. La cuenta se eliminará en la próxima ejecución programada.`;
  } else if (stage === 'HOLD') {
    headline = 'Cuenta resguardada';
    detail = 'La eliminación automática está desactivada para esta cuenta.';
  }

  return {
    stage,
    stageLabel: RETENTION_STAGE_LABELS[stage],
    periodEnd: periodEnd.toISOString(),
    purgeAt: purgeAt.toISOString(),
    daysUntilPurge,
    isScheduledForDeletion:
      stage === 'NOTICE' || stage === 'FINAL_NOTICE' || stage === 'DUE',
    headline,
    detail,
  };
}
