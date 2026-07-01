import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  accent?: 'amber' | 'green' | 'blue' | 'indigo';
  size?: 'sm' | 'md';
}

const ACCENT = {
  amber:  { ring: 'ring-amber-400 border-amber-400', active: 'bg-amber-50 text-amber-700', check: 'text-amber-600' },
  green:  { ring: 'ring-green-400 border-green-400', active: 'bg-green-50 text-green-700',  check: 'text-green-600' },
  blue:   { ring: 'ring-blue-400 border-blue-400',   active: 'bg-blue-50 text-blue-700',    check: 'text-blue-600'  },
  indigo: { ring: 'ring-indigo-400 border-indigo-400',active:'bg-indigo-50 text-indigo-700',check: 'text-indigo-600'},
};

export default function CustomSelect({
  value, onChange, options,
  placeholder = '— Seleccionar —',
  className = '',
  accent = 'amber',
  size = 'md',
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  const a = ACCENT[accent];

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const py = size === 'sm' ? 'py-1.5' : 'py-2';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 ${py} text-sm bg-white text-left transition-all focus:outline-none ${
          open ? `ring-2 ${a.ring}` : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={13}
          className={`text-gray-400 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-[70] left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-52 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 transition-colors"
            >
              {placeholder}
            </button>
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  opt.value === value ? `${a.active} font-medium` : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {opt.value === value
                  ? <Check size={12} className={`${a.check} shrink-0`} />
                  : <span className="w-3 shrink-0" />}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
