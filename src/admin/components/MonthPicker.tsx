/**
 * MonthPicker.tsx
 * ---------------
 * Selector de mes + año con el mismo estilo visual que DatePicker.
 * Muestra un dropdown con 12 botones de meses y navegacion de año.
 *
 * Props:
 *   value      → "YYYY-MM" o ""
 *   onChange   → recibe "YYYY-MM"
 *   placeholder
 *   accentClass → color del ring al abrir (default amber)
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface Props {
  value: string;           // "YYYY-MM" or ""
  onChange: (v: string) => void;
  placeholder?: string;
  accentClass?: string;
}

export default function MonthPicker({
  value,
  onChange,
  placeholder = 'Seleccionar mes',
  accentClass = 'border-amber-400 ring-amber-100',
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const selYear  = value ? parseInt(value.split('-')[0]) : null;
  const selMonth = value ? parseInt(value.split('-')[1]) - 1 : null; // 0-indexed

  const [viewYear, setViewYear] = useState(selYear ?? today.getFullYear());

  // Sincronizar viewYear cuando cambia el value externo
  useEffect(() => {
    if (selYear) setViewYear(selYear);
  }, [value]); // eslint-disable-line

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function selectMonth(monthIndex: number) {
    const mm = String(monthIndex + 1).padStart(2, '0');
    onChange(`${viewYear}-${mm}`);
    setOpen(false);
  }

  function clearValue() {
    onChange('');
    setOpen(false);
  }

  // Label visible en el input
  const displayLabel = value
    ? `${MONTHS_FULL[parseInt(value.split('-')[1]) - 1]} ${value.split('-')[0]}`
    : '';

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger input ─────────────────────────────────────────────── */}
      <div
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer bg-white select-none transition-all
          ${open ? `${accentClass} ring-2` : 'border-gray-200 hover:border-gray-300'}
          ${!displayLabel ? 'text-gray-400' : 'text-gray-800'}`}
        style={{ minWidth: 180 }}
      >
        <CalendarDays size={15} className="text-amber-500 flex-shrink-0" />
        <span className="flex-1 truncate">{displayLabel || placeholder}</span>
        {value && (
          <button
            onClick={e => { e.stopPropagation(); clearValue(); }}
            className="text-gray-300 hover:text-gray-500 transition-colors"
          >
            ×
          </button>
        )}
      </div>

      {/* ── Dropdown calendar ─────────────────────────────────────────── */}
      {open && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-64">
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setViewYear(y => y - 1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            >
              <ChevronLeft size={16} />
            </button>

            <span className="text-sm font-bold text-gray-800">
              {viewYear}
            </span>

            <button
              onClick={() => setViewYear(y => y + 1)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((m, i) => {
              const isSelected = selYear === viewYear && selMonth === i;
              const isToday    = today.getFullYear() === viewYear && today.getMonth() === i;

              return (
                <button
                  key={m}
                  onClick={() => selectMonth(i)}
                  className={`rounded-lg py-2 text-sm font-medium transition-all
                    ${isSelected
                      ? 'bg-gray-900 text-white font-bold'
                      : isToday
                        ? 'bg-amber-400 text-gray-900 font-bold'
                        : 'text-gray-700 hover:bg-amber-50 hover:text-amber-700'
                    }`}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex justify-between mt-3 pt-2 border-t border-gray-100">
            <button
              onClick={clearValue}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Limpiar
            </button>
            <button
              onClick={() => {
                const m = today.getMonth();
                const mm = String(m + 1).padStart(2, '0');
                onChange(`${today.getFullYear()}-${mm}`);
                setViewYear(today.getFullYear());
                setOpen(false);
              }}
              className="text-xs text-amber-500 font-semibold hover:text-amber-700 transition-colors"
            >
              Este mes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
