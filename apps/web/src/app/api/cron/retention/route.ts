import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runRetentionCycle } from '@/lib/server/retention';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Trabajo programado de retención.
 *
 * Lo invoca el cron de la plataforma de despliegue con
 * `Authorization: Bearer $CRON_SECRET`. Emite los avisos previos y
 * ejecuta las purgas cuyo plazo venció.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET no está configurado en el entorno.' },
      { status: 503 }
    );
  }

  const authorization = req.headers.get('authorization') ?? '';
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dryRun') === '1';

  try {
    const result = await runRetentionCycle(createAdminClient(), { dryRun });
    return NextResponse.json({ success: true, dryRun, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido en el ciclo de retención.';
    console.error('Ciclo de retención fallido:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
