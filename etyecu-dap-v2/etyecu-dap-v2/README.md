# ETYECU DAP v2.0

Proyecto base: Next.js 15 + TypeScript + Tailwind v4 + Supabase.
Sistema de diseño ya aplicado (el mismo del mockup aprobado): fondo oscuro, tarjetas moradas, sidebar con navegación por módulos.

## 1. Crear tu proyecto en Supabase (5 minutos)

1. Entra a https://supabase.com y crea una cuenta gratuita (puedes usar tu GitHub).
2. Clic en **New Project**. Elige un nombre (ej. `etyecu-dap`) y una contraseña de base de datos (guárdala, la necesitarás).
3. Espera 1-2 minutos a que se aprovisione.
4. Ve a **Project Settings > API**. Ahí vas a ver dos datos que necesitas:
   - `Project URL`
   - `anon public key`

## 2. Configurar las variables de entorno

```bash
cp .env.local.example .env.local
```

Abre `.env.local` y pega la URL y la key que copiaste de Supabase.

## 3. Crear las tablas en Supabase

1. En el dashboard de Supabase, ve a **SQL Editor**.
2. Abre el archivo `supabase/schema.sql` de este proyecto, copia todo su contenido.
3. Pégalo en el SQL Editor y dale **Run**.

Esto crea las 12 tablas principales (clientes, cdas, ordenes_dap, racks, novedades, etc.) ya traducidas desde tu base MySQL actual, con los roles de usuario que en la v1.0 existían pero no se aplicaban.

## 4. Correr el proyecto localmente

```bash
npm install
npm run dev
```

Abre http://localhost:3000 — deberías ver el Dashboard con el mismo diseño del mockup que ya aprobaste, pero ahora como código React real, no una maqueta estática.

## 5. Desplegar a Vercel (cuando quieras mostrarlo en la nube)

1. Sube este proyecto a un repositorio de GitHub.
2. Entra a https://vercel.com, conecta tu cuenta de GitHub.
3. Importa el repositorio — Vercel detecta Next.js automáticamente.
4. En **Environment Variables**, agrega las mismas dos variables de tu `.env.local`.
5. Deploy. En ~1 minuto tienes una URL pública para mostrar avances.

## Estructura del proyecto

```
src/
  app/
    page.tsx          -> Dashboard (ya construido)
    globals.css        -> Tokens del sistema de diseño (colores, radios)
  components/
    Sidebar.tsx         -> Navegación lateral
    Topbar.tsx           -> Barra superior (búsqueda, usuario)
    KpiCard.tsx           -> Tarjeta de métrica reutilizable
  lib/
    supabase-browser.ts   -> Cliente de Supabase para el navegador
supabase/
  schema.sql              -> Esquema completo de base de datos
```

## Próximos pasos sugeridos

- Conectar el Dashboard a datos reales de Supabase (reemplazar los números fijos por consultas).
- Construir la pantalla de Clientes (CRUD) como primer módulo funcional completo.
- Definir las políticas de Row Level Security por rol en `schema.sql` antes de ir a producción.
