import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { UserX, Plus, Search, Trash2, X, Upload, AlertTriangle } from 'lucide-react';

interface BlacklistEntry {
  id: string;
  nombre: string;
  ci_pasaporte: string | null;
  celular: string | null;
  observacion: string | null;
  foto_url: string | null;
  created_at: string;
  created_by: string | null;
}

const BUCKET = 'blacklist-photos';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-BO', { year: 'numeric', month: 'short', day: 'numeric' });
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

export default function BlacklistPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlacklistEntry | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({ nombre: '', ci_pasaporte: '', celular: '', observacion: '' });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchEntries() {
    setLoading(true);
    const { data } = await supabase
      .from('blacklist')
      .select('*')
      .order('created_at', { ascending: false });
    setEntries(data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchEntries(); }, []);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) { setFormError('El nombre es requerido.'); return; }
    setSaving(true);
    setFormError('');

    let foto_url: string | null = null;

    if (photoFile) {
      const ext = photoFile.name.split('.').pop() ?? 'jpg';
      const fname = `${slugify(form.nombre)}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(fname, photoFile, { contentType: photoFile.type, upsert: false });
      if (upErr) {
        setFormError('Error subiendo foto: ' + upErr.message);
        setSaving(false);
        return;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(fname);
      foto_url = pub.publicUrl;
    }

    const { error } = await supabase.from('blacklist').insert({
      nombre: form.nombre.trim(),
      ci_pasaporte: form.ci_pasaporte.trim() || null,
      celular: form.celular.trim() || null,
      observacion: form.observacion.trim() || null,
      foto_url,
      created_by: profile?.id ?? null,
    });

    if (error) {
      setFormError('Error guardando: ' + error.message);
      setSaving(false);
      return;
    }

    setForm({ nombre: '', ci_pasaporte: '', celular: '', observacion: '' });
    setPhotoFile(null);
    setPhotoPreview(null);
    setShowForm(false);
    setSaving(false);
    fetchEntries();
  }

  async function handleDelete(entry: BlacklistEntry) {
    setDeleting(entry.id);
    // Delete photo from storage if exists
    if (entry.foto_url) {
      const path = entry.foto_url.split(`/${BUCKET}/`)[1];
      if (path) await supabase.storage.from(BUCKET).remove([path]);
    }
    await supabase.from('blacklist').delete().eq('id', entry.id);
    setConfirmDelete(null);
    setDeleting(null);
    fetchEntries();
  }

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    return (
      e.nombre.toLowerCase().includes(q) ||
      (e.ci_pasaporte ?? '').toLowerCase().includes(q) ||
      (e.celular ?? '').includes(q)
    );
  });

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
            <UserX size={18} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Lista Negra</h1>
            <p className="text-xs text-gray-500">{entries.length} persona{entries.length !== 1 ? 's' : ''} registrada{entries.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormError(''); }}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Agregar
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, CI o celular…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <UserX size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? 'Sin resultados' : 'Sin registros aún'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => (
            <div
              key={entry.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex gap-4 shadow-sm"
            >
              {/* Photo */}
              <div
                className={`flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 ${entry.foto_url ? 'cursor-zoom-in' : ''}`}
                onClick={() => entry.foto_url && setLightbox(entry.foto_url)}
              >
                {entry.foto_url ? (
                  <img
                    src={entry.foto_url}
                    alt={entry.nombre}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).src = ''; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <UserX size={22} className="text-gray-300" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight">{entry.nombre}</h3>
                  {isAdmin && (
                    <button
                      onClick={() => setConfirmDelete(entry)}
                      className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                      title="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                  {entry.ci_pasaporte && <span>CI/Pas: <span className="text-gray-700 font-medium">{entry.ci_pasaporte}</span></span>}
                  {entry.celular && (
                    <span>
                      Cel:{' '}
                      <a
                        href={`https://wa.me/591${entry.celular.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-green-600 font-medium hover:underline"
                      >
                        {entry.celular}
                      </a>
                    </span>
                  )}
                </div>
                {entry.observacion && (
                  <p className="mt-1.5 text-xs text-red-700 bg-red-50 rounded-md px-2 py-1 leading-snug">
                    ⚠️ {entry.observacion}
                  </p>
                )}
                <p className="mt-1.5 text-[10px] text-gray-400">Agregado el {formatDate(entry.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="foto"
            className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl object-contain"
          />
        </div>
      )}

      {/* Add form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Nuevo registro</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
              {/* Photo upload */}
              <div
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg py-4 cursor-pointer hover:border-red-300 transition-colors"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="preview" className="h-24 object-contain rounded" />
                ) : (
                  <>
                    <Upload size={20} className="text-gray-300 mb-1" />
                    <span className="text-xs text-gray-400">Click para subir foto</span>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre completo *</label>
                <input
                  type="text"
                  required
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">CI / Pasaporte</label>
                  <input
                    type="text"
                    value={form.ci_pasaporte}
                    onChange={e => setForm(f => ({ ...f, ci_pasaporte: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Celular</label>
                  <input
                    type="text"
                    value={form.celular}
                    onChange={e => setForm(f => ({ ...f, celular: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Motivo / Observación</label>
                <textarea
                  rows={3}
                  value={form.observacion}
                  onChange={e => setForm(f => ({ ...f, observacion: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                />
              </div>

              {formError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors"
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">¿Eliminar registro?</p>
                <p className="text-xs text-gray-500">{confirmDelete.nombre}</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 mb-5">Esta acción no se puede deshacer. Se eliminará la foto también.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete.id}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors"
              >
                {deleting === confirmDelete.id ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
