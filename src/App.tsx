import { lazy, Suspense, useState } from "react";
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

// Admin (always needed)
import { AuthProvider } from "./admin/contexts/AuthContext";
import ProtectedRoute from "./admin/components/ProtectedRoute";
import AdminLayout from "./admin/components/AdminLayout";
import LoginPage from "./admin/pages/LoginPage";

// Admin pages — lazy loaded per route
const DashboardPage        = lazy(() => import("./admin/pages/DashboardPage"));
const CalendarPage         = lazy(() => import("./admin/pages/CalendarPage"));
const TransactionsPage     = lazy(() => import("./admin/pages/TransactionsPage"));
const PettyCashPage        = lazy(() => import("./admin/pages/PettyCashPage"));
const ShiftPage            = lazy(() => import("./admin/pages/ShiftPage"));
const ReportesPage         = lazy(() => import("./admin/pages/ReportesPage"));
const HistorialPage        = lazy(() => import("./admin/pages/HistorialPage"));
const GuestDatabasePage    = lazy(() => import("./admin/pages/GuestDatabasePage"));
const VitrinaPage          = lazy(() => import("./admin/pages/VitrinaPage"));
const SpanishSchoolAdminPage = lazy(() => import("./admin/pages/SpanishSchoolPage"));
const LimpiezasPage        = lazy(() => import("./admin/pages/LimpiezasPage"));
const BilletesPage         = lazy(() => import("./admin/pages/BilletesPage"));
const MarketingPage        = lazy(() => import("./admin/pages/MarketingPage"));
const MarketingCalendarPage = lazy(() => import("./admin/pages/MarketingCalendarPage"));
const PlanillasPage        = lazy(() => import("./admin/pages/PlanillasPage"));
const ImpuestosPage        = lazy(() => import("./admin/pages/ImpuestosPage"));
const PreciosPage          = lazy(() => import("./admin/pages/PreciosPage"));

// Spinner shown while lazy page loads
function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

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
      <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route index                          element={<DashboardPage />} />
          <Route path="calendar"                element={<CalendarPage />} />
          <Route path="transactions"            element={<TransactionsPage />} />
          <Route path="petty-cash"              element={<PettyCashPage />} />
          <Route path="shift"                   element={<ShiftPage />} />
          <Route path="reportes"                element={<ReportesPage />} />
          <Route path="historial"               element={<HistorialPage />} />
          <Route path="guests"                  element={<GuestDatabasePage />} />
          <Route path="vitrina"                 element={<VitrinaPage />} />
          <Route path="spanish"                 element={<SpanishSchoolAdminPage />} />
          <Route path="limpiezas"               element={<LimpiezasPage />} />
          <Route path="billetes"                element={<BilletesPage />} />
          <Route path="marketing"               element={<MarketingPage />} />
          <Route path="marketing-calendar"      element={<MarketingCalendarPage />} />
          <Route path="planillas"               element={<PlanillasPage />} />
          <Route path="impuestos"               element={<ImpuestosPage />} />
          <Route path="precios"                 element={<PreciosPage />} />
        </Routes>
      </Suspense>
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
