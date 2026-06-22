import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Users, PawPrint, Search, Minus, Plus, X } from "lucide-react";
import DateRangePicker from "./DateRangePicker";

export interface RoomOccupancy {
  adults: number;
  children: number;
}

export interface BookingFilters {
  checkIn: string;
  checkOut: string;
  rooms: RoomOccupancy[];
  hasPet: boolean;
}

interface Props {
  onChange: (filters: BookingFilters) => void;
}

export default function BookingSearch({ onChange }: Props) {
  const { t } = useTranslation();

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [rooms, setRooms] = useState<RoomOccupancy[]>([
    { adults: 2, children: 0 },
  ]);
  const [hasPet, setHasPet] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const guestsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (guestsRef.current && !guestsRef.current.contains(e.target as Node))
        setGuestsOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const totalGuests = rooms.reduce((s, r) => s + r.adults + r.children, 0);

  const updateRoom = (
    idx: number,
    field: "adults" | "children",
    val: number
  ) => {
    setRooms((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r))
    );
  };

  const addRoom = () =>
    setRooms((prev) => [...prev, { adults: 1, children: 0 }]);
  const removeRoom = (idx: number) =>
    setRooms((prev) => prev.filter((_, i) => i !== idx));

  const handleSearch = () => {
    onChange({ checkIn, checkOut, rooms, hasPet });
    document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth" });
  };

  const Counter = ({
    value,
    min,
    max,
    onInc,
    onDec,
  }: {
    value: number;
    min: number;
    max: number;
    onInc: () => void;
    onDec: () => void;
  }) => (
    <div className="flex items-center gap-2">
      <button
        onClick={onDec}
        disabled={value <= min}
        className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:border-amber-400 hover:text-amber-500 disabled:opacity-30 transition-colors"
      >
        <Minus size={12} />
      </button>
      <span className="w-4 text-center text-sm font-semibold text-gray-800">
        {value}
      </span>
      <button
        onClick={onInc}
        disabled={value >= max}
        className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:border-amber-400 hover:text-amber-500 disabled:opacity-30 transition-colors"
      >
        <Plus size={12} />
      </button>
    </div>
  );

  return (
    <div data-testid="booking-search" className="relative z-20 -mt-10 px-4 mb-0">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-2xl px-6 py-5 flex flex-wrap gap-4 items-end">

        {/* Date range picker */}
        <div className="flex-[2] min-w-[260px]">
          <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
            {t("search.dates")}
          </label>
          <DateRangePicker
            checkIn={checkIn}
            checkOut={checkOut}
            onChange={(ci, co) => {
              setCheckIn(ci);
              setCheckOut(co);
            }}
          />
        </div>

        {/* Guests popover */}
        <div className="flex-1 min-w-[180px] relative" ref={guestsRef}>
          <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1">
            {t("search.guests")}
          </label>
          <button
            data-testid="search-guests-btn"
            onClick={() => setGuestsOpen((o) => !o)}
            className="w-full flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 hover:border-amber-400 transition-colors"
          >
            <Users size={15} className="text-amber-400 shrink-0" />
            <span>
              {totalGuests} {t("search.guestsLabel")} · {rooms.length}{" "}
              {t("search.roomsLabel")}
            </span>
          </button>

          {guestsOpen && (
            <div
              data-testid="search-guests-popover"
              className="absolute top-full mt-2 left-0 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 z-50 w-72 max-h-96 overflow-y-auto"
            >
              {rooms.map((room, idx) => (
                <div
                  key={idx}
                  data-testid={`search-room-${idx}`}
                  className="mb-4 last:mb-0"
                >
                  {/* Room header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {t("search.room")} {idx + 1}
                    </span>
                    {rooms.length > 1 && (
                      <button
                        onClick={() => removeRoom(idx)}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Adults */}
                  <div className="flex items-center justify-between py-2 border-b border-gray-50">
                    <div>
                      <p className="text-sm text-gray-700">{t("search.adults")}</p>
                    </div>
                    <Counter
                      value={room.adults}
                      min={1}
                      max={10}
                      onInc={() => updateRoom(idx, "adults", room.adults + 1)}
                      onDec={() => updateRoom(idx, "adults", room.adults - 1)}
                    />
                  </div>

                  {/* Children */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm text-gray-700">{t("search.children")}</p>
                      <p className="text-xs text-gray-400">{t("search.childrenAge")}</p>
                    </div>
                    <Counter
                      value={room.children}
                      min={0}
                      max={5}
                      onInc={() => updateRoom(idx, "children", room.children + 1)}
                      onDec={() => updateRoom(idx, "children", room.children - 1)}
                    />
                  </div>

                  {idx < rooms.length - 1 && (
                    <div className="h-px bg-gray-100 mt-2" />
                  )}
                </div>
              ))}

              {/* Add room button */}
              {rooms.length < 10 && (
                <button
                  onClick={addRoom}
                  className="w-full mt-3 py-2 border border-dashed border-amber-400 text-amber-500 text-sm font-medium rounded-xl hover:bg-amber-50 transition-colors"
                >
                  + {t("search.addRoom")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pet toggle */}
        <div className="flex items-end">
          <button
            data-testid="search-pet-toggle"
            onClick={() => setHasPet((p) => !p)}
            className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-sm transition-colors ${
              hasPet
                ? "border-amber-400 bg-amber-50 text-amber-600 font-medium"
                : "border-gray-200 text-gray-500 hover:border-amber-400"
            }`}
          >
            <PawPrint size={15} />
            <span>{t("search.pet")}</span>
          </button>
        </div>

        {/* Search button */}
        <button
          data-testid="search-btn"
          onClick={handleSearch}
          className="bg-amber-400 hover:bg-amber-300 text-black font-semibold px-6 py-3 rounded-xl flex items-center gap-2 transition-colors"
        >
          <Search size={15} />
          <span>{t("search.cta")}</span>
        </button>
      </div>
    </div>
  );
}
