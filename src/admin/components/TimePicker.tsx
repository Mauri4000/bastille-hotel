import { useState, useRef, useEffect } from 'react';

const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

interface Props {
  value: string;
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
  const [open,     setOpen]     = useState(false);
  const [selH,     setSelH]     = useState(value ? value.slice(0, 2) : '');
  const [selM,     setSelM]     = useState(value ? value.slice(3, 5) : '');
  const [rawInput, setRawInput] = useState(value || '');
  const ref     = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelH(value ? value.slice(0, 2) : '');
    setSelM(value ? value.slice(3, 5) : '');
    setRawInput(value || '');
  }, [value]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

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
    const v = `${h}:${m}`;
    setRawInput(v);
    onChange(v);
  }

  function pickMinute(m: string) {
    const h = selH || '00';
    setSelH(h);
    setSelM(m);
    const v = `${h}:${m}`;
    setRawInput(v);
    onChange(v);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    let v = e.target.value.replace(/[^0-9:]/g, '');
    // Auto-insert colon after 2 digits
    if (/^\d{3,}$/.test(v)) v = v.slice(0, 2) + ':' + v.slice(2, 4);
    if (v.length > 5) v = v.slice(0, 5);
    setRawInput(v);
    if (/^\d{2}:\d{2}$/.test(v)) {
      const h = v.slice(0, 2), m = v.slice(3, 5);
      if (+h <= 23 && +m <= 59) {
        setSelH(h); setSelM(m);
        onChange(v);
      }
    }
  }

  function handleInputBlur() {
    if (!/^\d{2}:\d{2}$/.test(rawInput)) setRawInput(value || '');
    setTimeout(() => setOpen(false), 150);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(''); setSelH(''); setSelM(''); setRawInput('');
  }

  return (
    <div className="relative" ref={ref}>
      <div className={`w-full flex items-center gap-2 border rounded-xl px-3 py-2 bg-white transition-all ${
        open ? `${accentClass} ring-2` : 'border-gray-200 hover:border-gray-300'
      }`}>
        <span className="text-base select-none flex-shrink-0">{emoji}</span>
        <input
          type="text"
          inputMode="numeric"
          className="flex-1 text-sm bg-transparent outline-none min-w-0 placeholder-gray-400 font-medium"
          placeholder={placeholder}
          value={rawInput}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onBlur={handleInputBlur}
        />
        {rawInput && (
          <button type="button" className="text-gray-300 hover:text-gray-500 text-xs leading-none flex-shrink-0" onClick={handleClear}>✕</button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 w-48 select-none">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center mb-2">Hora</p>
          <div className="flex gap-2">
            <div ref={hourRef} className="flex-1 overflow-y-auto max-h-44 space-y-0.5 pr-0.5">
              {HOURS.map(h => (
                <button key={h} data-h={h} type="button" onMouseDown={() => pickHour(h)}
                  className={`w-full text-center py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    h === selH ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}>{h}</button>
              ))}
            </div>
            <div className="w-px bg-gray-100" />
            <div className="flex-1 space-y-0.5">
              {MINUTES.map(m => (
                <button key={m} type="button" onMouseDown={() => pickMinute(m)}
                  className={`w-full text-center py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    m === selM ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}>:{m}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
