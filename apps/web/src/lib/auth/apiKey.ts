import { createClient } from '@supabase/supabase-js';

// Server-side helper to authenticate B2B requests via x-api-key header
export async function authenticateApiKey(req: Request): Promise<{ restaurantId: string; keyId: string } | null> {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('X-API-Key') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!apiKey || !apiKey.startsWith('dtk_')) {
    return null;
  }

  // Hash key with SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Use service role or anon key to query merchant_api_keys
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'tu-service-role-key-aqui'
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: keyRecord, error } = await supabase
    .from('merchant_api_keys')
    .select('id, restaurant_id, is_active')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !keyRecord) {
    return null;
  }

  // Update last_used_at timestamp in background
  supabase
    .from('merchant_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id)
    .then();

  return { restaurantId: keyRecord.restaurant_id, keyId: keyRecord.id };
}

// Generate a secure API key with prefix
export async function generateApiKey(): Promise<{ rawKey: string; keyHash: string; keyPrefix: string }> {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const randomHex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const rawKey = `dtk_live_${randomHex}`;
  const keyPrefix = rawKey.substring(0, 14) + '...';

  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return { rawKey, keyHash, keyPrefix };
}

// Generate random 4-digit numeric PIN
export function generatePinCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
