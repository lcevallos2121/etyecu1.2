import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import crypto from "crypto";

function hashClave(clave: string, salt: string): string {
  return crypto.pbkdf2Sync(clave, salt, 100_000, 64, "sha512").toString("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { usuario, clave } = await req.json();
    if (!usuario || !clave) {
      return NextResponse.json({ error: "Usuario y clave son requeridos." }, { status: 400 });
    }

    const { data: acceso, error } = await getSupabaseAdmin()
      .from("portal_accesos")
      .select("id, cliente_nombre, usuario, clave_hash, activo")
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

    await getSupabaseAdmin()
      .from("portal_accesos")
      .update({ ultimo_acceso: new Date().toISOString() })
      .eq("id", acceso.id);

    const response = NextResponse.json({
      ok: true,
      cliente_nombre: acceso.cliente_nombre,
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
