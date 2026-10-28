import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Driver } from '@/lib/supabase/types';
import { assertCanWrite, requireTenantAccess } from '@/lib/auth/tenantAccess';
import { loadSubscriptionState } from '@/lib/server/subscription';

interface OperationalBody {
  type?: 'DRIVER' | 'KDS';
  tenantId?: string;
  name?: string;
  phone?: string;
  email?: string;
  password?: string;
  id?: string;
  isActive?: boolean;
}

interface KdsAccount {
  tenantUserId: string;
  userId: string;
  name: string;
  email: string;
  createdAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(value: string | undefined): string {
  return (value || '').replace(/\D/g, '');
}

async function listKdsAccounts(
  admin: SupabaseClient,
  tenantId: string
): Promise<KdsAccount[]> {
  const { data: members } = await admin
    .from('tenant_users')
    .select('id, user_id, role, created_at')
    .eq('tenant_id', tenantId)
    .eq('role', 'packing');

  if (!members || members.length === 0) return [];

  const wanted = new Set(members.map((member) => member.user_id));
  const usersById = new Map<
    string,
    { email?: string | null; user_metadata?: Record<string, unknown> }
  >();

  // listUsers no permite filtrar por IDs; se pagina para evitar límites silenciosos.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const user of data.users) {
      if (wanted.has(user.id)) usersById.set(user.id, user);
    }
    if (data.users.length < 1000) break;
    if ([...wanted].every((id) => usersById.has(id))) break;
  }

  return members.map((member) => {
    const user = usersById.get(member.user_id);
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const name =
      (typeof metadata.full_name === 'string' && metadata.full_name.trim()) ||
      (user?.email ? user.email.split('@')[0] : 'Cuenta KDS');

    return {
      tenantUserId: member.id,
      userId: member.user_id,
      name,
      email: user?.email ?? '—',
      createdAt: member.created_at,
    };
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const access = await requireTenantAccess(url.searchParams.get('tenantId'));

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const [{ data: drivers }, kds] = await Promise.all([
    access.admin
      .from('drivers')
      .select('*')
      .eq('tenant_id', access.tenantId)
      .order('created_at', { ascending: true }),
    listKdsAccounts(access.admin, access.tenantId),
  ]);

  return NextResponse.json({
    success: true,
    drivers: (drivers ?? []) as Driver[],
    kds,
  });
}

export async function POST(req: Request) {
  let body: OperationalBody;
  try {
    body = (await req.json()) as OperationalBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  const access = await requireTenantAccess(body.tenantId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const roleError = assertCanWrite(access.role);
  if (roleError) {
    return NextResponse.json({ error: roleError.error }, { status: roleError.status });
  }

  const { admin, tenantId } = access;
  const name = (body.name || '').trim();
  const password = body.password || '';

  if (name.length < 2) {
    return NextResponse.json({ error: 'Ingresa el nombre completo.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: 'La contraseña debe tener al menos 6 caracteres.' },
      { status: 400 }
    );
  }

  // ---------------------------------------------------------------
  // Alta de repartidor (con cupo max_drivers)
  // ---------------------------------------------------------------
  if (body.type === 'DRIVER') {
    const phone = normalizePhone(body.phone);
    if (phone.length !== 9) {
      return NextResponse.json(
        { error: 'El teléfono del repartidor debe tener 9 dígitos.' },
        { status: 400 }
      );
    }

    const state = await loadSubscriptionState(admin, tenantId);
    if (state.snapshot.readOnly) {
      return NextResponse.json(
        {
          error:
            'La suscripción está vencida. Renueva tu plan para habilitar el alta de personal operativo.',
          code: 'SUBSCRIPTION_EXPIRED',
        },
        { status: 403 }
      );
    }

    const maxDrivers = state.snapshot.maxDrivers;
    const { count: activeCount } = await admin
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);

    if ((activeCount ?? 0) >= maxDrivers) {
      return NextResponse.json(
        {
          error: `Has alcanzado el límite de motorizados activos de tu plan (${maxDrivers}). Mejora tu suscripción para ampliar tu flota.`,
          code: 'DRIVER_QUOTA_REACHED',
          maxDrivers,
        },
        { status: 409 }
      );
    }

    const { data: duplicate } = await admin
      .from('drivers')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();
    if (duplicate) {
      return NextResponse.json(
        { error: 'Ya existe un repartidor registrado con ese teléfono.' },
        { status: 409 }
      );
    }

    const { data: driver, error } = await admin
      .from('drivers')
      .insert({ tenant_id: tenantId, name, phone, is_active: true })
      .select()
      .single();

    if (error || !driver) {
      return NextResponse.json(
        { error: `No se pudo registrar al repartidor: ${error?.message || 'error desconocido'}` },
        { status: 500 }
      );
    }

    const { data: passwordResult } = await access.supabase.rpc('set_driver_password', {
      p_driver_id: driver.id,
      p_password: password,
    });
    const result = (passwordResult || null) as { success?: boolean; error?: string } | null;

    if (!result?.success) {
      await admin.from('drivers').delete().eq('id', driver.id);
      return NextResponse.json(
        {
          error:
            result?.error ||
            'El repartidor se creó, pero no se pudo asignar su contraseña. Intenta nuevamente.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, driver: driver as Driver }, { status: 201 });
  }

  // ---------------------------------------------------------------
  // Alta de cuenta KDS (rol packing, acceso solo a /packing)
  // ---------------------------------------------------------------
  if (body.type === 'KDS') {
    const email = (body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Ingresa un correo válido.' }, { status: 400 });
    }

    const state = await loadSubscriptionState(admin, tenantId);
    if (state.snapshot.readOnly) {
      return NextResponse.json(
        {
          error:
            'La suscripción está vencida. Renueva tu plan para habilitar el alta de personal operativo.',
          code: 'SUBSCRIPTION_EXPIRED',
        },
        { status: 403 }
      );
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        tenant_id: tenantId,
        operational_role: 'KDS',
      },
    });

    if (createError || !created.user) {
      const message = createError?.message?.toLowerCase().includes('already')
        ? 'Ya existe una cuenta con ese correo.'
        : createError?.message || 'No se pudo crear la cuenta KDS.';
      return NextResponse.json({ error: message }, { status: 409 });
    }

    const { data: member, error: memberError } = await admin
      .from('tenant_users')
      .insert({
        user_id: created.user.id,
        tenant_id: tenantId,
        role: 'packing',
      })
      .select()
      .single();

    if (memberError || !member) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json(
        {
          error: `No se pudo vincular la cuenta KDS al comercio: ${
            memberError?.message || 'error desconocido'
          }`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        kds: {
          tenantUserId: member.id,
          userId: created.user.id,
          name,
          email,
          createdAt: member.created_at,
        },
      },
      { status: 201 }
    );
  }

  return NextResponse.json({ error: 'Tipo de cuenta no válido.' }, { status: 400 });
}

export async function PATCH(req: Request) {
  let body: OperationalBody;
  try {
    body = (await req.json()) as OperationalBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  const access = await requireTenantAccess(body.tenantId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const roleError = assertCanWrite(access.role);
  if (roleError) {
    return NextResponse.json({ error: roleError.error }, { status: roleError.status });
  }

  const { admin, tenantId } = access;

  if (body.type === 'DRIVER') {
    if (!body.id) {
      return NextResponse.json({ error: 'Falta el repartidor.' }, { status: 400 });
    }

    const { data: driver } = await admin
      .from('drivers')
      .select('*')
      .eq('id', body.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!driver) {
      return NextResponse.json({ error: 'Repartidor no encontrado.' }, { status: 404 });
    }

    if (body.isActive === true && driver.is_active !== true) {
      const state = await loadSubscriptionState(admin, tenantId);
      if (state.snapshot.readOnly) {
        return NextResponse.json(
          { error: 'La suscripción está vencida. Renueva tu plan para reactivar personal.' },
          { status: 403 }
        );
      }

      const { count: activeCount } = await admin
        .from('drivers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .is('deleted_at', null);

      if ((activeCount ?? 0) >= state.snapshot.maxDrivers) {
        return NextResponse.json(
          {
            error: `Has alcanzado el límite de motorizados activos de tu plan (${state.snapshot.maxDrivers}).`,
            code: 'DRIVER_QUOTA_REACHED',
          },
          { status: 409 }
        );
      }
    }

    const { data: updated, error } = await admin
      .from('drivers')
      .update({ is_active: Boolean(body.isActive) })
      .eq('id', body.id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: 'No se pudo actualizar al repartidor.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, driver: updated as Driver });
  }

  if (body.type === 'KDS') {
    if (!body.id) {
      return NextResponse.json({ error: 'Falta la cuenta KDS.' }, { status: 400 });
    }

    const { data: member } = await admin
      .from('tenant_users')
      .select('id, user_id')
      .eq('id', body.id)
      .eq('tenant_id', tenantId)
      .eq('role', 'packing')
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ error: 'Cuenta KDS no encontrada.' }, { status: 404 });
    }

    const state = await loadSubscriptionState(admin, tenantId);
    if (state.snapshot.readOnly) {
      return NextResponse.json(
        {
          error:
            'La suscripción está vencida. Renueva tu plan para modificar el personal operativo.',
          code: 'SUBSCRIPTION_EXPIRED',
        },
        { status: 403 }
      );
    }

    const updates: { password?: string; user_metadata?: Record<string, unknown> } = {};
    if (body.password) {
      if (body.password.length < 6) {
        return NextResponse.json(
          { error: 'La contraseña debe tener al menos 6 caracteres.' },
          { status: 400 }
        );
      }
      updates.password = body.password;
    }
    if (body.name?.trim()) {
      updates.user_metadata = {
        full_name: body.name.trim(),
        tenant_id: tenantId,
        operational_role: 'KDS',
      };
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No hay cambios para aplicar.' }, { status: 400 });
    }

    const { error } = await admin.auth.admin.updateUserById(member.user_id, updates);
    if (error) {
      return NextResponse.json(
        { error: `No se pudo actualizar la cuenta KDS: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Tipo de cuenta no válido.' }, { status: 400 });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const id = url.searchParams.get('id');
  const tenantId = url.searchParams.get('tenantId');

  if (!type || !id) {
    return NextResponse.json({ error: 'Faltan parámetros.' }, { status: 400 });
  }

  const access = await requireTenantAccess(tenantId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const roleError = assertCanWrite(access.role);
  if (roleError) {
    return NextResponse.json({ error: roleError.error }, { status: roleError.status });
  }

  const { admin } = access;
  const state = await loadSubscriptionState(admin, access.tenantId);
  if (state.snapshot.readOnly) {
    return NextResponse.json(
      {
        error:
          'La suscripción está vencida. Renueva tu plan para dar de baja personal operativo.',
        code: 'SUBSCRIPTION_EXPIRED',
      },
      { status: 403 }
    );
  }

  if (type === 'DRIVER') {
    const { data, error } = await access.supabase.rpc('soft_delete_driver', {
      p_driver_id: id,
    });
    const result = (data || null) as {
      success?: boolean;
      error?: string;
      released_orders?: number;
    } | null;

    if (error || !result?.success) {
      return NextResponse.json(
        { error: result?.error || error?.message || 'No se pudo dar de baja al repartidor.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      releasedOrders: result.released_orders ?? 0,
    });
  }

  if (type === 'KDS') {
    const { data: member } = await admin
      .from('tenant_users')
      .select('id, user_id')
      .eq('id', id)
      .eq('tenant_id', access.tenantId)
      .eq('role', 'packing')
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ error: 'Cuenta KDS no encontrada.' }, { status: 404 });
    }

    const { error: unlinkError } = await admin.from('tenant_users').delete().eq('id', member.id);
    if (unlinkError) {
      return NextResponse.json(
        { error: 'No se pudo revocar el acceso de la cuenta KDS.' },
        { status: 500 }
      );
    }

    const { error: authError } = await admin.auth.admin.deleteUser(member.user_id);
    if (authError) {
      return NextResponse.json(
        {
          error: `El acceso fue revocado, pero no se pudo eliminar la cuenta de autenticación: ${authError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Tipo de cuenta no válido.' }, { status: 400 });
}
