import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/superadminAccess';

interface SupportBody {
  action?: 'reset_owner_password';
  tenantId?: string;
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `Dtk-${part(4)}-${part(4)}`;
}

export async function POST(req: Request) {
  const access = await requireSuperAdmin();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: SupportBody;
  try {
    body = (await req.json()) as SupportBody;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido.' }, { status: 400 });
  }

  if (body.action !== 'reset_owner_password' || !body.tenantId) {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  const { admin } = access;

  // Buscar el owner del comercio
  const { data: ownerRow } = await admin
    .from('tenant_users')
    .select('user_id')
    .eq('tenant_id', body.tenantId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();

  if (!ownerRow?.user_id) {
    return NextResponse.json(
      { error: 'Este comercio no tiene una cuenta de propietario (owner) vinculada.' },
      { status: 404 }
    );
  }

  const { data: userInfo, error: userErr } = await admin.auth.admin.getUserById(ownerRow.user_id);
  if (userErr || !userInfo?.user) {
    return NextResponse.json(
      { error: 'No se encontró la cuenta del propietario en Supabase Auth.' },
      { status: 404 }
    );
  }

  const tempPassword = generateTempPassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(ownerRow.user_id, {
    password: tempPassword,
  });

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'No se pudo actualizar la contraseña del propietario.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    email: userInfo.user.email ?? 'sin-correo',
    tempPassword,
  });
}
