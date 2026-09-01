# Bastille Hotel — Panel de Administración

Documento de contexto completo para continuar el desarrollo en otra sesión de Claude.

---

## Stack técnico

- **React + TypeScript** (Vite)
- **Tailwind CSS** para estilos
- **Supabase** (PostgreSQL) como backend — auth + base de datos + storage
- **pdfmake** (CDN v0.2.7) para el Parte Mensual PDF
- **HTML + window.print()** para el Reporte Familiar (reemplazó pdfmake)
- **React Router** para navegación

---

## Estructura de carpetas relevante

```
src/
  admin/
    contexts/
      AuthContext.tsx          — sesión, profile, role
    pages/
      CalendarPage.tsx         — calendario principal de reservas
      TransactionsPage.tsx     — ingresos y egresos (Caja Mayor/Chica/BNB/Tarjeta)
      ReportesPage.tsx         — Parte Diaria, Parte Mensual, Reporte Familiar
      MarketingPage.tsx        — gestión de publicaciones en redes sociales
      LimpiezasPage.tsx        — asignación de limpiezas por camarera
      ShiftPage.tsx            — cambio de turno (mañana/tarde/noche)
      BilletesPage.tsx         — registro de billetes falsos/sospechosos
      PettyCashPage.tsx        — caja chica detallada
      VitrinaPage.tsx          — productos de vitrina
      GuestDatabasePage.tsx    — base de datos de huéspedes
      HistorialPage.tsx        — historial de reservas
      DashboardPage.tsx        — dashboard principal
    components/
      AdminLayout.tsx          — nav sidebar + header
    constants.ts               — INCOME_CATEGORIES, EXPENSE_CATEGORIES, STATUS_CONFIG
    types.ts                   — todos los TypeScript types/interfaces
  lib/
    supabase.ts                — cliente Supabase
```

---

## Roles de usuario

```typescript
type Role = 'admin' | 'recepcion' | 'marketing';
```

- **admin** — acceso total
- **recepcion** — calendario, transacciones, reportes, limpiezas, turno
- **marketing** — solo MarketingPage

Tabla `profiles`: `id (uuid, FK auth.users), name, email, role, is_active, created_at`

---

## Tablas Supabase principales

### `reservations`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| room_id | text | ej. "H01", "SALON" |
| guest_id | uuid | FK guests nullable |
| guest_name | text | |
| guest_country | text | |
| num_guests | int | |
| num_nights | int | |
| check_in | date | |
| check_out | date | |
| status | text | ocupado/reserva/mantenimiento/habilitacion/limpieza |
| is_empresa | bool | |
| wants_invoice | bool | solo estos van al Parte Mensual |
| has_pet | bool | |
| price_per_night | numeric | |
| siaat_number | text | número de factura SIAAT |
| additional_guests | jsonb | array de huéspedes adicionales |
| early_checkin | bool | |
| early_checkin_amount | numeric | |
| late_checkout | bool | |
| late_checkout_amount | numeric | |
| notes | text | |
| created_by | uuid | FK profiles |

### `additional_guests` (dentro del jsonb)
```json
{
  "role": "adult" | "child" | "babies",
  "guest_name": "...",
  "nationality": "...",
  "age": 0,
  "gender": "M" | "F"
}
```

### `transactions`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| date | date | |
| time | time | |
| description | text | |
| amount | numeric | siempre positivo |
| type | text | 'ingreso' \| 'egreso' |
| category | text | ver INCOME_CATEGORIES / EXPENSE_CATEGORIES |
| caja | text | 'CAJA MAYOR' \| 'CAJA CHICA' \| 'CUENTA BNB' \| 'TARJETA' |
| room_id | text | |
| reservation_id | uuid | |
| responsible_id | uuid | FK profiles |

### `cleaning_tasks`
| Columna | Tipo |
|---|---|
| id | uuid |
| date | date |
| room_id | text |
| cleaner | text |
| task_type | text |
| notes | text |
| completed | bool |
| updated_at | timestamptz |

### `marketing_posts`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| date | date | |
| account_name | text | ej. "Bastille Hotel", "Cretassic Hostal" |
| networks | text[] | array de redes (legacy) |
| network_stats | jsonb | **usar esto** — stats por red |
| category | text | JSON string de array de categorías |
| title | text | |
| post_type | text | 'image' \| 'video' \| 'reel' |
| paid_ads | bool | |
| paid_ads_amount | numeric | |
| pending | bool | borrador/pendiente |
| image_url | text | |

**`network_stats` estructura:**
```json
{
  "Instagram": { "likes": 100, "comments": 5, "views": 1000 },
  "Facebook":  { "likes": 50,  "comments": 2, "views": 500  },
  "TikTok":    { "likes": 200, "comments": 10,"views": 5000 }
}
```

**`category` estructura** (JSON string de array):
```json
"[\"Empresa\",\"Desayuno\"]"
```
Backward compat: puede ser string simple `"Empresa"` (posts viejos).

**Categorías disponibles:**
`'Empresa' | 'Mascotas' | 'Desayuno' | 'Salón' | 'Cena' | 'Turístico' | 'Fecha Festiva' | 'Personal de Trabajo' | 'Otros'`

### `profiles`
| Columna | Tipo |
|---|---|
| id | uuid (FK auth.users) |
| name | text |
| email | text |
| role | text |
| is_active | bool |
| created_at | timestamptz |

### Otras tablas
- `guests` — base de datos de huéspedes
- `petty_cash` — caja chica
- `shift_handovers` — cambios de turno
- `banknote_logs` — registro de billetes

---

## Permisos Supabase (importante)

La tabla `marketing_posts` requiere GRANTs explícitos además de RLS:
```sql
GRANT ALL ON TABLE marketing_posts TO authenticated;
GRANT ALL ON TABLE marketing_posts TO anon;
```

---

## Creación de usuario nuevo

1. Supabase Dashboard → Authentication → Users → Add user → Create new user
2. Ingresar email y contraseña (patrón: `nombre@bastillehotel.bo` / `Nombre2026!`)
3. Copiar el UUID generado
4. SQL Editor:
```sql
UPDATE profiles SET name = 'Nombre', email = 'nombre@bastillehotel.bo', role = 'recepcion'
WHERE id = '<uuid>';
-- Si no existe (trigger no lo creó):
INSERT INTO profiles (id, name, email, role)
VALUES ('<uuid>', 'Nombre', 'nombre@bastillehotel.bo', 'recepcion');
```

---

## Módulos principales

### CalendarPage
- Grid de habitaciones × días del mes
- Mobile responsive: `isMobile = window.innerWidth < 768`
- Mobile: celdas 30px, desktop: 116px
- Celdas muestran color por status (verde=ocupado, amarillo=reserva, rojo=mant.)
- Al click abre modal de detalle/edición
- Soporta: early check-in, late checkout, mascota, pagos divididos, cambio de habitación

### TransactionsPage (Ingresos/Egresos)
- Tabs: Ingresos / Egresos (dentro de cada tab: sub-tabs por caja)
- 4 cajas: CAJA MAYOR, CAJA CHICA, CUENTA BNB, TARJETA
- Mobile: header compacto, tabs con scroll horizontal

### ReportesPage
Tres reportes:

**1. Parte Diaria** (pdfmake)
- Reporte diario de huéspedes para Migración
- Incluye: datos personales, edades, propósito de visita

**2. Parte Mensual** (pdfmake)
- Tabla de nacionalidades × días del mes
- Solo reservas con `wants_invoice = true`, excluyendo `room_id = 'SALON'`
- Logos de Bolivia/Chuquisaca convertidos con Canvas API (cualquier formato → PNG)
- Columnas: DAY_W=18, COL_W=11, TOT_W=16
- Huéspedes adicionales heredan nacionalidad del titular si no tienen propia
- Columnas: 13 nacionalidades + Africa + Otros Amer. + Total

**3. Reporte Familiar** (HTML + window.print())
- Abre ventana nueva con HTML estilizado
- Botón "Imprimir / PDF" → `window.print()`
- Secciones:
  - Resumen financiero (tabla + pie chart por caja)
  - Ingresos por categoría (barras CSS verdes)
  - Egresos por categoría (barras CSS rojas + detalle por categoría)
  - Huéspedes del mes (4 stat boxes)
  - Facturas y empresas (tabla)
  - Limpiezas por persona (barras + pie chart SVG + tabla)
  - Sueldos y servicios básicos (tabla)
  - Marketing (stat boxes, top 3, breakdown por cuenta/red/categoría, tabla detalle)
- El pie chart usa SVG generado inline
- Sin emojis (pdfmake/Roboto no los soporta, HTML sí pero se decidió texto plano)

### MarketingPage
- CRUD de publicaciones en redes sociales
- Multi-select de categorías (almacenadas como JSON string en columna `category`)
- Helper `parseCategories()` para backward compat
- Analytics panel: stats totales, top 3 por vistas (🥇🥈🥉), breakdown por categoría
- Filtros por cuenta y categoría
- Modal de confirmación custom para eliminar (no `window.confirm()`)
- Subida de imágenes a Supabase Storage

### LimpiezasPage
Staff disponible: `['Arlet', 'Carla', 'Vicky', 'Maria', 'Marioly', 'Romina']`
Colores: cada persona tiene color de pill y botón asignado.
Romina: `{ pill: 'bg-teal-100 text-teal-800', btn: 'bg-teal-500 text-white' }`
Incluye sección "Ayudas en Cretassic Hostal".

---

## Patrones de código importantes

### Imagen → base64 para pdfmake
```typescript
async function imgToBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth  || img.width;
      canvas.height = img.naturalHeight || img.height;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}
```

### Parsear categorías de marketing (backward compat)
```typescript
function parseCategories(row: any): Category[] {
  const raw = row?.category ?? row?.categories;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Category[];
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p as Category[]; } catch {}
  return [raw as Category];
}
```

### Agregar stats de network_stats
```typescript
const getStats = (ns: any) => {
  let likes = 0, comments = 0, views = 0;
  for (const v of Object.values(ns || {})) {
    const s = v as any;
    likes += s?.likes ?? 0; comments += s?.comments ?? 0; views += s?.views ?? 0;
  }
  return { likes, comments, views };
};
```

### Guardar post de marketing
```typescript
const { categories, ...rest } = form;
const payload = { ...rest, category: JSON.stringify(categories) };
```

---

## Categorías de ingresos y egresos

**Ingresos:**
`H01-HOSPEDAJE, H02-ALQUILER DE SALÓN, H03-VENTA DE VITRINAS, H04-EARLY/LATE CHECK OUT, H05-MASCOTAS, H06-DESAYUNOS EXTRA, H07-REPOSICIÓN DE DAÑOS, H08-GUARDAEQUIPAJE, H09-ALQUILER DE COMEDOR, H10-PLANCHADO, SALDO QR, SALDO EFECTIVO, VARIOS, ALQUILER DE SALÓN Y COMEDOR, REPOSICION DOÑA SONIA, SALDO DEL MES ANTERIOR`

**Egresos:**
`B01-DESAYUNOS DE HOTEL, B02-SUMINISTROS DE HOTEL, B03-SERVICIOS BÁSICOS, B04-INSUMOS DE LIMPIEZA, B05-SUELDOS Y SALARIOS, B06-MATERIAL DE ESCRITORIO, B07-PUBLICIDAD Y MARKETING, B08-GASTOS VARIOS, B09-MANTENIMIENTO DE HOTEL, B10-REFRIGERIOS AL PERSONAL, B11-SUMINISTROS DE VITRINAS, B12-SERVICIOS EXTRA DE HOTEL, B13-GASTOS FISCALES, B14-GASTO NO JUSTIFICADO, B15-CONSTRUCCIÓN TERRAZA, GASTOS FAMILIARES, RETIROS DOÑA SONIA, DEUDAS MAURI, ESCUELA ESPAÑOL, ROOFTOP`

---

## Habitaciones

IDs en uso: `H01` a `H09`, `H-CRETA-01` a `H-CRETA-04`, `SALON`
- `SALON` se excluye del Parte Mensual

Tipos de habitación incluyen: Simple, Doble, Triple, Matrimonial, MC (Matrimonial + Camita)

---

## Reglas de desarrollo

- **Git commits en INGLÉS siempre**
- **Claude NO hace git commits/pushes** — Mauri los hace desde su terminal
- Verificar siempre con `npx tsc --noEmit` antes de entregar cambios
- No usar `window.confirm()` — usar modales custom en React
- pdfmake NO soporta emojis con fuente Roboto — usar texto plano en PDFs

---

## Usuarios del sistema (ejemplos)

| Email | Rol |
|---|---|
| mauri@bastillehotel.bo | admin |
| laura@bastillehotel.bo | marketing |
| estela@bastillehotel.bo | recepcion |
| lizz@bastillehotel.bo | recepcion |
| brayan@bastillehotel.bo | recepcion |

---

## Variables de entorno

Archivo `.env` en la raíz:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Comandos útiles

```bash
npm run dev          # servidor de desarrollo
npm run build        # build de producción
npx tsc --noEmit     # verificar tipos sin compilar
```
