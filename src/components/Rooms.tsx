import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { PawPrint } from "lucide-react";
import RoomCard from "./RoomCard";
import { rooms } from "../data/rooms";
import type { BookingFilters } from "./BookingSearch";

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5 },
  }),
};

interface Props {
  filters: BookingFilters;
}

export default function Rooms({ filters }: Props) {
  const { t } = useTranslation();

  // Max occupancy needed in any single booking room
  const maxPerRoom = Math.max(
    ...filters.rooms.map((r) => r.adults + r.children)
  );

  const filtered = rooms.filter((r) => r.capacity >= maxPerRoom);
  const standardRooms = filtered.filter((r) => r.category === "room");
  const suites = filtered.filter((r) => r.category === "suite");
  const noResults = filtered.length === 0;

  return (
    <section
      id="rooms"
      data-testid="rooms-section"
      className="bg-gray-50 pt-16 pb-20 px-6"
    >
      <div data-testid="rooms-container" className="max-w-6xl mx-auto">

        {/* No results message */}
        {noResults && (
          <div
            data-testid="rooms-no-results"
            className="text-center py-20 text-gray-400"
          >
            <p className="text-lg">{t("search.noResults")}</p>
          </div>
        )}

        {/* Standard rooms */}
        {standardRooms.length > 0 && (
          <div data-testid="rooms-standard" className="mb-20">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-3">
                {t("rooms.title")}
              </h2>
              <p className="text-gray-500 text-lg">{t("rooms.subtitle")}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {standardRooms.map((room, i) => (
                <motion.div
                  key={room.id}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={cardVariants}
                >
                  <RoomCard room={room} filters={filters} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Suites */}
        {suites.length > 0 && (
          <div data-testid="rooms-suites" className="mb-16">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-3">
                {t("rooms.suitesTitle")}
              </h2>
              <p className="text-gray-500 text-lg">
                {t("rooms.suitesSubtitle")}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {suites.map((room, i) => (
                <motion.div
                  key={room.id}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={cardVariants}
                >
                  <RoomCard room={room} filters={filters} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Pet friendly badge */}
        {!noResults && (
          <div
            data-testid="rooms-pet-note"
            className="flex items-center justify-center gap-4 bg-green-50 border border-green-200 rounded-2xl py-4 px-8 w-fit mx-auto"
          >
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shrink-0">
              <PawPrint size={22} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-green-700 text-sm uppercase tracking-wide">
                Pet Friendly
              </p>
              <p className="text-green-600 text-xs">{t("rooms.pet")}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
