import { useEffect, useRef, useState } from 'react';
import { Plus, X, Pencil, Trash2, PackageSearch } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../../lib/logActivity';

interface DanoItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  photo_url: string | null;
  created_at: string;
}

interface FormState {
  name: string;
  description: string;
  price: string;
  file: File | null;
  previewUrl: string | null;
}

const EMPTY_FORM: FormState = { name: '', description: '', price: '', file: null, previewUrl: null };

export default function DanosPage() {
  const { profile } = useAuth();
  const [items, setItems]     = useState<DanoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<DanoItem | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [dragging, setDragging]   = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DanoItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchItems(); }, []);

  async function fetchItems() {
    setLoading(true);
    const { data } = await supabase
      .from('danos_items')
      .select('*')
      .order('name');
    setItems(data ?? []);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  }

  function openEdit(item: DanoItem) {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description ?? '',
      price: String(item.price),
      file: null,
      previewUrl: item.photo_url,
    });
    setError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  function setFile(f: File) {
    setForm(prev => ({ ...prev, file: f, previewUrl: URL.createObjectURL(f) }));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) setFile(f);
  }

  async function uploadPhoto(file: File): Promise<string | null> {
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('danos-photos').upload(path, file, { upsert: true, contentType: file.type });
    if (error) return null;
    const { data } = supabase.storage.from('danos-photos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) { setError('Precio inválido.'); return; }

    setSaving(true); setError('');
    let photoUrl = editing?.photo_url ?? null;
    if (form.file) {
      const url = await uploadPhoto(form.file);
      if (url) photoUrl = url;
    }

    const payload = {
      name:        form.name.trim(),
      description: form.description.trim() || null,
      price,
      photo_url:   photoUrl,
    };

    if (editing) {
      await supabase.from('danos_items').update(payload).eq('id', editing.id);
      logActivity(profile?.id, profile?.name, 'Editó ítem daños', 'dano', editing.id, form.name);
    } else {
      await supabase.from('danos_items').insert(payload);
      logActivity(profile?.id, profile?.name, 'Agregó ítem daños', 'dano', undefined, form.name);
    }

    setSaving(false);
    closeModal();
    fetchItems();
  }

  async function handleDelete(item: DanoItem) {
    await supabase.from('danos_items').delete().eq('id', item.id);
    logActivity(profile?.id, profile?.name, 'Eliminó ítem daños', 'dano', item.id, item.name);
    setDeleteConfirm(null);
    fetchItems();
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-amber-400 transition-colors';
  const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔧 Cosas Perdidas / Dañadas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Inventario de ítems con precio para cobrar a huéspedes</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold text-sm px-4 py-2 rounded-xl transition-colors">
          <Plus size={16} /> Agregar ítem
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-300 gap-3">
          <PackageSearch size={48} />
          <p className="text-sm font-medium text-gray-400">No hay ítems registrados aún</p>
          <button onClick={openNew}
            className="text-sm text-amber-500 hover:text-amber-400 font-semibold underline underline-offset-4">
            Agregar el primero
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map(item => (
            <div key={item.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
              {/* Photo */}
              <div className="relative h-36 bg-gray-50">
                {item.photo_url ? (
                  <img src={item.photo_url} alt={item.name}
                    className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-200">
                    <PackageSearch size={32} />
                  </div>
                )}
                {/* Actions overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button onClick={() => openEdit(item)}
                    className="bg-white/90 hover:bg-white text-gray-800 rounded-full p-1.5 transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => setDeleteConfirm(item)}
                    className="bg-white/90 hover:bg-red-500 hover:text-white text-gray-800 rounded-full p-1.5 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {/* Info */}
              <div className="p-3">
                <p className="text-sm font-bold text-gray-800 truncate">{item.name}</p>
                {item.description && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{item.description}</p>
                )}
                <p className="text-base font-bold text-red-500 mt-1">Bs. {item.price.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {editing ? 'Editar ítem' : 'Nuevo ítem'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Photo drop zone */}
              <div>
                <label className={labelCls}>Foto</label>
                <div
                  onClick={() => inputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  className={`relative rounded-xl border-2 border-dashed cursor-pointer overflow-hidden transition-all ${
                    dragging ? 'border-amber-400 bg-amber-50 scale-[1.01]' : form.previewUrl ? 'border-sky-300' : 'border-gray-200 hover:border-amber-300'
                  }`}
                  style={{ height: 140 }}>
                  {form.previewUrl ? (
                    <>
                      <img src={form.previewUrl} alt="preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                        <p className="text-white text-xs font-semibold">Cambiar foto</p>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5"
                      style={{ color: dragging ? '#f59e0b' : '#d1d5db' }}>
                      <PackageSearch size={28} />
                      <span className="text-xs font-medium">{dragging ? 'Suelta aquí' : 'Arrastrá o click para subir foto'}</span>
                    </div>
                  )}
                </div>
                <input ref={inputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
              </div>

              {/* Name */}
              <div>
                <label className={labelCls}>Nombre *</label>
                <input type="text" value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Control remoto TV"
                  className={inputCls} />
              </div>

              {/* Description */}
              <div>
                <label className={labelCls}>Descripción</label>
                <input type="text" value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Ej: Control Samsung habitación estándar"
                  className={inputCls} />
              </div>

              {/* Price */}
              <div>
                <label className={labelCls}>Precio (Bs.) *</label>
                <input type="number" min="0" step="0.50" value={form.price}
                  onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                  placeholder="0.00"
                  className={inputCls} />
              </div>

              {error && <p className="text-red-500 text-xs">{error}</p>}
            </div>

            <div className="flex gap-3 px-6 pb-5">
              <button onClick={closeModal}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-gray-900 text-sm font-bold py-2.5 rounded-xl transition-colors">
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <p className="text-lg font-bold text-gray-900 mb-1">¿Eliminar ítem?</p>
            <p className="text-sm text-gray-500 mb-5">"{deleteConfirm.name}" se eliminará permanentemente.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white text-sm font-bold py-2.5 rounded-xl transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
