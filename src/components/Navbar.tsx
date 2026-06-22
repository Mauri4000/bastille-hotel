import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";

const languages = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
];

const navLinks = ["rooms", "amenities", "gallery", "contact"] as const;

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-md text-white px-6 py-4 flex items-center justify-between"
    >
      {/* Hotel name / logo */}
      <span
        data-testid="navbar-logo"
        className="text-xl font-bold tracking-widest uppercase"
      >
        Bastille Hotel
      </span>

      {/* Desktop navigation links */}
      <div
        data-testid="navbar-desktop-links"
        className="hidden md:flex gap-8 text-sm uppercase tracking-wider"
      >
        {navLinks.map((key) => (
          <a
            key={key}
            href={`#${key}`}
            className="hover:text-amber-400 transition-colors"
          >
            {t(`nav.${key}`)}
          </a>
        ))}
      </div>

      {/* Language switcher + offers + book button */}
      <div
        data-testid="navbar-desktop-right"
        className="hidden md:flex items-center gap-4"
      >
        <div data-testid="navbar-lang-switcher" className="flex gap-1 text-xs">
          {languages.map((lang) => (
            <button
              data-testid={"nav-lang-" + lang.code}
              key={lang.code}
              onClick={() => i18n.changeLanguage(lang.code)}
              className={`px-2 py-1 rounded transition-colors ${
                i18n.language === lang.code
                  ? "bg-amber-400 text-black font-bold"
                  : "hover:text-amber-400"
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
        <a
          data-testid="nav-btn-offers"
          href="#offers"
          className="border border-white/40 hover:border-amber-400 hover:text-amber-400 text-white px-4 py-2 rounded text-sm font-semibold transition-colors"
        >
          🌟 {t("nav.offers")}
        </a>
        <button
          data-testid="nav-btn-signin"
          className="border border-white/40 hover:border-white text-white px-4 py-2 rounded text-sm font-semibold transition-colors"
        >
          👤 {t("nav.signin")}
        </button>
        <a
          data-testid="nav-btn-book"
          href="#booking"
          className="bg-amber-400 text-black px-4 py-2 rounded text-sm font-semibold hover:bg-amber-300 transition-colors"
        >
          {t("nav.book")}
        </a>
      </div>

      {/* Mobile menu toggle */}
      <button
        data-testid="nav-btn-mobile-menu"
        className="md:hidden"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        {menuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <motion.div
          data-testid="navbar-mobile-menu"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-full left-0 right-0 bg-black/95 flex flex-col items-center gap-6 py-8 text-sm uppercase tracking-wider"
        >
          {navLinks.map((key) => (
            <a
              data-testid={"nav-mobile-link-" + key}
              key={key}
              href={`#${key}`}
              onClick={() => setMenuOpen(false)}
              className="hover:text-amber-400"
            >
              {t(`nav.${key}`)}
            </a>
          ))}
          <a
            data-testid="nav-mobile-btn-offers"
            href="#offers"
            onClick={() => setMenuOpen(false)}
            className="border border-white/40 hover:border-amber-400 hover:text-amber-400 px-4 py-2 rounded text-sm font-semibold transition-colors"
          >
            🌟 {t("nav.offers")}
          </a>
          <button
            data-testid="nav-mobile-btn-signin"
            className="border border-white/40 px-4 py-2 rounded text-sm font-semibold transition-colors"
          >
            👤 {t("nav.signin")}
          </button>
          <a
            data-testid="nav-mobile-btn-book"
            href="#booking"
            onClick={() => setMenuOpen(false)}
            className="bg-amber-400 text-black px-4 py-2 rounded text-sm font-semibold hover:bg-amber-300 transition-colors"
          >
            {t("nav.book")}
          </a>
          <div data-testid="navbar-mobile-lang-switcher" className="flex gap-2">
            {languages.map((lang) => (
              <button
                data-testid={"nav-mobile-lang-" + lang.code}
                key={lang.code}
                onClick={() => {
                  i18n.changeLanguage(lang.code);
                  setMenuOpen(false);
                }}
                className={`px-3 py-1 rounded ${
                  i18n.language === lang.code
                    ? "bg-amber-400 text-black font-bold"
                    : ""
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
