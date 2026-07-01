import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Importá las fotos acá cuando las tengas.
// Ejemplo:
//   import conf1 from "../assets/gallery/conference/salon-1.jpg";
//
// Luego agregá el objeto al array `RAW_ITEMS`:
//   { src: conf1, category: "conference", alt: "Salón de conferencias" }
// ─────────────────────────────────────────────────────────────
const RAW_ITEMS: { src: string; category: Category; alt: string }[] = [
  // Conference room — reemplazá con tus fotos reales
  // { src: conf1, category: "conference", alt: "Salón de conferencias" },

  // Terrace / dining — reemplazá con tus fotos reales
  // { src: terrace1, category: "terrace", alt: "Terraza comedor" },

  // Buffet menu — reemplazá con tus fotos reales
  // { src: buffet1, category: "buffet", alt: "Menú buffet" },

  // Pets — reemplazá con tus fotos reales
  // { src: pet1, category: "pets", alt: "Perritos en el hotel" },

  // Hallway — reemplazá con tus fotos reales
  // { src: hall1, category: "hallway", alt: "Pasillo" },
];

type Category = "conference" | "terrace" | "buffet" | "pets" | "hallway";

const CATEGORIES: { key: Category | "all"; icon: string }[] = [
  { key: "all",        icon: "🏨" },
  { key: "conference", icon: "🎤" },
  { key: "terrace",    icon: "🌿" },
  { key: "buffet",     icon: "🍽️" },
  { key: "pets",       icon: "🐾" },
  { key: "hallway",    icon: "🚪" },
];

// Placeholder cards shown when a category has no images yet
const PLACEHOLDER_COUNTS: Record<Category, number> = {
  conference: 3,
  terrace:    3,
  buffet:     2,
  pets:       3,
  hallway:    2,
};

export default function Gallery() {
  const { t } = useTranslation();
  const [active, setActive] = useState<Category | "all">("all");
  const [lightbox, setLightbox] = useState<{ items: typeof RAW_ITEMS; index: number } | null>(null);

  // Filtered real images
  const filtered = useMemo(
    () => (active === "all" ? RAW_ITEMS : RAW_ITEMS.filter((i) => i.category === active)),
    [active]
  );

  // Navigate lightbox
  const prev = () =>
    lightbox && setLightbox({ ...lightbox, index: (lightbox.index - 1 + lightbox.items.length) % lightbox.items.length });
  const next = () =>
    lightbox && setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.items.length });

  // Categories that still have no real photos
  const emptyCategories: Category[] =
    active === "all"
      ? (["conference", "terrace", "buffet", "pets", "hallway"] as Category[]).filter(
          (cat) => !RAW_ITEMS.some((i) => i.category === cat)
        )
      : RAW_ITEMS.some((i) => i.category === active)
      ? []
      : [active as Category];

  return (
    <section id="gallery" className="bg-stone-950 py-24 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-white tracking-wide mb-3">
            {t("gallery.title")}
          </h2>
          <p className="text-white/60 text-lg">{t("gallery.subtitle")}</p>
        </motion.div>

        {/* Filter tabs */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {CATEGORIES.map(({ key, icon }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 border ${
                active === key
                  ? "bg-amber-400 text-black border-amber-400"
                  : "border-white/20 text-white/70 hover:border-amber-400 hover:text-amber-400"
              }`}
            >
              <span>{icon}</span>
              <span>{t(`gallery.cat.${key}`)}</span>
            </button>
          ))}
        </div>

        {/* Real photo grid */}
        {filtered.length > 0 && (
          <motion.div
            layout
            className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10"
          >
            <AnimatePresence>
              {filtered.map((item, idx) => (
                <motion.button
                  key={item.src + idx}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => setLightbox({ items: filtered, index: idx })}
                  className="relative aspect-[4/3] overflow-hidden rounded-lg group focus:outline-none"
                >
                  <img
                    src={item.src}
                    alt={item.alt}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300" />
                </motion.button>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Placeholder cards for categories without photos yet */}
        {emptyCategories.map((cat) => (
          <div key={cat} className="mb-10">
            {active === "all" && (
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl">
                  {CATEGORIES.find((c) => c.key === cat)?.icon}
                </span>
                <h3 className="text-white/70 text-lg font-semibold uppercase tracking-widest">
                  {t(`gallery.cat.${cat}`)}
                </h3>
                <div className="flex-1 h-px bg-white/10" />
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: PLACEHOLDER_COUNTS[cat] }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[4/3] rounded-lg border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 bg-white/[0.02]"
                >
                  <span className="text-3xl opacity-30">
                    {CATEGORIES.find((c) => c.key === cat)?.icon}
                  </span>
                  <span className="text-white/20 text-xs uppercase tracking-widest">
                    {t("gallery.pending")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
            onClick={() => setLightbox(null)}
          >
            {/* Close */}
            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white"
              onClick={() => setLightbox(null)}
            >
              <X size={32} />
            </button>

            {/* Prev */}
            {lightbox.items.length > 1 && (
              <button
                className="absolute left-4 text-white/70 hover:text-white"
                onClick={(e) => { e.stopPropagation(); prev(); }}
              >
                <ChevronLeft size={48} />
              </button>
            )}

            {/* Image */}
            <motion.img
              key={lightbox.index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              src={lightbox.items[lightbox.index].src}
              alt={lightbox.items[lightbox.index].alt}
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Next */}
            {lightbox.items.length > 1 && (
              <button
                className="absolute right-4 text-white/70 hover:text-white"
                onClick={(e) => { e.stopPropagation(); next(); }}
              >
                <ChevronRight size={48} />
              </button>
            )}

            {/* Counter */}
            <div className="absolute bottom-6 text-white/50 text-sm">
              {lightbox.index + 1} / {lightbox.items.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
