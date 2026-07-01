import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";

// ── Auto-import all gallery images ──────────────────────────────────────────
type ImgModule = { default: string };

const modules = import.meta.glob<ImgModule>(
  "../assets/gallery/**/*.{jpg,jpeg,JPG,JPEG,png,PNG,webp}",
  { eager: true }
);

type Category = "conference" | "terrace" | "buffet" | "pets" | "hallway";

interface GalleryItem {
  src: string;
  category: Category;
  filename: string;
}

const CATEGORY_ORDER: Category[] = [
  "conference",
  "terrace",
  "buffet",
  "pets",
  "hallway",
];

const CATEGORY_ICONS: Record<Category, string> = {
  conference: "🎤",
  terrace:    "🌿",
  buffet:     "🍽️",
  pets:       "🐾",
  hallway:    "🚪",
};

// Parse glob result into typed items
const ALL_ITEMS: GalleryItem[] = Object.entries(modules)
  .map(([path, mod]) => {
    const parts = path.split("/");
    // path: "../assets/gallery/<category>/<filename>"
    const category = parts[parts.length - 2] as Category;
    const filename = parts[parts.length - 1];
    return { src: mod.default, category, filename };
  })
  .filter((item) => CATEGORY_ORDER.includes(item.category))
  .sort((a, b) => {
    // Sort by category order, then filename
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return a.filename.localeCompare(b.filename);
  });

// ── Component ────────────────────────────────────────────────────────────────
export default function GalleryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [active, setActive] = useState<Category | "all">("all");
  const [lightbox, setLightbox] = useState<{ items: GalleryItem[]; index: number } | null>(null);

  const filtered = useMemo(
    () => (active === "all" ? ALL_ITEMS : ALL_ITEMS.filter((i) => i.category === active)),
    [active]
  );

  const openLightbox = (index: number) => setLightbox({ items: filtered, index });

  const prev = () =>
    lightbox &&
    setLightbox({ ...lightbox, index: (lightbox.index - 1 + lightbox.items.length) % lightbox.items.length });

  const next = () =>
    lightbox &&
    setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.items.length });

  // Keyboard nav
  const handleKey = (e: React.KeyboardEvent) => {
    if (!lightbox) return;
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
    if (e.key === "Escape") setLightbox(null);
  };

  return (
    <div className="min-h-screen bg-stone-950" onKeyDown={handleKey} tabIndex={-1}>
      <Navbar />

      {/* Hero header */}
      <div className="pt-28 pb-10 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-6xl font-bold text-white tracking-wide mb-3">
            {t("gallery.title")}
          </h1>
          <p className="text-white/50 text-lg">{t("gallery.subtitle")}</p>
        </motion.div>
      </div>

      {/* Back button */}
      <div className="px-6 max-w-7xl mx-auto mb-6">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-white/50 hover:text-amber-400 text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          {t("booking.back")}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="px-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setActive("all")}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
              active === "all"
                ? "bg-amber-400 text-black border-amber-400"
                : "border-white/20 text-white/60 hover:border-amber-400 hover:text-amber-400"
            }`}
          >
            🏨 {t("gallery.cat.all")}
          </button>
          {CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                active === cat
                  ? "bg-amber-400 text-black border-amber-400"
                  : "border-white/20 text-white/60 hover:border-amber-400 hover:text-amber-400"
              }`}
            >
              {CATEGORY_ICONS[cat]} {t(`gallery.cat.${cat}`)}
            </button>
          ))}
        </div>

        {/* Masonry grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="columns-2 md:columns-3 lg:columns-4 gap-3 pb-16"
          >
            {filtered.map((item, idx) => (
              <motion.button
                key={item.src}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
                onClick={() => openLightbox(idx)}
                className="break-inside-avoid mb-3 block w-full overflow-hidden rounded-lg group focus:outline-none"
              >
                <img
                  src={item.src}
                  alt={item.filename}
                  className="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
              </motion.button>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/96 flex items-center justify-center"
            onClick={() => setLightbox(null)}
          >
            {/* Close */}
            <button
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10"
              onClick={() => setLightbox(null)}
            >
              <X size={32} />
            </button>

            {/* Prev */}
            {lightbox.items.length > 1 && (
              <button
                className="absolute left-3 md:left-6 text-white/60 hover:text-white transition-colors z-10"
                onClick={(e) => { e.stopPropagation(); prev(); }}
              >
                <ChevronLeft size={48} />
              </button>
            )}

            {/* Image */}
            <motion.img
              key={lightbox.index}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              src={lightbox.items[lightbox.index].src}
              alt={lightbox.items[lightbox.index].filename}
              className="max-h-[88vh] max-w-[88vw] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Next */}
            {lightbox.items.length > 1 && (
              <button
                className="absolute right-3 md:right-6 text-white/60 hover:text-white transition-colors z-10"
                onClick={(e) => { e.stopPropagation(); next(); }}
              >
                <ChevronRight size={48} />
              </button>
            )}

            {/* Counter + category */}
            <div className="absolute bottom-5 flex items-center gap-3 text-white/50 text-sm">
              <span>{CATEGORY_ICONS[lightbox.items[lightbox.index].category]}</span>
              <span>{t(`gallery.cat.${lightbox.items[lightbox.index].category}`)}</span>
              <span>·</span>
              <span>{lightbox.index + 1} / {lightbox.items.length}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
