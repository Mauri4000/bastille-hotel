import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import type { BookingFilters } from "./BookingSearch";
import { rooms as allRooms } from "../data/rooms";

const WA_NUMBER = "59178637098";

interface Props {
  filters: BookingFilters;
}

interface FormData {
  name: string;
  email: string;
  phone: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  message: string;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BookingForm({ filters }: Props) {
  const { t } = useTranslation();

  const totalAdults = filters.rooms.reduce((s, r) => s + r.adults, 0);
  const totalChildren = filters.rooms.reduce((s, r) => s + r.children, 0);

  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    phone: "",
    roomId: "",
    checkIn: filters.checkIn,
    checkOut: filters.checkOut,
    adults: totalAdults,
    children: totalChildren,
    message: "",
  });

  // Sync with search widget when filters change
  useEffect(() => {
    setForm((f) => ({
      ...f,
      checkIn: filters.checkIn,
      checkOut: filters.checkOut,
      adults: filters.rooms.reduce((s, r) => s + r.adults, 0),
      children: filters.rooms.reduce((s, r) => s + r.children, 0),
    }));
  }, [filters]);

  const set = (field: keyof FormData, value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }));

  const selectedRoom = allRooms.find((r) => r.id === form.roomId);

  const buildWaMessage = () => {
    const roomName = selectedRoom ? t(selectedRoom.nameKey) : "—";
    return `🏨 *Bastille Hotel – Booking Request*

👤 *Name:* ${form.name}
📧 *Email:* ${form.email}
📱 *Phone:* ${form.phone}

📅 *Check-in:* ${formatDate(form.checkIn)}
📅 *Check-out:* ${formatDate(form.checkOut)}
🛏️ *Room:* ${roomName}
👥 *Adults:* ${form.adults}${form.children > 0 ? `\n🧒 *Children:* ${form.children}` : ""}
🐾 *Pet:* ${filters.hasPet ? "Yes" : "No"}

💬 *Message:* ${form.message || "—"}`;
  };

  const isValid =
    form.name.trim() &&
    form.email.trim() &&
    form.phone.trim() &&
    form.roomId &&
    form.checkIn &&
    form.checkOut;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(buildWaMessage())}`;
    window.open(url, "_blank");
  };

  const inputCls =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 outline-none focus:border-amber-400 transition-colors bg-white";
  const labelCls = "block text-xs text-gray-500 uppercase tracking-wide mb-1";

  return (
    <section
      id="booking"
      data-testid="booking-form-section"
      className="bg-gray-50 py-20 px-6"
    >
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2
            data-testid="booking-form-title"
            className="text-4xl font-bold text-gray-900 mb-3"
          >
            {t("booking.title")}
          </h2>
          <p
            data-testid="booking-form-subtitle"
            className="text-gray-500 text-lg"
          >
            {t("booking.subtitle")}
          </p>
        </motion.div>

        <motion.form
          data-testid="booking-form"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-lg p-8 flex flex-col gap-5"
        >
          {/* Name + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>{t("booking.name")}</label>
              <input
                data-testid="booking-input-name"
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="John Smith"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{t("booking.email")}</label>
              <input
                data-testid="booking-input-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="john@email.com"
                className={inputCls}
                required
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className={labelCls}>{t("booking.phone")}</label>
            <input
              data-testid="booking-input-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+1 555 000 0000"
              className={inputCls}
              required
            />
          </div>

          {/* Room */}
          <div>
            <label className={labelCls}>{t("booking.room")}</label>
            <select
              data-testid="booking-select-room"
              value={form.roomId}
              onChange={(e) => set("roomId", e.target.value)}
              className={inputCls}
              required
            >
              <option value="">{t("booking.roomPlaceholder")}</option>
              <optgroup label={t("rooms.title")}>
                {allRooms
                  .filter((r) => r.category === "room")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {t(r.nameKey)} — ${r.priceUSD}/night
                    </option>
                  ))}
              </optgroup>
              <optgroup label={t("rooms.suitesTitle")}>
                {allRooms
                  .filter((r) => r.category === "suite")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {t(r.nameKey)} — ${r.priceUSD}/night
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          {/* Dates — pre-filled from search */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelCls}>{t("search.checkIn")}</label>
              <input
                data-testid="booking-input-checkin"
                type="date"
                value={form.checkIn}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => set("checkIn", e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{t("search.checkOut")}</label>
              <input
                data-testid="booking-input-checkout"
                type="date"
                value={form.checkOut}
                min={form.checkIn}
                onChange={(e) => set("checkOut", e.target.value)}
                className={inputCls}
                required
              />
            </div>
          </div>

          {/* Guests summary — read-only, comes from search */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className={labelCls}>{t("search.adults")}</label>
              <input
                data-testid="booking-input-adults"
                type="number"
                value={form.adults}
                min={1}
                max={20}
                onChange={(e) => set("adults", Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div className="flex-1">
              <label className={labelCls}>{t("search.children")}</label>
              <input
                data-testid="booking-input-children"
                type="number"
                value={form.children}
                min={0}
                max={10}
                onChange={(e) => set("children", Number(e.target.value))}
                className={inputCls}
              />
            </div>
          </div>

          {/* Message */}
          <div>
            <label className={labelCls}>{t("booking.message")}</label>
            <textarea
              data-testid="booking-input-message"
              value={form.message}
              onChange={(e) => set("message", e.target.value)}
              placeholder={t("booking.messagePlaceholder")}
              rows={3}
              className={inputCls + " resize-none"}
            />
          </div>

          {/* Submit */}
          <button
            data-testid="booking-btn-submit"
            type="submit"
            disabled={!isValid}
            className="flex items-center justify-center gap-3 w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-2xl transition-colors text-base mt-2"
          >
            <Send size={18} />
            {t("booking.submit")}
          </button>

          <p
            data-testid="booking-wa-note"
            className="text-center text-xs text-gray-400"
          >
            {t("booking.waNote")}
          </p>
        </motion.form>
      </div>
    </section>
  );
}
