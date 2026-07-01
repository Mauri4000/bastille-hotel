import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, UtensilsCrossed, Clock, CalendarCheck, Star, MapPin } from "lucide-react";
import Navbar from "../components/Navbar";
import heroImg from "../assets/gallery/terrace/terraza1.jpg";

// Bird SVG matching the Soir d'Été logo style
const BirdSVG = () => (
  <svg viewBox="0 0 80 80" className="w-16 h-16 md:w-24 md:h-24" fill="none">
    <defs>
      <linearGradient id="bird-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stopColor="#f4a26b" />
        <stop offset="50%"  stopColor="#e8788a" />
        <stop offset="100%" stopColor="#b48fc8" />
      </linearGradient>
    </defs>
    {/* Body */}
    <path d="M15 42 C20 30, 35 28, 45 32 C52 35, 58 30, 65 18 C62 28, 58 34, 62 44 C54 38, 44 40, 36 46 C28 50, 18 50, 15 42Z"
          fill="url(#bird-grad)" opacity="0.95"/>
    {/* Tail feathers */}
    <path d="M15 42 C10 50, 8 58, 14 62 C12 54, 18 50, 15 42Z"
          fill="url(#bird-grad)" opacity="0.7"/>
    <path d="M15 42 C6 46, 4 54, 10 60 C10 52, 14 48, 15 42Z"
          fill="url(#bird-grad)" opacity="0.5"/>
    {/* Wing highlight */}
    <path d="M38 33 C44 30, 55 26, 62 22 C58 28, 52 32, 48 34Z"
          fill="url(#bird-grad)" opacity="0.6"/>
  </svg>
);

const SkeletonBlock = ({ icon: Icon, title }: { icon: React.ElementType; title: string }) => (
  <div className="border border-white/10 rounded-xl p-8 bg-white/[0.03]">
    <div className="flex items-center gap-3 mb-6">
      <Icon size={22} className="text-rose-300" />
      <h3 className="text-white text-lg font-semibold uppercase tracking-widest">{title}</h3>
    </div>
    <div className="space-y-3">
      <div className="h-4 bg-white/10 rounded w-3/4" />
      <div className="h-4 bg-white/10 rounded w-1/2" />
      <div className="h-4 bg-white/10 rounded w-2/3" />
    </div>
  </div>
);

export default function RooftopPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-stone-950">
      <Navbar />

      {/* Hero */}
      <section className="relative h-[70vh] flex items-end pb-16 px-8 overflow-hidden">
        <img
          src={heroImg}
          alt="Rooftop Soir d'Été"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 flex items-end gap-6"
        >
          <BirdSVG />
          <div>
            <p className="text-rose-300/80 text-sm uppercase tracking-widest mb-1">Bastille Hotel</p>
            <h1 className="text-4xl md:text-6xl font-bold text-white tracking-wide leading-tight">
              Soir d'Été
            </h1>
            <p
              className="text-lg md:text-xl font-light tracking-[0.3em] uppercase mt-1"
              style={{ color: "#b48fc8" }}
            >
              Rooftop
            </p>
          </div>
        </motion.div>
      </section>

      {/* Back */}
      <div className="px-8 max-w-6xl mx-auto mt-8 mb-10">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-white/50 hover:text-rose-300 text-sm transition-colors"
        >
          <ArrowLeft size={16} /> {t("booking.back")}
        </button>
      </div>

      {/* Skeleton sections */}
      <div className="px-8 max-w-6xl mx-auto pb-24 grid md:grid-cols-2 gap-6">
        <SkeletonBlock icon={Camera}        title="Galería" />
        <SkeletonBlock icon={UtensilsCrossed} title="Menú y bebidas" />
        <SkeletonBlock icon={Clock}         title="Horarios" />
        <SkeletonBlock icon={CalendarCheck} title="Reservas" />
        <SkeletonBlock icon={Star}          title="Eventos especiales" />
        <SkeletonBlock icon={MapPin}        title="Cómo llegar" />
      </div>
    </div>
  );
}
