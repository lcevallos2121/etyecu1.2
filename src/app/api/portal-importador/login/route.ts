import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Cliente con permisos de servidor (service role) — solo se usa aquí, en
// una API route que corre en el servidor, nunca se expone al navegador.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hashClave(clave: string, salt: string): string {
  return crypto.pbkdf2Sync(clave, salt, 100_000, 64, "sha512").toString("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { usuario, clave } = await req.json();
    if (!usuario || !clave) {
      return NextResponse.json({ error: "Usuario y clave son requeridos." }, { status: 400 });
    }

    const { data: acceso, error } = await supabaseAdmin
      .from("portal_accesos")
      .select("id, cliente_id, usuario, clave_hash, activo")
      .eq("usuario", usuario.trim().toLowerCase())
      .maybeSingle();

    if (error || !acceso) {
      return NextResponse.json({ error: "Usuario o clave incorrectos." }, { status: 401 });
    }

    if (!acceso.activo) {
      return NextResponse.json({ error: "Este acceso ha sido desactivado." }, { status: 403 });
    }

    // clave_hash guarda "salt:hash" concatenados
    const [salt, hashGuardado] = acceso.clave_hash.split(":");
    const hashIngresado = hashClave(clave, salt);

    if (hashIngresado !== hashGuardado) {
      return NextResponse.json({ error: "Usuario o clave incorrectos." }, { status: 401 });
    }

    // Token de sesión simple: se guarda en una cookie httpOnly
    const token = crypto.randomBytes(32).toString("hex");

    await supabaseAdmin
      .from("portal_accesos")
      .update({ ultimo_acceso: new Date().toISOString() })
      .eq("id", acceso.id);

    const response = NextResponse.json({
      ok: true,
      cliente_id: acceso.cliente_id,
    });

    // Cookie de sesión del portal (separada de la sesión del sistema interno)
    response.cookies.set("portal_sesion", `${acceso.id}:${token}`, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 días
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Error al iniciar sesión." }, { status: 500 });
  }
}
