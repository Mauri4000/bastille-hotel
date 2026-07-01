import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Users, Clock, Globe, Award, CalendarCheck } from "lucide-react";
import Navbar from "../components/Navbar";
import heroImg from "../assets/hero.jpeg";

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

export default function SpanishSchoolPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-stone-950">
      <Navbar />

      {/* Hero */}
      <section className="relative h-[60vh] flex items-end pb-16 px-8 overflow-hidden">
        <img
          src={heroImg}
          alt="Spanish School"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10"
        >
          <p className="text-amber-400 text-sm uppercase tracking-widest mb-2">Bastille Hotel</p>
          <h1 className="text-4xl md:text-6xl font-bold text-white tracking-wide">
            {t("nav.spanishSchool")}
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
        <SkeletonBlock icon={BookOpen}     title="Sobre la escuela" />
        <SkeletonBlock icon={Users}        title="Profesores" />
        <SkeletonBlock icon={Globe}        title="Niveles y cursos" />
        <SkeletonBlock icon={Clock}        title="Horarios" />
        <SkeletonBlock icon={Award}        title="Certificaciones" />
        <SkeletonBlock icon={CalendarCheck} title="Inscripciones" />
      </div>
    </div>
  );
}
