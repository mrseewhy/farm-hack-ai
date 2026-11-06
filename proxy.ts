import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const ADMIN_ROUTE_PREFIXES = ["/admin"];
const FARMER_ROUTE_PREFIXES = ["/profile", "/chat"];
const AUTH_ROUTES = ["/login", "/signup", "/redirect"];

function isRoute(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Read session from incoming request headers
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  const isAuthenticated = !!session?.user;
  const role = session?.user?.role;

  const isAdminRoute = isRoute(pathname, ADMIN_ROUTE_PREFIXES);
  const isFarmerRoute = isRoute(pathname, FARMER_ROUTE_PREFIXES);
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  // Helper: sign out (clear session cookie) and redirect to login
  const signOutAndRedirect = (to: string) => {
    const response = NextResponse.redirect(new URL(to, request.url));
    response.cookies.delete("better-auth.session_token");
    return response;
  };

  // Not authenticated: block protected routes, allow everything else
  if (!isAuthenticated) {
    if (isAdminRoute || isFarmerRoute) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // Authenticated on auth pages (login/signup/redirect) → send to role destination
  if (isAuthRoute) {
    if (role === "admin") {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    }
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  // Admin routes: only admins allowed
  if (isAdminRoute) {
    if (role === "admin") return NextResponse.next();
    if (role === "farmer") {
      return NextResponse.redirect(new URL("/chat", request.url));
    }
    // Unknown role → sign out + login
    return signOutAndRedirect("/login");
  }

  // Farmer routes: only farmers allowed
  if (isFarmerRoute) {
    if (role === "farmer") return NextResponse.next();
    if (role === "admin") {
      return NextResponse.redirect(new URL("/chat", request.url));
    }
    // Unknown role → sign out + login
    return signOutAndRedirect("/login");
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /api/* (Better Auth owns /api/auth/*)
     * - _next/static, _next/image, _next/data (framework internals)
     * - favicon.ico, sitemap.xml, robots.txt (static files)
     */
    "/((?!api|_next/static|_next/image|_next/data|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
