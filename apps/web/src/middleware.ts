import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Handle CORS for B2B API endpoints (/api/v1/*)
  if (request.nextUrl.pathname.startsWith('/api/v1')) {
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    supabaseResponse.headers.set('Access-Control-Allow-Origin', '*');
    supabaseResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    supabaseResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const dtkTenant = request.cookies.get('dtk_tenant')?.value;
  const dtkRole = request.cookies.get('dtk_role')?.value;

  if (!user && !dtkTenant && !dtkRole && (request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/superadmin'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|p/|tracking/|login).*)',
  ],
};
