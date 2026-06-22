import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { BookingFilters } from "./BookingSearch";
import {
  Wifi,
  Tv,
  ShowerHead,
  Laptop,
  Archive,
  Wind,
  Users,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Bath,
  Shirt,
  RefreshCw,
  Zap,
  GlassWater,
  Eye,
} from "lucide-react";
import type { Room, AmenityKey } from "../data/rooms";

const amenityIcons: Record<AmenityKey, React.ReactNode> = {
  wifi: <Wifi size={16} />,
  tv: <Tv size={16} />,
  shower: <ShowerHead size={16} />,
  desk: <Laptop size={16} />,
  closet: <Archive size={16} />,
  fan: <Wind size={16} />,
  breakfast: <Coffee size={16} />,
  hairdryer: <Zap size={16} />,
  towels: <Bath size={16} />,
  iron: <Shirt size={16} />,
  laundry: <RefreshCw size={16} />,
  minibar: <GlassWater size={16} />,
  streetview: <Eye size={16} />,
};

interface RoomCardProps {
  room: Room;
  filters?: BookingFilters;
}

export default function RoomCard({ room, filters }: RoomCardProps) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);

  const totalAdults = filters?.rooms.reduce((s, r) => s + r.adults, 0) ?? 1;
  const totalChildren = filters?.rooms.reduce((s, r) => s + r.children, 0) ?? 0;
  const bookingUrl = `/booking?room=${room.id}&checkIn=${filters?.checkIn ?? ""}&checkOut=${filters?.checkOut ?? ""}&adults=${totalAdults}&children=${totalChildren}&pet=${filters?.hasPet ?? false}`;

  const prev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrent((c) => (c - 1 + room.gallery.length) % room.gallery.length);
  };

  const next = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrent((c) => (c + 1) % room.gallery.length);
  };

  return (
    <div
      data-testid={"room-card-" + room.id}
      className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-shadow duration-300 flex flex-col"
    >
      {/* Carousel */}
      <div
        data-testid={"room-card-" + room.id + "-carousel"}
        className="relative overflow-hidden h-56 group"
      >
        {/* Images */}
        {room.gallery.map((img, i) => (
          <img
            key={i}
            data-testid={"room-card-" + room.id + "-img-" + i}
            src={img}
            alt={t(room.nameKey) + " photo " + (i + 1)}
            className={
              "absolute inset-0 w-full h-full object-cover transition-opacity duration-300 " +
              (i === current ? "opacity-100" : "opacity-0")
            }
          />
        ))}

        {/* Prev button */}
        <button
          data-testid={"room-card-" + room.id + "-btn-prev"}
          onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft size={20} />
        </button>

        {/* Next button */}
        <button
          data-testid={"room-card-" + room.id + "-btn-next"}
          onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight size={20} />
        </button>

        {/* Dot indicators */}
        <div
          data-testid={"room-card-" + room.id + "-dots"}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1"
        >
          {room.gallery.map((_, i) => (
            <button
              key={i}
              data-testid={"room-card-" + room.id + "-dot-" + i}
              onClick={(e) => {
                e.stopPropagation();
                setCurrent(i);
              }}
              className={
                "w-2 h-2 rounded-full transition-all " +
                (i === current ? "bg-white scale-125" : "bg-white/50")
              }
            />
          ))}
        </div>
      </div>

      {/* Card content */}
      <div
        data-testid={"room-card-" + room.id + "-content"}
        className="p-6 flex flex-col flex-1"
      >
        {/* Room name + capacity */}
        <div className="flex items-center justify-between mb-3">
          <h3
            data-testid={"room-card-" + room.id + "-title"}
            className="text-xl font-bold text-gray-900"
          >
            {t(room.nameKey)}
          </h3>
          <div
            data-testid={"room-card-" + room.id + "-capacity"}
            className="flex items-center gap-1 text-gray-500 text-sm"
          >
            <Users size={16} />
            <span>{room.capacity}</span>
          </div>
        </div>

        {/* Amenities */}
        <div
          data-testid={"room-card-" + room.id + "-amenities"}
          className="flex flex-wrap gap-2 mb-6"
        >
          {room.amenities.map((key) => (
            <div
              key={key}
              data-testid={"room-card-" + room.id + "-amenity-" + key}
              className="flex items-center gap-1 text-gray-500 text-xs bg-gray-100 px-2 py-1 rounded-full"
            >
              {amenityIcons[key]}
              <span>{t("rooms.amenities." + key)}</span>
            </div>
          ))}
        </div>

        {/* Price + Book */}
        <div className="flex items-center justify-between mt-auto">
          <div data-testid={"room-card-" + room.id + "-price"}>
            <span className="text-3xl font-bold text-gray-900">
              ${room.priceUSD}
            </span>
            <span className="text-gray-400 text-sm ml-1">/ night</span>
            <p
              data-testid={"room-card-" + room.id + "-price-bs"}
              className="text-xs text-gray-400"
            >
              ≈ {room.price} Bs
            </p>
          </div>
          <Link
            data-testid={"room-card-" + room.id + "-btn-book"}
            to={bookingUrl}
            className="bg-amber-400 hover:bg-amber-300 text-black font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {t("rooms.bookNow")}
          </Link>
        </div>
      </div>
    </div>
  );
}
