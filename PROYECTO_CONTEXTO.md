# Bastille Hotel — Contexto del Proyecto

## ¿Qué es esto?
Panel de administración interno para el **Bastille Hotel** (La Paz, Bolivia). Es una SPA (Single Page App) hecha con React + TypeScript, desplegada en Vercel, con base de datos en Supabase (PostgreSQL). El panel lo usan los recepcionistas y el admin (Mauri) para gestionar reservas, pagos, limpieza, reportes, etc.

---

## Stack tecnológico
- **Frontend:** React + TypeScript + Vite
- **Estilos:** Tailwind CSS
- **Base de datos / Auth:** Supabase (PostgreSQL + RLS)
- **Deploy:** Vercel (conectado a GitHub)
- **Routing:** React Router v6
- **Íconos:** Lucide React

---

## Estructura de archivos clave

```
src/
  admin/
    components/
      AdminLayout.tsx       — Sidebar + navegación
      CustomSelect.tsx      — Dropdown reutilizable (usar SIEMPRE en vez de <select>)
      DatePicker.tsx        — Selector de fecha. Props: birthdateMode, useFixed (para evitar clipping)
      TimePicker.tsx        — Selector de hora
      VitrinaProductPicker.tsx
    contexts/
      AuthContext.tsx       — profile, role ('admin' | 'recepcion')
    pages/
      CalendarPage.tsx      — PÁGINA PRINCIPAL. Calendario de habitaciones, reservas, check-in/out, pagos
      TransactionsPage.tsx  — Ingresos & Egresos
      ReportesPage.tsx      — Parte diaria (PDF/Excel) para migración
      LimpiezasPage.tsx     — Registro de limpiezas por habitación
      ShiftPage.tsx         — Cambio de turno
      BilletesPage.tsx      — Registro de billetes
      GuestDatabasePage.tsx — Base de huéspedes
      VitrinaPage.tsx       — Stock hotel (vitrina)
      HistorialPage.tsx     — Log de actividad (solo admin)
      SpanishSchoolPage.tsx — Módulo escuela de español
      DashboardPage.tsx
    types.ts                — Todos los tipos TypeScript
    constants.ts            — Categorías, STATUS_CONFIG, etc.
  lib/
    supabase.ts             — Cliente Supabase
    logActivity.ts          — Registra acciones en tabla 'activity_log'
```

---

## Roles de usuario
- `admin` — acceso total, ve todas las tabs, puede eliminar cualquier cosa
- `recepcion` — acceso limitado: no ve tab "Agosto 2026" (all), no ve "Personal BNB", puede eliminar transacciones excepto INICIO/FINAL DE CAJA

---

## Base de datos — Tablas principales

### `reservations`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| room_id | uuid | FK → rooms |
| guest_name | text | |
| num_guests | int | |
| check_in | date | YYYY-MM-DD |
| check_out | date | YYYY-MM-DD |
| status | text | 'ocupado' \| 'reserva' \| 'mantenimiento' \| 'habilitacion' \| 'limpieza' |
| price_per_night | numeric | |
| notes | text | Se usa para guardar JSON interno `__room_change` |
| guest_gender | text | 'M' \| 'F' \| '' |
| guest_age | int | |
| guest_marital | text | Estado civil |
| guest_doc_type | text | |
| guest_doc_number | text | |
| guest_nationality | text | |
| guest_origin | text | Procedencia |
| guest_next_dest | text | Próximo destino |
| guest_transport | text | Vía de transporte |
| guest_purpose | text | Motivo de viaje |
| child_guests | jsonb | Array de niños: [{name, birthdate, gender, doc_type, doc_number, nationality, marital_status, origin, next_dest, transport, purpose}] |
| is_empresa | bool | |
| has_pet | bool | |
| wants_invoice | bool | |
| siaat_number | text | Número de factura SIAAT |
| created_by | uuid | FK → profiles |

### `transactions`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid | PK |
| date | date | |
| time | text | HH:MM |
| description | text | |
| amount | numeric | |
| type | text | 'ingreso' \| 'egreso' |
| category | text | Ver constantes abajo |
| caja | text | 'CAJA MAYOR' \| 'CAJA CHICA' \| 'CUENTA BNB' \| 'TARJETA' |
| room_id | uuid | FK → rooms (opcional) |
| reservation_id | uuid | FK → reservations (opcional) |
| responsible_id | uuid | FK → profiles |
| notes | text | |

### `rooms`
| Campo | Tipo |
|-------|------|
| id | uuid |
| name | text | (ej: "B2", "A4", "C1") |
| type | text | subtipo de habitación |
| floor | int | |
| capacity | int | |
| price_usd | numeric | precio base |
| is_active | bool | |

### `profiles`
| Campo | Tipo |
|-------|------|
| id | uuid | igual al auth.uid() |
| name | text | |
| email | text | |
| role | text | 'admin' \| 'recepcion' |
| is_active | bool | |

### Otras tablas
- `shift_handovers` — cambios de turno
- `banknote_logs` — registro de billetes
- `limpiezas` — registros de limpieza
- `activity_log` — historial de acciones
- `vitrina_products` — productos de stock

---

## Categorías de transacciones

**Ingresos (H):**
H01-HOSPEDAJE, H02-ALQUILER DE SALÓN, H03-VENTA DE VITRINAS, H04-EARLY/LATE CHECK OUT, H05-MASCOTAS, H06-DESAYUNOS EXTRA, H07-REPOSICIÓN DE DAÑOS, H08-GUARDAEQUIPAJE, H09-ALQUILER DE COMEDOR, H10-PLANCHADO, SALDO QR, SALDO EFECTIVO, VARIOS, SALDO DEL MES ANTERIOR

**Egresos (B):**
B01-DESAYUNOS DE HOTEL, B02-SUMINISTROS DE HOTEL, B03-SERVICIOS BÁSICOS, B04-INSUMOS DE LIMPIEZA, B05-SUELDOS Y SALARIOS, B06-MATERIAL DE ESCRITORIO, B07-PUBLICIDAD Y MARKETING, B08-GASTOS VARIOS, B09-MANTENIMIENTO DE HOTEL, B10-REFRIGERIOS AL PERSONAL, B11-SUMINISTROS DE VITRINAS, B12-SERVICIOS EXTRA, B13-GASTOS FISCALES, B14-GASTO NO JUSTIFICADO, B15-CONSTRUCCIÓN TERRAZA, GASTOS FAMILIARES, RETIROS DOÑA SONIA, DEUDAS MAURI, ESCUELA ESPAÑOL

---

## CalendarPage — La página más importante

Es un calendario de habitaciones donde cada fila es una habitación y cada columna es un día. Las celdas son tarjetas de reserva coloreadas.

### Estados de reserva (colores)
- `ocupado` → verde (huésped presente)
- `reserva` → amarillo (reserva futura)
- `mantenimiento` → rojo
- `habilitacion` → gris/slate (habitación lista pero vacía)
- `limpieza` → azul

### Flujo principal de reserva
1. Clic en celda vacía → modal de nueva reserva
2. Se ingresa: nombre huésped, fechas, precio/noche, datos de migración (género, edad, estado civil, documento, etc.)
3. Niños: se pueden agregar con CustomSelect para género, DatePicker con `useFixed` para fecha de nacimiento
4. Al confirmar: se crea reservation en status 'ocupado' o 'reserva'
5. Clic en tarjeta existente → menú de opciones: Editar, Checkout, Adelanto, Cambiar habitación, etc.

### Checkout
- Modal que calcula total de noches × precio
- Muestra pagos ya realizados
- Permite pagar en Efectivo (CAJA MAYOR), QR (CUENTA BNB), Tarjeta, Caja Chica, o dividido
- Si la reserva fue movida de habitación (tiene `__room_change` en notes), muestra desglose de ambas habitaciones
- Al confirmar crea transaction + cambia status a 'limpieza'

### Adelanto de pago
- Desde menú de tarjeta, opción "Adelanto"
- Crea transaction con fecha/hora ACTUAL (no la fecha de check-in)
- Categoría H01-HOSPEDAJE

### Cambio de habitación
- Opción "Cambiar habitación" en menú de tarjeta
- Pide fecha de mudanza (moveDate) dentro del período de la reserva
- Al confirmar:
  1. Reserva original se acorta: check_out = moveDate
  2. Nueva reserva creada en nueva habitación: check_in = moveDate, check_out = fecha original
  3. Nueva reserva tiene en `notes` el JSON: `{"__room_change": {"parentId": "...", "parentRoom": "...", "moveDate": "..."}}`
  4. Se crea 1 celda de 'habilitacion' en habitación original (moveDate → moveDate+1)
  5. Si motivo = "dañada": también se crea celda de 'mantenimiento'

### Nota importante sobre `notes`
El campo `notes` de reservations se usa para dos cosas:
- Notas visibles al usuario (tooltip en tarjeta)
- JSON interno `__room_change` (NUNCA mostrar al usuario)
El código filtra: `if (!rawNotes.includes('__room_change'))` antes de mostrar tooltip.

---

## TransactionsPage — Ingresos & Egresos

### Tabs
- **Agosto 2026** (admin only) — todos los movimientos
- **Caja Mayor** — CAJA MAYOR + CUENTA BNB + TARJETA ingresos
- **Caja Chica** — solo CAJA CHICA
- **Egresos BNB** — egresos CUENTA BNB (sin sueldos)
- **BNB Mauri** — admin only, movimientos BNB
- **Personal BNB** — admin only, sueldos y salarios por QR

### Registros especiales
- `INICIO DE CAJA` y `FINAL DE CAJA` — son ShiftRef, no tienen botón eliminar, se muestran en columna SALDO como referencia
- El botón eliminar (🗑) aparece en todas las filas que NO son ShiftRef, para admin y recepcionistas

### Auto-scroll
Al cambiar de tab, la tabla hace scroll instantáneo (`behavior: 'instant'`) a la primera fila con la fecha de hoy. Si no hay filas de hoy, va al final.

---

## ReportesPage — Parte Diaria (Migración)

Genera el reporte de huéspedes para migración (Policía Boliviana). Se exporta como PDF o Excel.

### Campos requeridos por huésped (se resaltan en rojo si faltan)
`gender`, `age`, `marital_status`, `doc_type`, `doc_number`, `purpose`, `guest_origin`, `guest_next_dest`, `guest_transport`

### Reglas especiales
- Niños/bebés (`role: 'child'`): `marital_status` siempre se fuerza a `'S'` (Soltero)
- Los datos de niños heredan los del huésped principal si están vacíos (origin, next_dest, transport, purpose)
- Hay botón toggle `⚠️ N incompletos — filtrar` que muestra solo filas con campos faltantes

---

## Componentes reutilizables importantes

### CustomSelect
```tsx
<CustomSelect
  value={value}
  onChange={(v) => setValue(v)}
  options={[{ value: 'M', label: 'M — Masculino' }, { value: 'F', label: 'F — Femenino' }]}
  placeholder="Seleccionar"
  size="sm" // 'sm' | 'md' | 'lg'
/>
```
**Siempre usar CustomSelect en vez de `<select>` nativo.**

### DatePicker
```tsx
<DatePicker
  value={date}           // "YYYY-MM-DD" o ""
  onChange={(v) => setDate(v)}
  placeholder="Fecha"
  birthdateMode={true}   // empieza en año actual-30, muestra grid de años
  useFixed={true}        // usa position:fixed para escapar overflow:hidden de contenedores
/>
```

### logActivity
```ts
import { logActivity } from '../../lib/logActivity';
logActivity(profile?.id, profile?.name, 'Acción', 'tipo_entidad', entidadId, 'Descripción detalle');
```

---

## Convenciones y reglas importantes

1. **Git commits en inglés** (siempre, sin excepción)
2. **No hacer commits desde el asistente** — Mauri hace todos los commits/push desde su terminal
3. **Fechas siempre en zona horaria America/La_Paz**
   ```ts
   const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
   const time  = new Date().toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
   ```
4. **CustomSelect siempre** en vez de `<select>` nativo
5. **DatePicker con `useFixed`** dentro de modales o contenedores con overflow
6. **TypeScript estricto** — siempre correr `npx tsc --noEmit` para verificar tipos
7. El campo `guest_email` NO existe en la tabla `reservations` — no incluirlo en inserts

---

## RLS (Row Level Security) en Supabase — pendiente

Para que recepcionistas puedan eliminar transacciones, ejecutar en Supabase SQL Editor:
```sql
CREATE POLICY "receptionist_delete_transactions"
ON transactions FOR DELETE TO authenticated
USING (
  description != 'INICIO DE CAJA' AND description != 'FINAL DE CAJA'
);
```

---

## Flujo de trabajo habitual
1. Mauri o recepcionista edita código en local
2. `npm run dev` para ver cambios
3. `git add . && git commit -m "feat: descripción en inglés" && git push`
4. Vercel despliega automáticamente desde GitHub (tarda ~2 min)
5. Si Vercel no dispara el build: ir a vercel.com → proyecto → Deployments → "Redeploy"

---

## Lo que ya está construido (módulos completos)
- ✅ Calendario de habitaciones con reservas, check-in, checkout, adelantos
- ✅ Cambio de habitación con split de reserva y desglose en checkout
- ✅ Pago dividido (efectivo + QR, etc.)
- ✅ Early check-in / Late checkout (con cobro)
- ✅ Mascotas (con cobro H05)
- ✅ Parte diaria (PDF + Excel) para migración
- ✅ Ingresos & Egresos con múltiples cajas y tabs
- ✅ Cambio de turno con saldos iniciales/finales
- ✅ Registro de billetes (billetes sospechosos/falsos)
- ✅ Limpiezas por habitación
- ✅ Stock / Vitrina
- ✅ Base de huéspedes
- ✅ Historial de actividad (admin)
- ✅ Spanish School module
- ✅ Personal / Staff management
