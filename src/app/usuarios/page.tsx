"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Pencil, X } from "lucide-react";
import { Toast } from "@/components/Feedback";

export const dynamic = "force-dynamic";

type Rol = "administrador" | "agente_aduana" | "deposito_aduanero" | "mesa" | "importador";

type Perfil = {
  id: string;
  nombre: string;
  apellido: string | null;
  rol: Rol;
  estado: boolean;
  creado_en: string;
};

const rolLabel: Record<Rol, string> = {
  administrador: "Administrador",
  agente_aduana: "Agente de aduana",
  deposito_aduanero: "Depósito aduanero",
  mesa: "Mesa de trabajo",
  importador: "Importador",
};

const rolColor: Record<Rol, string> = {
  administrador: "bg-accent/[0.18] text-[#c4b8ff]",
  agente_aduana: "bg-green/[0.14] text-[#6ee7b7]",
  deposito_aduanero: "bg-amber/[0.14] text-[#fbbf24]",
  mesa: "bg-white/[0.08] text-text-dim",
  importador: "bg-red/[0.12] text-[#fca5a5]",
};

export default function UsuariosPage() {
  const supabase = createClient();

  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [editando, setEditando] = useState<Perfil | null>(null);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [rol, setRol] = useState<Rol>("deposito_aduanero");
  const [estado, setEstado] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("perfiles").select("*").order("creado_en");
    if (error) {
      setErrorMsg(
        error.message.includes("permission")
          ? "Sin permisos para leer perfiles. Falta correr auth_trigger_y_policy.sql en Supabase."
          : error.message
      );
    } else {
      setPerfiles((data as Perfil[]) ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function abrirEditar(p: Perfil) {
    setEditando(p);
    setNombre(p.nombre);
    setApellido(p.apellido ?? "");
    setRol(p.rol);
    setEstado(p.estado);
    setErrorMsg(null);
  }

  async function guardar() {
    if (!editando) return;
    setSaving(true);
    const { error } = await supabase
      .from("perfiles")
      .update({ nombre: nombre.trim(), apellido: apellido.trim() || null, rol, estado })
      .eq("id", editando.id);
    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setEditando(null);
    setToast("Usuario actualizado correctamente.");
    cargar();
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/usuarios" />

      <main className="flex-1 min-w-0">
        <Topbar />

        <div className="px-6.5 pt-5.5 pb-10">
          <h1 className="text-[21px] font-semibold mb-0.5">Usuarios</h1>
          <p className="text-[12.5px] text-text-faint mb-4.5">
            {perfiles.length} usuario{perfiles.length !== 1 ? "s" : ""} registrado
            {perfiles.length !== 1 ? "s" : ""}
          </p>

          <div className="mb-4.5 px-4 py-3 rounded-lg bg-accent/[0.08] border border-accent-2/20 text-[12px] text-text-dim">
            Para crear un usuario nuevo: Supabase Dashboard → <b>Authentication → Users → Add user</b>{" "}
            (correo + contraseña). El sistema le crea el perfil automáticamente — luego ajusta su
            nombre y rol aquí.
          </div>

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="grid grid-cols-[1.6fr_1.3fr_100px_90px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
              <span>Nombre</span>
              <span>Rol</span>
              <span>Estado</span>
              <span></span>
            </div>

            {loading ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">Cargando usuarios…</p>
            ) : perfiles.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">
                No hay perfiles todavía — crea un usuario desde Supabase.
              </p>
            ) : (
              perfiles.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[1.6fr_1.3fr_100px_90px] gap-3 px-5 py-3.5 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02]"
                >
                  <span className="text-[13px] font-medium">
                    {p.nombre} {p.apellido}
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full w-fit ${rolColor[p.rol]}`}>
                    {rolLabel[p.rol]}
                  </span>
                  <span
                    className={`text-[11.5px] ${p.estado ? "text-[#6ee7b7]" : "text-text-faint"}`}
                  >
                    {p.estado ? "Activo" : "Inactivo"}
                  </span>
                  <button
                    onClick={() => abrirEditar(p)}
                    className="w-7 h-7 rounded-lg card flex items-center justify-center text-text-dim hover:text-text"
                    aria-label="Editar"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {editando && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-[400px] p-6 relative">
            <button
              onClick={() => setEditando(null)}
              className="absolute top-4 right-4 text-text-faint hover:text-text"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <h2 className="text-[17px] font-semibold mb-4">Editar usuario</h2>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Nombre</label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Apellido</label>
                <input
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Rol</label>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value as Rol)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  {(Object.keys(rolLabel) as Rol[]).map((r) => (
                    <option key={r} value={r}>
                      {rolLabel[r]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-text-dim">
                <input
                  type="checkbox"
                  checked={estado}
                  onChange={(e) => setEstado(e.target.checked)}
                />
                Usuario activo
              </label>
            </div>

            {errorMsg && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                {errorMsg}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={guardar}
                disabled={saving}
                className="btn-primary flex-1 text-[13px] font-semibold py-2 rounded-lg disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button
                onClick={() => setEditando(null)}
                className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
