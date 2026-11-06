import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/datenschutz", "/auth"];

/**
 * Erneuert die Supabase-Sitzung bei jeder Anfrage und leitet nicht angemeldete
 * Besucher zur Anmeldung. Die eigentliche Autorisierung erfolgt zusätzlich serverseitig
 * (requireUser) und in der Datenbank (RLS).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return new NextResponse("Register ist noch nicht konfiguriert (Supabase-Umgebungsvariablen fehlen).", {
      status: 503,
    });
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!signedIn && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    if (pathname !== "/") target.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(target);
  }
  if (signedIn && pathname === "/login") {
    const target = request.nextUrl.clone();
    target.pathname = "/";
    target.search = "";
    return NextResponse.redirect(target);
  }
  return response;
}

export const config = {
  // Symbole und Manifest ohne Anmeldung, das Handy lädt sie ohne Sitzung
  matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-icon|icons/|manifest.webmanifest|api/cron|robots.txt).*)"],
};
