"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import {
  ArrowLeft, Package, Building2, Plus, Upload, Trash2, RefreshCw, X, Users, BarChart3, FileText,
  Check, HelpCircle,
} from "lucide-react";
import { ConfirmModal, Toast } from "@/components/Feedback";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

type EtqOrden = {
  id: string; numero_etq: string; origen: "etyecu" | "externo";
  cliente_nombre: string | null; tipo_producto: string | null;
  estado: string; observaciones: string | null; fecha: string;
  tallas: string[] | null;
  proveedor_factura: string | null;
  bodega_proceso: string | null;
  reglamento_tecnico: string | null;
  supervisora: string | null;
  // Datos de contacto del cliente (para la cabecera del informe): pueden venir
  // del cliente de etiquetado externo, o del cliente de la orden DAP (ETYECU)
  ruc_cliente: string | null;
  direccion_cliente: string | null;
};

type Item = {
  id: string;
  palet: string | null;
  codigo: string | null;
  descripcion: string | null;
  marca: string | null;
  color: string | null;
  composicion: string | null;
  pais: string | null;
  tienda: string | null;
  tallas: string | null;
  tallas_detalle: Record<string, number> | null;
  cajas: string | null;
  cantidad_contada: number;
  cantidad_factura: number;
  tipo_etiqueta: string | null;
  novedad: string | null;
  tiene_codigo: boolean | null;
  tiene_talla: boolean | null;
  codigo_nuevo: boolean | null;
  inen_marquilla: "inen" | "marquilla" | null;
};

const TALLAS_ROPA = ["XS", "S", "M", "L", "XL", "XXL"];
const TALLAS_CALZADO = ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"];

type Mesa = {
  id: string;
  nombre: string;
  integrantes: string[] | null;
  activa: boolean;
};

type Variante = {
  id: string;
  item_id: string;
  color: string | null;
  composicion: string | null;
  cajas: string | null;
  cantidad: number;
  tallas_detalle: Record<string, number> | null;
  tiene_codigo: boolean | null;
  tiene_talla: boolean | null;
  codigo_nuevo: boolean | null;
  inen_marquilla: "inen" | "marquilla" | null;
};

// Suma lo que está dentro de paréntesis: "164(24) 165(24)" -> 48
// También maneja rangos de calzado "179 A 182(96)" -> 96
function sumarCajas(texto: string | null | undefined): number {
  if (!texto) return 0;
  const nums = String(texto).match(/\((\d+)\)/g);
  if (!nums) return 0;
  return nums.reduce((a, n) => a + Number(n.replace(/[()]/g, "")), 0);
}

// Suma las cantidades del desglose por talla
function sumarTallas(detalle: Record<string, number> | null | undefined): number {
  if (!detalle) return 0;
  return Object.values(detalle).reduce((a, n) => a + Number(n || 0), 0);
}

// Orden lógico conocido de tallas de ropa. JSONB de Postgres NO garantiza
// conservar el orden en que se ingresaron las claves de un objeto — por
// eso las tallas podían verse mezcladas (ej. "L M S" en vez de "S M L",
// aunque se hubieran escrito en ese orden). Se ordena explícitamente según
// esta secuencia conocida; cualquier talla que no esté en la lista
// (numeración de calzado, tallas especiales, etc.) se ordena numérica o
// alfabéticamente como respaldo.
const ORDEN_TALLAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL", "4XL"];

function ordenarClavesDeTallas(claves: string[]): string[] {
  return [...claves].sort((a, b) => {
    const ia = ORDEN_TALLAS.indexOf(a.toUpperCase());
    const ib = ORDEN_TALLAS.indexOf(b.toUpperCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    const na = Number(a);
    const nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

// Extrae la "categoría" de una descripción tomando su primera palabra útil:
// se salta números/medidas sueltas (ej. "7", "5") y abreviaturas técnicas
// con barra (ej. "W/LINER", "W/CUT"), para que "7\" STRETCH WOVEN SHORT..."
// agrupe como "STRETCH" y no como "7" o "W/LINER". Así, por ejemplo,
// "BLUSA KIMONO", "BLUSA LARGA" y "BLUSA" se agrupan todas bajo "BLUSA".
function categoriaDeDescripcion(descripcion: string): string {
  const palabras = descripcion.trim().split(/\s+/);
  for (const p of palabras) {
    const limpio = p.replace(/^[()"'.,;:]+|[()"'.,;:]+$/g, "");
    if (limpio.length === 0) continue;
    if (/^\d+$/.test(limpio)) continue; // solo dígitos (medidas: 7, 5...)
    if (/^W\//i.test(limpio)) continue; // abreviaturas técnicas: W/LINER, W/CUT...
    return limpio.toUpperCase();
  }
  return (palabras[0] ?? "SIN CATEGORÍA").toUpperCase();
}

// Botón de 3 estados: null (gris, sin definir) -> true (verde, Sí) -> false
// (rojo, No) -> vuelve a null. Un clic avanza al siguiente estado.
function BotonTresEstados({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  function siguienteEstado() {
    if (valor === null) onChange(true);
    else if (valor === true) onChange(false);
    else onChange(null);
  }

  const estilos =
    valor === true
      ? "bg-green/[0.18] text-[#6ee7b7] border-green/30"
      : valor === false
      ? "bg-red/[0.18] text-[#fca5a5] border-red/30"
      : "bg-white/[0.04] text-text-faint border-border";

  return (
    <button
      type="button"
      onClick={siguienteEstado}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11.5px] font-medium transition-colors ${estilos}`}
      title="Clic para cambiar: sin definir → Sí → No"
    >
      {valor === true ? <Check size={13} /> : valor === false ? <X size={13} /> : <HelpCircle size={13} />}
      {label}
    </button>
  );
}

// Botón de 3 estados para Inen/Marquilla: gris (sin definir) -> amarillo
// (Inen) -> rojo (Marquilla) -> vuelve a gris. A diferencia de
// BotonTresEstados, aquí no es un Sí/No sino dos opciones mutuamente
// excluyentes (o es Inen, o es Marquilla, o no se ha definido).
function BotonInenMarquilla({
  valor,
  onChange,
}: {
  valor: "inen" | "marquilla" | null;
  onChange: (v: "inen" | "marquilla" | null) => void;
}) {
  function siguienteEstado() {
    if (valor === null) onChange("inen");
    else if (valor === "inen") onChange("marquilla");
    else onChange(null);
  }

  const estilos =
    valor === "inen"
      ? "bg-amber/[0.18] text-[#fbbf24] border-amber/30"
      : valor === "marquilla"
      ? "bg-red/[0.18] text-[#fca5a5] border-red/30"
      : "bg-white/[0.04] text-text-faint border-border";

  const texto = valor === "inen" ? "Inen" : valor === "marquilla" ? "Marquilla" : "Inen/Marquilla";

  return (
    <button
      type="button"
      onClick={siguienteEstado}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11.5px] font-medium transition-colors ${estilos}`}
      title="Clic para cambiar: sin definir → Inen → Marquilla"
    >
      {valor === "inen" || valor === "marquilla" ? <Check size={13} /> : <HelpCircle size={13} />}
      {texto}
    </button>
  );
}

// Buscador con autocompletado para el campo Composición, contra el
// catálogo normalizado — evita que la misma composición se escriba de
// muchas formas distintas (ej. "100% Poliéster" vs "10O %poliester"),
// que era lo que hacía inútil el filtro de composición al imprimir.
// Si el texto escrito no existe en el catálogo, muestra un botón para
// agregarlo de una vez, sin bloquear la captura.
function BuscadorComposicion({
  valor,
  onChange,
  catalogo,
  onAgregarAlCatalogo,
}: {
  valor: string;
  onChange: (v: string) => void;
  catalogo: string[];
  onAgregarAlCatalogo: (texto: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);

  const sugerencias = useMemo(() => {
    const q = valor.trim().toLowerCase();
    if (!q) return catalogo.slice(0, 8);
    return catalogo.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [catalogo, valor]);

  const coincideExacto = catalogo.some((c) => c.toLowerCase() === valor.trim().toLowerCase());

  return (
    <div className="relative">
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Ej. 95% Algodón, 5% Elastano"
        className="w-full card px-3 py-2 text-[13px] outline-none"
      />
      {abierto && (
        <div className="absolute z-20 top-full mt-1 w-full max-h-[220px] overflow-y-auto card p-1 shadow-lg">
          {sugerencias.length === 0 && !valor.trim() ? (
            <p className="text-[11.5px] text-text-faint px-2 py-2">Escribe para buscar…</p>
          ) : (
            sugerencias.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={() => {
                  onChange(c);
                  setAbierto(false);
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] hover:bg-white/[0.06]"
              >
                {c}
              </button>
            ))
          )}
          {valor.trim() && !coincideExacto && (
            <button
              type="button"
              onMouseDown={() => {
                onAgregarAlCatalogo(valor.trim());
                setAbierto(false);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-[#c4b8ff] hover:bg-accent/[0.1] border-t border-border mt-1 pt-2"
            >
              + Agregar &quot;{valor.trim()}&quot; al catálogo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Multiplica los valores YA escritos en las tallas por un factor (×2, ×3,
// ×4...) — útil cuando se captura la primera caja y las siguientes son
// iguales en la misma proporción, sin tener que reescribir cada talla a
// mano. Pide confirmación antes de aplicar, porque sobreescribe los
// valores actuales y no se puede deshacer.
function MultiplicadorTallas({
  tallas,
  onAplicar,
}: {
  tallas: Record<string, number>;
  onAplicar: (nuevo: Record<string, number>) => void;
}) {
  const hayValores = Object.keys(tallas).length > 0;

  function multiplicarPor(factor: number) {
    const nuevo: Record<string, number> = {};
    Object.entries(tallas).forEach(([talla, cant]) => {
      nuevo[talla] = Math.round(Number(cant || 0) * factor);
    });
    onAplicar(nuevo);
  }

  if (!hayValores) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <span className="text-[10.5px] text-text-faint">Multiplicar por:</span>
      {[2, 3, 4].map((factor) => (
        <button
          key={factor}
          type="button"
          onClick={() => {
            if (confirm(`¿Multiplicar todas las tallas actuales por ${factor}?`)) {
              multiplicarPor(factor);
            }
          }}
          className="px-2 py-0.5 rounded-md bg-accent/[0.12] text-[#c4b8ff] text-[11px] font-medium hover:bg-accent/[0.22]"
        >
          ×{factor}
        </button>
      ))}
    </div>
  );
}

// Check de 2 estados: false (gris, sin marcar) -> true (verde, Sí) -> false.
// Se usa para "Código Nuevo", que a diferencia de Tiene Código/Tiene Talla
// no necesita un tercer estado "No" — solo importa marcarlo cuando aplica.
function CheckDosEstados({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: boolean;
  onChange: (v: boolean) => void;
}) {
  const estilos = valor
    ? "bg-green/[0.18] text-[#6ee7b7] border-green/30"
    : "bg-white/[0.04] text-text-faint border-border";

  return (
    <button
      type="button"
      onClick={() => onChange(!valor)}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11.5px] font-medium transition-colors ${estilos}`}
      title="Clic para marcar/desmarcar"
    >
      {valor ? <Check size={13} /> : <HelpCircle size={13} />}
      {label}
    </button>
  );
}

export default function DetalleEtiquetadoPage() {
  const supabase = createClient();
  const params = useParams();
  const id = params?.id as string;

  const [orden, setOrden] = useState<EtqOrden | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [itemExpandidoId, setItemExpandidoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [avisoExcel, setAvisoExcel] = useState<string | null>(null);

  // Barra de captura rápida (código -> caja -> enter)
  const [qCodigo, setQCodigo] = useState("");
  const [qCaja, setQCaja] = useState("");
  const [capturandoRapido, setCapturandoRapido] = useState(false);
  const [sugerencias, setSugerencias] = useState<Item[]>([]);
  const [flashId, setFlashId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | undefined>();
  const [fPalet, setFPalet] = useState("");
  const [fCodigo, setFCodigo] = useState("");
  const [fDescripcion, setFDescripcion] = useState("");
  const [fMarca, setFMarca] = useState("");
  const [fColor, setFColor] = useState("");
  const [fComposicion, setFComposicion] = useState("");
  const [fPais, setFPais] = useState("");
  const [fTienda, setFTienda] = useState("");
  const [fCajas, setFCajas] = useState("");
  const [fFactura, setFFactura] = useState("");
  const [fTipoEtiqueta, setFTipoEtiqueta] = useState("COSIDO");
  const [fNovedad, setFNovedad] = useState("");
  const [fTallas, setFTallas] = useState<Record<string, number>>({});
  const [fTieneCodigo, setFTieneCodigo] = useState<boolean | null>(null);
  const [fTieneTalla, setFTieneTalla] = useState<boolean | null>(null);
  const [fCodigoNuevo, setFCodigoNuevo] = useState(false);
  const [fInenMarquilla, setFInenMarquilla] = useState<"inen" | "marquilla" | null>(null);

  // Modal "Agregar tallas": suma tallas de una caja NUEVA al total existente
  // del código, sin tener que recalcular a mano lo que ya había.
  const [showAgregarTallas, setShowAgregarTallas] = useState(false);
  const [itemAgregarTallas, setItemAgregarTallas] = useState<Item | null>(null);
  const [cajaNuevaTallas, setCajaNuevaTallas] = useState("");
  const [tallasNuevas, setTallasNuevas] = useState<Record<string, number>>({});

  // Modal "+ Variante": agrega una variante de color/composición distinta
  // del mismo código, sin descuadrar el total contra factura.
  const [showAgregarVariante, setShowAgregarVariante] = useState(false);
  const [itemVarianteId, setItemVarianteId] = useState<string | null>(null);
  const [vColor, setVColor] = useState("");
  const [vComposicion, setVComposicion] = useState("");
  const [vCajas, setVCajas] = useState("");
  const [vTallas, setVTallas] = useState<Record<string, number>>({});
  const [vTieneCodigo, setVTieneCodigo] = useState<boolean | null>(null);
  const [vTieneTalla, setVTieneTalla] = useState<boolean | null>(null);
  const [vCodigoNuevo, setVCodigoNuevo] = useState(false);
  const [vInenMarquilla, setVInenMarquilla] = useState<"inen" | "marquilla" | null>(null);

  // Configuración de tallas de la orden
  const [showTallasConfig, setShowTallasConfig] = useState(false);

  // Datos del informe final (proveedor/factura, bodega, reglamento, supervisora)
  const [showDatosInforme, setShowDatosInforme] = useState(false);
  const [fProveedorFactura, setFProveedorFactura] = useState("");
  const [fBodegaProceso, setFBodegaProceso] = useState("");
  const [fReglamento, setFReglamento] = useState("");
  const [fSupervisora, setFSupervisora] = useState("");
  const [showInforme, setShowInforme] = useState(false);
  const [tallasOrden, setTallasOrden] = useState<string[]>([]);
  const [tallasInput, setTallasInput] = useState("");

  // Mesas del día y mesa activa para capturar
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [mesaActivaId, setMesaActivaId] = useState<string>("");
  const [showMesas, setShowMesas] = useState(false);
  const [nuevaMesaNombre, setNuevaMesaNombre] = useState("");
  const [nuevaMesaIntegrantes, setNuevaMesaIntegrantes] = useState("");

  const [aEliminar, setAEliminar] = useState<string | null>(null);

  // Catálogo de composiciones normalizado — global, no depende de la
  // orden (las composiciones se repiten entre distintas cargas/clientes).
  const [catalogoComposiciones, setCatalogoComposiciones] = useState<string[]>([]);

  const cargarCatalogoComposiciones = useCallback(async () => {
    const { data } = await supabase
      .from("etq_composiciones_catalogo")
      .select("composicion")
      .order("composicion");
    setCatalogoComposiciones((data ?? []).map((d: { composicion: string }) => d.composicion));
  }, [supabase]);

  useEffect(() => {
    cargarCatalogoComposiciones();
  }, [cargarCatalogoComposiciones]);

  // Agrega una composición nueva al catálogo (si no existe ya) — para
  // cuando alguien escribe algo que no está en la lista, sin bloquear su
  // trabajo: se agrega de una vez y queda disponible para la próxima vez.
  async function agregarComposicionAlCatalogo(texto: string) {
    const limpio = texto.trim();
    if (!limpio) return;
    const { error } = await supabase
      .from("etq_composiciones_catalogo")
      .insert({ composicion: limpio })
      .select()
      .maybeSingle();
    // Si ya existía (conflicto de unicidad), no es un error real — solo
    // refrescamos el catálogo por si acaso.
    if (error && !error.message.includes("duplicate")) {
      setErrorMsg(`No se pudo agregar la composición al catálogo: ${error.message}`);
    }
    cargarCatalogoComposiciones();
  }

  const cargar = useCallback(async () => {
    if (!id) return;
    const { data: ord } = await supabase.from("etq_ordenes").select("*").eq("id", id).single();
    const ordTyped = (ord as EtqOrden) ?? null;

    // Traer RUC/dirección del cliente según el origen (etq_clientes o clientes vía orden DAP)
    if (ordTyped) {
      if (ordTyped.origen === "externo") {
        const { data: etqCli } = await supabase
          .from("etq_clientes")
          .select("ruc_ci, direccion")
          .eq("id", (ord as { etq_cliente_id: string | null }).etq_cliente_id ?? "")
          .single();
        ordTyped.ruc_cliente = etqCli?.ruc_ci ?? null;
        ordTyped.direccion_cliente = etqCli?.direccion ?? null;
      } else {
        const { data: ordenDap } = await supabase
          .from("ordenes_dap")
          .select("clientes(ruc_ci, direccion)")
          .eq("id", (ord as { orden_dap_id: string | null }).orden_dap_id ?? "")
          .single();
        const clienteDap = (
          ordenDap as unknown as {
            clientes: { ruc_ci: string | null; direccion: string | null } | null;
          }
        )?.clientes;
        ordTyped.ruc_cliente = clienteDap?.ruc_ci ?? null;
        ordTyped.direccion_cliente = clienteDap?.direccion ?? null;
      }
    }

    setOrden(ordTyped);
    setTallasOrden(ordTyped?.tallas ?? []);
    const { data: it } = await supabase
      .from("etq_items").select("*").eq("orden_id", id).order("orden_fila");
    const itemsData = (it as Item[]) ?? [];
    setItems(itemsData);

    // Variantes de todos los items de esta orden (para el desglose por color)
    const idsItems = itemsData.map((i) => i.id);
    if (idsItems.length > 0) {
      const { data: vars } = await supabase
        .from("etq_variantes")
        .select("*")
        .in("item_id", idsItems)
        .order("creado_en");
      setVariantes((vars as Variante[]) ?? []);
    } else {
      setVariantes([]);
    }

    const { data: ms } = await supabase
      .from("etq_mesas").select("*").eq("orden_id", id).order("nombre");
    const mesasData = (ms as Mesa[]) ?? [];
    setMesas(mesasData);
    // Si no hay mesa activa elegida, tomar la primera activa
    setMesaActivaId((prev) => {
      if (prev && mesasData.some((m) => m.id === prev)) return prev;
      return mesasData.find((m) => m.activa)?.id ?? "";
    });

    setLoading(false);
  }, [supabase, id]);

  async function agregarMesa() {
    if (!nuevaMesaNombre.trim()) return;
    const integrantes = nuevaMesaIntegrantes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const { error } = await supabase.from("etq_mesas").insert({
      orden_id: id,
      nombre: nuevaMesaNombre.trim(),
      integrantes,
    });
    if (error) { setErrorMsg(error.message); return; }
    setNuevaMesaNombre("");
    setNuevaMesaIntegrantes("");
    setToast("Mesa agregada.");
    cargar();
  }

  async function eliminarMesa(mesaId: string) {
    await supabase.from("etq_mesas").delete().eq("id", mesaId);
    setToast("Mesa eliminada.");
    cargar();
  }

  // Sugerir tallas por defecto según tipo de producto
  function tallasSugeridas(): string[] {
    if (orden?.tipo_producto === "calzado") return TALLAS_CALZADO;
    if (orden?.tipo_producto === "ropa") return TALLAS_ROPA;
    return TALLAS_ROPA;
  }

  function abrirConfigTallas() {
    setTallasInput((tallasOrden.length ? tallasOrden : tallasSugeridas()).join(", "));
    setShowTallasConfig(true);
  }

  async function guardarTallasOrden() {
    const arr = tallasInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const { error } = await supabase.from("etq_ordenes").update({ tallas: arr }).eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setTallasOrden(arr);
    setShowTallasConfig(false);
    setToast("Tallas configuradas.");
  }

  function abrirDatosInforme() {
    setFProveedorFactura(orden?.proveedor_factura ?? "");
    setFBodegaProceso(orden?.bodega_proceso ?? "");
    setFReglamento(orden?.reglamento_tecnico ?? "");
    setFSupervisora(orden?.supervisora ?? "Isabel Garcia");
    setShowDatosInforme(true);
  }

  async function guardarDatosInforme() {
    const { error } = await supabase
      .from("etq_ordenes")
      .update({
        proveedor_factura: fProveedorFactura.trim() || null,
        bodega_proceso: fBodegaProceso.trim() || null,
        reglamento_tecnico: fReglamento.trim() || null,
        supervisora: fSupervisora.trim() || null,
      })
      .eq("id", id);
    if (error) { setErrorMsg(error.message); return; }
    setShowDatosInforme(false);
    setToast("Datos del informe actualizados.");
    cargar();
  }

  useEffect(() => { cargar(); }, [cargar]);

  // Al abrir el informe final, dispara la impresión — pero solo después de
  // que el navegador termine de calcular el layout real (esperando a que
  // cargue el logo) y con un margen mayor, para que Chrome "vea" el
  // contenido completo antes de calcular cuántas páginas hacen falta.
  useEffect(() => {
    if (!showInforme) return;

    let cancelado = false;

    async function esperarImagenesYImprimir() {
      // Espera a que el navegador pinte el nuevo contenido en el DOM
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const contenedor = document.querySelector(".print-area");
      const imagenes = contenedor ? Array.from(contenedor.querySelectorAll("img")) : [];
      await Promise.all(
        imagenes.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete) return resolve();
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            })
        )
      );

      if (!cancelado) {
        setTimeout(() => window.print(), 150);
      }
    }

    esperarImagenesYImprimir();
    return () => {
      cancelado = true;
    };
  }, [showInforme]);

  // Búsqueda inteligente de códigos mientras se escribe
  useEffect(() => {
    const q = qCodigo.trim().toLowerCase();
    if (!q) { setSugerencias([]); return; }
    setSugerencias(
      items
        .filter((it) => (it.codigo ?? "").toLowerCase().includes(q))
        .slice(0, 6)
    );
  }, [qCodigo, items]);

  // Agregar una caja a un código existente (le suma la caja al texto)
  async function sumarCajaAExistente(it: Item, cajaTxt: string) {
    const nuevasCajas = ((it.cajas ?? "") + " " + cajaTxt).trim();
    const { error } = await supabase
      .from("etq_items")
      .update({ cajas: nuevasCajas, cantidad_contada: sumarCajas(nuevasCajas), actualizado_en: new Date().toISOString() })
      .eq("id", it.id);
    if (error) { setErrorMsg(error.message); return; }
    // Registrar el movimiento para medir producción por mesa
    await supabase.from("etq_movimientos").insert({
      orden_id: id,
      item_id: it.id,
      mesa_id: mesaActivaId || null,
      codigo: it.codigo,
      caja: cajaTxt,
      cantidad: sumarCajas(cajaTxt),
    });
    setFlashId(it.id);
    setTimeout(() => setFlashId(null), 900);
  }

  // Crear un código nuevo al vuelo con su primera caja
  async function crearCodigoRapido(codigo: string, cajaTxt: string) {
    const { data, error } = await supabase
      .from("etq_items")
      .insert({
        orden_id: id,
        codigo: codigo.trim(),
        cajas: cajaTxt || null,
        cantidad_contada: sumarCajas(cajaTxt),
        cantidad_factura: 0,
        orden_fila: items.length,
      })
      .select()
      .single();
    if (error) { setErrorMsg(error.message); return; }
    if (data) {
      await supabase.from("etq_movimientos").insert({
        orden_id: id,
        item_id: data.id,
        mesa_id: mesaActivaId || null,
        codigo: codigo.trim(),
        caja: cajaTxt,
        cantidad: sumarCajas(cajaTxt),
      });
      setFlashId(data.id);
      setTimeout(() => setFlashId(null), 900);
    }
  }

  // Al dar ENTER en la barra de captura
  async function capturaRapida() {
    // Protección contra doble envío: si ya hay una captura en curso (por
    // ejemplo, por auto-repeat del teclado al soltar Enter, o un doble
    // clic accidental en "Agregar"), se ignora la segunda llamada hasta
    // que la primera termine. Esto era lo que causaba que un mismo código
    // quedara registrado dos veces con la misma cantidad, a milisegundos
    // de diferencia.
    if (capturandoRapido) return;
    setCapturandoRapido(true);
    setErrorMsg(null);
    try {
      const codigo = qCodigo.trim();
      const caja = qCaja.trim();
      if (!codigo) { setErrorMsg("Escribe un código."); return; }
      if (!caja) { setErrorMsg("Escribe la caja con su cantidad, ej. 183(24)."); return; }
      if (sumarCajas(caja) === 0) {
        setErrorMsg("La caja debe llevar la cantidad en paréntesis, ej. 183(24).");
        return;
      }

      // ¿Ya existe el código (exacto, sin importar mayúsculas)?
      const existente = items.find(
        (it) => (it.codigo ?? "").toLowerCase() === codigo.toLowerCase()
      );
      if (existente) {
        await sumarCajaAExistente(existente, caja);
        setToast(`Caja sumada a ${existente.codigo}.`);
      } else {
        await crearCodigoRapido(codigo, caja);
        setToast(`Código ${codigo} creado.`);
      }

      setQCodigo("");
      setQCaja("");
      setSugerencias([]);
      await cargar();
      // devolver el foco al campo de código para seguir capturando
      setTimeout(() => document.getElementById("q-codigo")?.focus(), 50);
    } finally {
      setCapturandoRapido(false);
    }
  }

  function elegirSugerencia(it: Item) {
    setQCodigo(it.codigo ?? "");
    setSugerencias([]);
    setTimeout(() => document.getElementById("q-caja")?.focus(), 30);
  }

  // Estado de cada item: contado (suma cajas) vs factura
  function estadoItem(it: Item): { texto: string; clase: string; dif: number } {
    const contado = it.cantidad_contada;
    const factura = it.cantidad_factura;
    const dif = contado - factura;
    if (factura === 0) return { texto: "Sin factura", clase: "bg-white/[0.05] text-text-faint border border-border", dif };
    if (dif === 0) return { texto: "Completo", clase: "bg-green/15 text-[#6ee7b7] border border-green/25", dif };
    if (dif < 0) return { texto: `Faltan ${Math.abs(dif)}`, clase: "bg-red/15 text-[#fca5a5] border border-red/25", dif };
    return { texto: `Sobran ${dif}`, clase: "bg-amber/15 text-[#fbbf24] border border-amber/25", dif };
  }

  const totalContado = items.reduce((a, it) => a + Number(it.cantidad_contada || 0), 0);
  const totalFactura = items.reduce((a, it) => a + Number(it.cantidad_factura || 0), 0);
  const completos = items.filter((it) => estadoItem(it).texto === "Completo").length;
  const conProblema = items.filter((it) => {
    const e = estadoItem(it);
    return e.texto.startsWith("Faltan") || e.texto.startsWith("Sobran");
  }).length;

  function normalizar(s: string) {
    return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  }

  async function cargarExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvisoExcel(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets["INVENTARIO"] ?? wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (filas.length === 0) { setAvisoExcel("El archivo está vacío."); return; }

      const headers = Object.keys(filas[0]);
      const mapa: Record<string, string> = {};
      headers.forEach((h) => {
        const n = normalizar(h);
        if (n === "palet" || n === "pallet") mapa.palet = h;
        else if (n === "caja") mapa.cajas = h;
        else if (n === "codigo") mapa.codigo = h;
        else if (n.includes("descrip")) mapa.descripcion = h;
        else if (n === "marca") mapa.marca = h;
        else if (n.includes("composicion")) mapa.composicion = h;
        else if (n === "pais" || n.includes("paisorigen")) mapa.pais = h;
        else if (n === "tienda" || n.includes("nombretienda")) mapa.tienda = h;
        else if (n.includes("cantidadfactura") || n === "cantidaddefactura") mapa.factura = h;
        else if (n.includes("tipodeetiqueta") || n === "tipoetiqueta") mapa.tipo = h;
        else if (n.includes("novedad")) mapa.novedad = h;
      });

      if (!mapa.cajas && !mapa.codigo) {
        setAvisoExcel("No se reconoció el formato. El Excel debe tener columnas CAJA y CODIGO.");
        return;
      }

      const nuevos = filas
        .filter((f) => String(f[mapa.codigo ?? ""] ?? "").trim() !== "" || String(f[mapa.cajas ?? ""] ?? "").trim() !== "")
        .map((f, i) => {
          const cajasTxt = mapa.cajas ? String(f[mapa.cajas] ?? "") : "";
          return {
            orden_id: id,
            palet: mapa.palet ? String(f[mapa.palet] ?? "") : null,
            codigo: mapa.codigo ? String(f[mapa.codigo] ?? "") : null,
            descripcion: mapa.descripcion ? String(f[mapa.descripcion] ?? "") : null,
            marca: mapa.marca ? String(f[mapa.marca] ?? "") : null,
            composicion: mapa.composicion ? String(f[mapa.composicion] ?? "") : null,
            pais: mapa.pais ? String(f[mapa.pais] ?? "") : null,
            tienda: mapa.tienda ? String(f[mapa.tienda] ?? "") : null,
            cajas: cajasTxt || null,
            cantidad_contada: sumarCajas(cajasTxt),
            cantidad_factura: mapa.factura ? Number(f[mapa.factura]) || 0 : 0,
            tipo_etiqueta: mapa.tipo ? String(f[mapa.tipo] ?? "") : null,
            novedad: mapa.novedad ? String(f[mapa.novedad] ?? "") : null,
            orden_fila: items.length + i,
          };
        });

      if (nuevos.length === 0) { setAvisoExcel("No se encontraron renglones con código o cajas."); return; }
      const { error } = await supabase.from("etq_items").insert(nuevos);
      if (error) { setAvisoExcel(error.message); return; }
      setAvisoExcel(
        `✓ Se cargaron ${nuevos.length} códigos desde el inventario.`
      );
      cargar();
    } catch {
      setAvisoExcel("No se pudo leer el archivo. Verifica que sea un Excel válido.");
    } finally {
      e.target.value = "";
    }
  }

  function limpiar() {
    setEditId(undefined); setFPalet(""); setFCodigo(""); setFDescripcion("");
    setFMarca(""); setFColor(""); setFComposicion(""); setFPais(""); setFTienda("");
    setFCajas(""); setFFactura("");
    setFTipoEtiqueta("COSIDO"); setFNovedad(""); setFTallas({});
    setFTieneCodigo(null); setFTieneTalla(null); setFCodigoNuevo(false); setFInenMarquilla(null); setErrorMsg(null);
  }

  function abrirNuevo() { limpiar(); setShowForm(true); }

  function abrirEditar(it: Item) {
    limpiar();
    setEditId(it.id);
    setFPalet(it.palet ?? ""); setFCodigo(it.codigo ?? ""); setFDescripcion(it.descripcion ?? "");
    setFMarca(it.marca ?? ""); setFColor(it.color ?? ""); setFCajas(it.cajas ?? "");
    setFComposicion(it.composicion ?? ""); setFPais(it.pais ?? ""); setFTienda(it.tienda ?? "");
    setFFactura(it.cantidad_factura ? String(it.cantidad_factura) : "");
    setFTipoEtiqueta(it.tipo_etiqueta ?? "COSIDO"); setFNovedad(it.novedad ?? "");
    setFTallas(it.tallas_detalle ?? {});
    setFTieneCodigo(it.tiene_codigo ?? null); setFTieneTalla(it.tiene_talla ?? null);
    setFCodigoNuevo(it.codigo_nuevo ?? false);
    setFInenMarquilla(it.inen_marquilla ?? null);
    setShowForm(true);
  }

  async function guardar() {
    if (!fCodigo.trim() && !fCajas.trim()) {
      setErrorMsg("Ingresa al menos el código o las cajas.");
      return;
    }
    // Cantidad contada ANTES de guardar (para saber cuánto se agregó realmente,
    // así el movimiento que se registra refleja el incremento neto, no el total)
    const cantidadAntes = editId ? items.find((it) => it.id === editId)?.cantidad_contada ?? 0 : 0;
    const cantidadNueva = sumarCajas(fCajas);
    const incremento = cantidadNueva - cantidadAntes;

    const payload = {
      orden_id: id,
      palet: fPalet.trim() || null,
      codigo: fCodigo.trim() || null,
      descripcion: fDescripcion.trim() || null,
      marca: fMarca.trim() || null,
      color: fColor.trim() || null,
      composicion: fComposicion.trim() || null,
      pais: fPais.trim() || null,
      tienda: fTienda.trim() || null,
      cajas: fCajas.trim() || null,
      cantidad_contada: cantidadNueva,
      tipo_etiqueta: fTipoEtiqueta.trim() || null,
      novedad: fNovedad.trim() || null,
      tallas_detalle: fTallas,
      tiene_codigo: fTieneCodigo,
      tiene_talla: fTieneTalla,
      codigo_nuevo: fCodigoNuevo,
      inen_marquilla: fInenMarquilla,
      actualizado_en: new Date().toISOString(),
    };
    let itemId = editId;
    if (editId) {
      // La cantidad_factura NUNCA se toca al editar un código ya creado —
      // se mantiene lo que se guardó al ingresarlo la primera vez, aunque
      // el formulario visual tenga el campo bloqueado (esto es una segunda
      // capa de protección, por si el input se manipulara de algún modo).
      const { error } = await supabase.from("etq_items").update(payload).eq("id", editId);
      if (error) { setErrorMsg(error.message); return; }
    } else {
      const { data, error } = await supabase
        .from("etq_items")
        .insert({ ...payload, cantidad_factura: Number(fFactura) || 0, orden_fila: items.length })
        .select()
        .single();
      if (error) { setErrorMsg(error.message); return; }
      itemId = data?.id;
    }

    // Registrar el movimiento (mesa + hora) si hubo un incremento real de unidades
    if (itemId && incremento > 0) {
      await supabase.from("etq_movimientos").insert({
        orden_id: id,
        item_id: itemId,
        mesa_id: mesaActivaId || null,
        codigo: fCodigo.trim() || null,
        caja: fCajas.trim() || null,
        cantidad: incremento,
      });
    }

    // Registrar el desglose de tallas por caja SOLO cuando es un código nuevo
    // (ahí sí sabemos con certeza que todas sus tallas corresponden a las
    // cajas que se acaban de escribir). En edición de un código existente no
    // se registra, porque no se puede saber con certeza qué parte del texto
    // de cajas es "nueva" — evita guardar un desglose incorrecto.
    if (!editId && itemId && fCajas.trim() && sumarTallas(fTallas) > 0) {
      const matchNumero = fCajas.trim().match(/^\s*(\d+)/);
      await supabase.from("etq_tallas_por_caja").insert({
        item_id: itemId,
        variante_id: null,
        caja: fCajas.trim(),
        numero_caja: matchNumero ? matchNumero[1] : null,
        tallas_detalle: fTallas,
      });
    }

    setShowForm(false);
    setToast(editId ? "Código actualizado." : "Código agregado.");
    cargar();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    await supabase.from("etq_items").delete().eq("id", aEliminar);
    setAEliminar(null);
    setToast("Código eliminado.");
    cargar();
  }

  function abrirAgregarTallas(it: Item) {
    setItemAgregarTallas(it);
    setCajaNuevaTallas("");
    setTallasNuevas({});
    setErrorMsg(null);
    setShowAgregarTallas(true);
  }

  async function guardarAgregarTallas() {
    if (!itemAgregarTallas) return;
    const sumaTallasNuevas = sumarTallas(tallasNuevas);
    if (sumaTallasNuevas === 0) {
      setErrorMsg("Ingresa al menos una talla con cantidad.");
      return;
    }

    // Sumar las tallas nuevas a las que ya tenía el código
    const tallasCombinadas: Record<string, number> = { ...(itemAgregarTallas.tallas_detalle ?? {}) };
    Object.entries(tallasNuevas).forEach(([talla, cant]) => {
      tallasCombinadas[talla] = (tallasCombinadas[talla] ?? 0) + cant;
    });

    // Si además escribió la caja nueva, se suma también a las cajas existentes
    const nuevasCajas = cajaNuevaTallas.trim()
      ? ((itemAgregarTallas.cajas ?? "") + " " + cajaNuevaTallas.trim()).trim()
      : itemAgregarTallas.cajas;
    const nuevaCantidadContada = cajaNuevaTallas.trim()
      ? sumarCajas(nuevasCajas)
      : itemAgregarTallas.cantidad_contada;

    const { error } = await supabase
      .from("etq_items")
      .update({
        tallas_detalle: tallasCombinadas,
        cajas: nuevasCajas,
        cantidad_contada: nuevaCantidadContada,
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", itemAgregarTallas.id);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    // Registrar el movimiento (mesa + hora) si se agregó una caja nueva
    if (cajaNuevaTallas.trim()) {
      await supabase.from("etq_movimientos").insert({
        orden_id: id,
        item_id: itemAgregarTallas.id,
        mesa_id: mesaActivaId || null,
        codigo: itemAgregarTallas.codigo,
        caja: cajaNuevaTallas.trim(),
        cantidad: sumarCajas(cajaNuevaTallas),
      });

      // Registrar SOLO las tallas de esta caja puntual, para poder filtrar
      // por caja específica más adelante sin perder el desglose.
      const matchNumero = cajaNuevaTallas.trim().match(/^\s*(\d+)/);
      await supabase.from("etq_tallas_por_caja").insert({
        item_id: itemAgregarTallas.id,
        variante_id: null,
        caja: cajaNuevaTallas.trim(),
        numero_caja: matchNumero ? matchNumero[1] : null,
        tallas_detalle: tallasNuevas,
      });
    }

    setShowAgregarTallas(false);
    setToast(`Tallas sumadas a ${itemAgregarTallas.codigo}.`);
    cargar();
  }

  function abrirAgregarVariante(it: Item) {
    setItemVarianteId(it.id);
    setVColor("");
    setVComposicion("");
    setVCajas("");
    setVTallas({});
    setVTieneCodigo(null);
    setVTieneTalla(null);
    setVCodigoNuevo(false);
    setVInenMarquilla(null);
    setErrorMsg(null);
    setShowAgregarVariante(true);
  }

  async function guardarAgregarVariante() {
    if (!itemVarianteId) return;
    const cantidadVariante = sumarCajas(vCajas);
    if (cantidadVariante === 0) {
      setErrorMsg("Ingresa la caja de esta variante con su cantidad, ej. 245(12).");
      return;
    }

    const item = items.find((i) => i.id === itemVarianteId);
    if (!item) return;

    // 1. Guardar la variante con su propia caja, composición, color y tallas
    const { data: varianteCreada, error: errVar } = await supabase
      .from("etq_variantes")
      .insert({
        item_id: itemVarianteId,
        color: vColor.trim() || null,
        composicion: vComposicion.trim() || null,
        cajas: vCajas.trim(),
        cantidad: cantidadVariante,
        tallas_detalle: vTallas,
        tiene_codigo: vTieneCodigo,
        tiene_talla: vTieneTalla,
        codigo_nuevo: vCodigoNuevo,
        inen_marquilla: vInenMarquilla,
      })
      .select()
      .single();
    if (errVar) {
      setErrorMsg(errVar.message);
      return;
    }

    // 2. Sumar esa cantidad al TOTAL del código (lo que se cuadra contra factura)
    const nuevasCajas = ((item.cajas ?? "") + " " + vCajas.trim()).trim();
    const { error: errItem } = await supabase
      .from("etq_items")
      .update({
        cajas: nuevasCajas,
        cantidad_contada: sumarCajas(nuevasCajas),
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", itemVarianteId);
    if (errItem) {
      setErrorMsg(errItem.message);
      return;
    }

    // Registrar el movimiento (mesa + hora) para la medición de producción
    await supabase.from("etq_movimientos").insert({
      orden_id: id,
      item_id: itemVarianteId,
      mesa_id: mesaActivaId || null,
      codigo: item.codigo,
      caja: vCajas.trim(),
      cantidad: cantidadVariante,
    });

    // Registrar el desglose de tallas de esta caja puntual de la variante
    const matchNumeroVariante = vCajas.trim().match(/^\s*(\d+)/);
    await supabase.from("etq_tallas_por_caja").insert({
      item_id: itemVarianteId,
      variante_id: varianteCreada?.id ?? null,
      caja: vCajas.trim(),
      numero_caja: matchNumeroVariante ? matchNumeroVariante[1] : null,
      tallas_detalle: vTallas,
    });

    setShowAgregarVariante(false);
    setToast(`Variante agregada a ${item.codigo}.`);
    setItemExpandidoId(itemVarianteId);
    cargar();
  }

  // Vista previa de la suma mientras se escribe
  const previewSuma = sumarCajas(fCajas);

  // Resumen agrupado por descripción, para el Informe Final (lo que factura contabilidad)
  const resumenPorDescripcion = useMemo(() => {
    const grupos = new Map<
      string,
      {
        descripcion: string;
        cantidadFactura: number;
        cantidadInventario: number;
        totalEtiquetas: number;
      }
    >();
    items.forEach((it) => {
      const textoOriginal = (it.descripcion ?? it.codigo ?? "Sin descripción").trim() || "Sin descripción";
      // Clave normalizada SOLO para agrupar: mismo texto en mayúsculas y con
      // espacios múltiples colapsados a uno solo, para que "BATA DE 2 PIEZAS",
      // "Bata de 2 Piezas" y "BATA DE  2 PIEZAS" se unifiquen en una sola fila
      // aunque vengan escritas con capitalización o espacios distintos.
      const clave = textoOriginal.toUpperCase().replace(/\s+/g, " ");
      const actual = grupos.get(clave) ?? {
        descripcion: textoOriginal, // se conserva el primer texto tal como vino
        cantidadFactura: 0,
        cantidadInventario: 0,
        totalEtiquetas: 0,
      };
      actual.cantidadFactura += Number(it.cantidad_factura || 0);
      actual.cantidadInventario += Number(it.cantidad_contada || 0);

      // Total de etiquetas = suma de tallas. Si el código tiene variantes de
      // color, se suman las tallas de cada variante; si no, las del código.
      const variantesDelItem = variantes.filter((v) => v.item_id === it.id);
      if (variantesDelItem.length > 0) {
        variantesDelItem.forEach((v) => {
          actual.totalEtiquetas += sumarTallas(v.tallas_detalle);
        });
      } else {
        actual.totalEtiquetas += sumarTallas(it.tallas_detalle);
      }

      grupos.set(clave, actual);
    });
    return Array.from(grupos.values()).sort((a, b) => a.descripcion.localeCompare(b.descripcion));
  }, [items, variantes]);

  // Unifica las descripciones por categoría (primera palabra útil): por
  // ejemplo "BLUSA KIMONO", "BLUSA LARGA" y "BLUSA" se suman en una sola
  // fila "BLUSA". Se calcula sobre resumenPorDescripcion, que ya sumó por
  // descripción exacta — aquí solo se agrupa un nivel más.
  const resumenPorCategoria = useMemo(() => {
    const grupos = new Map<
      string,
      { descripcion: string; cantidadFactura: number; cantidadInventario: number; totalEtiquetas: number }
    >();
    resumenPorDescripcion.forEach((g) => {
      const categoria = categoriaDeDescripcion(g.descripcion);
      const actual = grupos.get(categoria) ?? {
        descripcion: categoria,
        cantidadFactura: 0,
        cantidadInventario: 0,
        totalEtiquetas: 0,
      };
      actual.cantidadFactura += g.cantidadFactura;
      actual.cantidadInventario += g.cantidadInventario;
      actual.totalEtiquetas += g.totalEtiquetas;
      grupos.set(categoria, actual);
    });
    return Array.from(grupos.values()).sort((a, b) => a.descripcion.localeCompare(b.descripcion));
  }, [resumenPorDescripcion]);

  // Alterna entre ver el detalle completo (por descripción exacta) o el
  // resumen unificado (por categoría). Por defecto, el resumen unificado,
  // ya que es lo que se pidió para el informe.
  const [verInformePorCategoria, setVerInformePorCategoria] = useState(true);
  const filasInforme = verInformePorCategoria ? resumenPorCategoria : resumenPorDescripcion;
  const totalesInformeFilas = filasInforme.reduce(
    (acc, g) => ({
      factura: acc.factura + g.cantidadFactura,
      inventario: acc.inventario + g.cantidadInventario,
      etiquetas: acc.etiquetas + g.totalEtiquetas,
    }),
    { factura: 0, inventario: 0, etiquetas: 0 }
  );

  const totalesInforme = resumenPorDescripcion.reduce(
    (acc, g) => ({
      factura: acc.factura + g.cantidadFactura,
      inventario: acc.inventario + g.cantidadInventario,
      etiquetas: acc.etiquetas + g.totalEtiquetas,
    }),
    { factura: 0, inventario: 0, etiquetas: 0 }
  );

  // Producción por mesa (para el reporte del día)
  const [movimientos, setMovimientos] = useState<{ mesa_id: string | null; cantidad: number; creado_en: string }[]>([]);
  const [showReporte, setShowReporte] = useState(false);
  const [diaReporte, setDiaReporte] = useState(new Date().toISOString().slice(0, 10));

  async function cargarReporte() {
    const { data } = await supabase
      .from("etq_movimientos")
      .select("mesa_id, cantidad, creado_en")
      .eq("orden_id", id);
    setMovimientos(data ?? []);
    setShowReporte(true);
  }

  // Días que realmente tienen movimientos (para el selector)
  const diasConMovimientos = Array.from(
    new Set(movimientos.map((m) => m.creado_en.slice(0, 10)))
  ).sort((a, b) => b.localeCompare(a));

  function produccionMesa(mesaId: string) {
    const movs = movimientos.filter(
      (m) => m.mesa_id === mesaId && m.creado_en.slice(0, 10) === diaReporte
    );
    const unidades = movs.reduce((a, m) => a + Number(m.cantidad || 0), 0);
    const cajas = movs.length;
    let minutos = 0;
    if (movs.length >= 2) {
      const fechas = movs.map((m) => new Date(m.creado_en).getTime()).sort((a, b) => a - b);
      minutos = Math.round((fechas[fechas.length - 1] - fechas[0]) / 60000);
    }
    return { unidades, cajas, minutos };
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/etiquetado" />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="px-6.5 pt-5.5 pb-10 max-w-[1120px]">
          <Link href="/etiquetado" className="inline-flex items-center gap-1.5 text-[12.5px] text-text-faint hover:text-text mb-4">
            <ArrowLeft size={14} /> Volver a etiquetado
          </Link>

          {loading ? (
            <p className="text-[13px] text-text-faint">Cargando…</p>
          ) : !orden ? (
            <div className="card p-8 text-center"><p className="text-[13px] text-text-faint">No se encontró la orden.</p></div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <h1 className="text-[21px] font-semibold">{orden.numero_etq}</h1>
                <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-accent/[0.18] text-[#c4b8ff] capitalize">{orden.estado}</span>
                <span className="flex items-center gap-1.5 text-[12.5px] text-text-dim">
                  {orden.origen === "etyecu" ? <Package size={14} /> : <Building2 size={14} />}
                  {orden.cliente_nombre} · <span className="capitalize">{orden.tipo_producto}</span>
                </span>
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={abrirDatosInforme}
                    className="btn-secondary text-[11.5px] font-semibold px-3 py-1.5 rounded-lg"
                  >
                    Datos del informe
                  </button>
                  <button
                    onClick={() => setShowInforme(true)}
                    className="btn-primary flex items-center gap-1 text-[11.5px] font-semibold px-3 py-1.5 rounded-lg"
                  >
                    <FileText size={13} /> Generar informe final
                  </button>
                </div>
              </div>

              {errorMsg && <div className="mb-4 px-4 py-2.5 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">{errorMsg}</div>}

              <div className="grid grid-cols-4 gap-3 mb-5">
                <div className="card p-4"><p className="text-[11px] uppercase tracking-wide text-text-faint mb-1">Factura</p><p className="text-[20px] font-semibold">{totalFactura}</p></div>
                <div className="card p-4"><p className="text-[11px] uppercase tracking-wide text-text-faint mb-1">Contado (etiquetas)</p><p className="text-[20px] font-semibold">{totalContado}</p></div>
                <div className="card p-4"><p className="text-[11px] uppercase tracking-wide text-text-faint mb-1">Completos</p><p className="text-[20px] font-semibold text-[#6ee7b7]">{completos}<span className="text-[13px] text-text-faint">/{items.length}</span></p></div>
                <div className="card p-4"><p className="text-[11px] uppercase tracking-wide text-text-faint mb-1">Con problema</p><p className="text-[20px] font-semibold text-[#fca5a5]">{conProblema}</p></div>
              </div>

              {/* Barra de captura rápida: código -> caja -> ENTER */}
              <div className="card p-3 mb-3 bg-accent/[0.04] border-accent-2/25">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wide text-[#c4b8ff] font-semibold px-1">
                    Captura rápida
                  </span>
                  {/* Selector de mesa activa */}
                  <select
                    value={mesaActivaId}
                    onChange={(e) => setMesaActivaId(e.target.value)}
                    className="card px-2.5 py-2 text-[12px] outline-none"
                    title="Mesa que está capturando"
                  >
                    <option value="">Sin mesa</option>
                    {mesas.map((m) => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowMesas(true)}
                    className="card px-2.5 py-2 text-[11.5px] text-text-dim hover:text-text"
                    title="Gestionar mesas"
                  >
                    <Users size={14} />
                  </button>
                  <div className="relative flex-1 min-w-[180px]">
                    <input
                      id="q-codigo"
                      value={qCodigo}
                      onChange={(e) => setQCodigo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          document.getElementById("q-caja")?.focus();
                        }
                      }}
                      placeholder="Código (busca o crea)…"
                      autoComplete="off"
                      className="w-full card px-3 py-2 text-[13px] outline-none font-mono"
                    />
                    {sugerencias.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full card border border-border-strong rounded-lg overflow-hidden shadow-xl">
                        {sugerencias.map((s) => {
                          const est = estadoItem(s);
                          return (
                            <div
                              key={s.id}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] hover:bg-white/[0.04] border-b border-border last:border-b-0 flex-wrap"
                            >
                              <button
                                onClick={() => elegirSugerencia(s)}
                                className="flex-1 flex items-center gap-2 text-left"
                              >
                                <span className="font-mono font-medium">{s.codigo}</span>
                                <span className="text-text-faint truncate">{s.descripcion ?? ""}</span>
                              </button>
                              <span className="flex items-center gap-2 shrink-0">
                                <span className="text-text-faint">{s.cantidad_contada}/{s.cantidad_factura}</span>
                                <span className={`text-[9.5px] px-1.5 py-0.5 rounded-full ${est.clase}`}>{est.texto}</span>
                                <button
                                  onClick={() => {
                                    setSugerencias([]);
                                    setQCodigo("");
                                    abrirAgregarVariante(s);
                                  }}
                                  className="text-[10.5px] px-2 py-0.5 rounded-md bg-amber/[0.15] text-[#fbbf24] hover:bg-amber/[0.25]"
                                  title="Agregar variante de color/composición"
                                >
                                  + Variante
                                </button>
                                <button
                                  onClick={() => {
                                    setSugerencias([]);
                                    setQCodigo("");
                                    abrirAgregarTallas(s);
                                  }}
                                  className="text-[10.5px] px-2 py-0.5 rounded-md bg-green/[0.15] text-[#6ee7b7] hover:bg-green/[0.25]"
                                  title="Agregar tallas de una caja nueva"
                                >
                                  + Tallas
                                </button>
                                <button
                                  onClick={() => {
                                    setSugerencias([]);
                                    setQCodigo("");
                                    abrirEditar(s);
                                  }}
                                  className="text-[10.5px] px-2 py-0.5 rounded-md bg-accent/[0.15] text-[#c4b8ff] hover:bg-accent/[0.25]"
                                >
                                  Editar
                                </button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="w-[160px]">
                    <input
                      id="q-caja"
                      value={qCaja}
                      onChange={(e) => setQCaja(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          capturaRapida();
                        }
                      }}
                      placeholder="Caja ej. 183(24)"
                      autoComplete="off"
                      className="w-full card px-3 py-2 text-[13px] outline-none font-mono"
                    />
                  </div>
                  <button
                    onClick={capturaRapida}
                    disabled={capturandoRapido}
                    className="btn-primary text-[12.5px] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                  >
                    Agregar
                  </button>
                </div>
                <p className="text-[10.5px] text-text-faint mt-1.5 px-1">
                  Escribe el código y presiona Enter, luego la caja con su cantidad y Enter otra vez. Si el código ya existe le suma la caja; si no, lo crea.
                </p>
              </div>

              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[14px] font-semibold">Inventario por código</h2>
                <div className="flex gap-2">
                  <label className="btn-secondary flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer">
                    <Upload size={13} /> Cargar Excel
                    <input type="file" accept=".xlsx,.xls,.xlsm" onChange={cargarExcel} className="hidden" />
                  </label>
                  <button onClick={abrirNuevo} className="btn-secondary flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg"><Plus size={13} /> Agregar código</button>
                  <button onClick={cargar} className="btn-secondary flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg" title="Refrescar"><RefreshCw size={13} /> Refrescar</button>
                  <button onClick={cargarReporte} className="btn-secondary flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg" title="Producción por mesa"><BarChart3 size={13} /> Reporte del día</button>
                </div>
              </div>

              {avisoExcel && <div className={`mb-3 px-3 py-2 rounded-lg text-[11.5px] ${avisoExcel.startsWith("✓") ? "bg-green/10 border border-green/20 text-[#6ee7b7]" : "bg-amber/10 border border-amber/20 text-[#fbbf24]"}`}>{avisoExcel}</div>}

              {items.length === 0 ? (
                <div className="card p-8 text-center border-dashed">
                  <p className="text-[13px] text-text-faint">Aún no hay inventario. Carga el Excel de inventario o agrega códigos a mano.</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="grid grid-cols-[45px_105px_1fr_120px_75px_75px_105px_260px] gap-2 px-4 py-2.5 text-[10.5px] uppercase tracking-wide text-text-faint border-b border-border">
                    <span>Palet</span><span>Código</span><span>Cajas (cantidad)</span><span>Descripción</span>
                    <span className="text-right">Factura</span><span className="text-right">Contado</span>
                    <span className="text-center">Estado</span><span className="text-right">Acción</span>
                  </div>
                  {items.map((it) => {
                    const est = estadoItem(it);
                    const variantesDelItem = variantes.filter((v) => v.item_id === it.id);
                    const expandido = itemExpandidoId === it.id;
                    return (
                      <div key={it.id}>
                        <div className={`grid grid-cols-[45px_105px_1fr_120px_75px_75px_105px_260px] gap-2 px-4 py-2.5 items-center border-b border-border last:border-b-0 text-[12px] transition-colors ${flashId === it.id ? "bg-green/[0.12]" : ""}`}>
                          <span className="text-text-dim">{it.palet ?? "—"}</span>
                          <button
                            onClick={() => setItemExpandidoId(expandido ? null : it.id)}
                            className="font-medium text-left flex items-center gap-1 hover:text-[#c4b8ff]"
                            title={variantesDelItem.length > 0 ? "Ver variantes" : "Sin variantes"}
                          >
                            {it.codigo ?? "—"}
                            {variantesDelItem.length > 0 && (
                              <span className="text-[9.5px] px-1.5 rounded-full bg-accent/[0.18] text-[#c4b8ff]">
                                {variantesDelItem.length}
                              </span>
                            )}
                          </button>
                          <span className="text-text-dim truncate" title={it.cajas ?? ""}>{it.cajas ?? "—"}</span>
                          <span className="text-text-dim truncate">{it.descripcion ?? "—"}</span>
                          <span className="text-right">{it.cantidad_factura}</span>
                          <span className="text-right font-medium">{it.cantidad_contada}</span>
                          <span className="flex justify-center"><span className={`text-[10px] px-2 py-0.5 rounded-full ${est.clase}`}>{est.texto}</span></span>
                          <span className="flex items-center justify-end gap-1 flex-wrap">
                            <button onClick={() => abrirAgregarVariante(it)} className="text-[11px] px-2 py-1 rounded-md bg-amber/[0.15] text-[#fbbf24] hover:bg-amber/[0.25] whitespace-nowrap">+ Variante</button>
                            <button onClick={() => abrirAgregarTallas(it)} className="text-[11px] px-2 py-1 rounded-md bg-green/[0.15] text-[#6ee7b7] hover:bg-green/[0.25] whitespace-nowrap">+ Tallas</button>
                            <button onClick={() => abrirEditar(it)} className="text-[11px] px-2 py-1 rounded-md bg-accent/[0.15] text-[#c4b8ff] hover:bg-accent/[0.25] whitespace-nowrap">Editar</button>
                            <button onClick={() => setAEliminar(it.id)} className="text-text-faint hover:text-red-300 shrink-0 pl-1"><Trash2 size={13} /></button>
                          </span>
                        </div>

                        {/* Fila expandida: variantes de color/composición de este código */}
                        {expandido && variantesDelItem.length > 0 && (
                          <div className="px-4 py-2 bg-white/[0.02] border-b border-border last:border-b-0">
                            <p className="text-[10px] uppercase tracking-wide text-text-faint mb-1.5 pl-1">
                              Variantes de {it.codigo}
                            </p>
                            <div className="flex flex-col gap-1">
                              {variantesDelItem.map((v) => (
                                <div
                                  key={v.id}
                                  className="grid grid-cols-[100px_1fr_1fr_70px] gap-2 px-2 py-1.5 rounded-md bg-white/[0.03] text-[11.5px] items-start"
                                >
                                  <span className="font-medium">{v.color ?? "—"}</span>
                                  <span className="text-text-dim">{v.composicion ?? "—"}</span>
                                  <span className="text-text-dim font-mono text-[10.5px]">{v.cajas ?? "—"}</span>
                                  <span className="text-right font-medium">{v.cantidad}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="card w-full max-w-[600px] my-6 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold">{editId ? "Editar código" : "Agregar código"}</h2>
              <button onClick={() => setShowForm(false)} className="text-text-faint hover:text-text"><X size={18} /></button>
            </div>
            {errorMsg && <div className="mb-4 px-4 py-2.5 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">{errorMsg}</div>}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div><label className="text-[11.5px] text-text-faint block mb-1">Palet</label><input value={fPalet} onChange={(e) => setFPalet(e.target.value)} className="w-full card px-3 py-2 text-[13px] outline-none" /></div>
              <div><label className="text-[11.5px] text-text-faint block mb-1">Código</label><input value={fCodigo} onChange={(e) => setFCodigo(e.target.value)} placeholder="EL001" className="w-full card px-3 py-2 text-[13px] outline-none" /></div>
              <div className="col-span-2"><label className="text-[11.5px] text-text-faint block mb-1">Descripción</label><input value={fDescripcion} onChange={(e) => setFDescripcion(e.target.value)} className="w-full card px-3 py-2 text-[13px] outline-none" /></div>
              <div><label className="text-[11.5px] text-text-faint block mb-1">Marca</label><input value={fMarca} onChange={(e) => setFMarca(e.target.value)} className="w-full card px-3 py-2 text-[13px] outline-none" /></div>
              <div><label className="text-[11.5px] text-text-faint block mb-1">Color</label><input value={fColor} onChange={(e) => setFColor(e.target.value)} className="w-full card px-3 py-2 text-[13px] outline-none" /></div>
              <div><label className="text-[11.5px] text-text-faint block mb-1">País de origen</label><input value={fPais} onChange={(e) => setFPais(e.target.value)} className="w-full card px-3 py-2 text-[13px] outline-none" /></div>
              <div><label className="text-[11.5px] text-text-faint block mb-1">Tienda</label><input value={fTienda} onChange={(e) => setFTienda(e.target.value)} className="w-full card px-3 py-2 text-[13px] outline-none" /></div>
              <div className="col-span-2">
                <label className="text-[11.5px] text-text-faint block mb-1">Composición</label>
                <BuscadorComposicion
                  valor={fComposicion}
                  onChange={setFComposicion}
                  catalogo={catalogoComposiciones}
                  onAgregarAlCatalogo={agregarComposicionAlCatalogo}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11.5px] text-text-faint block mb-1">Cajas (con cantidad en paréntesis)</label>
                <input value={fCajas} onChange={(e) => setFCajas(e.target.value)} placeholder="164(24) 165(24) 166(24)" className="w-full card px-3 py-2 text-[13px] outline-none font-mono" />
                <p className="text-[11px] text-[#6ee7b7] mt-1">Suma automática: {previewSuma} unidades</p>
              </div>

              {/* Grid de tallas */}
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11.5px] text-text-faint">Cantidad por talla</label>
                  <button
                    type="button"
                    onClick={abrirConfigTallas}
                    className="text-[10.5px] text-[#c4b8ff] hover:underline"
                  >
                    Configurar tallas
                  </button>
                </div>
                {tallasOrden.length === 0 ? (
                  <p className="text-[11px] text-amber">
                    No hay tallas configuradas para esta orden.{" "}
                    <button type="button" onClick={abrirConfigTallas} className="text-[#c4b8ff] hover:underline">
                      Configúralas aquí.
                    </button>
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {tallasOrden.map((t) => (
                        <div key={t} className="flex flex-col items-center">
                          <span className="text-[10px] text-text-faint mb-0.5">{t}</span>
                          <input
                            value={fTallas[t] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFTallas((prev) => {
                                const nuevo = { ...prev };
                                if (v === "" || Number(v) === 0) delete nuevo[t];
                                else nuevo[t] = Number(v);
                                return nuevo;
                              });
                            }}
                            type="number"
                            className="w-[52px] card px-1.5 py-1.5 text-[12px] outline-none text-center"
                          />
                        </div>
                      ))}
                    </div>
                    <MultiplicadorTallas tallas={fTallas} onAplicar={setFTallas} />
                    {/* Aviso visual si tallas no cuadran con cajas */}
                    {(() => {
                      const sumaTallas = sumarTallas(fTallas);
                      if (sumaTallas === 0) return null;
                      if (sumaTallas === previewSuma) {
                        return <p className="text-[11px] text-[#6ee7b7] mt-1.5">✓ Tallas cuadran con las cajas ({sumaTallas}).</p>;
                      }
                      return (
                        <p className="text-[11px] text-[#fbbf24] mt-1.5">
                          ⚠ Las tallas suman {sumaTallas} pero las cajas suman {previewSuma}. Revisa (puedes guardar igual).
                        </p>
                      );
                    })()}
                  </>
                )}
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">
                  Cantidad de factura {editId && <span className="text-amber">(bloqueado tras crear el código)</span>}
                </label>
                <input
                  value={fFactura}
                  onChange={(e) => setFFactura(e.target.value)}
                  type="number"
                  disabled={!!editId}
                  title={editId ? "No se puede editar la factura de un código ya creado" : undefined}
                  className="w-full card px-3 py-2 text-[13px] outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div><label className="text-[11.5px] text-text-faint block mb-1">Tipo de etiqueta</label>
                <select value={fTipoEtiqueta} onChange={(e) => setFTipoEtiqueta(e.target.value)} className="w-full card px-3 py-2 text-[13px] outline-none">
                  <option value="COSIDO">Cosido</option><option value="ADHESIVA">Adhesiva</option>
                </select>
              </div>
              <div className="col-span-2"><label className="text-[11.5px] text-text-faint block mb-1">Novedad (ej. DOBLE, CONJUNTO)</label><input value={fNovedad} onChange={(e) => setFNovedad(e.target.value)} className="w-full card px-3 py-2 text-[13px] outline-none" /></div>
              <div className="col-span-2">
                <label className="text-[11.5px] text-text-faint block mb-1.5">Para impresión de etiqueta</label>
                <div className="flex gap-2">
                  <BotonTresEstados label="Tiene código" valor={fTieneCodigo} onChange={setFTieneCodigo} />
                  <BotonTresEstados label="Tiene talla" valor={fTieneTalla} onChange={setFTieneTalla} />
                  <CheckDosEstados label="Código nuevo" valor={fCodigoNuevo} onChange={setFCodigoNuevo} />
                  <BotonInenMarquilla valor={fInenMarquilla} onChange={setFInenMarquilla} />
                </div>
              </div>
            </div>
            {/* Vista previa del estado en vivo */}
            {fFactura.trim() && (
              <div className="mb-4 text-[12px] text-text-dim">
                Estado: {(() => {
                  const dif = previewSuma - (Number(fFactura) || 0);
                  if (dif === 0) return <span className="text-[#6ee7b7]">Completo</span>;
                  if (dif < 0) return <span className="text-[#fca5a5]">Faltan {Math.abs(dif)}</span>;
                  return <span className="text-[#fbbf24]">Sobran {dif}</span>;
                })()}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg">Cancelar</button>
              <button onClick={guardar} className="btn-primary text-[13px] font-semibold px-4 py-2 rounded-lg">{editId ? "Guardar" : "Agregar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: gestionar mesas del día */}
      {showMesas && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="card w-full max-w-[560px] my-6 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold">Mesas del día</h2>
              <button onClick={() => setShowMesas(false)} className="text-text-faint hover:text-text"><X size={18} /></button>
            </div>

            {/* Lista de mesas */}
            {mesas.length > 0 && (
              <div className="flex flex-col gap-2 mb-4">
                {mesas.map((m) => (
                  <div key={m.id} className="card p-3 flex items-center justify-between bg-white/[0.02]">
                    <div>
                      <p className="text-[13px] font-medium">{m.nombre}</p>
                      <p className="text-[11.5px] text-text-faint">
                        {m.integrantes && m.integrantes.length > 0 ? m.integrantes.join(", ") : "Sin integrantes"}
                      </p>
                    </div>
                    <button onClick={() => eliminarMesa(m.id)} className="text-text-faint hover:text-red-300">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Agregar mesa */}
            <div className="border-t border-border pt-3">
              <p className="text-[11.5px] font-semibold text-text-dim mb-2">Agregar mesa</p>
              <div className="grid grid-cols-[110px_1fr] gap-2 mb-2">
                <input
                  value={nuevaMesaNombre}
                  onChange={(e) => setNuevaMesaNombre(e.target.value)}
                  placeholder="Mesa 1"
                  className="card px-3 py-2 text-[13px] outline-none"
                />
                <input
                  value={nuevaMesaIntegrantes}
                  onChange={(e) => setNuevaMesaIntegrantes(e.target.value)}
                  placeholder="Integrantes separados por coma: Juan, Pedro, María"
                  className="card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <button onClick={agregarMesa} className="btn-primary text-[12.5px] font-semibold px-4 py-2 rounded-lg">
                Agregar mesa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: reporte de producción del día por mesa */}
      {showReporte && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="card w-full max-w-[620px] my-6 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold">Producción por mesa</h2>
              <button onClick={() => setShowReporte(false)} className="text-text-faint hover:text-text"><X size={18} /></button>
            </div>

            {/* Selector de día: muestra solo la producción de esa fecha */}
            <div className="flex items-center gap-2 mb-4">
              <label className="text-[11.5px] text-text-faint">Día:</label>
              <select
                value={diaReporte}
                onChange={(e) => setDiaReporte(e.target.value)}
                className="card px-2.5 py-1.5 text-[12.5px] outline-none"
              >
                {!diasConMovimientos.includes(diaReporte) && (
                  <option value={diaReporte}>{diaReporte} (sin datos)</option>
                )}
                {diasConMovimientos.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {mesas.length === 0 ? (
              <p className="text-[12.5px] text-text-faint">
                No hay mesas configuradas. Agrégalas para medir la producción.
              </p>
            ) : (
              <div className="card overflow-hidden">
                <div className="grid grid-cols-[1fr_90px_90px_90px] gap-2 px-4 py-2.5 text-[10.5px] uppercase tracking-wide text-text-faint border-b border-border">
                  <span>Mesa / integrantes</span>
                  <span className="text-right">Unidades</span>
                  <span className="text-right">Cajas</span>
                  <span className="text-right">Tiempo</span>
                </div>
                {mesas.map((m) => {
                  const p = produccionMesa(m.id);
                  return (
                    <div key={m.id} className="grid grid-cols-[1fr_90px_90px_90px] gap-2 px-4 py-3 items-center border-b border-border last:border-b-0 text-[12px]">
                      <div>
                        <p className="font-medium">{m.nombre}</p>
                        <p className="text-[10.5px] text-text-faint">
                          {m.integrantes && m.integrantes.length > 0 ? m.integrantes.join(", ") : "—"}
                        </p>
                      </div>
                      <span className="text-right font-medium">{p.unidades}</span>
                      <span className="text-right text-text-dim">{p.cajas}</span>
                      <span className="text-right text-text-dim">{p.minutos > 0 ? `${p.minutos} min` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[10.5px] text-text-faint mt-3">
              El tiempo se calcula entre el primer y último movimiento de cada mesa. Unidades = suma de cajas capturadas por esa mesa.
            </p>
          </div>
        </div>
      )}

      {/* Modal: agregar variante (color/composición distinta del mismo código) */}
      {showAgregarVariante && itemVarianteId && (() => {
        const item = items.find((i) => i.id === itemVarianteId);
        const sumaTallasVariante = sumarTallas(vTallas);
        const sumaCajaVariante = sumarCajas(vCajas);
        return (
          <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] p-4 overflow-y-auto">
            <div className="card w-full max-w-[520px] my-6 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[16px] font-semibold">Agregar variante</h2>
                <button onClick={() => setShowAgregarVariante(false)} className="text-text-faint hover:text-text"><X size={18} /></button>
              </div>
              <p className="text-[12.5px] text-text-dim mb-3">
                Código <span className="font-medium text-text">{item?.codigo}</span> — usa esto cuando el
                mismo código viene en otro color o composición. Se suma al total contra factura, pero
                queda registrado por separado para el informe.
              </p>

              {errorMsg && <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">{errorMsg}</div>}

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[11.5px] text-text-faint block mb-1">Color</label>
                  <input value={vColor} onChange={(e) => setVColor(e.target.value)} className="w-full card px-3 py-2 text-[13px] outline-none" />
                </div>
                <div>
                  <label className="text-[11.5px] text-text-faint block mb-1">Composición</label>
                  <BuscadorComposicion
                    valor={vComposicion}
                    onChange={setVComposicion}
                    catalogo={catalogoComposiciones}
                    onAgregarAlCatalogo={agregarComposicionAlCatalogo}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="text-[11.5px] text-text-faint block mb-1">Caja(s) de esta variante *</label>
                <input value={vCajas} onChange={(e) => setVCajas(e.target.value)} placeholder="245(12)" className="w-full card px-3 py-2 text-[13px] outline-none font-mono" />
                <p className="text-[11px] text-[#6ee7b7] mt-1">Suma automática: {sumaCajaVariante} unidades</p>
              </div>

              <label className="text-[11.5px] text-text-faint block mb-1">Tallas de esta variante (opcional)</label>
              {tallasOrden.length === 0 ? (
                <p className="text-[11px] text-amber mb-2">Esta orden no tiene tallas configuradas todavía.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mb-2">
                  {tallasOrden.map((t) => (
                    <div key={t} className="flex flex-col items-center">
                      <span className="text-[10px] text-text-faint mb-0.5">{t}</span>
                      <input
                        value={vTallas[t] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setVTallas((prev) => {
                            const nuevo = { ...prev };
                            if (v === "" || Number(v) === 0) delete nuevo[t];
                            else nuevo[t] = Number(v);
                            return nuevo;
                          });
                        }}
                        type="number"
                        className="w-[52px] card px-1.5 py-1.5 text-[12px] outline-none text-center"
                      />
                    </div>
                  ))}
                </div>
              )}
              <MultiplicadorTallas tallas={vTallas} onAplicar={setVTallas} />

              {sumaTallasVariante > 0 && sumaCajaVariante > 0 && (
                sumaTallasVariante === sumaCajaVariante ? (
                  <p className="text-[11px] text-[#6ee7b7] mb-3">✓ Las tallas cuadran con la caja ({sumaTallasVariante}).</p>
                ) : (
                  <p className="text-[11px] text-[#fbbf24] mb-3">
                    ⚠ Las tallas suman {sumaTallasVariante} pero la caja trae {sumaCajaVariante}. Revisa (puedes guardar igual).
                  </p>
                )
              )}

              <label className="text-[11.5px] text-text-faint block mb-1.5">Para impresión de etiqueta</label>
              <div className="flex gap-2 mb-3">
                <BotonTresEstados label="Tiene código" valor={vTieneCodigo} onChange={setVTieneCodigo} />
                <BotonTresEstados label="Tiene talla" valor={vTieneTalla} onChange={setVTieneTalla} />
                <CheckDosEstados label="Código nuevo" valor={vCodigoNuevo} onChange={setVCodigoNuevo} />
                <BotonInenMarquilla valor={vInenMarquilla} onChange={setVInenMarquilla} />
              </div>

              <div className="flex gap-2 justify-end mt-2">
                <button onClick={() => setShowAgregarVariante(false)} className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg">Cancelar</button>
                <button onClick={guardarAgregarVariante} className="btn-primary text-[13px] font-semibold px-4 py-2 rounded-lg">Agregar variante</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: agregar tallas de una caja nueva (suma al total del código) */}
      {showAgregarTallas && itemAgregarTallas && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="card w-full max-w-[480px] my-6 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold">Agregar tallas</h2>
              <button onClick={() => setShowAgregarTallas(false)} className="text-text-faint hover:text-text"><X size={18} /></button>
            </div>
            <p className="text-[12.5px] text-text-dim mb-3">
              Código <span className="font-medium text-text">{itemAgregarTallas.codigo}</span> — escribe
              solo las tallas de la caja nueva que acabas de contar. El sistema las suma al total que
              ya tenía este código, no hace falta calcular nada a mano.
            </p>

            {errorMsg && <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">{errorMsg}</div>}

            {Object.keys(itemAgregarTallas.tallas_detalle ?? {}).length > 0 && (
              <p className="text-[11px] text-text-faint mb-3">
                Ya tenía: {ordenarClavesDeTallas(Object.keys(itemAgregarTallas.tallas_detalle ?? {})).map((t) => `${t}:${(itemAgregarTallas.tallas_detalle ?? {})[t]}`).join(" ")}
              </p>
            )}

            <div className="mb-3">
              <label className="text-[11.5px] text-text-faint block mb-1">
                Caja nueva (opcional, se suma a las cajas del código)
              </label>
              <input
                value={cajaNuevaTallas}
                onChange={(e) => setCajaNuevaTallas(e.target.value)}
                placeholder="Ej. 245(12)"
                className="w-full card px-3 py-2 text-[13px] outline-none font-mono"
              />
            </div>

            <label className="text-[11.5px] text-text-faint block mb-1">Tallas de esta caja</label>
            {tallasOrden.length === 0 ? (
              <p className="text-[11px] text-amber mb-2">
                Esta orden no tiene tallas configuradas todavía.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 mb-2">
                {tallasOrden.map((t) => (
                  <div key={t} className="flex flex-col items-center">
                    <span className="text-[10px] text-text-faint mb-0.5">{t}</span>
                    <input
                      value={tallasNuevas[t] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTallasNuevas((prev) => {
                          const nuevo = { ...prev };
                          if (v === "" || Number(v) === 0) delete nuevo[t];
                          else nuevo[t] = Number(v);
                          return nuevo;
                        });
                      }}
                      type="number"
                      className="w-[52px] card px-1.5 py-1.5 text-[12px] outline-none text-center"
                    />
                  </div>
                ))}
              </div>
            )}
            <MultiplicadorTallas tallas={tallasNuevas} onAplicar={setTallasNuevas} />

            {/* Aviso de cuadre: tallas de la caja nueva vs cantidad de la caja nueva */}
            {(() => {
              const sumaTallasNuevas = sumarTallas(tallasNuevas);
              const sumaCajaNueva = sumarCajas(cajaNuevaTallas);
              if (sumaTallasNuevas === 0 || sumaCajaNueva === 0) return null;
              if (sumaTallasNuevas === sumaCajaNueva) {
                return <p className="text-[11px] text-[#6ee7b7] mb-3">✓ Las tallas cuadran con la caja ({sumaTallasNuevas}).</p>;
              }
              return (
                <p className="text-[11px] text-[#fbbf24] mb-3">
                  ⚠ Las tallas suman {sumaTallasNuevas} pero la caja nueva trae {sumaCajaNueva}. Revisa
                  (puedes guardar igual).
                </p>
              );
            })()}

            <div className="flex gap-2 justify-end mt-2">
              <button onClick={() => setShowAgregarTallas(false)} className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg">Cancelar</button>
              <button onClick={guardarAgregarTallas} className="btn-primary text-[13px] font-semibold px-4 py-2 rounded-lg">Sumar al código</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: configurar tallas de la orden */}
      {showTallasConfig && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="card w-full max-w-[480px] my-6 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold">Configurar tallas de la orden</h2>
              <button onClick={() => setShowTallasConfig(false)} className="text-text-faint hover:text-text"><X size={18} /></button>
            </div>
            <p className="text-[12px] text-text-dim mb-3">
              Escribe las tallas separadas por coma. Estas serán las columnas para capturar cantidades.
            </p>
            <input
              value={tallasInput}
              onChange={(e) => setTallasInput(e.target.value)}
              placeholder="S, M, L, XL"
              className="w-full card px-3 py-2 text-[13px] outline-none mb-2 font-mono"
            />
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setTallasInput(TALLAS_ROPA.join(", "))}
                className="text-[11px] px-2 py-1 rounded-md card text-text-dim hover:text-text"
              >
                Usar tallas de ropa
              </button>
              <button
                type="button"
                onClick={() => setTallasInput(TALLAS_CALZADO.join(", "))}
                className="text-[11px] px-2 py-1 rounded-md card text-text-dim hover:text-text"
              >
                Usar tallas de calzado
              </button>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowTallasConfig(false)} className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg">Cancelar</button>
              <button onClick={guardarTallasOrden} className="btn-primary text-[13px] font-semibold px-4 py-2 rounded-lg">Guardar tallas</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: datos del informe final */}
      {showDatosInforme && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="card w-full max-w-[560px] my-6 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold">Datos del informe final</h2>
              <button onClick={() => setShowDatosInforme(false)} className="text-text-faint hover:text-text"><X size={18} /></button>
            </div>
            <p className="text-[12px] text-text-dim mb-3">
              Estos datos aparecen en el Informe Final de etiquetado (el que usa contabilidad para facturar).
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Proveedor y N° de factura</label>
                <input
                  value={fProveedorFactura}
                  onChange={(e) => setFProveedorFactura(e.target.value)}
                  placeholder="Ej. C&J CLARK LATIN AMERICA"
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Bodega del proceso</label>
                <input
                  value={fBodegaProceso}
                  onChange={(e) => setFBodegaProceso(e.target.value)}
                  placeholder="Ej. ETYECU Km 11 Vía Daule, Lot. Parque Industrial El Sauce Galpón #4"
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Reglamento técnico aplicado</label>
                <input
                  value={fReglamento}
                  onChange={(e) => setFReglamento(e.target.value)}
                  placeholder="Ej. RTE INEN 2107 para el etiquetado de calzado y marroquinería"
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Supervisora</label>
                <input
                  value={fSupervisora}
                  onChange={(e) => setFSupervisora(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowDatosInforme(false)} className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg">Cancelar</button>
              <button onClick={guardarDatosInforme} className="btn-primary text-[13px] font-semibold px-4 py-2 rounded-lg">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* PDF: Informe Final de Etiquetado (lo que factura contabilidad) */}
      {showInforme && orden && (
        <div className="fixed inset-0 z-[70] print:static print:z-auto print-static-container">
          <div className="print:hidden fixed top-4 right-4 z-10">
            <button
              onClick={() => setShowInforme(false)}
              className="bg-white text-black rounded-lg px-3 py-2 text-[13px] font-semibold shadow-lg"
            >
              Cerrar
            </button>
          </div>
          <div className="print-area hidden print:block text-black bg-white p-10">
            <div className="max-w-[720px] mx-auto">
              <div className="flex items-center justify-center gap-3 mb-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-etyecu.png" alt="ETYECU" className="h-14" />
              </div>
              <p className="text-[14px] font-bold text-center mb-0.5">ETIQUETADO EN ECUADOR</p>
              <p className="text-[11px] text-center mb-5">Según Res. 16049</p>

              <table className="w-full text-[10.5px] border border-black/50 border-collapse mb-4">
                <tbody>
                  <tr>
                    <td className="border border-black/40 p-1.5 font-bold w-[170px]">Número de Orden:</td>
                    <td className="border border-black/40 p-1.5 w-[200px]">{orden.numero_etq}</td>
                    <td className="border border-black/40 p-1.5 font-bold w-[170px]">Fecha de Emisión:</td>
                    <td className="border border-black/40 p-1.5">
                      {new Date().toISOString().slice(0, 10)}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black/40 p-1.5 font-bold">Importador:</td>
                    <td className="border border-black/40 p-1.5" colSpan={3}>{orden.cliente_nombre ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="border border-black/40 p-1.5 font-bold">RUC:</td>
                    <td className="border border-black/40 p-1.5">{orden.ruc_cliente ?? "—"}</td>
                    <td className="border border-black/40 p-1.5 font-bold">Dirección:</td>
                    <td className="border border-black/40 p-1.5">{orden.direccion_cliente ?? "—"}</td>
                  </tr>
                  <tr>
                    <td className="border border-black/40 p-1.5 font-bold">Proveedor y Factura N°:</td>
                    <td className="border border-black/40 p-1.5" colSpan={3}>
                      {orden.proveedor_factura ?? "—"}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black/40 p-1.5 font-bold">Bodega del Proceso:</td>
                    <td className="border border-black/40 p-1.5" colSpan={3}>
                      {orden.bodega_proceso ?? "—"}
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="text-[11px] font-bold mb-1">REGLAMENTOS ETIQUETADOS DURANTE EL PROCESO</p>
              <p className="text-[10.5px] border border-black/40 p-2 mb-4">
                {orden.reglamento_tecnico ?? "—"}
              </p>

              <p className="text-[10.5px] mb-3">
                Hemos procedido a realizar el etiquetado de su mercadería, correspondiente a los
                reglamentos señalados en el párrafo anterior. A continuación detallamos el total de
                prendas etiquetadas:
              </p>

              <button
                type="button"
                onClick={() => setVerInformePorCategoria((v) => !v)}
                className="print:hidden text-[11px] text-[#c4b8ff] hover:underline mb-2"
              >
                {verInformePorCategoria
                  ? "Ver detalle completo por descripción exacta"
                  : "Ver resumen unificado por categoría"}
              </button>

              <table className="w-full text-[10px] border border-black/50 border-collapse mb-2">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black/40 p-1.5 text-left">DESCRIPCIÓN</th>
                    <th className="border border-black/40 p-1.5 text-right w-[110px]">CANTIDAD DE FACTURA</th>
                    <th className="border border-black/40 p-1.5 text-right w-[120px]">CANTIDAD DE INVENTARIO</th>
                    <th className="border border-black/40 p-1.5 text-right w-[110px]">TOTAL DE ETIQUETAS</th>
                  </tr>
                </thead>
                <tbody>
                  {filasInforme.map((g) => (
                    <tr key={g.descripcion}>
                      <td className="border border-black/40 p-1.5">{g.descripcion}</td>
                      <td className="border border-black/40 p-1.5 text-right">{g.cantidadFactura}</td>
                      <td className="border border-black/40 p-1.5 text-right">{g.cantidadInventario}</td>
                      <td className="border border-black/40 p-1.5 text-right">{g.totalEtiquetas}</td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="border border-black/40 p-1.5 bg-gray-100">TOTALES</td>
                    <td className="border border-black/40 p-1.5 text-right">{totalesInformeFilas.factura}</td>
                    <td className="border border-black/40 p-1.5 text-right">{totalesInformeFilas.inventario}</td>
                    <td className="border border-black/40 p-1.5 text-right">{totalesInformeFilas.etiquetas}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-16 grid grid-cols-2 gap-10 text-center text-[10.5px] break-inside-avoid">
                <div>
                  <div className="border-t border-black pt-1">Realizado por</div>
                  <p className="mt-0.5">{orden.supervisora ?? "—"}</p>
                  <p>Etiquetado@etyecu.ec</p>
                </div>
                <div>
                  <div className="border-t border-black pt-1">Supervisado por</div>
                  <p className="mt-0.5">Isabel Garcia</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal abierto={aEliminar !== null} titulo="¿Eliminar este código?" mensaje="Se eliminará el renglón del inventario." onConfirmar={confirmarEliminar} onCancelar={() => setAEliminar(null)} />
      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
