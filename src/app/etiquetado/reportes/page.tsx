"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import * as XLSX from "xlsx";
import { Printer, X, Check, HelpCircle } from "lucide-react";
import { ConfirmModal, Toast } from "@/components/Feedback";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const dynamic = "force-dynamic";

type OrdenEtq = {
  id: string;
  numero_etq: string;
  origen: "etyecu" | "externo";
  cliente_nombre: string | null;
  tipo_producto: string | null;
  estado: string;
  fecha: string;
  creado_en: string;
  tallas: string[] | null;
};

type ItemEtq = {
  id: string;
  orden_id: string;
  palet: string | null;
  cajas: string | null;
  codigo: string | null;
  descripcion: string | null;
  marca: string | null;
  tienda: string | null;
  cantidad_contada: number;
  cantidad_factura: number;
  tallas_detalle: Record<string, number> | null;
  composicion: string | null;
  pais: string | null;
  tiene_codigo: boolean | null;
  tiene_talla: boolean | null;
  codigo_nuevo: boolean | null;
  tipo_etiqueta: string | null;
  novedad: string | null;
  ya_impreso: boolean | null;
  inen_marquilla: "inen" | "marquilla" | null;
  revisado: boolean | null;
};

type VarianteEtq = {
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
  ya_impreso: boolean | null;
  inen_marquilla: "inen" | "marquilla" | null;
  revisado: boolean | null;
};

type TallasPorCaja = {
  id: string;
  item_id: string;
  variante_id: string | null;
  caja: string;
  numero_caja: string | null;
  tallas_detalle: Record<string, number> | null;
};

type Movimiento = {
  id: string;
  orden_id: string;
  item_id: string | null;
  mesa_id: string | null;
  cantidad: number;
  creado_en: string;
};

type Mesa = {
  id: string;
  orden_id: string;
  nombre: string;
  integrantes: string[] | null;
};

const COLORES = ["#7c6cf0", "#6ee7b7", "#fbbf24", "#fca5a5", "#93c5fd", "#c4b8ff"];

const tabs = [
  { id: "resumen", label: "Resumen" },
  { id: "ordenes", label: "Órdenes" },
  { id: "produccion", label: "Producción por mesa" },
  { id: "inventario", label: "Inventario" },
  { id: "inconsistencias", label: "Inconsistencias" },
  { id: "productividad", label: "Productividad" },
] as const;

export default function ReportesEtiquetadoPage() {
  const supabase = createClient();

  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("resumen");
  const [ordenes, setOrdenes] = useState<OrdenEtq[]>([]);
  const [items, setItems] = useState<ItemEtq[]>([]);
  const [variantesTodas, setVariantesTodas] = useState<VarianteEtq[]>([]);
  const [tallasPorCajaTodas, setTallasPorCajaTodas] = useState<TallasPorCaja[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState<"todos" | "etyecu" | "externo">("todos");
  const [ordenSeleccionadaId, setOrdenSeleccionadaId] = useState<string>("");
  const [paletSeleccionado, setPaletSeleccionado] = useState<string>("todos");
  const [cajaFiltro, setCajaFiltro] = useState("");
  const [composicionFiltro, setComposicionFiltro] = useState<string>("todas");
  const [busquedaComposicion, setBusquedaComposicion] = useState("");
  const [sugerenciasComposicionAbiertas, setSugerenciasComposicionAbiertas] = useState(false);

  // Módulo de Inconsistencias
  const [tipoInconsistencia, setTipoInconsistencia] = useState<
    "todas" | "completo" | "faltante" | "sobrante" | "nuevo"
  >(
    "todas"
  );
  const [filtroRevisado, setFiltroRevisado] = useState<"todos" | "revisado" | "sin_revisar">("todos");
  const [filtroImpreso, setFiltroImpreso] = useState<"todos" | "impreso" | "sin_imprimir">("todos");
  // Filtros de Palet/Caja PROPIOS de Inconsistencias (independientes de los
  // de Inventario), mismo patrón en cascada: primero se elige el palet,
  // luego opcionalmente una caja específica dentro de ese palet.
  const [paletInconsistencia, setPaletInconsistencia] = useState<string>("todos");
  const [cajaFiltroInconsistencia, setCajaFiltroInconsistencia] = useState("");
  const [busquedaInconsistencias, setBusquedaInconsistencias] = useState("");
  const [itemRevisarId, setItemRevisarId] = useState<string | null>(null);
  const [cajaEditId, setCajaEditId] = useState<string | null>(null);
  const [cajaEditTexto, setCajaEditTexto] = useState("");
  const [cajaEditTallas, setCajaEditTallas] = useState<Record<string, number>>({});
  const [cajaAEliminarId, setCajaAEliminarId] = useState<string | null>(null);

  // Edición de los datos generales del código (palet, marca, composición,
  // país, tienda, tipo etiqueta, novedad) directamente desde el modal de
  // "Revisar cajas" — para que no haga falta abrir la pantalla de Inventario
  // en otra pestaña.
  const [editandoDatosGenerales, setEditandoDatosGenerales] = useState(false);
  const [egPalet, setEgPalet] = useState("");
  const [egCajas, setEgCajas] = useState("");
  const [egMarca, setEgMarca] = useState("");
  const [egComposicion, setEgComposicion] = useState("");
  const [egPais, setEgPais] = useState("");
  const [egTienda, setEgTienda] = useState("");
  const [egTipoEtiqueta, setEgTipoEtiqueta] = useState("COSIDO");
  const [egNovedad, setEgNovedad] = useState("");
  const [guardandoDatosGenerales, setGuardandoDatosGenerales] = useState(false);

  // Unificar dos códigos que en realidad son el mismo producto (el
  // proveedor a veces manda un código distinto para completar un
  // faltante). Isabel busca el código secundario, elige cuál de los dos
  // queda como principal, y todo se fusiona en él.
  const [showUnificar, setShowUnificar] = useState(false);
  const [busquedaUnificar, setBusquedaUnificar] = useState("");
  const [codigoSecundarioId, setCodigoSecundarioId] = useState<string | null>(null);
  const [principalElegido, setPrincipalElegido] = useState<"actual" | "otro">("actual");
  const [unificando, setUnificando] = useState(false);

  // Módulo de Productividad
  const [vistaProductividad, setVistaProductividad] = useState<"general" | "orden">("general");
  const [prodFechaDesde, setProdFechaDesde] = useState("");
  const [prodFechaHasta, setProdFechaHasta] = useState("");
  const [prodMesaFiltro, setProdMesaFiltro] = useState<string>("todas"); // "todas" o el NOMBRE de la mesa
  const [busquedaInventario, setBusquedaInventario] = useState("");
  const [tipoBusqueda, setTipoBusqueda] = useState<
    "todos" | "codigo" | "descripcion" | "tallas" | "composicion" | "pais"
  >("todos");

  const cargar = useCallback(async () => {
    setLoading(true);
    const [ordRes, itemsRes, movRes, mesasRes, varRes, tallasCajaRes] = await Promise.all([
      supabase
        .from("etq_ordenes")
        .select("id, numero_etq, origen, cliente_nombre, tipo_producto, estado, fecha, creado_en, tallas"),
      supabase
        .from("etq_items")
        .select(
          "id, orden_id, palet, cajas, codigo, descripcion, marca, tienda, cantidad_contada, cantidad_factura, tallas_detalle, composicion, pais, tiene_codigo, tiene_talla, codigo_nuevo, tipo_etiqueta, novedad, ya_impreso, inen_marquilla, revisado"
        ),
      supabase.from("etq_movimientos").select("id, orden_id, item_id, mesa_id, cantidad, creado_en"),
      supabase.from("etq_mesas").select("id, orden_id, nombre, integrantes"),
      supabase.from("etq_variantes").select("id, item_id, color, composicion, cajas, cantidad, tallas_detalle, tiene_codigo, tiene_talla, codigo_nuevo, ya_impreso, inen_marquilla, revisado"),
      supabase
        .from("etq_tallas_por_caja")
        .select("id, item_id, variante_id, caja, numero_caja, tallas_detalle"),
    ]);

    if (ordRes.error) {
      setErrorMsg(
        ordRes.error.message.includes("does not exist") || ordRes.error.message.includes("relation")
          ? "Falta crear las tablas de etiquetado. ¿Corriste etiquetado_schema.sql en Supabase?"
          : ordRes.error.message
      );
    } else {
      setErrorMsg(null);
    }

    setOrdenes((ordRes.data as OrdenEtq[]) ?? []);
    setItems((itemsRes.data as ItemEtq[]) ?? []);
    setMovimientos((movRes.data as Movimiento[]) ?? []);
    setMesas((mesasRes.data as Mesa[]) ?? []);
    setVariantesTodas((varRes.data as VarianteEtq[]) ?? []);
    setTallasPorCajaTodas((tallasCajaRes.data as TallasPorCaja[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Órdenes filtradas por fecha y origen
  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter((o) => {
      const f = new Date(o.fecha).getTime();
      if (fechaDesde && f < new Date(fechaDesde).getTime()) return false;
      if (fechaHasta && f > new Date(fechaHasta + "T23:59:59").getTime()) return false;
      if (filtroOrigen !== "todos" && o.origen !== filtroOrigen) return false;
      return true;
    });
  }, [ordenes, fechaDesde, fechaHasta, filtroOrigen]);

  const idsFiltrados = useMemo(() => new Set(ordenesFiltradas.map((o) => o.id)), [ordenesFiltradas]);

  const itemsFiltrados = useMemo(
    () => items.filter((it) => idsFiltrados.has(it.orden_id)),
    [items, idsFiltrados]
  );

  const movimientosFiltrados = useMemo(
    () => movimientos.filter((m) => idsFiltrados.has(m.orden_id)),
    [movimientos, idsFiltrados]
  );

  const mesasFiltradas = useMemo(
    () => mesas.filter((m) => idsFiltrados.has(m.orden_id)),
    [mesas, idsFiltrados]
  );

  // KPIs de resumen
  const resumen = useMemo(() => {
    const totalContado = itemsFiltrados.reduce((a, it) => a + Number(it.cantidad_contada || 0), 0);
    const totalFactura = itemsFiltrados.reduce((a, it) => a + Number(it.cantidad_factura || 0), 0);
    const completos = itemsFiltrados.filter(
      (it) => it.cantidad_factura > 0 && it.cantidad_contada === it.cantidad_factura
    ).length;
    const conProblema = itemsFiltrados.filter(
      (it) => it.cantidad_factura > 0 && it.cantidad_contada !== it.cantidad_factura
    ).length;
    const totalCodigos = itemsFiltrados.filter((it) => it.cantidad_factura > 0).length;
    const pctCompletos = totalCodigos > 0 ? Math.round((completos / totalCodigos) * 100) : 0;
    return {
      totalOrdenes: ordenesFiltradas.length,
      totalContado,
      totalFactura,
      pctCompletos,
      conProblema,
    };
  }, [itemsFiltrados, ordenesFiltradas]);

  // Órdenes por cliente (barras, para ver quién trae más)
  const porCliente = useMemo(() => {
    const conteo: Record<string, number> = {};
    ordenesFiltradas.forEach((o) => {
      const c = o.cliente_nombre ?? "Sin cliente";
      conteo[c] = (conteo[c] ?? 0) + 1;
    });
    return Object.entries(conteo)
      .map(([nombre, ordenes]) => ({ nombre, ordenes }))
      .sort((a, b) => b.ordenes - a.ordenes)
      .slice(0, 8);
  }, [ordenesFiltradas]);

  // Órdenes por tipo de producto
  const porProducto = useMemo(() => {
    const conteo: Record<string, number> = {};
    ordenesFiltradas.forEach((o) => {
      const p = o.tipo_producto ?? "otro";
      conteo[p] = (conteo[p] ?? 0) + 1;
    });
    return Object.entries(conteo).map(([name, value]) => ({ name, value }));
  }, [ordenesFiltradas]);

  // Producción por mesa (unidades totales)
  const produccionPorMesa = useMemo(() => {
    return mesasFiltradas
      .map((m) => {
        const movs = movimientosFiltrados.filter((mv) => mv.mesa_id === m.id);
        const unidades = movs.reduce((a, mv) => a + Number(mv.cantidad || 0), 0);
        return { nombre: m.nombre, unidades };
      })
      .filter((m) => m.unidades > 0)
      .sort((a, b) => b.unidades - a.unidades);
  }, [mesasFiltradas, movimientosFiltrados]);

  // ---- Módulo de Productividad ----

  // Movimientos según la vista elegida: general (rango de fechas, todas las
  // órdenes) o por la orden seleccionada arriba en el módulo de Inventario.
  const movimientosProductividad = useMemo(() => {
    let base = movimientos;
    if (vistaProductividad === "orden") {
      if (!ordenSeleccionadaId) return [];
      base = movimientos.filter((m) => m.orden_id === ordenSeleccionadaId);
    } else {
      if (prodFechaDesde) {
        const desde = new Date(prodFechaDesde).getTime();
        base = base.filter((m) => new Date(m.creado_en).getTime() >= desde);
      }
      if (prodFechaHasta) {
        const hasta = new Date(prodFechaHasta + "T23:59:59").getTime();
        base = base.filter((m) => new Date(m.creado_en).getTime() <= hasta);
      }
    }
    if (prodMesaFiltro !== "todas") {
      // "Mesa 1" puede existir con IDs distintos en cada orden (cada orden
      // crea sus propias mesas), así que se filtra por NOMBRE, agrupando
      // todos los ids de mesas que comparten ese nombre.
      const idsConEseNombre = new Set(
        mesas.filter((m) => m.nombre === prodMesaFiltro).map((m) => m.id)
      );
      base = base.filter((m) => m.mesa_id && idsConEseNombre.has(m.mesa_id));
    }
    return base;
  }, [
    movimientos,
    mesas,
    vistaProductividad,
    ordenSeleccionadaId,
    prodFechaDesde,
    prodFechaHasta,
    prodMesaFiltro,
  ]);

  // Todas las mesas que aparecen en el rango (deduplicadas por nombre, ya que
  // una "Mesa 1" puede existir en varias órdenes con distinto id).
  const mesasEnRango = useMemo(() => {
    const idsConMovimiento = new Set(movimientosProductividad.map((m) => m.mesa_id));
    return mesas.filter((m) => idsConMovimiento.has(m.id));
  }, [mesas, movimientosProductividad]);

  // Detalle de productividad por mesa: unidades, cajas, horas trabajadas, ritmo.
  // Se agrupa por NOMBRE de mesa (no por id), porque en la vista general una
  // misma "Mesa 1" puede tener varios ids distintos (uno por cada orden).
  type FilaProductividad = {
    mesaId: string;
    nombre: string;
    integrantes: string[];
    unidades: number;
    cajas: number;
    horas: number;
    ritmo: number; // unidades por hora
  };

  const productividadPorMesa: FilaProductividad[] = useMemo(() => {
    const nombresUnicos = Array.from(new Set(mesasEnRango.map((m) => m.nombre)));

    return nombresUnicos
      .map((nombre) => {
        // Todos los ids de mesas (de cualquier orden) que llevan este nombre
        const idsDelNombre = new Set(mesas.filter((m) => m.nombre === nombre).map((m) => m.id));
        const movs = movimientosProductividad.filter(
          (mv) => mv.mesa_id && idsDelNombre.has(mv.mesa_id)
        );
        const unidades = movs.reduce((a, mv) => a + Number(mv.cantidad || 0), 0);
        const cajas = movs.length;
        let horas = 0;
        if (movs.length >= 2) {
          const tiempos = movs.map((mv) => new Date(mv.creado_en).getTime()).sort((a, b) => a - b);
          horas = (tiempos[tiempos.length - 1] - tiempos[0]) / (1000 * 60 * 60);
        }
        const ritmo = horas > 0 ? unidades / horas : 0;
        // Integrantes: de la mesa más reciente con este nombre que tenga movimiento
        const mesaConIntegrantes = mesasEnRango.find((m) => m.nombre === nombre);
        return {
          mesaId: nombre, // usado solo como key en la tabla, no como id real
          nombre,
          integrantes: mesaConIntegrantes?.integrantes ?? [],
          unidades,
          cajas,
          horas: Math.round(horas * 10) / 10,
          ritmo: Math.round(ritmo),
        };
      })
      .filter((f) => f.unidades > 0)
      .sort((a, b) => b.unidades - a.unidades);
  }, [mesasEnRango, mesas, movimientosProductividad]);

  // KPIs generales del período/orden elegidos
  const kpisProductividad = useMemo(() => {
    const unidadesTotales = productividadPorMesa.reduce((a, f) => a + f.unidades, 0);
    const horasTotales = productividadPorMesa.reduce((a, f) => a + f.horas, 0);
    const ritmoPromedio = horasTotales > 0 ? Math.round(unidadesTotales / horasTotales) : 0;
    const mesaTop =
      productividadPorMesa.length > 0
        ? [...productividadPorMesa].sort((a, b) => b.ritmo - a.ritmo)[0]?.nombre ?? "—"
        : "—";
    return { unidadesTotales, horasTotales: Math.round(horasTotales * 10) / 10, ritmoPromedio, mesaTop };
  }, [productividadPorMesa]);

  // Evolución diaria: unidades producidas por día, para la gráfica de línea/barras
  const evolucionDiaria = useMemo(() => {
    const porDia: Record<string, number> = {};
    movimientosProductividad.forEach((mv) => {
      const dia = mv.creado_en.slice(0, 10);
      porDia[dia] = (porDia[dia] ?? 0) + Number(mv.cantidad || 0);
    });
    return Object.entries(porDia)
      .map(([fecha, unidades]) => ({ fecha, unidades }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [movimientosProductividad]);

  // Inventario de la orden seleccionada (para el tab "Inventario", por orden)
  const itemsOrdenSeleccionada = useMemo(
    () => items.filter((it) => it.orden_id === ordenSeleccionadaId),
    [items, ordenSeleccionadaId]
  );

  // Texto legible de las tallas: {"S":24,"M":48} -> "S:24 M:48"
  // Orden lógico conocido de tallas de ropa. JSONB de Postgres NO garantiza
  // conservar el orden en que se ingresaron las claves de un objeto — por
  // eso antes se veían las tallas mezcladas (ej. "L M S" en vez de
  // "S M L", aunque se hubieran escrito en ese orden). Se ordena
  // explícitamente según esta secuencia conocida; cualquier talla que no
  // esté en la lista (numeración de calzado, tallas especiales, etc.) se
  // agrega al final ordenada alfabética/numéricamente como respaldo.
  const ORDEN_TALLAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL", "4XL"];

  function ordenarClavesDeTallas(claves: string[]): string[] {
    return [...claves].sort((a, b) => {
      const ia = ORDEN_TALLAS.indexOf(a.toUpperCase());
      const ib = ORDEN_TALLAS.indexOf(b.toUpperCase());
      if (ia !== -1 && ib !== -1) return ia - ib; // ambas conocidas: por el orden de la lista
      if (ia !== -1) return -1; // solo "a" es conocida: va primero
      if (ib !== -1) return 1; // solo "b" es conocida: va primero
      // Ninguna conocida (ej. numeración de calzado): orden numérico si
      // ambas son números, si no alfabético.
      const na = Number(a);
      const nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }

  function formatoTallas(detalle: Record<string, number> | null): string {
    if (!detalle || Object.keys(detalle).length === 0) return "—";
    return ordenarClavesDeTallas(Object.keys(detalle))
      .map((talla) => `${talla}:${detalle[talla]}`)
      .join(" ");
  }

  // Total de etiquetas a imprimir: suma de las cantidades dentro de cada talla
  function sumarTallasDetalle(detalle: Record<string, number> | null): number {
    if (!detalle) return 0;
    return Object.values(detalle).reduce((a, n) => a + Number(n || 0), 0);
  }

  // ¿El texto de cajas ("164(24) 165(24)" o "179 A 182(96)") contiene ese
  // número de caja exacto, suelto o dentro de un rango "A"?
  function textoContieneCaja(cajasTexto: string | null, numeroCaja: string): boolean {
    if (!cajasTexto || !numeroCaja) return false;
    const objetivo = Number(numeroCaja);
    if (Number.isNaN(objetivo)) return false;

    // Rango: "179 A 182(96)" -> caja 179,180,181,182
    const regexRango = /(\d+)\s*A\s*(\d+)\s*\(/gi;
    let match;
    while ((match = regexRango.exec(cajasTexto)) !== null) {
      const desde = Number(match[1]);
      const hasta = Number(match[2]);
      if (objetivo >= desde && objetivo <= hasta) return true;
    }

    // Números sueltos: "164(24) 165(24)" -> caja 164, 165
    const regexSuelto = /(\d+)\s*\(/g;
    while ((match = regexSuelto.exec(cajasTexto)) !== null) {
      if (Number(match[1]) === objetivo) return true;
    }
    return false;
  }

  // Filtro de búsqueda: código, descripción o tallas
  // Lista de palets disponibles en la orden (para el selector)
  const paletsDisponibles = useMemo(() => {
    const set = new Set(
      itemsOrdenSeleccionada.map((it) => (it.palet ?? "").trim()).filter(Boolean)
    );
    return Array.from(set).sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [itemsOrdenSeleccionada]);

  // Paso 1: filtrar por el palet elegido
  const itemsDelPalet = useMemo(() => {
    if (paletSeleccionado === "todos") return itemsOrdenSeleccionada;
    return itemsOrdenSeleccionada.filter((it) => (it.palet ?? "").trim() === paletSeleccionado);
  }, [itemsOrdenSeleccionada, paletSeleccionado]);

  // Paso 2: dentro del palet, filtrar por número de caja exacto (tipo Excel)
  const itemsDeLaCaja = useMemo(() => {
    const caja = cajaFiltro.trim();
    if (!caja) return itemsDelPalet;
    return itemsDelPalet.filter((it) => textoContieneCaja(it.cajas, caja));
  }, [itemsDelPalet, cajaFiltro]);

  // Composiciones únicas que existen en TODA la orden, para poblar el
  // desplegable del filtro de Composición.
  // Composiciones que existen DENTRO del palet/caja ya elegidos (si no hay
  // palet/caja elegidos, itemsDeLaCaja = toda la orden, así que en ese caso
  // igual muestra todas). Así el buscador de composición solo sugiere lo
  // que de verdad existe en la selección actual, no de toda la orden.
  const composicionesDisponibles = useMemo(() => {
    const set = new Set<string>();
    itemsDeLaCaja.forEach((it) => {
      const c = (it.composicion ?? "").trim();
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [itemsDeLaCaja]);

  // Sugerencias que coinciden con lo que Isabel va escribiendo — para no
  // mostrar un desplegable largo con TODAS las composiciones de una vez,
  // sino solo las que coinciden con la búsqueda (como el resto de
  // buscadores del sistema).
  const composicionesSugeridas = useMemo(() => {
    const q = busquedaComposicion.trim().toLowerCase();
    if (!q) return composicionesDisponibles;
    return composicionesDisponibles.filter((c) => c.toLowerCase().includes(q));
  }, [composicionesDisponibles, busquedaComposicion]);

  // Paso 2.5: filtro de composición COMO SUB-FILTRO dentro de Palet/Caja.
  // Cuando ella ya eligió palet 1 + caja 1, el filtro de composición acota
  // dentro de esa selección (solo las composiciones de esa caja puntual),
  // no de toda la orden.
  const itemsPorComposicion = useMemo(() => {
    if (composicionFiltro === "todas") return itemsDeLaCaja;
    return itemsDeLaCaja.filter((it) => (it.composicion ?? "").trim() === composicionFiltro);
  }, [itemsDeLaCaja, composicionFiltro]);

  // Paso 3: búsqueda de texto libre (código, descripción, tallas, etc.)
  const itemsInventarioFiltrados = useMemo(() => {
    const q = busquedaInventario.trim().toLowerCase();
    if (!q) return itemsPorComposicion;
    return itemsPorComposicion.filter((it) => {
      const codigo = (it.codigo ?? "").toLowerCase();
      const marca = (it.marca ?? "").toLowerCase();
      const descripcion = (it.descripcion ?? "").toLowerCase();
      const tallas = formatoTallas(it.tallas_detalle).toLowerCase();
      const composicion = (it.composicion ?? "").toLowerCase();
      const pais = (it.pais ?? "").toLowerCase();

      if (tipoBusqueda === "codigo") return codigo.includes(q);
      if (tipoBusqueda === "descripcion") return descripcion.includes(q);
      if (tipoBusqueda === "tallas") return tallas.includes(q);
      if (tipoBusqueda === "composicion") return composicion.includes(q);
      if (tipoBusqueda === "pais") return pais.includes(q);

      return (
        codigo.includes(q) ||
        marca.includes(q) ||
        descripcion.includes(q) ||
        tallas.includes(q) ||
        composicion.includes(q) ||
        pais.includes(q)
      );
    });
  }, [itemsPorComposicion, busquedaInventario, tipoBusqueda]);

  // Extrae SOLO la caja buscada del texto completo: "164(24) 165(24)" + "165"
  // -> "165(24)". Si no hay filtro de caja activo, muestra el texto completo.
  function textoCajaFiltrada(cajasTexto: string | null): string {
    if (!cajasTexto) return "—";
    const caja = cajaFiltro.trim();
    if (!caja) return cajasTexto;
    const objetivo = Number(caja);
    if (Number.isNaN(objetivo)) return cajasTexto;

    // Si viene de un rango "179 A 182(96)", se muestra el rango completo
    // (no se puede aislar solo un número dentro del rango).
    const regexRango = /(\d+)\s*A\s*(\d+)\s*\((\d+)\)/gi;
    let match;
    while ((match = regexRango.exec(cajasTexto)) !== null) {
      const desde = Number(match[1]);
      const hasta = Number(match[2]);
      if (objetivo >= desde && objetivo <= hasta) return match[0];
    }

    // Número suelto: extraer solo "165(24)"
    const regexSuelto = new RegExp(`\\b${objetivo}\\s*\\(\\d+\\)`, "g");
    const encontrado = cajasTexto.match(regexSuelto);
    return encontrado ? encontrado[0] : cajasTexto;
  }


  // tiene variantes). Así Isabel ve por separado cada color/composición con
  // su propio desglose de tallas, listo para saber qué imprimir de cada uno.
  type FilaInventario = {
    key: string;
    idReal: string; // id real del item o de la variante, para poder actualizarlo
    esVarianteParaGuardar: boolean; // true = idReal es de etq_variantes, false = de etq_items
    palet: string | null;
    codigo: string | null;
    marca: string | null;
    tienda: string | null;
    descripcion: string | null;
    color: string | null;
    composicion: string | null;
    pais: string | null;
    cajas: string | null;
    cantidad: number;
    tallasTexto: string;
    totalTallas: number;
    esVariante: boolean;
    sinDesgloseDeCaja: boolean; // true si hay filtro de caja pero no hay historial para esa caja
    tieneCodigo: boolean | null;
    tieneTalla: boolean | null;
    yaImpreso: boolean;
  };

  const filasInventario: FilaInventario[] = useMemo(() => {
    const filas: FilaInventario[] = [];
    const cajaActiva = cajaFiltro.trim();

    itemsInventarioFiltrados.forEach((it) => {
      const variantesDelItem = variantesTodas.filter((v) => v.item_id === it.id);
      if (variantesDelItem.length === 0) {
        // ¿Hay filtro de caja? Buscar el desglose específico de esa caja.
        // Si no existe (código capturado antes de tener este historial), se
        // muestra el TOTAL del código como respaldo — no es exacto de esa
        // caja puntual, pero es un número real y utilizable para imprimir.
        let tallasAMostrar = it.tallas_detalle;
        let sinDesglose = false;
        if (cajaActiva) {
          const registro = tallasPorCajaTodas.find(
            (t) => t.item_id === it.id && t.variante_id === null && t.numero_caja === cajaActiva
          );
          if (registro) {
            tallasAMostrar = registro.tallas_detalle;
          } else {
            sinDesglose = true; // se queda con el total del código (it.tallas_detalle)
          }
        }
        filas.push({
          key: it.id,
          idReal: it.id,
          esVarianteParaGuardar: false,
          palet: it.palet,
          codigo: it.codigo,
          marca: it.marca,
          tienda: it.tienda,
          descripcion: it.descripcion,
          color: null,
          composicion: it.composicion,
          pais: it.pais,
          cajas: it.cajas,
          cantidad: it.cantidad_contada,
          tallasTexto: formatoTallas(tallasAMostrar),
          totalTallas: sumarTallasDetalle(tallasAMostrar),
          esVariante: false,
          sinDesgloseDeCaja: sinDesglose,
          tieneCodigo: it.tiene_codigo,
          tieneTalla: it.tiene_talla,
          yaImpreso: it.ya_impreso ?? false,
        });
      } else {
        variantesDelItem.forEach((v, i) => {
          let tallasAMostrar = v.tallas_detalle;
          let sinDesglose = false;
          if (cajaActiva) {
            // Nota: como no guardamos el id real de la variante en este listado
            // (solo item_id + color), buscamos por item_id y comparamos la caja
            // de la variante para asociar el registro correcto.
            const registro = tallasPorCajaTodas.find(
              (t) =>
                t.item_id === it.id &&
                t.numero_caja === cajaActiva &&
                t.caja.trim() === (v.cajas ?? "").trim()
            );
            if (registro) {
              tallasAMostrar = registro.tallas_detalle;
            } else {
              sinDesglose = true; // se queda con el total de la variante (v.tallas_detalle)
            }
          }
          filas.push({
            key: `${it.id}-${i}`,
            idReal: v.id,
            esVarianteParaGuardar: true,
            palet: it.palet,
            codigo: it.codigo,
            marca: it.marca,
            tienda: it.tienda,
            descripcion: it.descripcion,
            color: v.color,
            composicion: v.composicion ?? it.composicion,
            pais: it.pais,
            cajas: v.cajas,
            cantidad: v.cantidad,
            tallasTexto: formatoTallas(tallasAMostrar),
            totalTallas: sumarTallasDetalle(tallasAMostrar),
            esVariante: true,
            sinDesgloseDeCaja: sinDesglose,
            tieneCodigo: v.tiene_codigo,
            tieneTalla: v.tiene_talla,
            yaImpreso: v.ya_impreso ?? false,
          });
        });
      }
    });
    return filas;
  }, [itemsInventarioFiltrados, variantesTodas, tallasPorCajaTodas, cajaFiltro]);

  // Marca/desmarca "Ya impreso" en la fila. Actualiza la tabla correcta
  // (etq_items o etq_variantes) según si la fila es un código simple o una
  // variante de color, usando el id REAL de cada una.
  async function toggleYaImpreso(fila: FilaInventario) {
    const nuevoValor = !fila.yaImpreso;
    const tabla = fila.esVarianteParaGuardar ? "etq_variantes" : "etq_items";
    const { error } = await supabase
      .from(tabla)
      .update({ ya_impreso: nuevoValor })
      .eq("id", fila.idReal);
    if (error) {
      setToast(`No se pudo actualizar: ${error.message}`);
      return;
    }
    // Actualiza solo esa fila en el estado local, SIN recargar toda la
    // tabla desde el servidor — así no hay parpadeo ni reordenamiento
    // visual, el resaltado se ve al instante y de forma estable.
    if (fila.esVarianteParaGuardar) {
      setVariantesTodas((prev) =>
        prev.map((v) => (v.id === fila.idReal ? { ...v, ya_impreso: nuevoValor } : v))
      );
    } else {
      setItems((prev) =>
        prev.map((it) => (it.id === fila.idReal ? { ...it, ya_impreso: nuevoValor } : it))
      );
    }
  }

  // Marca/desmarca "Revisado" en Inconsistencias, directamente sobre
  // etq_items (ahí las filas son códigos completos, no variantes
  // separadas). Actualiza el estado local sin recargar toda la tabla, para
  // evitar el mismo parpadeo que ya corregimos en "Ya impreso".
  async function toggleRevisado(itemId: string, valorActual: boolean | null) {
    const nuevoValor = !valorActual;
    const { error } = await supabase.from("etq_items").update({ revisado: nuevoValor }).eq("id", itemId);
    if (error) {
      setToast(`No se pudo actualizar: ${error.message}`);
      return;
    }
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, revisado: nuevoValor } : it)));
  }

  // Descarga el inventario tal cual se ve en pantalla (mismas columnas y
  // mismas filas ya filtradas por palet/caja/búsqueda), agregando el campo
  // Tienda que no se muestra en la tabla pero sí se pide en la exportación.
  function descargarInventarioExcel() {
    const ordenActual = ordenes.find((o) => o.id === ordenSeleccionadaId);
    const filas = filasInventario.map((f) => {
      const itemOriginal = itemsInventarioFiltrados.find((it) => it.id === f.key);
      // Inen y Marquilla son mutuamente excluyentes (inen_marquilla solo
      // puede ser "inen", "marquilla" o null) — se muestran como dos
      // columnas separadas para que sea fácil filtrar/contar en Excel.
      const valorInenMarquilla = f.esVariante
        ? variantesTodas.find((v) => v.id === f.idReal)?.inen_marquilla
        : itemOriginal?.inen_marquilla;
      return {
        Palet: f.palet ?? "",
        Cajas: f.cajas ?? "",
        Código: f.codigo ?? "",
        Marca: itemOriginal?.marca ?? "",
        Descripción: f.descripcion ?? "",
        Color: f.color ?? "",
        Tallas: f.tallasTexto,
        Composición: f.composicion ?? "",
        Tienda: itemOriginal?.tienda ?? "",
        País: f.pais ?? "",
        Factura: f.esVariante ? "" : itemOriginal?.cantidad_factura ?? "",
        Contado: f.cantidad,
        "Total etiquetas": f.totalTallas,
        Inen: valorInenMarquilla === "inen" ? "Sí" : "",
        Marquilla: valorInenMarquilla === "marquilla" ? "Sí" : "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    const nombreArchivo = `Inventario_${ordenActual?.numero_etq ?? "orden"}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  }

  const totalesOrdenSeleccionada = itemsOrdenSeleccionada.reduce(
    (acc, it) => ({
      factura: acc.factura + Number(it.cantidad_factura || 0),
      contado: acc.contado + Number(it.cantidad_contada || 0),
    }),
    { factura: 0, contado: 0 }
  );

  // ---- Módulo de Inconsistencias ----

  // Códigos de la orden seleccionada con diferencia contra factura
  // Todos los códigos con factura de la orden (completos e inconsistentes),
  // para que el filtro pueda mostrar cualquiera de los tres estados.
  const inconsistencias = useMemo(() => {
    return itemsOrdenSeleccionada
      .map((it) => ({ ...it, diferencia: it.cantidad_contada - it.cantidad_factura }))
      .filter((it) => it.cantidad_factura > 0);
  }, [itemsOrdenSeleccionada]);

  const inconsistenciasFiltradas = useMemo(() => {
    const q = busquedaInconsistencias.trim().toLowerCase();
    return inconsistencias.filter((it) => {
      if (tipoInconsistencia === "completo" && it.diferencia !== 0) return false;
      if (tipoInconsistencia === "faltante" && it.diferencia >= 0) return false;
      if (tipoInconsistencia === "sobrante" && it.diferencia <= 0) return false;
      if (tipoInconsistencia === "nuevo" && !it.codigo_nuevo) return false;
      if (filtroRevisado === "revisado" && !it.revisado) return false;
      if (filtroRevisado === "sin_revisar" && it.revisado) return false;
      if (paletInconsistencia !== "todos" && (it.palet ?? "").trim() !== paletInconsistencia) return false;
      if (cajaFiltroInconsistencia.trim() && !textoContieneCaja(it.cajas, cajaFiltroInconsistencia.trim()))
        return false;
      if (filtroImpreso === "impreso" && !it.ya_impreso) return false;
      if (filtroImpreso === "sin_imprimir" && it.ya_impreso) return false;
      if (!q) return true;
      const codigo = (it.codigo ?? "").toLowerCase();
      const descripcion = (it.descripcion ?? "").toLowerCase();
      const marca = (it.marca ?? "").toLowerCase();
      return codigo.includes(q) || descripcion.includes(q) || marca.includes(q);
    });
  }, [
    inconsistencias,
    tipoInconsistencia,
    filtroRevisado,
    filtroImpreso,
    paletInconsistencia,
    cajaFiltroInconsistencia,
    busquedaInconsistencias,
  ]);

  const itemEnRevision = items.find((it) => it.id === itemRevisarId) ?? null;
  const tallasOrdenDeLaOrdenSeleccionada =
    ordenes.find((o) => o.id === ordenSeleccionadaId)?.tallas ?? [];

  // Todas las cajas registradas de ese código (del código simple Y de sus variantes)
  const cajasDelItemEnRevision: TallasPorCaja[] = useMemo(() => {
    if (!itemRevisarId) return [];
    return tallasPorCajaTodas.filter((t) => t.item_id === itemRevisarId);
  }, [itemRevisarId, tallasPorCajaTodas]);

  async function abrirRevisarCajas(itemId: string) {
    setItemRevisarId(itemId);
    setCajaEditId(null);
    setEditandoDatosGenerales(false);
    const item = items.find((it) => it.id === itemId);
    if (item) {
      setEgPalet(item.palet ?? "");
      setEgCajas(item.cajas ?? "");
      setEgMarca(item.marca ?? "");
      setEgComposicion(item.composicion ?? "");
      setEgPais(item.pais ?? "");
      setEgTienda(item.tienda ?? "");
      setEgTipoEtiqueta(item.tipo_etiqueta ?? "COSIDO");
      setEgNovedad(item.novedad ?? "");
    }
  }

  function abrirEditarCaja(reg: TallasPorCaja) {
    setCajaEditId(reg.id);
    setCajaEditTexto(reg.caja);
    setCajaEditTallas(reg.tallas_detalle ?? {});
  }

  // Recalcula y guarda el total del código (o variante) a partir de TODAS
  // sus cajas registradas, después de editar o eliminar una de ellas.
  async function recalcularTotalDesdeRegistros(itemId: string, varianteId: string | null) {
    const query = supabase
      .from("etq_tallas_por_caja")
      .select("caja, tallas_detalle")
      .eq("item_id", itemId);
    const { data: registros } = varianteId
      ? await query.eq("variante_id", varianteId)
      : await query.is("variante_id", null);

    const regs = (registros as { caja: string; tallas_detalle: Record<string, number> }[]) ?? [];
    const cajasTexto = regs.map((r) => r.caja).join(" ").trim();
    const tallasCombinadas: Record<string, number> = {};
    regs.forEach((r) => {
      Object.entries(r.tallas_detalle ?? {}).forEach(([talla, cant]) => {
        tallasCombinadas[talla] = (tallasCombinadas[talla] ?? 0) + Number(cant || 0);
      });
    });
    const nuevaCantidad = sumarCajasTexto(cajasTexto);

    if (varianteId) {
      await supabase
        .from("etq_variantes")
        .update({ cajas: cajasTexto || null, cantidad: nuevaCantidad, tallas_detalle: tallasCombinadas })
        .eq("id", varianteId);
    } else {
      await supabase
        .from("etq_items")
        .update({
          cajas: cajasTexto || null,
          cantidad_contada: nuevaCantidad,
          tallas_detalle: tallasCombinadas,
        })
        .eq("id", itemId);
    }
  }

  function sumarCajasTexto(texto: string): number {
    if (!texto) return 0;
    const nums = texto.match(/\((\d+)\)/g);
    if (!nums) return 0;
    return nums.reduce((a, n) => a + Number(n.replace(/[()]/g, "")), 0);
  }

  async function guardarDatosGeneralesCodigo() {
    if (!itemRevisarId) return;
    setGuardandoDatosGenerales(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase
        .from("etq_items")
        .update({
          palet: egPalet.trim() || null,
          cajas: egCajas.trim() || null,
          marca: egMarca.trim() || null,
          composicion: egComposicion.trim() || null,
          pais: egPais.trim() || null,
          tienda: egTienda.trim() || null,
          tipo_etiqueta: egTipoEtiqueta.trim() || null,
          novedad: egNovedad.trim() || null,
          actualizado_en: new Date().toISOString(),
        })
        .eq("id", itemRevisarId);
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      setEditandoDatosGenerales(false);
      setToast("Datos del código actualizados.");
      cargar();
    } finally {
      setGuardandoDatosGenerales(false);
    }
  }

  // Búsqueda de códigos candidatos a unificar, dentro de la MISMA orden que
  // el código en revisión (nunca cruza órdenes distintas, evita mezclar
  // inventarios de cargas diferentes por error).
  const candidatosUnificar = useMemo(() => {
    if (!itemRevisarId || !itemEnRevision) return [];
    const q = busquedaUnificar.trim().toLowerCase();
    return items.filter((it) => {
      if (it.id === itemRevisarId) return false; // no puede unificarse consigo mismo
      if (it.orden_id !== itemEnRevision.orden_id) return false; // misma orden siempre
      if (!q) return false; // solo muestra sugerencias si ya escribió algo
      const codigo = (it.codigo ?? "").toLowerCase();
      const descripcion = (it.descripcion ?? "").toLowerCase();
      return codigo.includes(q) || descripcion.includes(q);
    });
  }, [items, itemRevisarId, itemEnRevision, busquedaUnificar]);

  const codigoSecundario = items.find((it) => it.id === codigoSecundarioId) ?? null;

  function abrirUnificar() {
    setShowUnificar(true);
    setBusquedaUnificar("");
    setCodigoSecundarioId(null);
    setPrincipalElegido("actual");
    setErrorMsg(null);
  }

  // Fusiona codigoSecundario DENTRO del código elegido como principal:
  // suma cantidades, combina cajas y tallas, y reasigna todo el historial
  // (registros de tallas por caja, variantes, movimientos de mesa) al
  // principal — así no se pierde nada de lo que Isabel ya capturó. Al
  // final, borra el código secundario, que ya quedó vacío.
  async function confirmarUnificar() {
    if (!itemRevisarId || !codigoSecundarioId || !itemEnRevision || !codigoSecundario) return;
    setUnificando(true);
    setErrorMsg(null);
    try {
      const principalId = principalElegido === "actual" ? itemRevisarId : codigoSecundarioId;
      const secundarioId = principalElegido === "actual" ? codigoSecundarioId : itemRevisarId;
      const principal = principalElegido === "actual" ? itemEnRevision : codigoSecundario;
      const secundario = principalElegido === "actual" ? codigoSecundario : itemEnRevision;

      // 1. Combinar cajas (texto) y calcular el nuevo total combinado
      const cajasCombinadas = [principal.cajas, secundario.cajas]
        .filter(Boolean)
        .join(" ")
        .trim();

      // 2. Combinar tallas_detalle sumando talla por talla
      const tallasCombinadas: Record<string, number> = { ...(principal.tallas_detalle ?? {}) };
      Object.entries(secundario.tallas_detalle ?? {}).forEach(([talla, cant]) => {
        tallasCombinadas[talla] = (tallasCombinadas[talla] ?? 0) + Number(cant || 0);
      });

      // 3. Reasignar el historial de tallas por caja del secundario al principal
      const { error: errCajas } = await supabase
        .from("etq_tallas_por_caja")
        .update({ item_id: principalId })
        .eq("item_id", secundarioId);
      if (errCajas) {
        setErrorMsg(`No se pudo reasignar el historial de cajas: ${errCajas.message}`);
        return;
      }

      // 4. Reasignar las variantes de color del secundario al principal
      const { error: errVariantes } = await supabase
        .from("etq_variantes")
        .update({ item_id: principalId })
        .eq("item_id", secundarioId);
      if (errVariantes) {
        setErrorMsg(`No se pudo reasignar las variantes: ${errVariantes.message}`);
        return;
      }

      // 5. Reasignar los movimientos (historial de producción por mesa)
      const { error: errMovs } = await supabase
        .from("etq_movimientos")
        .update({ item_id: principalId })
        .eq("item_id", secundarioId);
      if (errMovs) {
        setErrorMsg(`No se pudo reasignar el historial de producción: ${errMovs.message}`);
        return;
      }

      // 6. Actualizar el código principal con los totales combinados. La
      // cantidad de FACTURA no se suma — se mantiene la del código elegido
      // como principal, porque es un dato declarado por el proveedor/
      // cliente, no algo que deba cambiar por cómo se agrupen los códigos.
      const { error: errUpdate } = await supabase
        .from("etq_items")
        .update({
          cajas: cajasCombinadas || null,
          cantidad_contada: (principal.cantidad_contada || 0) + (secundario.cantidad_contada || 0),
          tallas_detalle: tallasCombinadas,
          actualizado_en: new Date().toISOString(),
        })
        .eq("id", principalId);
      if (errUpdate) {
        setErrorMsg(`No se pudo actualizar el código principal: ${errUpdate.message}`);
        return;
      }

      // 7. Borrar el código secundario, que ya quedó vacío (todo se movió)
      const { error: errDelete } = await supabase.from("etq_items").delete().eq("id", secundarioId);
      if (errDelete) {
        setErrorMsg(`Se combinaron los datos pero no se pudo borrar el código sobrante: ${errDelete.message}`);
        return;
      }

      setShowUnificar(false);
      setItemRevisarId(null);
      setToast(
        `Códigos unificados en ${principal.codigo} (factura ${principal.cantidad_factura}). ` +
          `La factura de ${secundario.codigo} (${secundario.cantidad_factura}) no se sumó.`
      );
      cargar();
    } finally {
      setUnificando(false);
    }
  }

  async function guardarEdicionCaja() {
    if (!cajaEditId || !itemRevisarId) return;
    const reg = cajasDelItemEnRevision.find((r) => r.id === cajaEditId);

    const { error } = await supabase
      .from("etq_tallas_por_caja")
      .update({ caja: cajaEditTexto.trim(), tallas_detalle: cajaEditTallas })
      .eq("id", cajaEditId);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    await recalcularTotalDesdeRegistros(itemRevisarId, reg?.variante_id ?? null);
    setCajaEditId(null);
    setToast("Caja actualizada.");
    cargar();
  }

  async function confirmarEliminarCaja() {
    if (!cajaAEliminarId || !itemRevisarId) return;
    const reg = cajasDelItemEnRevision.find(
      (r) => r.id === cajaAEliminarId
    );

    await supabase.from("etq_tallas_por_caja").delete().eq("id", cajaAEliminarId);
    await recalcularTotalDesdeRegistros(itemRevisarId, reg?.variante_id ?? null);
    setCajaAEliminarId(null);
    setToast("Caja eliminada y total recalculado.");
    cargar();
  }

  function exportarCSV() {
    const filas = [
      ["N° Etiquetado", "Origen", "Cliente", "Producto", "Estado", "Fecha"],
      ...ordenesFiltradas.map((o) => [
        o.numero_etq,
        o.origen === "etyecu" ? "ETYECU" : "Cliente externo",
        o.cliente_nombre ?? "",
        o.tipo_producto ?? "",
        o.estado,
        new Date(o.fecha).toLocaleDateString("es-EC"),
      ]),
    ];
    const csv = filas.map((f) => f.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reportes_etiquetado_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/etiquetado/reportes" />

      <main className="flex-1 min-w-0">
        <Topbar />

        <div className="px-6.5 pt-5.5 pb-10">
          <div className="flex items-center justify-between mb-4.5 print:hidden">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Reportes de etiquetado</h1>
              <p className="text-[12.5px] text-text-faint">
                Indicadores y métricas del módulo de etiquetado
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportarCSV}
                className="btn-secondary flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-lg"
              >
                Exportar CSV
              </button>
              <button
                onClick={() => window.print()}
                className="btn-secondary flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-lg"
              >
                <Printer size={14} /> Imprimir
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 mb-4 print:hidden">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-[12px] font-medium px-3 py-1.5 rounded-lg ${
                  tab === t.id ? "bg-accent/[0.18] text-[#c4b8ff]" : "card text-text-dim"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex gap-3 mb-4.5 print:hidden flex-wrap items-end card p-3">
            <div>
              <label className="text-[10.5px] text-text-faint block mb-1">Desde</label>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="card px-3 py-1.5 text-[12px] outline-none"
              />
            </div>
            <div>
              <label className="text-[10.5px] text-text-faint block mb-1">Hasta</label>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="card px-3 py-1.5 text-[12px] outline-none"
              />
            </div>
            <div>
              <label className="text-[10.5px] text-text-faint block mb-1">Origen</label>
              <select
                value={filtroOrigen}
                onChange={(e) => setFiltroOrigen(e.target.value as typeof filtroOrigen)}
                className="card px-3 py-1.5 text-[12px] outline-none"
              >
                <option value="todos">Todos</option>
                <option value="etyecu">ETYECU</option>
                <option value="externo">Cliente externo</option>
              </select>
            </div>
            {(fechaDesde || fechaHasta) && (
              <button
                onClick={() => {
                  setFechaDesde("");
                  setFechaHasta("");
                }}
                className="text-[11.5px] text-text-faint hover:text-text underline py-1.5"
              >
                Limpiar fechas
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-[13px] text-text-faint">Cargando…</p>
          ) : (
            <>
              {tab === "resumen" && (
                <>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "Órdenes en el período", value: resumen.totalOrdenes },
                      { label: "Unidades etiquetadas", value: resumen.totalContado.toLocaleString("es-EC") },
                      { label: "% Completos vs factura", value: `${resumen.pctCompletos}%` },
                      { label: "Códigos con inconsistencia", value: resumen.conProblema },
                    ].map((k) => (
                      <div key={k.label} className="card p-3.5">
                        <p className="text-[11px] text-text-faint">{k.label}</p>
                        <p className="text-[22px] font-semibold mt-1">{k.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="card p-4">
                      <p className="text-[12.5px] font-semibold mb-3">Órdenes por cliente (top 8)</p>
                      {porCliente.length === 0 ? (
                        <p className="text-[12px] text-text-faint">Sin datos en el período.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={porCliente} layout="vertical" margin={{ left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" allowDecimals={false} />
                            <YAxis type="category" dataKey="nombre" width={110} tick={{ fontSize: 10.5 }} />
                            <Tooltip />
                            <Bar dataKey="ordenes" fill="#7c6cf0" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    <div className="card p-4">
                      <p className="text-[12.5px] font-semibold mb-3">Órdenes por tipo de producto</p>
                      {porProducto.length === 0 ? (
                        <p className="text-[12px] text-text-faint">Sin datos en el período.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={porProducto} dataKey="value" nameKey="name" outerRadius={80} label>
                              {porProducto.map((_, i) => (
                                <Cell key={i} fill={COLORES[i % COLORES.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </>
              )}

              {tab === "ordenes" && (
                <div className="card overflow-hidden">
                  <div className="grid grid-cols-[120px_1fr_100px_120px_100px_100px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                    <span>N° Etiquetado</span>
                    <span>Cliente</span>
                    <span>Origen</span>
                    <span>Producto</span>
                    <span>Estado</span>
                    <span className="text-right">Fecha</span>
                  </div>
                  {ordenesFiltradas.length === 0 ? (
                    <p className="text-[12.5px] text-text-faint p-5">No hay órdenes en el período.</p>
                  ) : (
                    ordenesFiltradas.map((o) => (
                      <div
                        key={o.id}
                        className="grid grid-cols-[120px_1fr_100px_120px_100px_100px] gap-3 px-5 py-3 items-center border-b border-border last:border-b-0 text-[12.5px]"
                      >
                        <span className="font-medium">{o.numero_etq}</span>
                        <span className="truncate">{o.cliente_nombre ?? "—"}</span>
                        <span className="text-text-dim">{o.origen === "etyecu" ? "ETYECU" : "Externo"}</span>
                        <span className="text-text-dim capitalize">{o.tipo_producto ?? "—"}</span>
                        <span className="text-text-dim capitalize">{o.estado}</span>
                        <span className="text-right text-text-dim">
                          {new Date(o.fecha).toLocaleDateString("es-EC")}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "produccion" && (
                <div className="card p-4">
                  <p className="text-[12.5px] font-semibold mb-3">Unidades procesadas por mesa</p>
                  {produccionPorMesa.length === 0 ? (
                    <p className="text-[12px] text-text-faint">No hay movimientos registrados en el período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={produccionPorMesa} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="nombre" width={90} />
                        <Tooltip />
                        <Bar dataKey="unidades" fill="#7c6cf0" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}

              {tab === "inventario" && (
                <>
                  <div className="card p-3 mb-4 flex items-center gap-3 flex-wrap">
                    <label className="text-[11.5px] text-text-faint">Orden:</label>
                    <select
                      value={ordenSeleccionadaId}
                      onChange={(e) => {
                        setOrdenSeleccionadaId(e.target.value);
                        setBusquedaInventario("");
                        setPaletSeleccionado("todos");
                        setCajaFiltro("");
                      }}
                      className="card px-3 py-1.5 text-[12.5px] outline-none min-w-[280px]"
                    >
                      <option value="">Selecciona una orden…</option>
                      {ordenesFiltradas.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.numero_etq} · {o.cliente_nombre ?? "—"}
                        </option>
                      ))}
                    </select>
                    {ordenSeleccionadaId && (
                      <>
                        <button
                          onClick={descargarInventarioExcel}
                          className="btn-secondary text-[11.5px] font-semibold px-3 py-1.5 rounded-lg ml-auto"
                        >
                          Descargar inventario en Excel
                        </button>
                        <Link
                          href={`/etiquetado/${ordenSeleccionadaId}`}
                          className="btn-secondary text-[11.5px] font-semibold px-3 py-1.5 rounded-lg"
                        >
                          Abrir orden / generar informe final
                        </Link>
                      </>
                    )}
                  </div>

                  {!ordenSeleccionadaId ? (
                    <div className="card p-8 text-center">
                      <p className="text-[13px] text-text-faint">
                        Elige una orden arriba para ver su inventario completo.
                      </p>
                    </div>
                  ) : itemsOrdenSeleccionada.length === 0 ? (
                    <div className="card p-8 text-center">
                      <p className="text-[13px] text-text-faint">Esta orden aún no tiene inventario cargado.</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="card p-3.5">
                          <p className="text-[11px] text-text-faint">Total declarado (factura)</p>
                          <p className="text-[22px] font-semibold mt-1">
                            {totalesOrdenSeleccionada.factura.toLocaleString("es-EC")}
                          </p>
                        </div>
                        <div className="card p-3.5">
                          <p className="text-[11px] text-text-faint">Total contado (etiquetas)</p>
                          <p className="text-[22px] font-semibold mt-1">
                            {totalesOrdenSeleccionada.contado.toLocaleString("es-EC")}
                          </p>
                        </div>
                        <div className="card p-3.5">
                          <p className="text-[11px] text-text-faint">Diferencia neta</p>
                          <p
                            className={`text-[22px] font-semibold mt-1 ${
                              totalesOrdenSeleccionada.contado - totalesOrdenSeleccionada.factura === 0
                                ? "text-[#6ee7b7]"
                                : "text-[#fbbf24]"
                            }`}
                          >
                            {(
                              totalesOrdenSeleccionada.contado - totalesOrdenSeleccionada.factura
                            ).toLocaleString("es-EC")}
                          </p>
                        </div>
                      </div>

                      {/* Selector de PALET + filtro de CAJA (para imprimir caja por caja) */}
                      <div className="card p-3 mb-3 flex items-center gap-3 flex-wrap">
                        <div>
                          <label className="text-[11px] text-text-faint block mb-1">Palet</label>
                          <select
                            value={paletSeleccionado}
                            onChange={(e) => {
                              setPaletSeleccionado(e.target.value);
                              setCajaFiltro("");
                            }}
                            className="card px-3 py-2 text-[12.5px] outline-none min-w-[140px]"
                          >
                            <option value="todos">Todos los palets</option>
                            {paletsDisponibles.map((p) => (
                              <option key={p} value={p}>
                                Palet {p}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-text-faint block mb-1">
                            Caja (dentro del palet)
                          </label>
                          <input
                            value={cajaFiltro}
                            onChange={(e) => setCajaFiltro(e.target.value)}
                            placeholder="Ej. 1, 12…"
                            className="card px-3 py-2 text-[12.5px] outline-none w-[160px] font-mono"
                          />
                        </div>

                        <div className="w-px self-stretch bg-border" />

                        <div className="relative">
                          <label className="text-[11px] text-text-faint block mb-1">
                            Composición
                          </label>
                          {composicionFiltro !== "todas" ? (
                            <div className="flex items-center gap-1.5 card px-3 py-2 min-w-[220px]">
                              <span className="text-[12.5px] flex-1 truncate">{composicionFiltro}</span>
                              <button
                                onClick={() => {
                                  setComposicionFiltro("todas");
                                  setBusquedaComposicion("");
                                }}
                                className="text-text-faint hover:text-text"
                                title="Quitar filtro de composición"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <input
                              value={busquedaComposicion}
                              onChange={(e) => setBusquedaComposicion(e.target.value)}
                              onFocus={() => setSugerenciasComposicionAbiertas(true)}
                              onBlur={() => setTimeout(() => setSugerenciasComposicionAbiertas(false), 150)}
                              placeholder="Buscar composición…"
                              className="card px-3 py-2 text-[12.5px] outline-none w-[220px]"
                            />
                          )}
                          {sugerenciasComposicionAbiertas && composicionFiltro === "todas" && (
                            <div className="absolute z-20 top-full mt-1 w-[260px] max-h-[220px] overflow-y-auto card p-1 shadow-lg">
                              {composicionesSugeridas.length === 0 ? (
                                <p className="text-[11.5px] text-text-faint px-2 py-2">
                                  Ninguna composición coincide.
                                </p>
                              ) : (
                                composicionesSugeridas.map((c) => (
                                  <button
                                    key={c}
                                    onClick={() => {
                                      setComposicionFiltro(c);
                                      setBusquedaComposicion("");
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] hover:bg-white/[0.06]"
                                  >
                                    {c}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>

                        {(paletSeleccionado !== "todos" || cajaFiltro || composicionFiltro !== "todas") && (
                          <button
                            onClick={() => {
                              setPaletSeleccionado("todos");
                              setCajaFiltro("");
                              setComposicionFiltro("todas");
                              setBusquedaComposicion("");
                            }}
                            className="text-[11.5px] text-text-faint hover:text-text underline self-end pb-2"
                          >
                            Limpiar filtros
                          </button>
                        )}
                        {cajaFiltro && (
                          <span className="text-[11px] text-[#fbbf24] self-end pb-2">
                            Mostrando la caja {cajaFiltro}. Donde dice <b>(total)</b> junto a las tallas,
                            ese código aún no tiene desglose exacto de esta caja y se muestra el total
                            completo del código.
                          </span>
                        )}
                        {composicionFiltro !== "todas" && (
                          <span className="text-[11px] text-[#c4b8ff] self-end pb-2">
                            Filtrando además por composición "{composicionFiltro}"
                            {(paletSeleccionado !== "todos" || cajaFiltro) && " dentro de la selección actual"}.
                          </span>
                        )}
                      </div>

                      <div className="card p-3 mb-4 flex gap-2">
                        <select
                          value={tipoBusqueda}
                          onChange={(e) => setTipoBusqueda(e.target.value as typeof tipoBusqueda)}
                          className="card px-3 py-2 text-[12.5px] outline-none w-[170px] shrink-0"
                        >
                          <option value="todos">Todos los campos</option>
                          <option value="codigo">Código</option>
                          <option value="descripcion">Descripción</option>
                          <option value="tallas">Talla</option>
                          <option value="composicion">Composición</option>
                          <option value="pais">País</option>
                        </select>
                        <input
                          value={busquedaInventario}
                          onChange={(e) => setBusquedaInventario(e.target.value)}
                          placeholder="Escribe el texto a buscar (código, descripción, talla...)…"
                          className="w-full card px-3 py-2 text-[12.5px] outline-none"
                        />
                      </div>

                      <div className="card overflow-x-auto">
                        <div className="min-w-[1800px]">
                            <div className="grid grid-cols-[50px_70px_100px_110px_90px_150px_90px_150px_170px_90px_90px_90px_120px_90px_80px_80px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                              <span className="text-center">Impr.</span>
                              <span>Palet</span>
                              <span>Cajas</span>
                              <span>Código</span>
                              <span>Marca</span>
                              <span>Descripción</span>
                              <span>Color</span>
                              <span>Tallas</span>
                              <span>Composición</span>
                              <span>País</span>
                              <span className="text-right">Factura</span>
                              <span className="text-right">Contado</span>
                              <span className="text-right">Total etiquetas</span>
                              <span className="text-right">Diferencia</span>
                              <span className="text-center">Cód.✓</span>
                              <span className="text-center">Talla✓</span>
                            </div>
                            {filasInventario.length === 0 ? (
                              <p className="text-[12.5px] text-text-faint p-5">
                                Ningún código coincide con la búsqueda.
                              </p>
                            ) : (
                              filasInventario.map((f) => (
                                <div
                                  key={f.key}
                                  className={`grid grid-cols-[50px_70px_100px_110px_90px_150px_90px_150px_170px_90px_90px_90px_120px_90px_80px_80px] gap-3 px-5 py-2.5 items-start border-b border-border last:border-b-0 text-[12.5px] transition-colors duration-300 ${
                                    f.yaImpreso
                                      ? "bg-teal-500/[0.1]"
                                      : f.esVariante
                                      ? "bg-amber/[0.03]"
                                      : ""
                                  }`}
                                >
                                  <span className="flex justify-center pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => toggleYaImpreso(f)}
                                      title={f.yaImpreso ? "Marcado como impreso" : "Marcar como impreso"}
                                      className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                                        f.yaImpreso
                                          ? "bg-teal-500 border-teal-500"
                                          : "bg-white/[0.04] border-border hover:border-teal-500/50"
                                      }`}
                                    >
                                      {f.yaImpreso && <Check size={13} className="text-white" />}
                                    </button>
                                  </span>
                                  <span className="text-text-dim pt-0.5">{f.palet ?? "—"}</span>
                                  <span className="text-text-dim leading-snug font-mono text-[11px]">
                                    {textoCajaFiltrada(f.cajas)}
                                  </span>
                                  <span className="font-medium pt-0.5">{f.codigo ?? "—"}</span>
                                  <span className="text-text-dim pt-0.5">{f.marca ?? "—"}</span>
                                  <span className="text-text-dim pt-0.5">{f.descripcion ?? "—"}</span>
                                  <span className="text-text-dim pt-0.5">
                                    {f.esVariante ? (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber/[0.18] text-[#fbbf24]">
                                        {f.color ?? "—"}
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </span>
                                  <span
                                    className="text-text-dim text-[11px] font-mono leading-snug"
                                    title={
                                      f.sinDesgloseDeCaja
                                        ? "Total del código completo (aún no hay desglose exacto de esta caja)"
                                        : undefined
                                    }
                                  >
                                    {f.tallasTexto}
                                    {f.sinDesgloseDeCaja && (
                                      <span className="text-[9px] text-[#fbbf24] ml-1">(total)</span>
                                    )}
                                  </span>
                                  <span className="text-text-dim leading-snug">{f.composicion ?? "—"}</span>
                                  <span className="text-text-dim pt-0.5">{f.pais ?? "—"}</span>
                                  <span className="text-right pt-0.5 text-text-faint">
                                    {f.esVariante ? "—" : itemsInventarioFiltrados.find((it) => it.id === f.key)?.cantidad_factura}
                                  </span>
                                  <span className="text-right pt-0.5 font-medium">{f.cantidad}</span>
                                  <span className="text-right pt-0.5 font-semibold text-[#c4b8ff]">
                                    {f.totalTallas}
                                  </span>
                                  <span className="text-right pt-0.5">
                                    {f.esVariante ? (
                                      <span className="text-text-faint">—</span>
                                    ) : (
                                      (() => {
                                        const original = itemsInventarioFiltrados.find((it) => it.id === f.key);
                                        if (!original) return <span className="text-text-faint">—</span>;
                                        const dif = original.cantidad_contada - original.cantidad_factura;
                                        return (
                                          <span
                                            className={`font-medium ${
                                              dif === 0
                                                ? "text-[#6ee7b7]"
                                                : dif < 0
                                                ? "text-[#fca5a5]"
                                                : "text-[#fbbf24]"
                                            }`}
                                          >
                                            {dif > 0 ? `+${dif}` : dif}
                                          </span>
                                        );
                                      })()
                                    )}
                                  </span>
                                  <span className="flex justify-center pt-0.5">
                                    {f.tieneCodigo === true ? (
                                      <Check size={14} className="text-[#6ee7b7]" />
                                    ) : f.tieneCodigo === false ? (
                                      <X size={14} className="text-[#fca5a5]" />
                                    ) : (
                                      <HelpCircle size={13} className="text-text-faint" />
                                    )}
                                  </span>
                                  <span className="flex justify-center pt-0.5">
                                    {f.tieneTalla === true ? (
                                      <Check size={14} className="text-[#6ee7b7]" />
                                    ) : f.tieneTalla === false ? (
                                      <X size={14} className="text-[#fca5a5]" />
                                    ) : (
                                      <HelpCircle size={13} className="text-text-faint" />
                                    )}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      {variantesTodas.length > 0 && (
                        <p className="text-[11px] text-text-faint mt-2">
                          Las filas resaltadas son variantes de color/composición de un mismo código. Su
                          suma es la que cuadra contra la factura del código.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}

              {tab === "inconsistencias" && (
                <>
                  <div className="card p-3 mb-3">
                    <label className="text-[11px] text-text-faint block mb-1">Orden</label>
                    <select
                      value={ordenSeleccionadaId}
                      onChange={(e) => {
                        setOrdenSeleccionadaId(e.target.value);
                        setItemRevisarId(null);
                      }}
                      className="card px-3 py-2 text-[12.5px] outline-none min-w-[280px]"
                    >
                      <option value="">Selecciona una orden…</option>
                      {ordenesFiltradas.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.numero_etq} · {o.cliente_nombre ?? "—"}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!ordenSeleccionadaId ? (
                    <div className="card p-8 text-center">
                      <p className="text-[13px] text-text-faint">
                        Elige una orden arriba para ver sus inconsistencias.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap">
                        <select
                          value={tipoInconsistencia}
                          onChange={(e) =>
                            setTipoInconsistencia(e.target.value as typeof tipoInconsistencia)
                          }
                          className="card px-3 py-2 text-[12.5px] outline-none w-[160px] shrink-0"
                        >
                          <option value="todas">Todas</option>
                          <option value="completo">Solo completos</option>
                          <option value="faltante">Solo faltantes</option>
                          <option value="sobrante">Solo sobrantes</option>
                          <option value="nuevo">Solo códigos nuevos</option>
                        </select>
                        <select
                          value={filtroRevisado}
                          onChange={(e) => setFiltroRevisado(e.target.value as typeof filtroRevisado)}
                          className="card px-3 py-2 text-[12.5px] outline-none w-[150px] shrink-0"
                        >
                          <option value="todos">Revisado: todos</option>
                          <option value="revisado">Solo revisados</option>
                          <option value="sin_revisar">Solo sin revisar</option>
                        </select>
                        <select
                          value={filtroImpreso}
                          onChange={(e) => setFiltroImpreso(e.target.value as typeof filtroImpreso)}
                          className="card px-3 py-2 text-[12.5px] outline-none w-[150px] shrink-0"
                        >
                          <option value="todos">Impreso: todos</option>
                          <option value="impreso">Solo impresos</option>
                          <option value="sin_imprimir">Solo sin imprimir</option>
                        </select>
                        <select
                          value={paletInconsistencia}
                          onChange={(e) => {
                            setPaletInconsistencia(e.target.value);
                            setCajaFiltroInconsistencia("");
                          }}
                          className="card px-3 py-2 text-[12.5px] outline-none w-[130px] shrink-0"
                        >
                          <option value="todos">Todos los palets</option>
                          {paletsDisponibles.map((p) => (
                            <option key={p} value={p}>
                              Palet {p}
                            </option>
                          ))}
                        </select>
                        <input
                          value={cajaFiltroInconsistencia}
                          onChange={(e) => setCajaFiltroInconsistencia(e.target.value)}
                          placeholder="Caja…"
                          className="card px-3 py-2 text-[12.5px] outline-none w-[100px] shrink-0 font-mono"
                        />
                        <input
                          value={busquedaInconsistencias}
                          onChange={(e) => setBusquedaInconsistencias(e.target.value)}
                          placeholder="Buscar por código, descripción o marca…"
                          className="w-full card px-3 py-2 text-[12.5px] outline-none"
                        />
                      </div>

                      {inconsistenciasFiltradas.length === 0 ? (
                        <div className="card p-8 text-center">
                          <p className="text-[13px] text-text-faint">
                            {inconsistencias.length === 0
                              ? "Esta orden aún no tiene códigos con cantidad de factura registrada."
                              : "Ningún código coincide con el filtro."}
                          </p>
                        </div>
                      ) : (
                        <div className="card overflow-hidden overflow-x-auto">
                          <div className="min-w-[1650px]">
                            <div className="grid grid-cols-[50px_70px_90px_100px_1fr_90px_90px_60px_60px_60px_140px_90px_70px_70px_70px_130px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                              <span className="text-center">Rev.</span>
                              <span>Palet</span>
                              <span>Cajas</span>
                              <span>Código</span>
                              <span>Descripción</span>
                              <span>Marca</span>
                              <span>Etiqueta</span>
                              <span className="text-center">Nuevo</span>
                              <span className="text-center">Cód.✓</span>
                              <span className="text-center">Talla✓</span>
                              <span>Composición</span>
                              <span>Tallas</span>
                              <span className="text-right">Factura</span>
                              <span className="text-right">Contado</span>
                              <span className="text-right">Dif.</span>
                              <span className="text-right">Acción</span>
                            </div>
                            {inconsistenciasFiltradas.map((it) => (
                              <div
                                key={it.id}
                                className={`grid grid-cols-[50px_70px_90px_100px_1fr_90px_90px_60px_60px_60px_140px_90px_70px_70px_70px_130px] gap-3 px-5 py-2.5 items-center border-b border-border last:border-b-0 text-[12.5px] transition-colors duration-300 ${
                                  it.revisado ? "bg-teal-500/[0.1]" : ""
                                }`}
                              >
                                <span className="flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => toggleRevisado(it.id, it.revisado)}
                                    title={it.revisado ? "Marcado como revisado" : "Marcar como revisado"}
                                    className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                                      it.revisado
                                        ? "bg-teal-500 border-teal-500"
                                        : "bg-white/[0.04] border-border hover:border-teal-500/50"
                                    }`}
                                  >
                                    {it.revisado && <Check size={13} className="text-white" />}
                                  </button>
                                </span>
                                <span className="text-text-faint">{it.palet ?? "—"}</span>
                                <span className="text-text-faint text-[11px] truncate" title={it.cajas ?? ""}>
                                  {it.cajas ?? "—"}
                                </span>
                                <span className="font-medium">{it.codigo ?? "—"}</span>
                                <span className="text-text-dim truncate">{it.descripcion ?? "—"}</span>
                                <span className="text-text-dim truncate">{it.marca ?? "—"}</span>
                                <span className="text-text-faint truncate text-[11px]">
                                  {it.tipo_etiqueta ?? "—"}
                                </span>
                                <span className="flex justify-center">
                                  {it.codigo_nuevo ? (
                                    <Check size={14} className="text-[#6ee7b7]" />
                                  ) : (
                                    <span className="text-text-faint">—</span>
                                  )}
                                </span>
                                <span className="flex justify-center">
                                  {it.tiene_codigo === true ? (
                                    <Check size={14} className="text-[#6ee7b7]" />
                                  ) : it.tiene_codigo === false ? (
                                    <X size={14} className="text-[#fca5a5]" />
                                  ) : (
                                    <HelpCircle size={13} className="text-text-faint" />
                                  )}
                                </span>
                                <span className="flex justify-center">
                                  {it.tiene_talla === true ? (
                                    <Check size={14} className="text-[#6ee7b7]" />
                                  ) : it.tiene_talla === false ? (
                                    <X size={14} className="text-[#fca5a5]" />
                                  ) : (
                                    <HelpCircle size={13} className="text-text-faint" />
                                  )}
                                </span>
                                <span className="text-text-faint truncate text-[11px]" title={it.composicion ?? ""}>
                                  {it.composicion ?? "—"}
                                </span>
                                <span className="text-text-faint truncate text-[11px]">
                                  {formatoTallas(it.tallas_detalle)}
                                </span>
                                <span className="text-right">{it.cantidad_factura}</span>
                                <span className="text-right">{it.cantidad_contada}</span>
                                <span
                                  className={`text-right font-semibold ${
                                    it.diferencia === 0
                                      ? "text-[#6ee7b7]"
                                      : it.diferencia < 0
                                      ? "text-[#fca5a5]"
                                      : "text-[#fbbf24]"
                                  }`}
                                >
                                  {it.diferencia === 0
                                    ? "Completo"
                                    : it.diferencia > 0
                                    ? `+${it.diferencia}`
                                    : it.diferencia}
                                </span>
                                <span className="text-right">
                                  <button
                                    onClick={() => abrirRevisarCajas(it.id)}
                                    className="text-[11.5px] text-[#c4b8ff] hover:underline"
                                  >
                                    Revisar / Editar →
                                  </button>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {tab === "productividad" && (
                <>
                  {/* Selector de vista: General (rango de fechas) vs Por orden */}
                  <div className="card p-3 mb-3 flex items-center gap-2">
                    <button
                      onClick={() => setVistaProductividad("general")}
                      className={`text-[12px] font-medium px-3 py-1.5 rounded-lg ${
                        vistaProductividad === "general"
                          ? "bg-accent/[0.18] text-[#c4b8ff]"
                          : "text-text-dim hover:text-text"
                      }`}
                    >
                      General (rango de fechas)
                    </button>
                    <button
                      onClick={() => setVistaProductividad("orden")}
                      className={`text-[12px] font-medium px-3 py-1.5 rounded-lg ${
                        vistaProductividad === "orden"
                          ? "bg-accent/[0.18] text-[#c4b8ff]"
                          : "text-text-dim hover:text-text"
                      }`}
                    >
                      Por orden específica
                    </button>
                  </div>

                  {/* Filtros según la vista elegida */}
                  <div className="card p-3 mb-4 flex items-end gap-3 flex-wrap">
                    {vistaProductividad === "general" ? (
                      <>
                        <div>
                          <label className="text-[10.5px] text-text-faint block mb-1">Desde</label>
                          <input
                            type="date"
                            value={prodFechaDesde}
                            onChange={(e) => setProdFechaDesde(e.target.value)}
                            className="card px-3 py-1.5 text-[12px] outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10.5px] text-text-faint block mb-1">Hasta</label>
                          <input
                            type="date"
                            value={prodFechaHasta}
                            onChange={(e) => setProdFechaHasta(e.target.value)}
                            className="card px-3 py-1.5 text-[12px] outline-none"
                          />
                        </div>
                        {(prodFechaDesde || prodFechaHasta) && (
                          <button
                            onClick={() => {
                              setProdFechaDesde("");
                              setProdFechaHasta("");
                            }}
                            className="text-[11.5px] text-text-faint hover:text-text underline pb-1.5"
                          >
                            Limpiar fechas
                          </button>
                        )}
                      </>
                    ) : (
                      <div>
                        <label className="text-[10.5px] text-text-faint block mb-1">Orden</label>
                        <select
                          value={ordenSeleccionadaId}
                          onChange={(e) => setOrdenSeleccionadaId(e.target.value)}
                          className="card px-3 py-2 text-[12.5px] outline-none min-w-[280px]"
                        >
                          <option value="">Selecciona una orden…</option>
                          {ordenesFiltradas.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.numero_etq} · {o.cliente_nombre ?? "—"}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-[10.5px] text-text-faint block mb-1">Mesa</label>
                      <select
                        value={prodMesaFiltro}
                        onChange={(e) => setProdMesaFiltro(e.target.value)}
                        className="card px-3 py-2 text-[12.5px] outline-none min-w-[140px]"
                      >
                        <option value="todas">Todas las mesas</option>
                        {Array.from(new Set(mesas.map((m) => m.nombre)))
                          .sort()
                          .map((nombre) => (
                            <option key={nombre} value={nombre}>
                              {nombre}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {vistaProductividad === "orden" && !ordenSeleccionadaId ? (
                    <div className="card p-8 text-center">
                      <p className="text-[13px] text-text-faint">
                        Elige una orden arriba para ver su productividad.
                      </p>
                    </div>
                  ) : productividadPorMesa.length === 0 ? (
                    <div className="card p-8 text-center">
                      <p className="text-[13px] text-text-faint">
                        No hay movimientos registrados en este período/orden.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* KPIs */}
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        <div className="card p-3.5">
                          <p className="text-[11px] text-text-faint">Unidades totales</p>
                          <p className="text-[22px] font-semibold mt-1">
                            {kpisProductividad.unidadesTotales.toLocaleString("es-EC")}
                          </p>
                        </div>
                        <div className="card p-3.5">
                          <p className="text-[11px] text-text-faint">Horas trabajadas</p>
                          <p className="text-[22px] font-semibold mt-1">
                            {kpisProductividad.horasTotales} h
                          </p>
                        </div>
                        <div className="card p-3.5">
                          <p className="text-[11px] text-text-faint">Ritmo promedio</p>
                          <p className="text-[22px] font-semibold mt-1">
                            {kpisProductividad.ritmoPromedio} u/h
                          </p>
                        </div>
                        <div className="card p-3.5">
                          <p className="text-[11px] text-text-faint">Mesa con mejor ritmo</p>
                          <p className="text-[18px] font-semibold mt-1 text-[#6ee7b7]">
                            {kpisProductividad.mesaTop}
                          </p>
                        </div>
                      </div>

                      {/* Gráficas */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="card p-4">
                          <p className="text-[12.5px] font-semibold mb-3">
                            Ritmo por mesa (unidades/hora)
                          </p>
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={productividadPorMesa} layout="vertical" margin={{ left: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                              <XAxis type="number" />
                              <YAxis type="category" dataKey="nombre" width={80} />
                              <Tooltip />
                              <Bar dataKey="ritmo" fill="#7c6cf0" radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="card p-4">
                          <p className="text-[12.5px] font-semibold mb-3">
                            Evolución diaria de unidades producidas
                          </p>
                          {evolucionDiaria.length <= 1 ? (
                            <p className="text-[12px] text-text-faint">
                              Se necesita más de un día con datos para ver la evolución.
                            </p>
                          ) : (
                            <ResponsiveContainer width="100%" height={240}>
                              <LineChart data={evolucionDiaria}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="fecha" tick={{ fontSize: 10.5 }} />
                                <YAxis />
                                <Tooltip />
                                <Line
                                  type="monotone"
                                  dataKey="unidades"
                                  stroke="#7c6cf0"
                                  strokeWidth={2}
                                  dot={{ r: 3 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                      {/* Tabla detallada */}
                      <div className="card overflow-hidden">
                        <div className="grid grid-cols-[1fr_90px_90px_90px_100px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                          <span>Mesa / integrantes</span>
                          <span className="text-right">Unidades</span>
                          <span className="text-right">Cajas</span>
                          <span className="text-right">Horas</span>
                          <span className="text-right">Ritmo (u/h)</span>
                        </div>
                        {productividadPorMesa.map((f) => (
                          <div
                            key={f.mesaId}
                            className="grid grid-cols-[1fr_90px_90px_90px_100px] gap-3 px-5 py-3 items-center border-b border-border last:border-b-0 text-[12.5px]"
                          >
                            <div>
                              <p className="font-medium">{f.nombre}</p>
                              <p className="text-[10.5px] text-text-faint">
                                {f.integrantes.length > 0 ? f.integrantes.join(", ") : "—"}
                              </p>
                            </div>
                            <span className="text-right font-medium">
                              {f.unidades.toLocaleString("es-EC")}
                            </span>
                            <span className="text-right text-text-dim">{f.cajas}</span>
                            <span className="text-right text-text-dim">{f.horas}</span>
                            <span className="text-right font-semibold text-[#c4b8ff]">{f.ritmo}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10.5px] text-text-faint mt-2">
                        Ritmo = unidades ÷ horas trabajadas (tiempo entre el primer y último movimiento
                        de la mesa en el período). Horas = 0 si solo hay un movimiento registrado.
                      </p>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>

      {/* Modal: Revisar cajas de un código con inconsistencia */}
      {itemRevisarId && itemEnRevision && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="card w-full max-w-[680px] my-6 p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-[16px] font-semibold">{itemEnRevision.codigo}</h2>
                <p className="text-[12px] text-text-dim">{itemEnRevision.descripcion}</p>
              </div>
              <button onClick={() => setItemRevisarId(null)} className="text-text-faint hover:text-text">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="card p-2.5 bg-white/[0.02]">
                <p className="text-[10px] text-text-faint">Factura</p>
                <p className="text-[16px] font-semibold">{itemEnRevision.cantidad_factura}</p>
              </div>
              <div className="card p-2.5 bg-white/[0.02]">
                <p className="text-[10px] text-text-faint">Contado (total)</p>
                <p className="text-[16px] font-semibold">{itemEnRevision.cantidad_contada}</p>
              </div>
              <div className="card p-2.5 bg-white/[0.02]">
                <p className="text-[10px] text-text-faint">Diferencia</p>
                <p
                  className={`text-[16px] font-semibold ${
                    itemEnRevision.cantidad_contada - itemEnRevision.cantidad_factura < 0
                      ? "text-[#fca5a5]"
                      : "text-[#fbbf24]"
                  }`}
                >
                  {itemEnRevision.cantidad_contada - itemEnRevision.cantidad_factura > 0 ? "+" : ""}
                  {itemEnRevision.cantidad_contada - itemEnRevision.cantidad_factura}
                </p>
              </div>
            </div>

            {errorMsg && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              onClick={() => setEditandoDatosGenerales((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 mb-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] text-[12px] font-medium text-text-dim"
            >
              <span>Datos generales del código (palet, marca, composición, país, tienda...)</span>
              <span className="text-text-faint">{editandoDatosGenerales ? "▲ Ocultar" : "▼ Editar"}</span>
            </button>

            <button
              type="button"
              onClick={abrirUnificar}
              className="w-full flex items-center justify-between px-3 py-2 mb-3 rounded-lg bg-accent/[0.1] hover:bg-accent/[0.18] text-[12px] font-medium text-[#c4b8ff]"
            >
              <span>¿Es el mismo producto que otro código de esta orden? Unificar aquí</span>
              <span>→</span>
            </button>

            {editandoDatosGenerales && (
              <div className="card p-3 mb-4 bg-white/[0.02]">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">Palet</label>
                    <input
                      value={egPalet}
                      onChange={(e) => setEgPalet(e.target.value)}
                      className="w-full card px-2.5 py-1.5 text-[12.5px] outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10.5px] text-text-faint block mb-1">
                      Cantidad por caja (ej. 165(24) 166(30))
                    </label>
                    <input
                      value={egCajas}
                      onChange={(e) => setEgCajas(e.target.value)}
                      placeholder="Número de caja seguido de su cantidad entre paréntesis"
                      className="w-full card px-2.5 py-1.5 text-[12.5px] outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">Marca</label>
                    <input
                      value={egMarca}
                      onChange={(e) => setEgMarca(e.target.value)}
                      className="w-full card px-2.5 py-1.5 text-[12.5px] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">País de origen</label>
                    <input
                      value={egPais}
                      onChange={(e) => setEgPais(e.target.value)}
                      className="w-full card px-2.5 py-1.5 text-[12.5px] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">Tienda</label>
                    <input
                      value={egTienda}
                      onChange={(e) => setEgTienda(e.target.value)}
                      className="w-full card px-2.5 py-1.5 text-[12.5px] outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10.5px] text-text-faint block mb-1">Composición</label>
                    <input
                      value={egComposicion}
                      onChange={(e) => setEgComposicion(e.target.value)}
                      placeholder="Ej. 95% Algodón, 5% Elastano"
                      className="w-full card px-2.5 py-1.5 text-[12.5px] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">Tipo de etiqueta</label>
                    <select
                      value={egTipoEtiqueta}
                      onChange={(e) => setEgTipoEtiqueta(e.target.value)}
                      className="w-full card px-2.5 py-1.5 text-[12.5px] outline-none"
                    >
                      <option value="COSIDO">Cosido</option>
                      <option value="ADHESIVA">Adhesiva</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">Novedad</label>
                    <input
                      value={egNovedad}
                      onChange={(e) => setEgNovedad(e.target.value)}
                      placeholder="Ej. DOBLE, CONJUNTO"
                      className="w-full card px-2.5 py-1.5 text-[12.5px] outline-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={guardarDatosGeneralesCodigo}
                    disabled={guardandoDatosGenerales}
                    className="btn-primary text-[12px] font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    {guardandoDatosGenerales ? "Guardando…" : "Guardar datos generales"}
                  </button>
                </div>
              </div>
            )}

            <p className="text-[11.5px] font-semibold text-text-dim mb-2">
              Todas las cajas capturadas de este código ({cajasDelItemEnRevision.length})
            </p>

            {cajasDelItemEnRevision.length === 0 ? (
              <p className="text-[12px] text-amber mb-2">
                Este código no tiene historial de cajas individuales (se capturó antes de que
                existiera este detalle). Solo se puede editar el total desde el módulo de Inventario.
              </p>
            ) : (
              <div className="flex flex-col gap-2 mb-2">
                {cajasDelItemEnRevision.map((reg) =>
                  cajaEditId === reg.id ? (
                    <div key={reg.id} className="card p-3 border-accent-2/40">
                      <div className="mb-2">
                        <label className="text-[10.5px] text-text-faint block mb-1">Caja</label>
                        <input
                          value={cajaEditTexto}
                          onChange={(e) => setCajaEditTexto(e.target.value)}
                          className="w-full card px-2.5 py-1.5 text-[12.5px] outline-none font-mono"
                        />
                      </div>
                      <label className="text-[10.5px] text-text-faint block mb-1">Tallas</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {tallasOrdenDeLaOrdenSeleccionada.map((t) => (
                          <div key={t} className="flex flex-col items-center">
                            <span className="text-[9.5px] text-text-faint mb-0.5">{t}</span>
                            <input
                              value={cajaEditTallas[t] ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCajaEditTallas((prev) => {
                                  const nuevo = { ...prev };
                                  if (v === "" || Number(v) === 0) delete nuevo[t];
                                  else nuevo[t] = Number(v);
                                  return nuevo;
                                });
                              }}
                              type="number"
                              className="w-[48px] card px-1 py-1 text-[11.5px] outline-none text-center"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setCajaEditId(null)}
                          className="btn-secondary text-[11.5px] font-semibold px-3 py-1.5 rounded-lg"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={guardarEdicionCaja}
                          className="btn-primary text-[11.5px] font-semibold px-3 py-1.5 rounded-lg"
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={reg.id}
                      className="grid grid-cols-[110px_1fr_130px] gap-2 px-3 py-2 rounded-md bg-white/[0.03] items-center text-[12px]"
                    >
                      <span className="font-mono">{reg.caja}</span>
                      <span className="text-text-dim font-mono text-[11.5px]">
                        {formatoTallas(reg.tallas_detalle)}
                      </span>
                      <span className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => abrirEditarCaja(reg)}
                          className="text-[11px] px-2 py-1 rounded-md bg-accent/[0.15] text-[#c4b8ff] hover:bg-accent/[0.25]"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setCajaAEliminarId(reg.id)}
                          className="text-[11px] px-2 py-1 rounded-md bg-red/[0.15] text-[#fca5a5] hover:bg-red/[0.25]"
                        >
                          Eliminar
                        </button>
                      </span>
                    </div>
                  )
                )}
              </div>
            )}

            <p className="text-[10.5px] text-text-faint mt-2">
              Al editar o eliminar una caja, el total del código se recalcula automáticamente.
            </p>

            <div className="flex justify-end mt-3">
              <button
                onClick={() => setItemRevisarId(null)}
                className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Unificar dos códigos que son el mismo producto */}
      {showUnificar && itemEnRevision && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-[80] p-4 overflow-y-auto">
          <div className="card w-full max-w-[520px] my-6 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[16px] font-semibold">Unificar códigos</h2>
              <button onClick={() => setShowUnificar(false)} className="text-text-faint hover:text-text">
                <X size={18} />
              </button>
            </div>
            <p className="text-[12px] text-text-dim mb-4">
              Úsalo cuando el proveedor mandó el mismo producto con otro código (por ejemplo, para
              completar un faltante). Busca ese otro código dentro de esta orden y elige cuál de los
              dos se queda como el código principal — el otro se fusiona dentro de él y desaparece.
            </p>

            {errorMsg && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                {errorMsg}
              </div>
            )}

            {!codigoSecundarioId ? (
              <>
                <label className="text-[11.5px] text-text-faint block mb-1">
                  Busca el otro código (por código o descripción)
                </label>
                <input
                  value={busquedaUnificar}
                  onChange={(e) => setBusquedaUnificar(e.target.value)}
                  placeholder="Ej. AS1, o parte de la descripción…"
                  autoFocus
                  className="w-full card px-3 py-2 text-[13px] outline-none font-mono mb-2"
                />
                {busquedaUnificar.trim() && (
                  <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto">
                    {candidatosUnificar.length === 0 ? (
                      <p className="text-[12px] text-text-faint px-1 py-2">
                        Ningún código de esta orden coincide con la búsqueda.
                      </p>
                    ) : (
                      candidatosUnificar.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setCodigoSecundarioId(c.id)}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-left"
                        >
                          <span>
                            <span className="font-medium text-[12.5px]">{c.codigo}</span>
                            <span className="text-[11px] text-text-faint ml-2">{c.descripcion}</span>
                          </span>
                          <span className="text-[11px] text-text-faint">
                            {c.cantidad_contada}/{c.cantidad_factura}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="card p-3 bg-white/[0.02]">
                    <p className="text-[10px] text-text-faint mb-1">Código actual</p>
                    <p className="text-[13px] font-semibold">{itemEnRevision.codigo}</p>
                    <p className="text-[11px] text-text-dim">
                      Factura {itemEnRevision.cantidad_factura} · Contado {itemEnRevision.cantidad_contada}
                    </p>
                  </div>
                  <div className="card p-3 bg-white/[0.02]">
                    <p className="text-[10px] text-text-faint mb-1">Código a unir</p>
                    <p className="text-[13px] font-semibold">{codigoSecundario?.codigo}</p>
                    <p className="text-[11px] text-text-dim">
                      Factura {codigoSecundario?.cantidad_factura} · Contado{" "}
                      {codigoSecundario?.cantidad_contada}
                    </p>
                  </div>
                </div>

                <label className="text-[11.5px] text-text-faint block mb-1.5">
                  ¿Cuál de los dos se queda como el código principal?
                </label>
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setPrincipalElegido("actual")}
                    className={`flex-1 px-3 py-2 rounded-lg border text-[12.5px] font-medium ${
                      principalElegido === "actual"
                        ? "bg-accent/[0.2] text-[#c4b8ff] border-accent-2/40"
                        : "bg-white/[0.03] text-text-dim border-border"
                    }`}
                  >
                    {itemEnRevision.codigo}
                  </button>
                  <button
                    onClick={() => setPrincipalElegido("otro")}
                    className={`flex-1 px-3 py-2 rounded-lg border text-[12.5px] font-medium ${
                      principalElegido === "otro"
                        ? "bg-accent/[0.2] text-[#c4b8ff] border-accent-2/40"
                        : "bg-white/[0.03] text-text-dim border-border"
                    }`}
                  >
                    {codigoSecundario?.codigo}
                  </button>
                </div>

                <p className="text-[11px] text-[#fbbf24] mb-4">
                  ⚠ El código que NO elijas se eliminará; sus cajas, tallas y variantes se sumarán
                  al Contado del que elijas como principal (la Cantidad de Factura del principal se
                  mantiene tal cual, no se suma). Esta acción no se puede deshacer.
                </p>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setCodigoSecundarioId(null)}
                    className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg"
                  >
                    ← Elegir otro código
                  </button>
                  <button
                    onClick={confirmarUnificar}
                    disabled={unificando}
                    className="btn-primary text-[13px] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                  >
                    {unificando ? "Unificando…" : "Confirmar unión"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        abierto={cajaAEliminarId !== null}
        titulo="¿Eliminar esta caja?"
        mensaje="Se eliminará el registro de esta caja y el total del código se recalculará sin ella."
        onConfirmar={confirmarEliminarCaja}
        onCancelar={() => setCajaAEliminarId(null)}
      />
      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
