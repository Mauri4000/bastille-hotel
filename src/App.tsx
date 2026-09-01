import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Public site
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Rooms from "./components/Rooms";
import BookingSearch from "./components/BookingSearch";
import Contact from "./components/Contact";
import BookingPage from "./pages/BookingPage";
import GalleryPage from "./pages/GalleryPage";
import ConferencePage from "./pages/ConferencePage";
import RooftopPage from "./pages/RooftopPage";
import SpanishSchoolPage from "./pages/SpanishSchoolPage";
import Footer from "./components/Footer";
import type { BookingFilters } from "./components/BookingSearch";

// Admin
import { AuthProvider } from "./admin/contexts/AuthContext";
import ProtectedRoute from "./admin/components/ProtectedRoute";
import AdminLayout from "./admin/components/AdminLayout";
import LoginPage from "./admin/pages/LoginPage";
import DashboardPage from "./admin/pages/DashboardPage";
import CalendarPage from "./admin/pages/CalendarPage";
import TransactionsPage from "./admin/pages/TransactionsPage";
import PettyCashPage from "./admin/pages/PettyCashPage";
import ShiftPage from "./admin/pages/ShiftPage";
import ReportesPage from "./admin/pages/ReportesPage";
import HistorialPage from "./admin/pages/HistorialPage";
import GuestDatabasePage from "./admin/pages/GuestDatabasePage";
import VitrinaPage from "./admin/pages/VitrinaPage";
import SpanishSchoolAdminPage from "./admin/pages/SpanishSchoolPage";
import LimpiezasPage from "./admin/pages/LimpiezasPage";
import BilletesPage from "./admin/pages/BilletesPage";
import MarketingPage from "./admin/pages/MarketingPage";
import PlanillasPage from "./admin/pages/PlanillasPage";
import ImpuestosPage from "./admin/pages/ImpuestosPage";

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
      <Footer />
    </>
  );
}

function AdminApp() {
  return (
    <AdminLayout>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="calendar"     element={<CalendarPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="petty-cash"   element={<PettyCashPage />} />
        <Route path="shift"        element={<ShiftPage />} />
        <Route path="reportes"     element={<ReportesPage />} />
        <Route path="historial"    element={<HistorialPage />} />
        <Route path="guests"       element={<GuestDatabasePage />} />
        <Route path="vitrina"      element={<VitrinaPage />} />
        <Route path="spanish"      element={<SpanishSchoolAdminPage />} />
        <Route path="limpiezas"    element={<LimpiezasPage />} />
        <Route path="billetes"     element={<BilletesPage />} />
        <Route path="marketing"    element={<MarketingPage />} />
        <Route path="planillas"    element={<PlanillasPage />} />
        <Route path="impuestos"    element={<ImpuestosPage />} />
      </Routes>
    </AdminLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public site */}
          <Route path="/"               element={<HomePage />} />
          <Route path="/booking"        element={<BookingPage />} />
          <Route path="/gallery"        element={<GalleryPage />} />
          <Route path="/conference"     element={<ConferencePage />} />
          <Route path="/rooftop"        element={<RooftopPage />} />
          <Route path="/spanish-school" element={<SpanishSchoolPage />} />

          {/* Admin */}
          <Route path="/admin/login"  element={<LoginPage />} />
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute>
                <AdminApp />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
