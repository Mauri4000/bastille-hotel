import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Check, BookOpen,
  ChevronLeft, ChevronRight, ShoppingBasket, MapPin,
  Music, Dumbbell, UtensilsCrossed, Sun, Moon,
} from "lucide-react";
import Navbar from "../components/Navbar";
import heroImg from "../assets/hero.jpeg";
import { supabase } from "../lib/supabase";

// ─── WhatsApp number ─────────────────────────────────────────────
// Replace with the hotel's WhatsApp number (Bolivia: 591XXXXXXXX)
const WA_NUMBER = "591XXXXXXXXX";

// ─── Data ────────────────────────────────────────────────────────
const teachers = [
  {
    id: "julian", name: "Julián Fernández",
    photos: [{ src: "/teachers/julian.jpg", pos: "50% 65%" }],
    tags: ["English", "German", "Systems Engineering"],
    bio: "My name is Julián Fernández, I study Systems Engineering and Languages — English and German. I love travelling, sports (basketball and football) and cooking in my free time.",
    accent: "from-amber-500 to-orange-600",
    tagColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  {
    id: "zalam", name: "Zalam",
    photos: [
      { src: "/teachers/zalam.jpg",     pos: "50% 60%" },
      { src: "/teachers/zalam-art.jpg", pos: "50% 50%" },
    ],
    tags: ["Psychology", "Performing Arts", "Visual Arts"],
    bio: "Hi! I'm Zalam — psychologist and performing/visual artist. I love learning new things and find inspiration in books and films. Outside class you'll find me at the gym, playing horror video games, dancing or hunting for a good story. I like classes to be a comfortable space where we learn with confidence, have conversations and discover common interests.",
    accent: "from-violet-500 to-purple-700",
    tagColor: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  },
  {
    id: "darleth", name: "Darleth",
    photos: [
      { src: "/teachers/darleth.jpg",       pos: "50% 25%" },
      { src: "/teachers/darleth-dance.jpg", pos: "50% 30%" },
    ],
    tags: ["Folkloric Dance", "Culture & History", "Photography"],
    bio: "Hi! I'm Darleth — a young woman deeply in love with Sucre. I'm passionate about local culture, history and Bolivian traditions, as well as adventure, photography and new experiences. I'm in the final stage of my teacher training and have experience teaching folkloric dance. I'm patient, curious and love building a space where conversation flows naturally. For me, language is the gateway to exchanging cultures — tell me about yours!",
    accent: "from-teal-400 to-emerald-600",
    tagColor: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  },
];

const levels = [
  { id: "basico",     label: "Basic",        range: "A1 – A2", desc: "Little or no Spanish experience" },
  { id: "intermedio", label: "Intermediate", range: "B1 – B2", desc: "Can hold simple conversations" },
  { id: "avanzado",   label: "Advanced",     range: "C1 – C2", desc: "Fluent and looking to refine" },
];

const classTypes = [
  { id: "mercado",  Icon: ShoppingBasket,  label: "Market classes",        desc: "Learn at Sucre's local market — prices, colours, produce, real conversations." },
  { id: "tours",    Icon: MapPin,          label: "Cultural tours",         desc: "Walk the city learning history, architecture and Bolivian culture along the way." },
  { id: "baile",    Icon: Music,           label: "Dance classes",          desc: "Rhythm, music and vocabulary — Spanish through dance and performing arts." },
  { id: "teorica",  Icon: BookOpen,        label: "Theoretical classes",    desc: "Grammar, structure and written Spanish. A solid foundation for the language." },
  { id: "deportes", Icon: Dumbbell,        label: "Sports & activities",    desc: "Vocabulary in action: physical activities and games where language flows naturally." },
  { id: "cocina",   Icon: UtensilsCrossed, label: "Kitchen classes",        desc: "Cook Bolivian dishes and learn through recipes, ingredients and techniques." },
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

// ─── Mini calendar ────────────────────────────────────────────────
function DatePicker({ selected, onChange }: { selected: string[]; onChange: (d: string[]) => void }) {
  const today = new Date();
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year  = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today.toISOString().slice(0, 10);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function toggle(day: number) {
    const str = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const past = new Date(str) < new Date(todayStr);
    if (past) return;
    onChange(selected.includes(str) ? selected.filter(s => s !== str) : [...selected, str]);
  }

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setView(new Date(year, month - 1, 1))} className="text-white/40 hover:text-white p-1">
          <ChevronLeft size={16} />
        </button>
        <span className="text-white text-sm font-semibold">{MONTHS[month]} {year}</span>
        <button onClick={() => setView(new Date(year, month + 1, 1))} className="text-white/40 hover:text-white p-1">
          <ChevronRight size={16} />
        </button>
      </div>
      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => <div key={d} className="text-center text-[10px] text-white/30 font-semibold py-1">{d}</div>)}
      </div>
      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const str = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isPast   = str < todayStr;
          const isToday  = str === todayStr;
          const isSel    = selected.includes(str);
          return (
            <button
              key={str}
              disabled={isPast}
              onClick={() => toggle(day)}
              className={`h-8 w-full rounded-lg text-xs font-medium transition-all
                ${isPast  ? "text-white/15 cursor-not-allowed" : ""}
                ${isToday && !isSel ? "border border-amber-400/60 text-amber-400" : ""}
                ${isSel   ? "bg-amber-400 text-stone-900 font-bold" : !isPast ? "hover:bg-white/10 text-white/80" : ""}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex flex-wrap gap-1">
            {[...selected].sort().map(s => (
              <span key={s} className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">
                {new Date(s + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                <button onClick={() => onChange(selected.filter(x => x !== s))} className="ml-1 opacity-60 hover:opacity-100">×</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────
export default function SpanishSchoolPage() {
  const navigate = useNavigate();

  const [photoIndex,       setPhotoIndex]       = useState<Record<string, number>>({});
  const [selectedTeacher,  setSelectedTeacher]  = useState<string | null>(null);
  const [selectedLevel,    setSelectedLevel]    = useState<string | null>(null);
  const [selectedType,     setSelectedType]     = useState<string | null>(null);
  const [selectedDates,    setSelectedDates]    = useState<string[]>([]);
  const [selectedSlot,     setSelectedSlot]     = useState<"morning" | "afternoon" | null>(null);
  const [form, setForm] = useState({ name: "", nationality: "", passport: "", email: "", whatsapp: "", message: "", num_students: "1" });
  const [loading,   setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const teacher = teachers.find(t => t.id === selectedTeacher);

  const canBook = selectedTeacher && selectedLevel && selectedType && selectedDates.length > 0 && selectedSlot
    && form.name.trim() && form.nationality.trim() && form.passport.trim();

  function buildWhatsAppText() {
    const t  = teacher?.name ?? "";
    const lv = levels.find(l => l.id === selectedLevel);
    const ct = classTypes.find(c => c.id === selectedType);
    const slot = selectedSlot === "morning" ? "Morning (9:00 – 13:00)" : "Afternoon (15:00 – 19:00)";
    const dates = [...selectedDates].sort()
      .map(s => new Date(s + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }))
      .join(", ");
    return encodeURIComponent(
`🇧🇴 *NEW SPANISH CLASS BOOKING*

👤 Name: ${form.name}
🌍 Nationality: ${form.nationality}
📄 Passport / ID: ${form.passport}
👥 Students: ${form.num_students}
📧 Email: ${form.email || "—"}
📱 WhatsApp: ${form.whatsapp || "—"}

👨‍🏫 Teacher: ${t}
🎓 Level: ${lv?.label} (${lv?.range})
📚 Type: ${ct?.label}
📅 Dates: ${dates}
⏰ Schedule: ${slot}
${form.message ? `\n💬 Message: ${form.message}` : ""}
`);
  }

  async function handleBook() {
    if (!canBook) return;
    setLoading(true);
    try {
      await supabase.from("spanish_school_inquiries").insert({
        teacher: selectedTeacher, level: selectedLevel, class_type: selectedType,
        dates: selectedDates, time_slot: selectedSlot,
        name: form.name, nationality: form.nationality, passport: form.passport,
        num_students: parseInt(form.num_students) || 1,
        email: form.email || null, whatsapp: form.whatsapp || null, message: form.message || null,
      });
    } catch { /* non-blocking */ }
    setLoading(false);
    setSubmitted(true);
    window.open(`https://wa.me/${WA_NUMBER}?text=${buildWhatsAppText()}`, "_blank");
  }

  function reset() {
    setSubmitted(false); setSelectedTeacher(null); setSelectedLevel(null);
    setSelectedType(null); setSelectedDates([]); setSelectedSlot(null);
    setForm({ name: "", nationality: "", passport: "", email: "", whatsapp: "", message: "", num_students: "1" });
  }

  return (
    <div className="min-h-screen bg-stone-950">
      <Navbar />

      {/* Hero */}
      <section className="relative h-[55vh] flex items-end pb-14 px-8 overflow-hidden">
        <img src={heroImg} alt="Spanish School" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-black/50 to-black/20" />
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="relative z-10">
          <p className="text-amber-400 text-sm uppercase tracking-widest mb-2">Bastille Hotel · Sucre, Bolivia</p>
          <h1 className="text-4xl md:text-6xl font-bold text-white tracking-wide">Spanish School</h1>
          <p className="text-white/60 mt-3 text-lg max-w-xl">
            Spanish classes that adapt to your travel style — in the market, the kitchen, the streets of Sucre.
          </p>
        </motion.div>
      </section>

      <div className="px-6 max-w-5xl mx-auto pb-32">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-white/40 hover:text-amber-400 text-sm transition-colors mt-8 mb-12">
          <ArrowLeft size={16} /> Back
        </button>

        {/* ── Teachers ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="text-white text-2xl font-bold mb-2">Meet your teachers</h2>
          <p className="text-white/50 mb-8 text-sm">Choose the one that feels right for you</p>

          <div className="grid md:grid-cols-2 gap-6">
            {teachers.map((t, i) => {
              const isSelected = selectedTeacher === t.id;
              const idx = photoIndex[t.id] ?? 0;
              const photo = t.photos[idx];
              const hasMultiple = t.photos.length > 1;
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i + 0.3 }}
                  className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-300 cursor-pointer group
                    ${isSelected ? "border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.15)]" : "border-white/10 hover:border-white/30"}`}
                  onClick={() => { setSelectedTeacher(t.id); setSelectedLevel(null); setSelectedType(null); setSelectedDates([]); setSelectedSlot(null); setSubmitted(false); }}
                >
                  {/* Photo carousel */}
                  <div className="relative h-80 overflow-hidden" onClick={e => e.stopPropagation()}>
                    <AnimatePresence mode="wait">
                      <motion.img
                        key={photo.src}
                        src={photo.src} alt={t.name}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="w-full h-full object-cover"
                        style={{ objectPosition: photo.pos }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </AnimatePresence>
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/10 to-transparent pointer-events-none" />
                    {hasMultiple && (
                      <>
                        <button onClick={() => setPhotoIndex(p => ({ ...p, [t.id]: (idx - 1 + t.photos.length) % t.photos.length }))}
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white">
                          <ChevronLeft size={16} />
                        </button>
                        <button onClick={() => setPhotoIndex(p => ({ ...p, [t.id]: (idx + 1) % t.photos.length }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white">
                          <ChevronRight size={16} />
                        </button>
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {t.photos.map((_, pi) => (
                            <button key={pi} onClick={() => setPhotoIndex(p => ({ ...p, [t.id]: pi }))}
                              className={`h-1.5 rounded-full transition-all ${pi === idx ? "bg-white w-4" : "bg-white/40 w-1.5"}`} />
                          ))}
                        </div>
                      </>
                    )}
                    {isSelected && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                        className="absolute top-4 right-4 w-9 h-9 bg-amber-400 rounded-full flex items-center justify-center shadow-lg pointer-events-none">
                        <Check size={18} className="text-stone-900" strokeWidth={3} />
                      </motion.div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="bg-stone-900 px-6 py-5">
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {t.tags.map(tag => (
                        <span key={tag} className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${t.tagColor}`}>{tag}</span>
                      ))}
                    </div>
                    <h3 className="text-white text-xl font-bold mb-3">{t.name}</h3>
                    <p className="text-white/60 text-sm leading-relaxed">{t.bio}</p>
                    <button className={`w-full mt-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200
                      ${isSelected ? "bg-amber-400 text-stone-900" : "bg-white/5 text-white/70 hover:bg-white/10 border border-white/10"}`}>
                      {isSelected ? `✓ ${t.name} selected` : `Choose ${t.name}`}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* ── Booking form ── */}
        <AnimatePresence>
          {selectedTeacher && (
            <motion.div key="booking" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.5 }} className="mt-16">
              <div className="flex items-center gap-3 mb-8">
                <div className={`w-1 h-8 rounded-full bg-gradient-to-b ${teacher?.accent}`} />
                <div>
                  <h2 className="text-white text-2xl font-bold">Book your class</h2>
                  <p className="text-white/40 text-sm">with {teacher?.name} · Bastille Spanish School</p>
                </div>
              </div>

              {submitted ? (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="bg-green-900/20 border border-green-500/30 rounded-2xl p-10 text-center">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check size={28} className="text-white" strokeWidth={3} />
                  </div>
                  <h3 className="text-white text-xl font-bold mb-2">WhatsApp opened!</h3>
                  <p className="text-white/60 text-sm max-w-sm mx-auto">
                    Your booking details have been sent to our receptionist via WhatsApp. We'll confirm your class shortly.
                  </p>
                  <button onClick={reset} className="mt-6 text-amber-400 text-sm hover:text-amber-300 underline">Book another class</button>
                </motion.div>
              ) : (
                <div className="space-y-8">

                  {/* Step 1: Level */}
                  <div>
                    <p className="text-white/40 text-xs uppercase tracking-widest mb-4">1 · Your Spanish level</p>
                    <div className="grid grid-cols-3 gap-3">
                      {levels.map(l => (
                        <button key={l.id} type="button" onClick={() => setSelectedLevel(l.id)}
                          className={`text-left p-4 rounded-xl border-2 transition-all duration-200
                            ${selectedLevel === l.id ? "border-amber-400 bg-amber-400/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}>
                          <p className={`text-lg font-bold ${selectedLevel === l.id ? "text-amber-400" : "text-white"}`}>{l.label}</p>
                          <p className={`text-sm font-semibold mt-0.5 ${selectedLevel === l.id ? "text-amber-400/70" : "text-white/40"}`}>{l.range}</p>
                          <p className="text-white/40 text-xs mt-2 leading-snug">{l.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Step 2: Class type */}
                  <div>
                    <p className="text-white/40 text-xs uppercase tracking-widest mb-1">2 · Type of class</p>
                    <p className="text-white/25 text-xs mb-4">Pick the experience that suits your style</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {classTypes.map(ct => (
                        <button key={ct.id} type="button" onClick={() => setSelectedType(ct.id)}
                          className={`text-left p-4 rounded-xl border-2 transition-all duration-200
                            ${selectedType === ct.id ? "border-amber-400 bg-amber-400/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}>
                          <ct.Icon size={20} className={selectedType === ct.id ? "text-amber-400" : "text-white/40"} />
                          <p className={`text-sm font-bold mt-2 ${selectedType === ct.id ? "text-amber-400" : "text-white"}`}>{ct.label}</p>
                          <p className="text-white/40 text-xs mt-1 leading-snug">{ct.desc}</p>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 flex items-start gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
                      <span className="text-2xl mt-0.5">🗣️</span>
                      <div>
                        <p className="text-amber-400 text-sm font-bold">+ Chalita</p>
                        <p className="text-white/50 text-xs leading-relaxed mt-0.5">
                          Sucre's colloquial speech — local expressions, Bolivian slang and the sucrense accent you won't find in any textbook.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Dates + time slot */}
                  <div>
                    <p className="text-white/40 text-xs uppercase tracking-widest mb-4">3 · Dates & schedule</p>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-white/50 text-xs mb-2">Select one or more days</p>
                        <DatePicker selected={selectedDates} onChange={setSelectedDates} />
                      </div>
                      <div>
                        <p className="text-white/50 text-xs mb-2">Choose a time slot</p>
                        <div className="space-y-3">
                          <button type="button" onClick={() => setSelectedSlot("morning")}
                            className={`w-full text-left p-5 rounded-xl border-2 transition-all
                              ${selectedSlot === "morning" ? "border-amber-400 bg-amber-400/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}>
                            <div className="flex items-center gap-3">
                              <Sun size={22} className={selectedSlot === "morning" ? "text-amber-400" : "text-white/40"} />
                              <div>
                                <p className={`font-bold text-sm ${selectedSlot === "morning" ? "text-amber-400" : "text-white"}`}>Morning</p>
                                <p className="text-white/40 text-xs mt-0.5">9:00 am – 1:00 pm</p>
                              </div>
                            </div>
                          </button>
                          <button type="button" onClick={() => setSelectedSlot("afternoon")}
                            className={`w-full text-left p-5 rounded-xl border-2 transition-all
                              ${selectedSlot === "afternoon" ? "border-amber-400 bg-amber-400/10" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}>
                            <div className="flex items-center gap-3">
                              <Moon size={22} className={selectedSlot === "afternoon" ? "text-amber-400" : "text-white/40"} />
                              <div>
                                <p className={`font-bold text-sm ${selectedSlot === "afternoon" ? "text-amber-400" : "text-white"}`}>Afternoon</p>
                                <p className="text-white/40 text-xs mt-0.5">3:00 pm – 7:00 pm</p>
                              </div>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 4: Your details */}
                  <div>
                    <p className="text-white/40 text-xs uppercase tracking-widest mb-4">4 · Your details</p>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-white/50 text-xs mb-1.5">Full name *</label>
                        <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your full name"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition-all" />
                      </div>
                      <div>
                        <label className="block text-white/50 text-xs mb-1.5">Nationality *</label>
                        <input type="text" required value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} placeholder="e.g. American, French, German…"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition-all" />
                      </div>
                      <div>
                        <label className="block text-white/50 text-xs mb-1.5">Passport / ID number *</label>
                        <input type="text" required value={form.passport} onChange={e => setForm(f => ({ ...f, passport: e.target.value }))} placeholder="Passport or document number"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition-all" />
                      </div>
                      <div>
                        <label className="block text-white/50 text-xs mb-1.5">Number of students *</label>
                        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                          <button type="button" onClick={() => setForm(f => ({ ...f, num_students: String(Math.max(1, parseInt(f.num_students) - 1)) }))}
                            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-lg leading-none">−</button>
                          <span className="flex-1 text-center text-white font-bold text-lg">{form.num_students}</span>
                          <button type="button" onClick={() => setForm(f => ({ ...f, num_students: String(parseInt(f.num_students) + 1) }))}
                            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-lg leading-none">+</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-white/50 text-xs mb-1.5">WhatsApp number</label>
                        <input type="tel" value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+1 555 123 4567"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition-all" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-white/50 text-xs mb-1.5">Email address</label>
                        <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition-all" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-white/50 text-xs mb-1.5">Message <span className="text-white/25">(optional)</span></label>
                        <textarea rows={2} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="e.g. I'm arriving July 20th, available in the mornings…"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 text-sm focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30 transition-all resize-none" />
                      </div>
                    </div>
                  </div>

                  {/* Summary + Book button */}
                  {selectedLevel && selectedType && selectedDates.length > 0 && selectedSlot && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/50 text-xs">👤 {teacher?.name}</span>
                        <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/50 text-xs">🎓 {levels.find(l => l.id === selectedLevel)?.label}</span>
                        <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/50 text-xs">📚 {classTypes.find(c => c.id === selectedType)?.label}</span>
                        <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/50 text-xs">📅 {selectedDates.length} day{selectedDates.length > 1 ? "s" : ""}</span>
                        <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/50 text-xs">⏰ {selectedSlot === "morning" ? "Morning" : "Afternoon"}</span>
                        <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-white/50 text-xs">👥 {form.num_students} student{parseInt(form.num_students) > 1 ? "s" : ""}</span>
                      </div>
                      <button
                        onClick={handleBook}
                        disabled={!canBook || loading}
                        className="flex items-center gap-3 px-8 py-4 bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-green-900/30"
                      >
                        {loading
                          ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.098.543 4.072 1.497 5.789L0 24l6.386-1.674A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
                        }
                        {loading ? "Sending…" : "Book via WhatsApp"}
                      </button>
                      {!canBook && (
                        <p className="text-white/30 text-xs">Please fill in name, nationality and passport number to continue.</p>
                      )}
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
