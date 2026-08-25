import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hashClave(clave: string, salt: string): string {
  return crypto.pbkdf2Sync(clave, salt, 100_000, 64, "sha512").toString("hex");
}

function generarClaveLegible(): string {
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alfabeto[crypto.randomInt(alfabeto.length)];
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const { cliente_id, usuario } = await req.json();
    if (!cliente_id || !usuario) {
      return NextResponse.json({ error: "cliente_id y usuario son requeridos." }, { status: 400 });
    }

    const usuarioLimpio = String(usuario).trim().toLowerCase();
    const claveGenerada = generarClaveLegible();
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashClave(claveGenerada, salt);

    const { data, error } = await supabaseAdmin
      .from("portal_accesos")
      .upsert(
        {
          cliente_id,
          usuario: usuarioLimpio,
          clave_hash: `${salt}:${hash}`,
          activo: true,
        },
        { onConflict: "usuario" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      acceso_id: data.id,
      usuario: usuarioLimpio,
      clave: claveGenerada,
    });
  } catch {
    return NextResponse.json({ error: "Error al generar el acceso." }, { status: 500 });
  }
}
