import { NextResponse } from 'next/server';
import { assertCanWrite, requireTenantAccess } from '@/lib/auth/tenantAccess';

interface BusinessBody {
  tenantId?: string;
  name?: string;
  phone?: string;
  address?: string;
  ruc?: string | null;
  isOpen?: boolean;
}

export async function PATCH(req: Request) {
  let body: BusinessBody;
  try {
    body = (await req.json()) as BusinessBody;
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

  // Interruptor rápido de recepción de pedidos (no requiere reenviar el formulario).
  if (typeof body.isOpen === 'boolean' && !body.name) {
    const { data: toggled, error: toggleError } = await access.admin
      .from('tenants')
      .update({ is_open: body.isOpen })
      .eq('id', access.tenantId)
      .select()
      .single();

    if (toggleError || !toggled) {
      return NextResponse.json(
        { error: 'No se pudo actualizar el estado operativo del local.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, tenant: toggled });
  }

  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const address = (body.address || '').trim();
  const ruc = (body.ruc || '').replace(/\D/g, '');

  if (name.length < 2 || name.length > 100) {
    return NextResponse.json(
      { error: 'La razón social debe tener entre 2 y 100 caracteres.' },
      { status: 400 }
    );
  }
  if (phone.replace(/\D/g, '').length < 6) {
    return NextResponse.json({ error: 'Ingresa un teléfono de contacto válido.' }, { status: 400 });
  }
  if (address.length < 5) {
    return NextResponse.json(
      { error: 'Ingresa la dirección del centro de despacho.' },
      { status: 400 }
    );
  }
  if (ruc && ruc.length !== 8 && ruc.length !== 11) {
    return NextResponse.json(
      { error: 'El identificador fiscal debe ser un RUC de 11 dígitos o un DNI de 8 dígitos.' },
      { status: 400 }
    );
  }

  const { data: updated, error } = await access.admin
    .from('tenants')
    .update({
      name,
      phone,
      address,
      ruc: ruc || null,
      ...(typeof body.isOpen === 'boolean' ? { is_open: body.isOpen } : {}),
    })
    .eq('id', access.tenantId)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: `No se pudo actualizar el negocio: ${error?.message || 'error desconocido'}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, tenant: updated });
}
