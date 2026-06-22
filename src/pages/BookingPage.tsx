import { useState, useRef, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, MapPin, Mail, MessageCircle, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { rooms as allRooms } from "../data/rooms";

const WA_NUMBER = "59178637098";
const EMAIL = "bastillehotelsucre@gmail.com";
const ADDRESS = "Aniceto Arce 247, Sucre, Bolivia";
const PET_FEE_USD = 3;

// ─── helpers ────────────────────────────────────────────────────────────────
function nightsBetween(a: string, b: string) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDay(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" });
}

const COUNTRIES = [
  { name: "Argentina",      iso: "ar" },
  { name: "Australia",      iso: "au" },
  { name: "Bolivia",        iso: "bo" },
  { name: "Brazil",         iso: "br" },
  { name: "Canada",         iso: "ca" },
  { name: "Chile",          iso: "cl" },
  { name: "Colombia",       iso: "co" },
  { name: "Ecuador",        iso: "ec" },
  { name: "France",         iso: "fr" },
  { name: "Germany",        iso: "de" },
  { name: "Italy",          iso: "it" },
  { name: "Mexico",         iso: "mx" },
  { name: "Netherlands",    iso: "nl" },
  { name: "Paraguay",       iso: "py" },
  { name: "Peru",           iso: "pe" },
  { name: "Portugal",       iso: "pt" },
  { name: "Spain",          iso: "es" },
  { name: "Switzerland",    iso: "ch" },
  { name: "United Kingdom", iso: "gb" },
  { name: "United States",  iso: "us" },
  { name: "Uruguay",        iso: "uy" },
  { name: "Venezuela",      iso: "ve" },
  { name: "Other",          iso: ""   },
];
const DOC_TYPES = ["Passport", "DNI", "CI", "Driver's License"];

// ─── form state ──────────────────────────────────────────────────────────────
interface FormState {
  firstName: string; lastName: string; nationality: string;
  docType: string; docNumber: string;
  country: string; phone: string; email: string;
  emailConfirm: string; notes: string;
}
const empty: FormState = {
  firstName: "", lastName: "", nationality: "", docType: "Passport",
  docNumber: "", country: "", phone: "", email: "", emailConfirm: "", notes: "",
};
type FormKey = keyof FormState;
const REQUIRED: FormKey[] = ["firstName","lastName","nationality","docNumber","country","phone","email","emailConfirm"];

// ─── phone countries ─────────────────────────────────────────────────────────
const PHONE_COUNTRIES = [
  { iso: "bo", name: "Bolivia",        code: "+591" },
  { iso: "ar", name: "Argentina",      code: "+54"  },
  { iso: "br", name: "Brazil",         code: "+55"  },
  { iso: "cl", name: "Chile",          code: "+56"  },
  { iso: "co", name: "Colombia",       code: "+57"  },
  { iso: "ec", name: "Ecuador",        code: "+593" },
  { iso: "pe", name: "Peru",           code: "+51"  },
  { iso: "py", name: "Paraguay",       code: "+595" },
  { iso: "uy", name: "Uruguay",        code: "+598" },
  { iso: "ve", name: "Venezuela",      code: "+58"  },
  { iso: "mx", name: "Mexico",         code: "+52"  },
  { iso: "us", name: "United States",  code: "+1"   },
  { iso: "ca", name: "Canada",         code: "+1"   },
  { iso: "gb", name: "United Kingdom", code: "+44"  },
  { iso: "de", name: "Germany",        code: "+49"  },
  { iso: "fr", name: "France",         code: "+33"  },
  { iso: "it", name: "Italy",          code: "+39"  },
  { iso: "es", name: "Spain",          code: "+34"  },
  { iso: "pt", name: "Portugal",       code: "+351" },
  { iso: "nl", name: "Netherlands",    code: "+31"  },
  { iso: "ch", name: "Switzerland",    code: "+41"  },
  { iso: "au", name: "Australia",      code: "+61"  },
  { iso: "jp", name: "Japan",          code: "+81"  },
  { iso: "cn", name: "China",          code: "+86"  },
  { iso: "in", name: "India",          code: "+91"  },
  { iso: "il", name: "Israel",         code: "+972" },
];

function FlagImg({ iso, size = 20 }: { iso: string; size?: number }) {
  return (
    <img
      src={`https://flagcdn.com/w${size}/${iso}.png`}
      srcSet={`https://flagcdn.com/w${size * 2}/${iso}.png 2x`}
      width={size}
      alt={iso}
      className="rounded-sm object-cover shrink-0"
      style={{ height: size * 0.75 }}
    />
  );
}

function CountrySelect({ value, onChange, placeholder, hasError, testId }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hasError?: boolean;
  testId?: string;
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef   = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const selected = COUNTRIES.find((c) => c.name === value);
  const filtered = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const border = hasError ? "border-red-400" : "border-gray-200";

  return (
    <div ref={wrapRef} className="relative w-full">
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 border ${border} rounded-xl bg-white hover:bg-gray-50 px-4 py-3 text-sm transition-colors outline-none text-left`}
      >
        {selected?.iso
          ? <FlagImg iso={selected.iso} size={20} />
          : <span className="w-5 h-4 bg-gray-200 rounded-sm shrink-0" />
        }
        <span className={`flex-1 ${value ? "text-gray-800" : "text-gray-400"}`}>
          {value || placeholder || "Select a country"}
        </span>
        <span className="text-gray-400 text-xs">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-full flex flex-col" style={{ maxHeight: "280px" }}>
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-amber-400"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { onChange(c.name); setOpen(false); setSearch(""); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50 text-sm text-left transition-colors ${
                  c.name === value ? "bg-amber-50" : ""
                }`}
              >
                {c.iso
                  ? <FlagImg iso={c.iso} size={20} />
                  : <span className="w-5 h-4 bg-gray-200 rounded-sm shrink-0" />
                }
                <span className="flex-1 text-gray-700">{c.name}</span>
                {c.name === value && <span className="text-amber-500 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhoneInput({ value, onChange, hasError, testId }: {
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
  testId?: string;
}) {
  const initCode = PHONE_COUNTRIES.find((c) => value.startsWith(c.code))?.code ?? "+591";
  const initNum  = value.startsWith(initCode) ? value.slice(initCode.length).trim() : value;

  const [dialCode, setDialCode] = useState(initCode);
  const [number,   setNumber]   = useState(initNum);
  const [open,     setOpen]     = useState(false);
  const [search,   setSearch]   = useState("");
  const wrapRef   = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const handleCode = (c: typeof PHONE_COUNTRIES[0]) => {
    setDialCode(c.code);
    setOpen(false);
    setSearch("");
    onChange(`${c.code} ${number}`.trim());
  };
  const handleNum = (n: string) => {
    setNumber(n);
    onChange(`${dialCode} ${n}`.trim());
  };

  const selected  = PHONE_COUNTRIES.find((c) => c.code === dialCode) ?? PHONE_COUNTRIES[0];
  const border    = hasError ? "border-red-400" : "border-gray-200";
  const filtered  = PHONE_COUNTRIES.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.code.includes(search)
  );

  return (
    <div ref={wrapRef} className="relative flex">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 border ${border} border-r-0 rounded-l-xl bg-gray-50 hover:bg-gray-100 px-3 py-3 text-sm font-medium transition-colors shrink-0 outline-none`}
      >
        <FlagImg iso={selected.iso} size={20} />
        <span className="text-gray-700">{selected.code}</span>
        <span className="text-gray-400 text-xs">{open ? "▴" : "▾"}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-64 flex flex-col" style={{ maxHeight: "280px" }}>
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country or code..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-amber-400"
            />
          </div>
          {/* List */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-gray-400 py-4">No results</p>
            ) : filtered.map((c, i) => (
              <button
                key={`${c.code}-${i}`}
                type="button"
                onClick={() => handleCode(c)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50 text-sm text-left transition-colors ${
                  c.iso === selected.iso ? "bg-amber-50" : ""
                }`}
              >
                <FlagImg iso={c.iso} size={20} />
                <span className="text-gray-700 flex-1 truncate">{c.name}</span>
                <span className="text-gray-400 text-xs shrink-0">{c.code}</span>
                {c.iso === selected.iso && <span className="text-amber-500 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Number input */}
      <input
        data-testid={testId}
        type="tel"
        value={number}
        onChange={(e) => handleNum(e.target.value)}
        placeholder="78682542"
        className={`flex-1 border ${border} border-l-0 rounded-r-xl px-4 py-3 text-sm outline-none focus:border-amber-400 bg-white min-w-0`}
      />
    </div>
  );
}

// ─── sub-components OUTSIDE main component (fixes focus-loss bug) ─────────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 bg-amber-400 text-black px-5 py-3 rounded-xl mb-5">
        {icon}
        <span className="font-semibold text-sm uppercase tracking-wide">{title}</span>
      </div>
      <div className="px-1">{children}</div>
    </div>
  );
}

function Field({ label, required, error, submitted, children }: {
  label: string; required?: boolean; error?: string; submitted?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && submitted && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

function TermsModal({ onClose, t }: { onClose: () => void; t: (k: string) => string }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-8 pt-7 pb-4 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">{t("booking.termsTitle")}</h3>
          <p className="text-xs text-gray-400 mt-1">Bastille Hotel · Mauricio Davalos · NIT 750303601 · Sucre, Bolivia</p>
        </div>

        <div className="overflow-y-auto px-8 py-5 text-sm text-gray-600 flex flex-col gap-5">

          <section>
            <h4 className="font-bold text-gray-800 mb-2">{t("booking.tms1t")}</h4>
            <p>{t("booking.tms1p")}</p>
            <ul className="mt-2 flex flex-col gap-1 list-disc list-inside">
              <li>{t("booking.tms1a")}</li>
              <li><strong>Check-in:</strong> {t("booking.tms1b")}</li>
              <li><strong>Check-out:</strong> {t("booking.tms1c")}</li>
              <li>{t("booking.tms1d")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-bold text-gray-800 mb-2">{t("booking.tms2t")}</h4>
            <ul className="flex flex-col gap-1 list-disc list-inside">
              <li>{t("booking.tms2a")}</li>
              <li>{t("booking.tms2b")}</li>
              <li>{t("booking.tms2c")}</li>
              <li>{t("booking.tms2d")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-bold text-gray-800 mb-2">{t("booking.tms3t")}</h4>
            <p>{t("booking.tms3p")}</p>
          </section>

          <section>
            <h4 className="font-bold text-gray-800 mb-2">{t("booking.tms4t")}</h4>
            <p className="font-medium text-gray-700 mb-1">{t("booking.tms4hotel")}</p>
            <ul className="flex flex-col gap-1 list-disc list-inside mb-3">
              <li>{t("booking.tms4h1")}</li>
              <li>{t("booking.tms4h2")}</li>
              <li>{t("booking.tms4h3")}</li>
            </ul>
            <p className="font-medium text-gray-700 mb-1">{t("booking.tms4guest")}</p>
            <ul className="flex flex-col gap-1 list-disc list-inside">
              <li>{t("booking.tms4g1")}</li>
              <li>{t("booking.tms4g2")}</li>
              <li>{t("booking.tms4g3")}</li>
              <li>{t("booking.tms4g4")}</li>
              <li>{t("booking.tms4g5")}</li>
              <li>{t("booking.tms4g6")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-bold text-gray-800 mb-2">{t("booking.tms5t")}</h4>
            <ul className="flex flex-col gap-2 list-disc list-inside">
              <li><strong>{t("booking.tms5pets_label")}</strong> {t("booking.tms5pets")}</li>
              <li><strong>{t("booking.tms5smoke_label")}</strong> {t("booking.tms5smoke")}</li>
              <li><strong>{t("booking.tms5terrace_label")}</strong> {t("booking.tms5terrace")}</li>
              <li><strong>{t("booking.tms5laundry_label")}</strong> {t("booking.tms5laundry")}</li>
              <li><strong>{t("booking.tms5visits_label")}</strong> {t("booking.tms5visits")}</li>
              <li><strong>{t("booking.tms5minors_label")}</strong> {t("booking.tms5minors")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-bold text-gray-800 mb-2">{t("booking.tms6t")}</h4>
            <ul className="flex flex-col gap-1 list-disc list-inside">
              <li><strong>{t("booking.tms6a_label")}</strong> {t("booking.tms6a")}</li>
              <li><strong>{t("booking.tms6b_label")}</strong> {t("booking.tms6b")}</li>
              <li>{t("booking.tms6c")}</li>
            </ul>
          </section>

          <section>
            <h4 className="font-bold text-gray-800 mb-2">{t("booking.tms7t")}</h4>
            <p>{t("booking.tms7p")}</p>
          </section>

          <section>
            <h4 className="font-bold text-gray-800 mb-2">{t("booking.tms8t")}</h4>
            <p>{t("booking.tms8p")}</p>
          </section>

          <section>
            <h4 className="font-bold text-gray-800 mb-2">{t("booking.tms9t")}</h4>
            <ul className="flex flex-col gap-1 list-disc list-inside">
              <li>{t("booking.tms9a")}</li>
              <li>{t("booking.tms9b")}</li>
              <li>{t("booking.tms9c")}</li>
              <li>{t("booking.tms9d")}</li>
            </ul>
          </section>

        </div>

        <div className="px-8 py-4 border-t border-gray-100">
          <button onClick={onClose} className="w-full bg-amber-400 hover:bg-amber-300 text-black font-bold py-3 rounded-xl transition-colors">
            {t("booking.termsClose")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function BookingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const roomId   = params.get("room") ?? "";
  const checkIn  = params.get("checkIn") ?? "";
  const checkOut = params.get("checkOut") ?? "";
  const adults   = Number(params.get("adults") ?? 1);
  const children = Number(params.get("children") ?? 0);
  const hasPet   = params.get("pet") === "true";

  const room   = allRooms.find((r) => r.id === roomId);
  const nights = nightsBetween(checkIn, checkOut);
  const total  = room ? room.priceUSD * Math.max(nights, 1) : 0;

  const [form, setForm]               = useState<FormState>(empty);
  const [errors, setErrors]           = useState<Partial<Record<FormKey, string>>>({});
  const [submitted, setSubmitted]     = useState(false);
  const [termsAccepted, setTerms]     = useState(false);
  const [termsError, setTermsError]   = useState(false);
  const [showTerms, setShowTerms]     = useState(false);
  const [sendMethod, setSendMethod]   = useState<"whatsapp" | "email">("whatsapp");
  const [success, setSuccess]         = useState(false);
  const [sentMsg, setSentMsg]         = useState("");
  const [copied, setCopied]           = useState(false);
  const [imgIdx, setImgIdx]           = useState(0);

  const gallery = room?.gallery ?? [];
  const prevImg = () => setImgIdx((i) => (i === 0 ? gallery.length - 1 : i - 1));
  const nextImg = () => setImgIdx((i) => (i === gallery.length - 1 ? 0 : i + 1));

  const set = (k: FormKey, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const inp = (k: FormKey) =>
    `w-full border rounded-xl px-4 py-3 text-sm outline-none transition-colors ${
      errors[k] && submitted ? "border-red-400 focus:border-red-400" : "border-gray-200 focus:border-amber-400"
    }`;

  const validate = () => {
    const errs: Partial<Record<FormKey, string>> = {};
    REQUIRED.forEach((k) => { if (!form[k].trim()) errs[k] = t("booking.required"); });
    if (form.email && form.emailConfirm && form.email !== form.emailConfirm)
      errs.emailConfirm = t("booking.emailMismatch");
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildMessage = (roomName: string, petFeeTotal: number, grandTotal: number) => {
    const petLine = hasPet && petFeeTotal > 0 ? ` | Pet: +$${petFeeTotal} USD` : "";
    const childLine = children > 0 ? ` + ${children} children` : "";
    return [
      `*BASTILLE HOTEL — Booking Request*`,
      ``,
      `*Guest:* ${form.firstName} ${form.lastName}`,
      `*Nationality:* ${form.nationality} | *Doc:* ${form.docType} ${form.docNumber}`,
      `*Country:* ${form.country}`,
      `*Phone:* ${form.phone}`,
      `*Email:* ${form.email}`,
      ``,
      `*Check-in:* ${fmtDay(checkIn)}`,
      `*Check-out:* ${fmtDay(checkOut)}`,
      `*Nights:* ${nights}`,
      `*Room:* ${roomName}`,
      `*Guests:* ${adults} adults${childLine}${petLine}`,
      ``,
      `*TOTAL: $${grandTotal} USD*`,
      ``,
      `*Notes:* ${form.notes || "—"}`,
      ``,
      `Guest accepted terms and conditions.`,
    ].join("\n");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const valid = validate();
    if (!termsAccepted) setTermsError(true);
    if (!valid || !termsAccepted) return;
    if (!room) return;

    const roomName     = t(room.nameKey);
    const petFeeTotal  = hasPet && nights > 0 ? PET_FEE_USD * nights : 0;
    const grandTotal   = total + petFeeTotal;
    const msg          = buildMessage(roomName, petFeeTotal, grandTotal);

    if (sendMethod === "whatsapp") {
      window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank");
    }
    // For email: we show the message on the success screen so the user can copy it
    setSentMsg(msg);
    setSuccess(true);
  };

  // ── success screen ────────────────────────────────────────────────────────
  if (success) {
    const handleCopy = () => {
      navigator.clipboard.writeText(sentMsg).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    };

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-10">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">✅</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t("booking.successTitle")}</h2>
          <p className="text-gray-500 mb-1">
            {t("booking.successMsg1")}{" "}
            <span className="font-semibold text-gray-700">{room ? t(room.nameKey) : ""}</span>.
          </p>
          <p className="text-gray-500 mb-6">{t("booking.successMsg2")}</p>

          {sendMethod === "whatsapp" ? (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-6">
              📱 {t("booking.successFallbackWa")}{" "}
              <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer"
                className="font-bold underline">+591 78637098</a>
            </div>
          ) : (
            <div className="text-left mb-6">
              <p className="text-sm text-gray-600 mb-2 font-medium">
                📧 {t("booking.emailCopyInstructions")}{" "}
                <a href={`mailto:${EMAIL}`} className="text-amber-500 underline font-bold">{EMAIL}</a>
              </p>
              <div className="relative">
                <textarea
                  readOnly
                  value={sentMsg}
                  rows={12}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-600 font-mono resize-none bg-gray-50 outline-none"
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
                <button
                  onClick={handleCopy}
                  className={`absolute top-2 right-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                    copied ? "bg-green-500 text-white" : "bg-amber-400 hover:bg-amber-300 text-black"
                  }`}
                >
                  {copied ? "✓ Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => navigate("/")}
            className="w-full bg-amber-400 hover:bg-amber-300 text-black font-bold py-3 rounded-xl transition-colors"
          >
            {t("booking.backHome")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="booking-page" className="min-h-screen bg-gray-50">
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} t={t} />}

      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <button data-testid="booking-page-back" onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors text-sm">
          <ArrowLeft size={18} />
          {t("booking.back")}
        </button>
        <h1 className="text-lg font-bold text-gray-900 mx-auto">{t("booking.pageTitle")}</h1>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-7 gap-10">

        {/* ── LEFT: form ── */}
        <form data-testid="booking-form" onSubmit={handleSubmit} className="lg:col-span-4 flex flex-col gap-0">

          {/* Guest details */}
          <Section icon={<Users size={16} />} title={t("booking.sectionHolder")}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Field label={t("booking.firstName")} required error={errors.firstName} submitted={submitted}>
                <input data-testid="booking-input-firstname" type="text" value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  placeholder="Ej: Juan" className={inp("firstName")} />
              </Field>
              <Field label={t("booking.lastName")} required error={errors.lastName} submitted={submitted}>
                <input data-testid="booking-input-lastname" type="text" value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  placeholder="Ej: Perez" className={inp("lastName")} />
              </Field>
            </div>
            <div className="mb-4">
              <Field label={t("booking.nationality")} required error={errors.nationality} submitted={submitted}>
                <CountrySelect
                  value={form.nationality}
                  onChange={(v) => set("nationality", v)}
                  placeholder={t("booking.selectCountry")}
                  hasError={!!errors.nationality && submitted}
                  testId="booking-select-nationality"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Field label={t("booking.docType")} submitted={submitted}>
                <select data-testid="booking-select-doctype" value={form.docType}
                  onChange={(e) => set("docType", e.target.value)} className={inp("docType")}>
                  {DOC_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label={t("booking.docNumber")} required error={errors.docNumber} submitted={submitted}>
                <input data-testid="booking-input-docnumber" type="text" value={form.docNumber}
                  onChange={(e) => set("docNumber", e.target.value)}
                  placeholder="Ej: A1234567" className={inp("docNumber")} />
              </Field>
            </div>
            <Field label={t("booking.country")} required error={errors.country} submitted={submitted}>
              <CountrySelect
                value={form.country}
                onChange={(v) => set("country", v)}
                placeholder={t("booking.selectCountry")}
                hasError={!!errors.country && submitted}
                testId="booking-select-country"
              />
            </Field>
          </Section>

          {/* Contact details */}
          <Section icon={<MessageCircle size={16} />} title={t("booking.sectionContact")}>
            <div className="mb-4">
              <Field label={t("booking.phone")} required error={errors.phone} submitted={submitted}>
                <PhoneInput
                  value={form.phone}
                  onChange={(v) => set("phone", v)}
                  hasError={!!errors.phone && submitted}
                  testId="booking-input-phone"
                />
              </Field>
            </div>
            <div className="mb-4">
              <Field label={`${t("booking.email")} — ${t("booking.emailNote")}`} required error={errors.email} submitted={submitted}>
                <input data-testid="booking-input-email" type="email" value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="ejemplo@gmail.com" className={inp("email")} />
              </Field>
            </div>
            <div className="mb-4">
              <Field label={t("booking.emailConfirm")} required error={errors.emailConfirm} submitted={submitted}>
                <input data-testid="booking-input-email-confirm" type="email" value={form.emailConfirm}
                  onChange={(e) => set("emailConfirm", e.target.value)}
                  placeholder="ejemplo@gmail.com" className={inp("emailConfirm")} />
              </Field>
            </div>
            <Field label={`${t("booking.notes")} (${t("booking.optional")})`} submitted={submitted}>
              <textarea data-testid="booking-input-notes" value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder={t("booking.notesPlaceholder")}
                rows={3} className={inp("notes") + " resize-none"} />
            </Field>
          </Section>

          {/* Send method */}
          <div className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">{t("booking.sendMethodLabel")}</p>
            <div className="flex flex-col gap-2">
              {(["whatsapp", "email"] as const).map((method) => (
                <label key={method}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    sendMethod === method ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"
                  }`}>
                  <input
                    data-testid={`booking-send-${method}`}
                    type="radio"
                    name="sendMethod"
                    value={method}
                    checked={sendMethod === method}
                    onChange={() => setSendMethod(method)}
                    className="accent-amber-400"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {method === "whatsapp" ? "📱 WhatsApp" : `📧 ${t("booking.sendEmail")}`}
                  </span>
                  {method === "whatsapp" && (
                    <span className="ml-auto text-xs text-green-600 font-medium">{t("booking.sendWaNote")}</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Terms */}
          <div className="mb-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                data-testid="booking-terms-checkbox"
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => { setTerms(e.target.checked); setTermsError(false); }}
                className="mt-0.5 w-4 h-4 accent-amber-400 shrink-0"
              />
              <span className="text-sm text-gray-600">
                {t("booking.termsText")}{" "}
                <button type="button" onClick={() => setShowTerms(true)}
                  className="text-amber-500 underline font-medium hover:text-amber-600">
                  {t("booking.termsLink")}
                </button>
              </span>
            </label>
            {termsError && (
              <p className="text-red-500 text-xs mt-1 ml-7">{t("booking.termsError")}</p>
            )}
          </div>

          {submitted && Object.keys(errors).length > 0 && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
              ⚠️ {t("booking.formError")}
            </div>
          )}

          <button data-testid="booking-btn-submit" type="submit"
            className="w-full bg-amber-400 hover:bg-amber-300 text-black font-bold py-4 rounded-2xl text-base transition-colors flex items-center justify-center gap-2">
            {t("booking.sendBtn")} →
          </button>

          <p className="text-center text-xs text-gray-400 mt-3">
            📩 {t("booking.sendNote")}
          </p>
        </form>

        {/* ── RIGHT: summary panel ── */}
        <div className="lg:col-span-3">
          <div data-testid="booking-summary" className="bg-white rounded-2xl shadow-lg overflow-hidden sticky top-6">

            {/* Carousel */}
            {room && gallery.length > 0 && (
              <div data-testid="booking-summary-img" className="relative w-full h-64 overflow-hidden bg-gray-100">
                <img src={gallery[imgIdx]} alt={`${t(room.nameKey)} ${imgIdx + 1}`}
                  className="w-full h-full object-cover transition-opacity duration-300" />
                {gallery.length > 1 && (
                  <>
                    <button data-testid="booking-carousel-prev" onClick={prevImg}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors">
                      <ChevronLeft size={18} />
                    </button>
                    <button data-testid="booking-carousel-next" onClick={nextImg}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors">
                      <ChevronRight size={18} />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {gallery.map((_, i) => (
                        <button key={i} data-testid={`booking-carousel-dot-${i}`} onClick={() => setImgIdx(i)}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${i === imgIdx ? "bg-white" : "bg-white/40"}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="p-6">
              {/* Hotel info */}
              <h2 className="text-lg font-bold text-gray-900 mb-3">Bastille Hotel</h2>
              <div className="flex flex-col gap-3 mb-5 pb-5 border-b border-gray-100">
                <div className="flex flex-col gap-2 text-sm text-gray-500">
                  <span className="flex items-center gap-2">
                    <MapPin size={14} className="text-amber-400 shrink-0" />{ADDRESS}
                  </span>
                  <a href={`mailto:${EMAIL}`} className="flex items-center gap-2 hover:text-amber-500">
                    <Mail size={14} className="text-amber-400 shrink-0" />{EMAIL}
                  </a>
                  <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-green-500">
                    <MessageCircle size={14} className="text-green-500 shrink-0" />+591 78637098
                  </a>
                </div>
                <a href="https://www.google.com/maps/search/Bastille+Hotel+Sucre+Bolivia"
                  target="_blank" rel="noopener noreferrer" data-testid="booking-mini-map"
                  className="rounded-xl overflow-hidden border border-gray-200 hover:border-amber-400 transition-colors block"
                  title="Open in Google Maps">
                  <iframe src="https://maps.google.com/maps?q=Bastille+Hotel+Sucre+Bolivia&output=embed&z=17"
                    width="100%" height="160"
                    style={{ border: 0, pointerEvents: "none", display: "block" }}
                    loading="lazy" title="Bastille Hotel location" />
                </a>
              </div>

              {/* Booking summary */}
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-4">{t("booking.summary")}</p>

              <div className="flex items-center gap-2 mb-5">
                <div className="text-center flex-1">
                  <p className="text-xs text-gray-400 uppercase">Check-in</p>
                  <p className="text-2xl font-bold text-gray-900 leading-tight">{checkIn ? checkIn.split("-")[2] : "—"}</p>
                  <p className="text-xs text-gray-500">{checkIn ? fmtDate(checkIn).split(" ").slice(1).join(" ") : ""}</p>
                </div>
                <div className="bg-gray-900 text-white text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap">
                  {nights} {nights === 1 ? t("booking.night") : t("booking.nights")}
                </div>
                <div className="text-center flex-1">
                  <p className="text-xs text-gray-400 uppercase">Check-out</p>
                  <p className="text-2xl font-bold text-gray-900 leading-tight">{checkOut ? checkOut.split("-")[2] : "—"}</p>
                  <p className="text-xs text-gray-500">{checkOut ? fmtDate(checkOut).split(" ").slice(1).join(" ") : ""}</p>
                </div>
              </div>

              {room && (
                <div className="flex items-center justify-between py-3 border-t border-gray-100">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t(room.nameKey)}</p>
                    <p className="text-xs text-gray-400">
                      {adults} {t("search.adults")}{children > 0 ? ` · ${children} ${t("search.children")}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">
                    ${room.priceUSD} <span className="text-gray-400 font-normal text-xs">/night</span>
                  </p>
                </div>
              )}

              {hasPet && nights > 0 && (
                <div className="flex items-center justify-between py-2 border-t border-gray-100">
                  <p className="text-sm text-gray-600">🐾 {t("booking.petFee")}</p>
                  <p className="text-sm text-gray-700">${PET_FEE_USD * nights} USD</p>
                </div>
              )}

              <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{t("booking.subtotal")}</span><span>${total} USD</span>
                </div>
                {hasPet && nights > 0 && (
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>{t("booking.petFee")}</span><span>${PET_FEE_USD * nights} USD</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-100">
                  <span>{t("booking.total")}</span>
                  <span>${total + (hasPet && nights > 0 ? PET_FEE_USD * nights : 0)} USD</span>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">{t("booking.policies")}</p>
                <ul className="flex flex-col gap-2 text-xs text-gray-500">
                  <li className="flex items-start gap-2"><span>🌙</span><span>{t("booking.policyEarlyCheckin")}</span></li>
                  <li className="flex items-start gap-2"><span>🕐</span><span>{t("booking.policyCheckin")}</span></li>
                  <li className="flex items-start gap-2"><span>⏰</span><span>{t("booking.policyLateCheckout")}</span></li>
                  <li className="flex items-start gap-2"><span>🚬</span><span>{t("booking.policySmoking")}</span></li>
                  <li className="flex items-start gap-2"><span>🌿</span><span>{t("booking.policyTerrace")}</span></li>
                  <li className="flex items-start gap-2"><span>👕</span><span>{t("booking.policyLaundry")}</span></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
