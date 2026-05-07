declare const process: {
  env?: {
    MAINTENANCE_MODE?: string;
  };
};

type NextRequestLike = {
  nextUrl: URL;
  cookies: {
    get(name: string): { value: string } | undefined;
  };
  url: string;
};

type NextResponseLike = {
  kind: "next" | "redirect";
  redirectTo?: URL;
};

const NextResponse = {
  next(): NextResponseLike {
    return { kind: "next" };
  },
  redirect(url: URL): NextResponseLike {
    return { kind: "redirect", redirectTo: url };
  },
};

const MAINTENANCE = process.env?.MAINTENANCE_MODE === "true";

export function middleware(request: NextRequestLike) {
  if (!MAINTENANCE) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/") ||
    pathname.includes(".")
  ) return NextResponse.next();
  const cookie = request.cookies.get("beomz_access");
  if (cookie?.value === "1") return NextResponse.next();
  return NextResponse.redirect(new URL("/maintenance", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
