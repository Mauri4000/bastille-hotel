import type { ReservationStatus } from './types';

export const INCOME_CATEGORIES = [
  'H01-HOSPEDAJE',
  'H02-ALQUILER DE SALÓN',
  'H03-VENTA DE VITRINAS',
  'H04-EARLY/LATE CHECK OUT',
  'H05-MASCOTAS',
  'H06-DESAYUNOS EXTRA',
  'H07-REPOSICIÓN DE DAÑOS',
  'H08-GUARDAEQUIPAJE',
  'H09-ALQUILER DE COMEDOR',
  'H10-PLANCHADO',
  'SALDO QR',
  'SALDO EFECTIVO',
  'VARIOS',
  'ALQUILER DE SALÓN Y COMEDOR',
] as const;

export const EXPENSE_CATEGORIES = [
  'B01-DESAYUNOS DE HOTEL',
  'B02-SUMINISTROS DE HOTEL',
  'B03-SERVICIOS BÁSICOS',
  'B04-INSUMOS DE LIMPIEZA',
  'B05-SUELDOS Y SALARIOS',
  'B06-MATERIAL DE ESCRITORIO',
  'B07-PUBLICIDAD Y MARKETING',
  'B08-GASTOS VARIOS',
  'B09-MANTENIMIENTO DE HOTEL',
  'B10-REFRIGERIOS AL PERSONAL',
  'B11-SUMINISTROS DE VITRINAS',
  'B12-SERVICIOS EXTRA DE HOTEL',
  'B13-GASTOS FISCALES',
  'B14-GASTO NO JUSTIFICADO',
  'B15-CONSTRUCCIÓN TERRAZA',
  'GASTOS FAMILIARES',
  'RETIROS DOÑA SONIA',
] as const;

export const STATUS_CONFIG: Record<
  ReservationStatus,
  { bg: string; text: string; border: string; label: string; dot: string }
> = {
  ocupado: {
    bg: 'bg-green-500',
    text: 'text-white',
    border: 'border-green-600',
    label: 'Ocupado',
    dot: 'bg-green-500',
  },
  reserva: {
    bg: 'bg-amber-400',
    text: 'text-black',
    border: 'border-amber-500',
    label: 'Reserva',
    dot: 'bg-amber-400',
  },
  mantenimiento: {
    bg: 'bg-red-500',
    text: 'text-white',
    border: 'border-red-600',
    label: 'Mantenimiento',
    dot: 'bg-red-500',
  },
  habilitacion: {
    bg: 'bg-blue-400',
    text: 'text-white',
    border: 'border-blue-500',
    label: 'Habilitación',
    dot: 'bg-blue-400',
  },
};

export const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

export const DAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
