import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import heroImg from "../assets/hero.jpeg";

export default function Hero() {
  const { t } = useTranslation();

  return (
    <section
      data-testid="hero-section"
      className="relative h-screen flex items-center justify-center overflow-hidden"
    >
      {/* Full-screen background image */}
      <img
        data-testid="hero-bg-image"
        src={heroImg}
        alt="Bastille Hotel"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Dark overlay for text readability */}
      <div
        data-testid="hero-overlay"
        className="absolute inset-0 bg-black/50"
      />

      {/* Animated hero content */}
      <motion.div
        data-testid="hero-content"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.3 }}
        className="relative z-10 text-center text-white px-6"
      >
        <h1
          data-testid="hero-title"
          className="text-4xl md:text-7xl font-bold tracking-wide mb-4"
        >
          {t("hero.title")}
        </h1>
        <p
          data-testid="hero-subtitle"
          className="text-lg md:text-2xl text-white/80 mb-8"
        >
          {t("hero.subtitle")}
        </p>
        <a
          data-testid="hero-btn-view-rooms"
          href="#rooms"
          className="bg-amber-400 text-black px-8 py-3 rounded text-lg font-semibold hover:bg-amber-300 transition-colors"
        >
          {t("hero.cta")}
        </a>
      </motion.div>
    </section>
  );
}
