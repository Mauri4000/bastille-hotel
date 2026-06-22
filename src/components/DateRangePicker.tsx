import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

interface Props {
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function toStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function formatShort(dateStr: string) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

function addMonths(year: number, month: number, delta: number) {
  const d = new Date(year, month + delta);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export default function DateRangePicker({ checkIn, checkOut, onChange }: Props) {
  const today = todayStr();
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [step, setStep] = useState<"in" | "out">("in");
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const prev = () => {
    const m = addMonths(viewYear, viewMonth, -1);
    setViewYear(m.year);
    setViewMonth(m.month);
  };
  const next = () => {
    const m = addMonths(viewYear, viewMonth, 1);
    setViewYear(m.year);
    setViewMonth(m.month);
  };

  const handleDay = (dateStr: string) => {
    if (dateStr < today) return;
    if (step === "in") {
      onChange(dateStr, "");
      setStep("out");
    } else {
      if (dateStr <= checkIn) {
        onChange(dateStr, "");
        setStep("out");
      } else {
        onChange(checkIn, dateStr);
        setStep("in");
        setOpen(false);
      }
    }
  };

  const rangeEnd = checkOut || hovered || "";

  const isStart = (d: string) => d === checkIn;
  const isEnd = (d: string) => d === checkOut;
  const inRange = (d: string) =>
    checkIn && rangeEnd && d > checkIn && d < rangeEnd;

  const renderMonth = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let i = 1; i <= days; i++) cells.push(i);

    return (
      <div className="w-64">
        <p className="text-center text-sm font-semibold text-gray-800 mb-3">
          {MONTHS[month]} {year}
        </p>
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-xs text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />;
            const ds = toStr(year, month, day);
            const past = ds < today;
            const isToday = ds === today;
            const start = isStart(ds);
            const end = isEnd(ds);
            const range = inRange(ds);

            let cls =
              "h-9 w-full text-sm flex items-center justify-center transition-all relative ";
            if (past) {
              cls += "text-gray-300 cursor-not-allowed ";
            } else if (start || end) {
              cls += "bg-amber-400 text-black font-bold rounded-full cursor-pointer z-10 ";
            } else if (range) {
              cls += "bg-amber-100 text-gray-800 cursor-pointer ";
            } else if (isToday) {
              cls += "text-amber-500 font-bold cursor-pointer hover:bg-amber-50 hover:rounded-full ";
            } else {
              cls += "text-gray-700 cursor-pointer hover:bg-amber-50 hover:rounded-full ";
            }

            return (
              <button
                key={ds}
                disabled={past}
                onClick={() => handleDay(ds)}
                onMouseEnter={() => !past && setHovered(ds)}
                onMouseLeave={() => setHovered(null)}
                className={cls}
              >
                {day}
                {isToday && !start && !end && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-amber-400 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const m2 = addMonths(viewYear, viewMonth, 1);

  return (
    <div className="relative" ref={ref}>
      {/* Trigger pill */}
      <button
        data-testid="datepicker-trigger"
        onClick={() => {
          setOpen((o) => !o);
          setStep("in");
        }}
        className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 hover:border-amber-400 transition-colors bg-white w-full"
      >
        <CalendarDays size={16} className="text-amber-400 shrink-0" />
        <div className="flex items-center gap-3 text-sm">
          <div className="text-left">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-tight">
              Check-in
            </p>
            <p className="font-semibold text-gray-800">{formatShort(checkIn)}</p>
          </div>
          <span className="text-gray-300 text-base">→</span>
          <div className="text-left">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-tight">
              Check-out
            </p>
            <p className="font-semibold text-gray-800">{formatShort(checkOut)}</p>
          </div>
        </div>
      </button>

      {/* Popup */}
      {open && (
        <div
          data-testid="datepicker-popup"
          className="absolute top-full mt-3 left-0 bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 z-50 flex gap-8"
        >
          {/* Prev arrow */}
          <button
            onClick={prev}
            className="absolute left-4 top-6 p-1 hover:text-amber-400 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>

          {renderMonth(viewYear, viewMonth)}

          {/* Divider */}
          <div className="w-px bg-gray-100" />

          {renderMonth(m2.year, m2.month)}

          {/* Next arrow */}
          <button
            onClick={next}
            className="absolute right-4 top-6 p-1 hover:text-amber-400 transition-colors"
          >
            <ChevronRight size={18} />
          </button>

          {/* Hint */}
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-gray-400">
            {step === "in" ? "Select check-in date" : "Select check-out date"}
          </p>
        </div>
      )}
    </div>
  );
}
