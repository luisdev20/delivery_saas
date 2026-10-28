import { NextResponse } from 'next/server';
import { requireTenantAccess } from '@/lib/auth/tenantAccess';
import { generateApiKey } from '@/lib/auth/apiKey';

const SAFE_KEY_FIELDS = 'id, name, key_prefix, is_active, last_used_at, created_at';

function requestedTenantId(req: Request): string | null {
  return new URL(req.url).searchParams.get('tenantId');
}

async function authorize(req: Request) {
  const access = await requireTenantAccess(requestedTenantId(req));
  if (!access.ok) {
    return {
      error: NextResponse.json({ error: access.error }, { status: access.status }),
    } as const;
  }

  if (access.role !== 'owner' && access.role !== 'superadmin') {
    return {
      error: NextResponse.json(
        { error: 'Solo el owner del comercio puede administrar claves API.' },
        { status: 403 }
      ),
    } as const;
  }

  return { access } as const;
}

// GET /api/v1/keys - Listar claves del comercio (solo owner/superadmin)
export async function GET(req: Request) {
  const auth = await authorize(req);
  if ('error' in auth) return auth.error;

  const { data: keys, error } = await auth.access.supabase
    .from('tenant_api_keys')
    .select(SAFE_KEY_FIELDS)
    .eq('tenant_id', auth.access.tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Error al consultar claves.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, keys: keys || [] });
}

// POST /api/v1/keys - Generar una nueva API Key (solo owner/superadmin)
export async function POST(req: Request) {
  const auth = await authorize(req);
  if ('error' in auth) return auth.error;

  try {
    const body = await req.json().catch(() => ({}));
    const keyName = String(body.name || '').trim().slice(0, 100) || 'Integración producción';

    const { rawKey, keyHash, keyPrefix } = await generateApiKey();

    const { data: keyRecord, error } = await auth.access.supabase
      .from('tenant_api_keys')
      .insert({
        tenant_id: auth.access.tenantId,
        name: keyName,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        is_active: true,
      })
      .select(SAFE_KEY_FIELDS)
      .single();

    if (error || !keyRecord) {
      return NextResponse.json({ error: 'Error al guardar la clave API.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      raw_key: rawKey,
      key: keyRecord,
      message:
        'Clave API generada con éxito. Guárdala de forma segura, no volverá a mostrarse completa.',
    });
  } catch {
    return NextResponse.json({ error: 'Error interno al generar clave.' }, { status: 500 });
  }
}

// PATCH /api/v1/keys - Activar o pausar una clave (solo owner/superadmin)
export async function PATCH(req: Request) {
  const auth = await authorize(req);
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== 'string' || typeof body.isActive !== 'boolean') {
    return NextResponse.json(
      { error: 'Se requiere el id de la clave y el estado isActive.' },
      { status: 400 }
    );
  }

  const { data: key, error } = await auth.access.supabase
    .from('tenant_api_keys')
    .update({ is_active: body.isActive })
    .eq('id', body.id)
    .eq('tenant_id', auth.access.tenantId)
    .select(SAFE_KEY_FIELDS)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Error al actualizar la clave.' }, { status: 500 });
  }
  if (!key) {
    return NextResponse.json({ error: 'Clave no encontrada.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, key });
}

// DELETE /api/v1/keys?id=... - Revocar una clave (solo owner/superadmin)
export async function DELETE(req: Request) {
  const auth = await authorize(req);
  if ('error' in auth) return auth.error;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Se requiere el id de la clave.' }, { status: 400 });
  }

  const { data: key, error } = await auth.access.supabase
    .from('tenant_api_keys')
    .delete()
    .eq('id', id)
    .eq('tenant_id', auth.access.tenantId)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Error al revocar la clave.' }, { status: 500 });
  }
  if (!key) {
    return NextResponse.json({ error: 'Clave no encontrada.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
