"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Settings, LogOut, Search, AlertTriangle, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

const rolLabel: Record<string, string> = {
  administrador: "Administrador",
  agente_aduana: "Agente de aduana",
  deposito_aduanero: "Depósito aduanero",
  mesa: "Mesa de trabajo",
  importador: "Importador",
};

type Notificacion = { texto: string; href: string; tipo: "novedad" | "cda" };
type Resultado = { texto: string; sub: string; href: string };

export function Topbar() {
  const supabase = createClient();
  const router = useRouter();

  const [nombre, setNombre] = useState("Cargando…");
  const [rol, setRol] = useState("");

  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showLogout, setShowLogout] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [showResultados, setShowResultados] = useState(false);
  const buscarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: perfil } = await supabase
        .from("perfiles")
        .select("nombre, apellido, rol")
        .eq("id", user.id)
        .single();

      if (perfil) {
        setNombre(`${perfil.nombre}${perfil.apellido ? " " + perfil.apellido : ""}`);
        setRol(rolLabel[perfil.rol] ?? perfil.rol);
      } else {
        setNombre(user.email ?? "Usuario");
      }

      const [novRes, cdaRes] = await Promise.all([
        supabase
          .from("novedades")
          .select("tipo, ordenes_dap(numero_dap)")
          .eq("resuelto", false)
          .limit(5),
        supabase.from("cdas").select("folio").is("numero_cda", null).limit(5),
      ]);

      const notifs: Notificacion[] = [];
      (novRes.data ?? []).forEach((n) => {
        const orden = n.ordenes_dap as unknown as { numero_dap: string } | null;
        notifs.push({
          texto: `Novedad pendiente en ${orden?.numero_dap ?? "una orden"}`,
          href: "/novedades",
          tipo: "novedad",
        });
      });
      (cdaRes.data ?? []).forEach((c) => {
        notifs.push({ texto: `CDA #${c.folio} sin número asignado`, href: "/cda", tipo: "cda" });
      });
      setNotificaciones(notifs);
    })();
  }, [supabase]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (buscarRef.current && !buscarRef.current.contains(e.target as Node)) {
        setShowResultados(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function buscar(texto: string) {
    setBusqueda(texto);
    if (texto.trim().length < 2) {
      setResultados([]);
      setShowResultados(false);
      return;
    }

    const t = `%${texto}%`;
    const [ordenesRes, clientesRes, cdasRes] = await Promise.all([
      supabase.from("ordenes_dap").select("numero_dap, cdas(clientes(nombre))").ilike("numero_dap", t).limit(4),
      supabase.from("clientes").select("nombre, ruc_ci").or(`nombre.ilike.${t},ruc_ci.ilike.${t}`).limit(4),
      supabase.from("cdas").select("folio, numero_cda, clientes(nombre)").ilike("numero_cda", t).limit(4),
    ]);

    const res: Resultado[] = [];
    (ordenesRes.data ?? []).forEach((o) => {
      const cda = o.cdas as unknown as { clientes: { nombre: string } | null } | null;
      res.push({
        texto: `Orden ${o.numero_dap}`,
        sub: cda?.clientes?.nombre ?? "Ingreso",
        href: "/ingreso",
      });
    });
    (clientesRes.data ?? []).forEach((c) => {
      res.push({ texto: c.nombre, sub: `Cliente · ${c.ruc_ci}`, href: "/clientes" });
    });
    (cdasRes.data ?? []).forEach((c) => {
      const cli = c.clientes as unknown as { nombre: string } | null;
      res.push({
        texto: `CDA ${c.numero_cda ?? `#${c.folio}`}`,
        sub: cli?.nombre ?? "CDA",
        href: "/cda",
      });
    });

    setResultados(res);
    setShowResultados(true);
  }

  async function salir() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-3.5 px-6.5 py-3.5 border-b border-border relative z-40">
        <div ref={buscarRef} className="relative flex-1 max-w-[340px]">
          <div className="flex items-center gap-2 card px-3 py-2">
            <Search size={14} className="text-text-faint shrink-0" />
            <input
              value={busqueda}
              onChange={(e) => buscar(e.target.value)}
              onFocus={() => busqueda.length >= 2 && setShowResultados(true)}
              placeholder="Buscar orden, cliente o CDA…"
              className="bg-transparent text-[12.5px] outline-none w-full placeholder:text-text-faint"
            />
          </div>
          {showResultados && (
            <div className="absolute top-full left-0 right-0 mt-1 card p-1.5 z-[100] max-h-[300px] overflow-y-auto">
              {resultados.length === 0 ? (
                <p className="text-[12px] text-text-faint px-3 py-2">Sin resultados.</p>
              ) : (
                resultados.map((r, i) => (
                  <Link
                    key={i}
                    href={r.href}
                    onClick={() => setShowResultados(false)}
                    className="block px-3 py-2 rounded-lg hover:bg-white/[0.04]"
                  >
                    <p className="text-[12.5px]">{r.texto}</p>
                    <p className="text-[11px] text-text-faint">{r.sub}</p>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3.5">
          <div className="relative">
            <button
              onClick={() => {
                setShowNotif(!showNotif);
                setShowConfig(false);
              }}
              className="w-8 h-8 rounded-[9px] card flex items-center justify-center text-text-dim hover:text-text relative"
              aria-label="Notificaciones"
            >
              <Bell size={15} />
              {notificaciones.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red text-white text-[9px] flex items-center justify-center font-bold">
                  {notificaciones.length}
                </span>
              )}
            </button>
            {showNotif && (
              <div className="absolute top-full right-0 mt-1.5 w-[300px] card p-1.5 z-[100] max-h-[360px] overflow-y-auto">
                <p className="text-[11px] uppercase tracking-wide text-text-faint px-3 py-2">Notificaciones</p>
                {notificaciones.length === 0 ? (
                  <p className="text-[12px] text-text-faint px-3 py-3">Todo al día. Sin pendientes.</p>
                ) : (
                  notificaciones.map((n, i) => (
                    <Link
                      key={i}
                      href={n.href}
                      onClick={() => setShowNotif(false)}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/[0.04]"
                    >
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                          n.tipo === "novedad" ? "bg-red/[0.16] text-[#fca5a5]" : "bg-amber/[0.16] text-[#fbbf24]"
                        }`}
                      >
                        {n.tipo === "novedad" ? <AlertTriangle size={12} /> : <FileText size={12} />}
                      </span>
                      <span className="text-[12px] text-text-dim">{n.texto}</span>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowConfig(!showConfig);
                setShowNotif(false);
              }}
              className="w-8 h-8 rounded-[9px] card flex items-center justify-center text-text-dim hover:text-text"
              aria-label="Configuración"
            >
              <Settings size={15} />
            </button>
            {showConfig && (
              <div className="absolute top-full right-0 mt-1.5 w-[220px] card p-1.5 z-[100]">
                <p className="text-[11px] uppercase tracking-wide text-text-faint px-3 py-2">Configuración</p>
                <Link href="/usuarios" onClick={() => setShowConfig(false)} className="block px-3 py-2 rounded-lg hover:bg-white/[0.04] text-[12.5px] text-text-dim">
                  Gestión de usuarios
                </Link>
                <Link href="/racks" onClick={() => setShowConfig(false)} className="block px-3 py-2 rounded-lg hover:bg-white/[0.04] text-[12.5px] text-text-dim">
                  Racks y ubicaciones
                </Link>
                <Link href="/reportes" onClick={() => setShowConfig(false)} className="block px-3 py-2 rounded-lg hover:bg-white/[0.04] text-[12.5px] text-text-dim">
                  Reportes
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-amber-400 to-orange-500" />
            <div className="leading-tight">
              <p className="text-[12.5px]">{nombre}</p>
              <p className="text-[10.5px] text-text-faint">{rol}</p>
            </div>
          </div>

          <button
            onClick={() => setShowLogout(true)}
            className="w-8 h-8 rounded-[9px] card flex items-center justify-center text-text-dim hover:text-red-300"
            aria-label="Cerrar sesión"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {showLogout && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="card w-full max-w-[360px] p-6 relative text-center">
            <div className="w-12 h-12 rounded-full bg-red/[0.14] flex items-center justify-center mx-auto mb-4">
              <LogOut size={20} className="text-[#fca5a5]" />
            </div>
            <h2 className="text-[17px] font-semibold mb-1.5">¿Cerrar sesión?</h2>
            <p className="text-[12.5px] text-text-faint mb-5">
              Tendrás que volver a iniciar sesión para acceder al sistema.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowLogout(false)} className="btn-secondary flex-1 text-[13px] font-semibold py-2.5 rounded-lg">
                Cancelar
              </button>
              <button onClick={salir} className="flex-1 text-[13px] font-semibold py-2.5 rounded-lg bg-red/90 text-white hover:bg-red">
                Sí, salir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
