import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { PawPrint } from "lucide-react";
import RoomCard from "./RoomCard";
import { rooms } from "../data/rooms";

// Animation variant for staggered card entrance
const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5 },
  }),
};

export default function Rooms() {
  const { t } = useTranslation();

  const standardRooms = rooms.filter((r) => r.category === "room");
  const suites = rooms.filter((r) => r.category === "suite");

  return (
    <section
      id="rooms"
      data-testid="rooms-section"
      className="bg-gray-50 py-20 px-6"
    >
      <div data-testid="rooms-container" className="max-w-6xl mx-auto">
        {/* Standard rooms */}
        <div data-testid="rooms-standard" className="mb-20">
          <div
            data-testid="rooms-standard-header"
            className="text-center mb-12"
          >
            <h2
              data-testid="rooms-standard-title"
              className="text-4xl font-bold text-gray-900 mb-3"
            >
              {t("rooms.title")}
            </h2>
            <p
              data-testid="rooms-standard-subtitle"
              className="text-gray-500 text-lg"
            >
              {t("rooms.subtitle")}
            </p>
          </div>

          <div
            data-testid="rooms-standard-grid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {standardRooms.map((room, i) => (
              <motion.div
                key={room.id}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={cardVariants}
              >
                <RoomCard room={room} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Suites — only shown when there's data */}
        {suites.length > 0 && (
          <div data-testid="rooms-suites" className="mb-16">
            <div
              data-testid="rooms-suites-header"
              className="text-center mb-12"
            >
              <h2
                data-testid="rooms-suites-title"
                className="text-4xl font-bold text-gray-900 mb-3"
              >
                {t("rooms.suitesTitle")}
              </h2>
              <p
                data-testid="rooms-suites-subtitle"
                className="text-gray-500 text-lg"
              >
                {t("rooms.suitesSubtitle")}
              </p>
            </div>

            <div
              data-testid="rooms-suites-grid"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {suites.map((room, i) => (
                <motion.div
                  key={room.id}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={cardVariants}
                >
                  <RoomCard room={room} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Pet friendly note */}
        <div
          data-testid="rooms-pet-note"
          className="flex items-center justify-center gap-2 text-gray-500 text-sm bg-white border border-gray-200 rounded-xl py-4 px-6 w-fit mx-auto"
        >
          <PawPrint size={18} className="text-amber-400" />
          <span>{t("rooms.pet")}</span>
        </div>
      </div>
    </section>
  );
}
