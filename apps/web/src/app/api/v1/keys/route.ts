import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateApiKey } from '@/lib/auth/apiKey';

// GET /api/v1/keys - Listar API keys del comercio autenticado
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const { data: restUser } = await supabase
    .from('restaurant_users')
    .select('restaurant_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!restUser) {
    return NextResponse.json({ error: 'Comercio no asociado.' }, { status: 404 });
  }

  const { data: keys, error } = await supabase
    .from('merchant_api_keys')
    .select('id, name, key_prefix, is_active, last_used_at, created_at')
    .eq('restaurant_id', restUser.restaurant_id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Error al consultar claves.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, keys: keys || [] });
}

// POST /api/v1/keys - Generar una nueva API Key para el comercio
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const { data: restUser } = await supabase
    .from('restaurant_users')
    .select('restaurant_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!restUser) {
    return NextResponse.json({ error: 'Comercio no asociado.' }, { status: 404 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const keyName = body.name?.trim() || 'Clave API Producción';

    const { rawKey, keyHash, keyPrefix } = await generateApiKey();

    const { data: keyRecord, error } = await supabase
      .from('merchant_api_keys')
      .insert({
        restaurant_id: restUser.restaurant_id,
        name: keyName,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        is_active: true,
      })
      .select('id, name, key_prefix, is_active, created_at')
      .single();

    if (error || !keyRecord) {
      return NextResponse.json({ error: 'Error al guardar la clave API.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      raw_key: rawKey, // Se muestra solo una vez
      key: keyRecord,
      message: 'Clave API generada con éxito. Guarde este token de forma segura, no volverá a mostrarse completo.',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Error interno al generar clave.' }, { status: 500 });
  }
}
