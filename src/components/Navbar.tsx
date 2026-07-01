import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Menu, X, Bird } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const languages = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
];

type NavLink = { key: string; href: string; bird?: boolean };

const navLinks: NavLink[] = [
  { key: "rooms",        href: "#rooms" },
  { key: "conference",   href: "/conference" },
  { key: "rooftop",      href: "/rooftop", bird: true },
  { key: "spanishSchool", href: "/spanish-school" },
];

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLink = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (href.startsWith("/")) {
      navigate(href);
    } else {
      if (location.pathname === "/") {
        document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
      } else {
        window.location.href = "/" + href;
      }
    }
  };

  const linkLabel = ({ key, bird }: NavLink) => (
    <span className="flex items-center gap-1.5">
      {bird && (
        <Bird
          size={14}
          className="shrink-0"
          style={{ color: "#f4a26b" }} // warm salmon matching the logo
        />
      )}
      {t(`nav.${key}`)}
    </span>
  );

  return (
    <motion.nav
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-md text-white px-6 py-4 flex items-center justify-between"
    >
      {/* Hotel name / logo */}
      <a
        data-testid="navbar-logo"
        href="/"
        onClick={(e) => { e.preventDefault(); navigate("/"); }}
        className="text-xl font-bold tracking-widest uppercase hover:text-amber-400 transition-colors"
      >
        Bastille Hotel
      </a>

      {/* Desktop navigation links */}
      <div
        data-testid="navbar-desktop-links"
        className="hidden md:flex gap-8 text-sm uppercase tracking-wider"
      >
        {navLinks.map((link) => (
          <a
            key={link.key}
            href={link.href}
            onClick={(e) => handleLink(e, link.href)}
            className="hover:text-amber-400 transition-colors"
          >
            {linkLabel(link)}
          </a>
        ))}
      </div>

      {/* Language switcher + book button */}
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
          onClick={(e) => handleLink(e, "#offers")}
          className="border border-white/40 hover:border-amber-400 hover:text-amber-400 text-white px-4 py-2 rounded text-sm font-semibold transition-colors"
        >
          🌟 {t("nav.offers")}
        </a>
        <a
          data-testid="nav-btn-book"
          href="#booking"
          onClick={(e) => handleLink(e, "#booking")}
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
          {navLinks.map((link) => (
            <a
              data-testid={"nav-mobile-link-" + link.key}
              key={link.key}
              href={link.href}
              onClick={(e) => { handleLink(e, link.href); setMenuOpen(false); }}
              className="hover:text-amber-400"
            >
              {linkLabel(link)}
            </a>
          ))}
          <a
            data-testid="nav-mobile-btn-offers"
            href="#offers"
            onClick={(e) => { handleLink(e, "#offers"); setMenuOpen(false); }}
            className="border border-white/40 hover:border-amber-400 hover:text-amber-400 px-4 py-2 rounded text-sm font-semibold transition-colors"
          >
            🌟 {t("nav.offers")}
          </a>
          <a
            data-testid="nav-mobile-btn-book"
            href="#booking"
            onClick={(e) => { handleLink(e, "#booking"); setMenuOpen(false); }}
            className="bg-amber-400 text-black px-4 py-2 rounded text-sm font-semibold hover:bg-amber-300 transition-colors"
          >
            {t("nav.book")}
          </a>
          <div data-testid="navbar-mobile-lang-switcher" className="flex gap-2">
            {languages.map((lang) => (
              <button
                data-testid={"nav-mobile-lang-" + lang.code}
                key={lang.code}
                onClick={() => { i18n.changeLanguage(lang.code); setMenuOpen(false); }}
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
