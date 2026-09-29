import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Eye, Bot, Share2, Trash2, Mail } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

interface Section {
  icon: React.ElementType;
  title: string;
  content: React.ReactNode;
}

export default function PrivacyPage() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language?.startsWith('es') ? 'es' : i18n.language?.startsWith('fr') ? 'fr' : 'en';

  const updated = "29 de septiembre de 2026";

  const sections: Section[] = [
    {
      icon: Eye,
      title: lang === 'es' ? '1. Datos que recopilamos' : lang === 'fr' ? '1. Données collectées' : '1. Data We Collect',
      content: lang === 'es' ? (
        <ul className="space-y-2 list-disc list-inside text-gray-400">
          <li>Nombre completo del huésped</li>
          <li>Número de documento de identidad o pasaporte</li>
          <li>Número de teléfono y/o correo electrónico (si se proporcionan)</li>
          <li>Fechas de check-in y check-out</li>
          <li>Número de personas hospedadas</li>
          <li>Datos de navegación anónimos (páginas visitadas, idioma del navegador)</li>
        </ul>
      ) : lang === 'fr' ? (
        <ul className="space-y-2 list-disc list-inside text-gray-400">
          <li>Nom complet de l'hôte</li>
          <li>Numéro de document d'identité ou passeport</li>
          <li>Numéro de téléphone et/ou adresse e-mail (si fournis)</li>
          <li>Dates d'arrivée et de départ</li>
          <li>Nombre de personnes hébergées</li>
          <li>Données de navigation anonymes (pages visitées, langue du navigateur)</li>
        </ul>
      ) : (
        <ul className="space-y-2 list-disc list-inside text-gray-400">
          <li>Guest full name</li>
          <li>Identity document number or passport</li>
          <li>Phone number and/or email address (if provided)</li>
          <li>Check-in and check-out dates</li>
          <li>Number of guests</li>
          <li>Anonymous browsing data (pages visited, browser language)</li>
        </ul>
      ),
    },
    {
      icon: Shield,
      title: lang === 'es' ? '2. Cómo usamos tus datos' : lang === 'fr' ? '2. Utilisation des données' : '2. How We Use Your Data',
      content: (
        <p className="text-gray-400 leading-relaxed">
          {lang === 'es'
            ? 'Utilizamos tus datos exclusivamente para gestionar tu reserva, cumplir con las obligaciones legales de registro de huéspedes en Bolivia (Ley 2206 y normativa migratoria), y mejorar nuestros servicios. No utilizamos tus datos para publicidad ni los vendemos a terceros.'
            : lang === 'fr'
            ? 'Nous utilisons vos données exclusivement pour gérer votre réservation, respecter les obligations légales d\'enregistrement des hôtes en Bolivie, et améliorer nos services. Nous n\'utilisons pas vos données à des fins publicitaires et ne les vendons pas à des tiers.'
            : 'We use your data exclusively to manage your reservation, comply with Bolivia\'s legal guest registration obligations, and improve our services. We do not use your data for advertising purposes or sell it to third parties.'}
        </p>
      ),
    },
    {
      icon: Bot,
      title: lang === 'es' ? '3. Uso de Inteligencia Artificial' : lang === 'fr' ? '3. Utilisation de l\'IA' : '3. Use of Artificial Intelligence',
      content: (
        <p className="text-gray-400 leading-relaxed">
          {lang === 'es'
            ? 'Bastille Hotel utiliza herramientas de inteligencia artificial (IA) en algunos procesos internos de gestión y comunicación. Ninguna decisión automatizada que te afecte directamente es tomada exclusivamente por IA sin supervisión humana.'
            : lang === 'fr'
            ? 'Bastille Hotel utilise des outils d\'intelligence artificielle (IA) dans certains processus internes de gestion et de communication. Aucune décision automatisée vous concernant directement n\'est prise exclusivement par IA sans supervision humaine.'
            : 'Bastille Hotel uses artificial intelligence (AI) tools in some internal management and communication processes. No automated decision directly affecting you is made exclusively by AI without human oversight.'}
        </p>
      ),
    },
    {
      icon: Share2,
      title: lang === 'es' ? '4. Terceros que pueden acceder a tus datos' : lang === 'fr' ? '4. Tiers ayant accès à vos données' : '4. Third Parties With Access to Your Data',
      content: (
        <div className="space-y-3">
          <p className="text-gray-400">
            {lang === 'es'
              ? 'Para operar este sitio web y nuestro sistema de reservas, trabajamos con los siguientes proveedores:'
              : lang === 'fr'
              ? 'Pour exploiter ce site web et notre système de réservation, nous travaillons avec les fournisseurs suivants :'
              : 'To operate this website and our reservation system, we work with the following providers:'}
          </p>
          <ul className="space-y-2 list-disc list-inside text-gray-400">
            <li>
              <strong className="text-gray-300">Supabase</strong> —{' '}
              {lang === 'es' ? 'Base de datos y autenticación (servidores en EE.UU.)' : lang === 'fr' ? 'Base de données et authentification (serveurs aux États-Unis)' : 'Database and authentication (servers in the USA)'}
            </li>
            <li>
              <strong className="text-gray-300">Vercel</strong> —{' '}
              {lang === 'es' ? 'Alojamiento web (servidores en EE.UU.)' : lang === 'fr' ? 'Hébergement web (serveurs aux États-Unis)' : 'Web hosting (servers in the USA)'}
            </li>
          </ul>
          <p className="text-gray-500 text-sm">
            {lang === 'es'
              ? 'Estos proveedores solo acceden a los datos necesarios para prestar sus servicios y están sujetos a sus propias políticas de privacidad.'
              : lang === 'fr'
              ? 'Ces fournisseurs n\'accèdent qu\'aux données nécessaires à la prestation de leurs services et sont soumis à leurs propres politiques de confidentialité.'
              : 'These providers only access the data necessary to provide their services and are subject to their own privacy policies.'}
          </p>
        </div>
      ),
    },
    {
      icon: Trash2,
      title: lang === 'es' ? '5. Tus derechos: borrar tus datos' : lang === 'fr' ? '5. Vos droits : suppression de données' : '5. Your Rights: Data Deletion',
      content: (
        <div className="space-y-3">
          <p className="text-gray-400 leading-relaxed">
            {lang === 'es'
              ? 'Tienes derecho a solicitar la eliminación de tus datos personales de nuestros sistemas. Una vez recibida tu solicitud, eliminaremos tu información en un plazo máximo de 30 días, salvo que la ley boliviana nos obligue a conservarla por un período determinado (por ejemplo, registros de huéspedes requeridos por migración).'
              : lang === 'fr'
              ? 'Vous avez le droit de demander la suppression de vos données personnelles de nos systèmes. Une fois votre demande reçue, nous supprimerons vos informations dans un délai maximum de 30 jours, sauf si la loi bolivienne nous oblige à les conserver pendant une période déterminée.'
              : 'You have the right to request the deletion of your personal data from our systems. Once your request is received, we will delete your information within a maximum of 30 days, unless Bolivian law requires us to retain it for a specified period (e.g., guest records required by immigration authorities).'}
          </p>
          <div className="bg-amber-400/10 border border-amber-400/30 rounded-lg p-4 flex items-start gap-3">
            <Mail className="text-amber-400 mt-0.5 shrink-0" size={18} />
            <p className="text-gray-300 text-sm">
              {lang === 'es' ? 'Para solicitar la eliminación de tus datos, escríbenos a: ' : lang === 'fr' ? 'Pour demander la suppression de vos données, écrivez-nous à : ' : 'To request data deletion, contact us at: '}
              <a href="mailto:info@bastillehotelsucre.com" className="text-amber-400 hover:underline">
                info@bastillehotelsucre.com
              </a>
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-stone-950">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 text-sm uppercase tracking-widest"
          >
            <ArrowLeft size={16} />
            {lang === 'es' ? 'Volver' : lang === 'fr' ? 'Retour' : 'Back'}
          </button>

          <div className="flex items-center gap-3 mb-4">
            <Shield className="text-amber-400" size={28} />
            <h1 className="text-3xl md:text-4xl font-bold text-white uppercase tracking-widest">
              {lang === 'es' ? 'Política de Privacidad' : lang === 'fr' ? 'Politique de Confidentialité' : 'Privacy Policy'}
            </h1>
          </div>
          <p className="text-gray-500 text-sm">
            {lang === 'es' ? `Última actualización: ${updated}` : lang === 'fr' ? `Dernière mise à jour : ${updated}` : `Last updated: September 29, 2026`}
          </p>
          <p className="text-gray-400 mt-4 leading-relaxed">
            {lang === 'es'
              ? 'En Bastille Hotel nos tomamos tu privacidad en serio. Esta política explica qué datos recopilamos, cómo los usamos y cuáles son tus derechos.'
              : lang === 'fr'
              ? 'Chez Bastille Hotel, nous prenons votre confidentialité au sérieux. Cette politique explique quelles données nous collectons, comment nous les utilisons et quels sont vos droits.'
              : 'At Bastille Hotel we take your privacy seriously. This policy explains what data we collect, how we use it, and what your rights are.'}
          </p>
        </div>
      </section>

      <div className="border-t border-white/5" />

      {/* Sections */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto space-y-10">
          {sections.map(({ icon: Icon, title, content }) => (
            <div key={title} className="border border-white/10 rounded-xl p-8 bg-white/[0.02]">
              <div className="flex items-center gap-3 mb-5">
                <Icon size={20} className="text-amber-400 shrink-0" />
                <h2 className="text-white text-lg font-semibold uppercase tracking-widest">{title}</h2>
              </div>
              {content}
            </div>
          ))}

          {/* Contact */}
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">
              {lang === 'es' ? '¿Preguntas sobre esta política?' : lang === 'fr' ? 'Des questions sur cette politique ?' : 'Questions about this policy?'}{' '}
              <a href="mailto:info@bastillehotelsucre.com" className="text-amber-400 hover:underline">
                info@bastillehotelsucre.com
              </a>
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
