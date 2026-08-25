import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// El importador no entra al sistema interno en absoluto: va a su propio
// portal en /portal-importador (construido aparte, con su propio login).
const RUTA_PORTAL_IMPORTADOR = "/portal-importador";

// Rutas exclusivas del módulo de Etiquetado.
const ES_RUTA_ETIQUETADO = (path: string) => path.startsWith("/etiquetado");

// Rutas exclusivas del sistema DAP (todo lo que no es Etiquetado, login,
// ni el portal de importador). El rol "etiquetado" no debe entrar aquí.
const ES_RUTA_DAP = (path: string) =>
  !ES_RUTA_ETIQUETADO(path) &&
  !path.startsWith("/login") &&
  !path.startsWith(RUTA_PORTAL_IMPORTADOR);

// Rutas dentro del DAP que solo puede ver "administrador" (ni siquiera
// deposito_aduanero ni etiquetado).
const RUTAS_SOLO_ADMIN_EN_DAP = ["/usuarios", "/tracking-importadores"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLoginPage = path.startsWith("/login");
  // Excluye tanto las páginas del portal (/portal-importador/...) como sus
  // API routes (/api/portal-importador/...), que tienen su propia sesión.
  const isPortalImportador =
    path.startsWith(RUTA_PORTAL_IMPORTADOR) || path.startsWith("/api/portal-importador");

  // El portal de importador tiene su propio login/sesión aparte; el
  // middleware del sistema interno no debe interferir con esas rutas.
  if (isPortalImportador) {
    return response;
  }

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Restricción por rol. Si la consulta del rol falla por cualquier motivo,
  // NO se bloquea a nadie (evita dejar a todo el sistema sin acceso por un
  // error de red/consulta) — solo se redirige cuando el rol se conoce con
  // certeza y no corresponde a esa zona del sistema.
  if (user) {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("rol")
      .eq("id", user.id)
      .maybeSingle();

    const rol = perfil?.rol;

    if (rol) {
      // El rol "etiquetado" solo puede estar en /etiquetado/*
      if (rol === "etiquetado" && ES_RUTA_DAP(path)) {
        const url = request.nextUrl.clone();
        url.pathname = "/etiquetado";
        return NextResponse.redirect(url);
      }

      // deposito_aduanero y otros roles del DAP no entran a Etiquetado
      if (rol !== "administrador" && rol !== "etiquetado" && ES_RUTA_ETIQUETADO(path)) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return NextResponse.redirect(url);
      }

      // Rutas del DAP exclusivas de administrador (ej. /usuarios)
      if (
        rol !== "administrador" &&
        RUTAS_SOLO_ADMIN_EN_DAP.some((r) => path.startsWith(r))
      ) {
        const url = request.nextUrl.clone();
        url.pathname = rol === "etiquetado" ? "/etiquetado" : "/";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  // Excluye también archivos estáticos servidos desde public/ (logos, íconos,
  // etc.) — sin esto, el middleware los trataba como rutas protegidas y
  // redirigía a /login cuando no había sesión (ej. en el portal externo).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)",
  ],
};
