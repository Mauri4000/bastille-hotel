import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DAYS_SHORT = ['Do','Lu','Ma','Mi','Ju','Vi','Sá'];

interface Props {
  value: string;          // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  placeholder?: string;
  accentClass?: string;   // ring color, default amber
  birthdateMode?: boolean; // starts in current year - 30, shows year grid on click
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Seleccionar fecha',
  accentClass = 'border-amber-400 ring-amber-100',
  birthdateMode = false,
}: Props) {
  const [open, setOpen]     = useState(false);
  const [mode, setMode]     = useState<'days' | 'years'>('days');
  const ref = useRef<HTMLDivElement>(null);

  const today = new Date();
  const sel = value
    ? (() => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); })()
    : null;

  const defaultYear = birthdateMode ? today.getFullYear() - 30 : today.getFullYear();
  const [vy, setVy] = useState(sel?.getFullYear() ?? defaultYear);
  const [vm, setVm] = useState(sel?.getMonth() ?? today.getMonth());

  // Year grid decade range
  const decadeStart = Math.floor(vy / 10) * 10 - 5;
  const yearRange = Array.from({ length: 20 }, (_, i) => decadeStart + i);

  useEffect(() => {
    if (sel) { setVy(sel.getFullYear()); setVm(sel.getMonth()); }
  }, [value]); // eslint-disable-line

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setMode('days');
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  function prev() { vm === 0 ? (setVm(11), setVy(y => y - 1)) : setVm(m => m - 1); }
  function next() { vm === 11 ? (setVm(0), setVy(y => y + 1)) : setVm(m => m + 1); }

  function pick(day: number) {
    onChange(`${vy}-${String(vm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    setOpen(false);
    setMode('days');
  }

  function pickYear(y: number) {
    setVy(y);
    setMode('days');
  }

  function setToday() {
    const t = new Date();
    onChange(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`);
    setOpen(false);
    setMode('days');
  }

  const firstDow  = new Date(vy, vm, 1).getDay();
  const daysCount = new Date(vy, vm + 1, 0).getDate();
  const prevCount = new Date(vy, vm, 0).getDate();

  const display = sel
    ? sel.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setMode('days'); }}
        className={`w-full flex items-center gap-2 border rounded-xl px-3 py-2.5 text-sm bg-white transition-all ${
          open ? `${accentClass} ring-2` : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <span className="text-base select-none">📅</span>
        <span className={`flex-1 text-left ${display ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
          {display ?? placeholder}
        </span>
        {display && (
          <span
            className="text-gray-300 hover:text-gray-500 text-xs ml-auto leading-none"
            onClick={e => { e.stopPropagation(); onChange(''); }}
          >✕</span>
        )}
      </button>

      {/* Calendar popup */}
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-72 select-none">

          {/* ── YEAR GRID MODE ── */}
          {mode === 'years' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={() => setVy(y => y - 20)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                  <ChevronLeft size={15} />
                </button>
                <span className="text-sm font-bold text-gray-800">{yearRange[0]} — {yearRange[yearRange.length - 1]}</span>
                <button type="button" onClick={() => setVy(y => y + 20)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                  <ChevronRight size={15} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {yearRange.map(y => (
                  <button key={y} type="button" onClick={() => pickYear(y)}
                    className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                      y === vy
                        ? 'bg-gray-900 text-white'
                        : y === today.getFullYear()
                        ? 'bg-amber-400 text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}>
                    {y}
                  </button>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-center">
                <button type="button" onClick={() => setMode('days')}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  ← Volver al calendario
                </button>
              </div>
            </>
          )}

          {/* ── DAY GRID MODE ── */}
          {mode === 'days' && (
            <>
              {/* Month nav */}
              <div className="flex items-center justify-between mb-4">
                <button type="button" onClick={prev} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                  <ChevronLeft size={15} />
                </button>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold text-gray-800">{MONTHS_SHORT[vm]}</span>
                  <button type="button" onClick={() => setMode('years')}
                    className="text-sm font-bold text-amber-600 hover:text-amber-700 hover:underline transition-colors px-0.5">
                    {vy} ▾
                  </button>
                </div>
                <button type="button" onClick={next} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS_SHORT.map((d, i) => (
                  <div key={d} className={`text-center text-[10px] font-bold py-1 ${i === 0 || i === 6 ? 'text-red-400' : 'text-gray-400'}`}>{d}</div>
                ))}
              </div>

              {/* Cells */}
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: firstDow }, (_, i) => (
                  <div key={`p${i}`} className="text-center py-2 text-xs text-gray-200 font-medium">
                    {prevCount - firstDow + i + 1}
                  </div>
                ))}
                {Array.from({ length: daysCount }, (_, i) => {
                  const day = i + 1;
                  const iso = `${vy}-${String(vm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isSelected = iso === value;
                  const isToday = day === today.getDate() && vm === today.getMonth() && vy === today.getFullYear();
                  const dow = (firstDow + i) % 7;
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <button key={day} type="button" onClick={() => pick(day)}
                      className={`relative text-center py-2 text-xs rounded-xl font-semibold transition-all ${
                        isSelected
                          ? 'bg-gray-900 text-white shadow-sm'
                          : isToday
                          ? 'bg-amber-400 text-white font-bold'
                          : isWeekend
                          ? 'text-red-400 hover:bg-red-50'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}>
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
                <button type="button" onClick={() => { onChange(''); setOpen(false); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  Limpiar
                </button>
                <button type="button" onClick={setToday}
                  className="text-xs font-bold text-amber-600 hover:text-amber-700 transition-colors">
                  Hoy
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
