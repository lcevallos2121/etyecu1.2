"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalLoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/portal-importador/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, clave }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar sesión.");
        return;
      }
      router.push("/portal-importador/tracking");
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0e17] px-4">
      <div className="w-full max-w-[380px]">
        <div className="flex flex-col items-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-etyecu-blanco.png" alt="ETYECU" className="h-14 mb-3" />
          <p className="text-[13px] text-[#8b8a9a]">Portal de seguimiento de carga</p>
        </div>

        <form
          onSubmit={iniciarSesion}
          className="bg-[#17151f] border border-[#2a2836] rounded-2xl p-6"
        >
          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[12.5px] text-red-300">
              {error}
            </div>
          )}

          <label className="text-[11.5px] text-[#8b8a9a] block mb-1.5">Usuario</label>
          <input
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            className="w-full bg-[#0f0e17] border border-[#2a2836] rounded-lg px-3.5 py-2.5 text-[14px] text-white outline-none focus:border-[#7c6cf0] mb-4 transition-colors"
            placeholder="tu-usuario"
          />

          <label className="text-[11.5px] text-[#8b8a9a] block mb-1.5">Clave</label>
          <input
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            type="password"
            autoComplete="current-password"
            className="w-full bg-[#0f0e17] border border-[#2a2836] rounded-lg px-3.5 py-2.5 text-[14px] text-white outline-none focus:border-[#7c6cf0] mb-6 transition-colors"
            placeholder="••••••••"
          />

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-[#7c6cf0] hover:bg-[#6d5de0] text-white font-semibold text-[14px] py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {cargando ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <p className="text-center text-[11.5px] text-[#5c5a6b] mt-5">
          ¿No tienes tus datos de acceso? Contacta a tu asesor en ETYECU.
        </p>
      </div>
    </div>
  );
}
