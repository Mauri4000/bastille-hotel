import { useState, useRef, useEffect } from 'react';

const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

interface Props {
  value: string;         // "HH:MM" or ""
  onChange: (v: string) => void;
  placeholder?: string;
  emoji?: string;
  accentClass?: string;
}

export default function TimePicker({
  value,
  onChange,
  placeholder = '-- : --',
  emoji = '🕐',
  accentClass = 'border-amber-400 ring-amber-100',
}: Props) {
  const [open, setOpen]     = useState(false);
  const [selH, setSelH]     = useState(value ? value.slice(0, 2) : '');
  const [selM, setSelM]     = useState(value ? value.slice(3, 5) : '');
  const ref                 = useRef<HTMLDivElement>(null);
  const hourRef             = useRef<HTMLDivElement>(null);

  // Sync internal state when value prop changes
  useEffect(() => {
    setSelH(value ? value.slice(0, 2) : '');
    setSelM(value ? value.slice(3, 5) : '');
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Auto-scroll selected hour into view
  useEffect(() => {
    if (open && selH && hourRef.current) {
      const btn = hourRef.current.querySelector(`[data-h="${selH}"]`) as HTMLElement | null;
      btn?.scrollIntoView({ block: 'center' });
    }
  }, [open, selH]);

  function pickHour(h: string) {
    setSelH(h);
    const m = selM || '00';
    setSelM(m);
    onChange(`${h}:${m}`);
  }

  function pickMinute(m: string) {
    const h = selH || '08';
    setSelH(h);
    setSelM(m);
    onChange(`${h}:${m}`);
    setOpen(false);
  }

  const display = selH && selM ? `${selH}:${selM}` : null;

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 border rounded-xl px-3 py-2.5 text-sm bg-white transition-all ${
          open ? `${accentClass} ring-2` : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <span className="text-base select-none">{emoji}</span>
        <span className={`flex-1 text-left ${display ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
          {display ?? placeholder}
        </span>
        {display && (
          <span
            className="text-gray-300 hover:text-gray-500 text-xs leading-none"
            onClick={e => { e.stopPropagation(); onChange(''); setSelH(''); setSelM(''); }}
          >✕</span>
        )}
      </button>

      {/* Popup */}
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 w-48 select-none">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center mb-2">Hora</p>

          <div className="flex gap-2">
            {/* Hours — scrollable */}
            <div ref={hourRef} className="flex-1 overflow-y-auto max-h-44 space-y-0.5 pr-0.5 scrollbar-thin">
              {HOURS.map(h => (
                <button
                  key={h}
                  data-h={h}
                  type="button"
                  onClick={() => pickHour(h)}
                  className={`w-full text-center py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    h === selH ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="w-px bg-gray-100" />

            {/* Minutes */}
            <div className="flex-1 space-y-0.5">
              {MINUTES.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMinute(m)}
                  className={`w-full text-center py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    m === selM ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  :{m}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
