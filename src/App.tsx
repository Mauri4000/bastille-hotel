import { useState } from "react";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Rooms from "./components/Rooms";
import BookingSearch from "./components/BookingSearch";
import type { BookingFilters } from "./components/BookingSearch";

const defaultFilters: BookingFilters = {
  checkIn: "",
  checkOut: "",
  rooms: [{ adults: 2, children: 0 }],
  hasPet: false,
};

export default function App() {
  const [filters, setFilters] = useState<BookingFilters>(defaultFilters);

  return (
    <main>
      <Navbar />
      <Hero />
      <BookingSearch onChange={setFilters} />
      <Rooms filters={filters} />
    </main>
  );
}
