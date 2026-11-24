import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  loadTenantRetentionList,
  purgeTenant,
} from '@/lib/server/retention';

interface RetentionBody {
  action?: 'extend' | 'hold' | 'release' | 'purge';
  tenantId?: string;
  days?: number;
  confirmSlug?: string;
}

const MIN_EXTENSION_DAYS = 1;
const MAX_EXTENSION_DAYS = 365;

/**
 * Acciones de superadministración sobre el plazo de retención:
 * prórroga, resguardo, liberación y purga anticipada.
 */
export async function POST(req: Request) {
  const session = await getSessionContext();

  if (session.role !== 'superadmin') {
    return NextResponse.json({ error: 'Requiere rol de superadministrador.' }, { status: 403 });
  }

  let body: RetentionBody;
  try {
    body = (await req.json()) as RetentionBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  if (!body.tenantId || !body.action) {
    return NextResponse.json(
      { error: 'Indica el comercio y la acción a ejecutar.' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const rows = await loadTenantRetentionList(admin);
  const row = rows.find((item) => item.tenantId === body.tenantId);

  if (!row) {
    return NextResponse.json({ error: 'El comercio indicado no existe.' }, { status: 404 });
  }

  if (body.action === 'extend') {
    const days = Math.min(
      MAX_EXTENSION_DAYS,
      Math.max(MIN_EXTENSION_DAYS, Number(body.days) || 30)
    );
    const candidate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const currentExtension = row.extendedUntil ? new Date(row.extendedUntil) : null;
    const extendedUntil =
      currentExtension && currentExtension > candidate ? currentExtension : candidate;

    const { error } = await admin
      .from('tenants')
      .update({ retention_extended_until: extendedUntil.toISOString() })
      .eq('id', row.tenantId);

    if (error) {
      return NextResponse.json(
        { error: `No se pudo prorrogar la retención: ${error.message}` },
        { status: 500 }
      );
    }

    await admin.from('tenant_retention_events').insert({
      tenant_id: row.tenantId,
      tenant_name: row.name,
      tenant_slug: row.slug,
      event_type: 'EXTENDED',
      channel: 'IN_APP',
      metadata: { days, extendedUntil: extendedUntil.toISOString() },
    });

    return NextResponse.json({ success: true, extendedUntil: extendedUntil.toISOString() });
  }

  if (body.action === 'hold' || body.action === 'release') {
    const hold = body.action === 'hold';

    const { error } = await admin
      .from('tenants')
      .update({ retention_hold: hold })
      .eq('id', row.tenantId);

    if (error) {
      return NextResponse.json(
        { error: `No se pudo actualizar el resguardo: ${error.message}` },
        { status: 500 }
      );
    }

    await admin.from('tenant_retention_events').insert({
      tenant_id: row.tenantId,
      tenant_name: row.name,
      tenant_slug: row.slug,
      event_type: hold ? 'HOLD' : 'RELEASED',
      channel: 'IN_APP',
    });

    return NextResponse.json({ success: true, hold });
  }

  if (body.action === 'purge') {
    if (!body.confirmSlug || body.confirmSlug !== row.slug) {
      return NextResponse.json(
        { error: 'Confirma la eliminación escribiendo el identificador exacto del comercio.' },
        { status: 400 }
      );
    }

    const outcome = await purgeTenant(admin, row);

    if (!outcome.deleted) {
      return NextResponse.json(
        { error: outcome.reason ?? 'No se pudo eliminar el comercio.' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      authUsersDeleted: outcome.authUsersDeleted,
    });
  }

  return NextResponse.json({ error: 'Acción no soportada.' }, { status: 400 });
}
