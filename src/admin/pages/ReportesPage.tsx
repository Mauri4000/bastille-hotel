import { useState } from 'react';
import { FileText, Send, RefreshCw, CheckCircle, AlertCircle, Eye } from 'lucide-react';

const API = 'http://localhost:5001';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function mondayStr() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

export default function ReportesPage() {
  const [fromDate, setFromDate] = useState(mondayStr());
  const [toDate, setToDate]     = useState(todayStr());
  const [pdfUrl, setPdfUrl]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [sendMsg, setSendMsg]   = useState<string | null>(null);

  async function handleGenerar() {
    setLoading(true);
    setError(null);
    setPdfUrl(null);
    setSent(false);
    setSendMsg(null);
    try {
      const url = `${API}/api/generate?from=${fromDate}&to=${toDate}`;
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({ message: 'Error desconocido' }));
        throw new Error(j.message ?? 'Error al generar el PDF');
      }
      const blob = await res.blob();
      setPdfUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setError(e.message ?? 'No se pudo conectar al servidor local.\nAsegúrate de correr: python scripts/api_server.py');
    } finally {
      setLoading(false);
    }
  }

  async function handleEnviar() {
    setSending(true);
    setError(null);
    setSendMsg(null);
    try {
      const url = `${API}/api/send?from=${fromDate}&to=${toDate}`;
      const res = await fetch(url);
      const j   = await res.json();
      if (!j.ok) throw new Error(j.message ?? 'Error al enviar');
      setSent(true);
      setSendMsg(j.message ?? 'Correo enviado.');
    } catch (e: any) {
      setError(e.message ?? 'Error al enviar el correo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-sm text-gray-500 mt-1">Genera y envía el Parte Diario a la Secretaría de Culturas y Turismo.</p>
      </div>

      {/* Card: Parte Diario */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
            <FileText size={18} className="text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Parte Diario</h2>
            <p className="text-xs text-gray-500">Formato oficial — Secretaría de Culturas y Turismo de Sucre</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Date range */}
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => { setFromDate(e.target.value); setPdfUrl(null); setSent(false); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
              <input
                type="date"
                value={toDate}
                onChange={e => { setToDate(e.target.value); setPdfUrl(null); setSent(false); }}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerar}
              disabled={loading || !fromDate || !toDate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-500 text-gray-900 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Eye size={16} />
              )}
              {loading ? 'Generando...' : 'Generar Parte Diario'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm whitespace-pre-line">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* API server hint */}
          {!pdfUrl && !loading && !error && (
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-700">Requisito previo</p>
              <p>El servidor local debe estar corriendo para generar y enviar el PDF:</p>
              <code className="block bg-gray-100 rounded px-3 py-1.5 text-gray-800 font-mono mt-1">
                python scripts/api_server.py
              </code>
            </div>
          )}

          {/* PDF Preview */}
          {pdfUrl && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Eye size={15} className="text-gray-400" />
                  Vista previa del documento
                </p>
                <a
                  href={pdfUrl}
                  download={`PARTE_DIARIA_${fromDate}_${toDate}.pdf`}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium underline"
                >
                  Descargar PDF
                </a>
              </div>
              <iframe
                src={pdfUrl}
                className="w-full rounded-lg border border-gray-200"
                style={{ height: '600px' }}
                title="Vista previa Parte Diario"
              />

              {/* Send button */}
              {!sent ? (
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleEnviar}
                    disabled={sending}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <RefreshCw size={15} className="animate-spin" />
                    ) : (
                      <Send size={15} />
                    )}
                    {sending ? 'Enviando...' : 'Enviar por correo'}
                  </button>
                  <p className="text-xs text-gray-400">
                    Revisa el documento antes de enviar.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  <span>{sendMsg ?? 'Correo enviado correctamente.'}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Coming soon: Parte Mensual */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm opacity-60">
        <div className="flex items-center gap-3 px-6 py-4">
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
            <FileText size={18} className="text-gray-400" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-500">Parte Mensual</h2>
            <p className="text-xs text-gray-400">Próximamente</p>
          </div>
        </div>
      </div>
    </div>
  );
}
