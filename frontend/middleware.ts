import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────
//  ShuroqX Middleware — Route Protection
//  Roles: "user" (client/specialist) | "admin"
//
//  /auth        → guest only
//  /dashboard/* → authenticated users only (role: "user")
//  /admin/*     → authenticated admins only (role: "admin")
// ─────────────────────────────────────────────

const SESSION_KEY = "shuroqx_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Parse session cookie ───────────────────
  const sessionRaw = request.cookies.get(SESSION_KEY)?.value;
  let session: { token?: string; user?: { role?: string } } | null = null;
  try {
    if (sessionRaw) session = JSON.parse(decodeURIComponent(sessionRaw));
  } catch {
    session = null;
  }

  const isAuthenticated = !!session?.token;
  const role = session?.user?.role || "user";
  const isAdmin = role === "admin";

  // ── /auth — guest only ─────────────────────
  if (pathname.startsWith("/auth")) {
    if (isAuthenticated) {
      return NextResponse.redirect(
        new URL(isAdmin ? "/admin/specialists" : "/dashboard", request.url)
      );
    }
    return NextResponse.next();
  }

  // ── /admin/* — admin only ──────────────────
  if (pathname.startsWith("/admin")) {
    if (!isAuthenticated) {
      const url = new URL("/auth", request.url);
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    if (!isAdmin) {
      // Regular user sneaking into /admin → back to dashboard
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // ── /dashboard/* — users only ──────────────
  if (pathname.startsWith("/dashboard")) {
    if (!isAuthenticated) {
      const url = new URL("/auth", request.url);
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
    if (isAdmin) {
      // Admin trying to reach dashboard → send to admin panel
      return NextResponse.redirect(new URL("/admin/specialists", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - api routes
     * - _next/static
     * - _next/image
     * - favicon.ico
     * - public files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};