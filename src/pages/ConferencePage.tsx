import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Monitor, Wifi, Coffee, Camera, DollarSign } from "lucide-react";
import Navbar from "../components/Navbar";
import heroImg from "../assets/gallery/conference/salon.jpeg";

const SkeletonBlock = ({ icon: Icon, title }: { icon: React.ElementType; title: string }) => (
  <div className="border border-white/10 rounded-xl p-8 bg-white/[0.03]">
    <div className="flex items-center gap-3 mb-6">
      <Icon size={22} className="text-amber-400" />
      <h3 className="text-white text-lg font-semibold uppercase tracking-widest">{title}</h3>
    </div>
    <div className="space-y-3">
      <div className="h-4 bg-white/10 rounded w-3/4" />
      <div className="h-4 bg-white/10 rounded w-1/2" />
      <div className="h-4 bg-white/10 rounded w-2/3" />
    </div>
  </div>
);

export default function ConferencePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-stone-950">
      <Navbar />

      {/* Hero */}
      <section className="relative h-[60vh] flex items-end pb-16 px-8 overflow-hidden">
        <img
          src={heroImg}
          alt="Salón de Conferencias"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10"
        >
          <p className="text-amber-400 text-sm uppercase tracking-widest mb-2">Bastille Hotel</p>
          <h1 className="text-4xl md:text-6xl font-bold text-white tracking-wide">
            {t("nav.conference")}
          </h1>
        </motion.div>
      </section>

      {/* Back */}
      <div className="px-8 max-w-6xl mx-auto mt-8 mb-10">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-white/50 hover:text-amber-400 text-sm transition-colors"
        >
          <ArrowLeft size={16} /> {t("booking.back")}
        </button>
      </div>

      {/* Skeleton sections */}
      <div className="px-8 max-w-6xl mx-auto pb-24 grid md:grid-cols-2 gap-6">
        <SkeletonBlock icon={Camera}     title="Fotos" />
        <SkeletonBlock icon={Users}      title="Capacidad y configuraciones" />
        <SkeletonBlock icon={Monitor}    title="Equipamiento A/V" />
        <SkeletonBlock icon={Wifi}       title="Servicios incluidos" />
        <SkeletonBlock icon={Coffee}     title="Catering" />
        <SkeletonBlock icon={DollarSign} title="Tarifas" />
      </div>
    </div>
  );
}
