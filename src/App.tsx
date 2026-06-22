import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Rooms from "./components/Rooms";
import BookingSearch from "./components/BookingSearch";
import Contact from "./components/Contact";
import BookingPage from "./pages/BookingPage";
import type { BookingFilters } from "./components/BookingSearch";

const defaultFilters: BookingFilters = {
  checkIn: "",
  checkOut: "",
  rooms: [{ adults: 2, children: 0 }],
  hasPet: false,
};

function HomePage() {
  const [filters, setFilters] = useState<BookingFilters>(defaultFilters);

  return (
    <>
      <Navbar />
      <Hero />
      <BookingSearch onChange={setFilters} />
      <Rooms filters={filters} />
      <Contact />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/booking" element={<BookingPage />} />
      </Routes>
    </BrowserRouter>
  );
}
