import { useEffect, useState, useCallback, useRef } from 'react';
import type { FormEvent, DragEvent } from 'react';
import { Plus, Minus, Search, Package, RefreshCw, Trash2, X, UploadCloud, CalendarClock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../../lib/logActivity';
import DatePicker from '../components/DatePicker';

type Category = 'higiene' | 'alimentos';

interface VitrinaProduct {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_filename: string;
  expiration_date: string | null;
  category: Category;
}

// Devuelve la URL para mostrar la imagen: si es una subida (URL completa de
// Supabase Storage) se usa tal cual; si es un nombre de archivo de los
// productos originales, se busca en /public/vitrinas.
function imageSrc(filename: string) {
  if (!filename) return '';
  return /^https?:\/\//.test(filename) ? filename : `/vitrinas/${filename}`;
}

function daysUntil(dateStr: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// Switch deslizable Higiene / Alimentos
function CategorySwitch({ value, onChange, small = false }: {
  value: Category;
  onChange: (c: Category) => void;
  small?: boolean;
}) {
  return (
    <div className={`relative inline-flex w-full items-center rounded-full bg-gray-100 p-0.5 select-none ${small ? 'text-[10px]' : 'text-sm'}`}>
      <div
        className="absolute top-0.5 bottom-0.5 left-0.5 rounded-full bg-white shadow transition-transform duration-200 ease-out"
        style={{ width: 'calc(50% - 2px)', transform: value === 'alimentos' ? 'translateX(100%)' : 'translateX(0)' }}
      />
      <button
        type="button"
        onClick={() => onChange('higiene')}
        className={`relative z-10 flex-1 rounded-full font-semibold transition-colors ${small ? 'py-1' : 'py-1.5'} ${
          value === 'higiene' ? 'text-sky-600' : 'text-gray-400'
        }`}
      >
        Higiene
      </button>
      <button
        type="button"
        onClick={() => onChange('alimentos')}
        className={`relative z-10 flex-1 rounded-full font-semibold transition-colors ${small ? 'py-1' : 'py-1.5'} ${
          value === 'alimentos' ? 'text-emerald-600' : 'text-gray-400'
        }`}
      >
        Alimentos
      </button>
    </div>
  );
}

export default function VitrinaPage() {
  const { profile } = useAuth();
  const [products,  setProducts]  = useState<VitrinaProduct[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [tab,       setTab]       = useState<'todos' | Category>('higiene');
  const [saving,    setSaving]    = useState<Record<string, boolean>>({});
  const [pending,   setPending]   = useState<Record<string, number>>({}); // unsaved qty changes

  const [fetchError, setFetchError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [adding,        setAdding]      = useState(false);
  const [addError,      setAddError]    = useState<string | null>(null);
  const [uploading,     setUploading]   = useState(false);
  const [dragOver,      setDragOver]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emptyForm = { name: '', price: '', quantity: '', image_filename: '', expiration_date: '', category: 'higiene' as Category };
  const [form, setForm] = useState(emptyForm);

  const [editingExpiry, setEditingExpiry] = useState<string | null>(null); // product id

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('vitrina_products')
      .select('*')
      .order('name');
    if (error) setFetchError(error.message);
    setProducts(data ?? []);
    setPending({});
    setLoading(false);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  function qtyFor(p: VitrinaProduct) {
    return pending[p.id] !== undefined ? pending[p.id] : p.quantity;
  }

  function change(p: VitrinaProduct, delta: number) {
    const current = qtyFor(p);
    const next = Math.max(0, current + delta);
    setPending(prev => ({ ...prev, [p.id]: next }));
  }

  async function saveOne(p: VitrinaProduct) {
    const newQty = pending[p.id];
    if (newQty === undefined || newQty === p.quantity) return;
    setSaving(prev => ({ ...prev, [p.id]: true }));
    await supabase
      .from('vitrina_products')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    logActivity(profile?.id, profile?.name, 'Stock actualizado', 'vitrina', p.id, `${p.name}: ${p.quantity} → ${newQty}`);
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, quantity: newQty } : x));
    setPending(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    setSaving(prev => ({ ...prev, [p.id]: false }));
  }

  async function deleteProduct(p: VitrinaProduct) {
    if (!window.confirm(`¿Eliminar "${p.name}" de la vitrina? Esta acción no se puede deshacer.`)) return;
    setSaving(prev => ({ ...prev, [p.id]: true }));
    const { error } = await supabase.from('vitrina_products').delete().eq('id', p.id);
    if (error) {
      setFetchError(error.message);
      setSaving(prev => ({ ...prev, [p.id]: false }));
      return;
    }
    logActivity(profile?.id, profile?.name, 'Producto eliminado', 'vitrina', p.id, p.name);
    setProducts(prev => prev.filter(x => x.id !== p.id));
    setPending(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    setSaving(prev => { const n = { ...prev }; delete n[p.id]; return n; });
  }

  function openAddModal() {
    setForm(emptyForm);
    setAddError(null);
    setShowAddModal(true);
  }

  async function uploadImage(file: File) {
    if (!file.type.startsWith('image/')) {
      setAddError('Selecciona un archivo de imagen válido.');
      return;
    }
    setUploading(true);
    setAddError(null);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('vitrina-images').upload(path, file);
    if (error) {
      setUploading(false);
      setAddError(`No se pudo subir la imagen: ${error.message}`);
      return;
    }
    const { data: pub } = supabase.storage.from('vitrina-images').getPublicUrl(path);
    setForm(f => ({ ...f, image_filename: pub.publicUrl }));
    setUploading(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadImage(file);
  }

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const price = parseFloat(form.price);
    const quantity = parseInt(form.quantity, 10) || 0;
    if (!name) { setAddError('El nombre es obligatorio.'); return; }
    if (isNaN(price) || price < 0) { setAddError('Ingresa un precio válido.'); return; }

    setAdding(true);
    setAddError(null);
    const { data, error } = await supabase
      .from('vitrina_products')
      .insert({
        name,
        price,
        quantity,
        image_filename: form.image_filename.trim(),
        expiration_date: form.expiration_date || null,
        category: form.category,
      })
      .select()
      .single();
    setAdding(false);
    if (error) { setAddError(error.message); return; }

    logActivity(profile?.id, profile?.name, 'Producto agregado', 'vitrina', data.id, `${name} (${quantity} ud, Bs. ${price})`);
    setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setShowAddModal(false);
  }

  async function updateExpiration(p: VitrinaProduct, newDate: string) {
    const value = newDate || null;
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, expiration_date: value } : x));
    setEditingExpiry(null);
    const { error } = await supabase
      .from('vitrina_products')
      .update({ expiration_date: value, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    if (error) { setFetchError(error.message); return; }
    logActivity(profile?.id, profile?.name, 'Vencimiento actualizado', 'vitrina', p.id, `${p.name}: ${value ?? 'sin fecha'}`);
  }

  async function setCategory(p: VitrinaProduct, next: Category) {
    if (next === p.category) return;
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, category: next } : x));
    const { error } = await supabase
      .from('vitrina_products')
      .update({ category: next, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    if (error) { setFetchError(error.message); return; }
    logActivity(profile?.id, profile?.name, 'Categoría actualizada', 'vitrina', p.id, `${p.name}: ${next}`);
  }

  async function saveAll() {
    const changed = Object.keys(pending);
    if (changed.length === 0) return;
    for (const id of changed) {
      const p = products.find(x => x.id === id);
      if (p) await saveOne(p);
    }
  }

  const filtered = products
    .filter(p => tab === 'todos' || p.category === tab)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const hasPending = Object.keys(pending).length > 0;
  const higieneCount   = products.filter(p => p.category === 'higiene').length;
  const alimentosCount = products.filter(p => p.category === 'alimentos').length;
  const totalItems = filtered.reduce((s, p) => s + p.quantity, 0);
  const totalValue = filtered.reduce((s, p) => s + p.price * p.quantity, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stock Vitrina</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} productos · {totalItems} unidades · Bs. {totalValue.toFixed(2)} valor total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchProducts} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500">
            <RefreshCw size={16} />
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo producto
          </button>
          {hasPending && (
            <button
              onClick={saveAll}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold text-sm rounded-lg transition-colors"
            >
              Guardar cambios ({Object.keys(pending).length})
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {([
          ['higiene', 'Higiene', higieneCount],
          ['alimentos', 'Alimentos', alimentosCount],
          ['todos', 'Todos', products.length],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-amber-400 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {label} <span className="text-xs font-normal text-gray-400">({count})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar producto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          Error: {fetchError}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map(p => {
            const qty    = qtyFor(p);
            const isDirty = pending[p.id] !== undefined && pending[p.id] !== p.quantity;
            const isSaving = saving[p.id];
            return (
              <div
                key={p.id}
                className={`bg-white rounded-2xl shadow-sm border transition-all ${
                  isDirty ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-200'
                }`}
              >
                {/* Image */}
                <div className="relative">
                  <img
                    src={imageSrc(p.image_filename)}
                    alt={p.name}
                    className="w-full h-32 object-cover rounded-t-2xl bg-gray-100"
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div className="hidden w-full h-32 rounded-t-2xl bg-gray-100 flex items-center justify-center">
                    <Package size={32} className="text-gray-300" />
                  </div>
                  {/* Stock badge */}
                  <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    qty === 0 ? 'bg-red-500 text-white' : qty <= 2 ? 'bg-orange-400 text-white' : 'bg-green-500 text-white'
                  }`}>
                    {qty === 0 ? 'Agotado' : `${qty} ud`}
                  </div>
                  {/* Delete button */}
                  <button
                    onClick={() => deleteProduct(p)}
                    disabled={isSaving}
                    className="absolute top-2 left-2 w-6 h-6 rounded-full bg-white/90 hover:bg-red-500 text-gray-500 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
                    title="Eliminar producto"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Info */}
                <div className="p-2.5">
                  <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                  <p className="text-sm font-bold text-amber-600 mt-1">Bs. {p.price.toFixed(2)}</p>

                  {/* Category */}
                  <div className="mt-1.5">
                    <CategorySwitch value={p.category} onChange={c => setCategory(p, c)} small />
                  </div>

                  {/* Expiration */}
                  <div className="mt-1.5">
                    {editingExpiry === p.id ? (
                      <DatePicker
                        value={p.expiration_date ?? ''}
                        onChange={v => updateExpiration(p, v)}
                        placeholder="Vencimiento"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingExpiry(p.id)}
                        className={`w-full flex items-center gap-1 text-[11px] font-medium rounded-lg px-2 py-1 transition-colors ${
                          !p.expiration_date
                            ? 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
                            : daysUntil(p.expiration_date) < 0
                            ? 'text-red-600 bg-red-50 hover:bg-red-100'
                            : daysUntil(p.expiration_date) <= 30
                            ? 'text-orange-600 bg-orange-50 hover:bg-orange-100'
                            : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <CalendarClock size={12} />
                        {p.expiration_date
                          ? `Vence ${p.expiration_date.split('-').reverse().join('/')}`
                          : 'Agregar vencimiento'}
                      </button>
                    )}
                  </div>

                  {/* Qty controls */}
                  <div className="flex items-center justify-between mt-2 gap-1">
                    <button
                      onClick={() => change(p, -1)}
                      disabled={qty === 0}
                      className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 flex items-center justify-center disabled:opacity-30 transition-colors"
                    >
                      <Minus size={13} />
                    </button>
                    <span className={`text-sm font-bold w-8 text-center ${isDirty ? 'text-amber-600' : 'text-gray-900'}`}>
                      {qty}
                    </span>
                    <button
                      onClick={() => change(p, +1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-green-100 text-gray-600 hover:text-green-600 flex items-center justify-center transition-colors"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  {/* Save individual */}
                  {isDirty && (
                    <button
                      onClick={() => saveOne(p)}
                      disabled={isSaving}
                      className="w-full mt-2 py-1 text-[11px] font-semibold bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-lg transition-colors disabled:opacity-60"
                    >
                      {isSaving ? '...' : '✓ Guardar'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-400">
              <Package size={40} className="mx-auto mb-2 opacity-30" />
              <p>No se encontraron productos</p>
            </div>
          )}
        </div>
      )}

      {/* Add product modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Nuevo producto</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input
                  type="text"
                  autoFocus
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="Ej. CHOCOLATE PEQUEÑO"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
                <CategorySwitch value={form.category} onChange={c => setForm(f => ({ ...f, category: c }))} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Precio (Bs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="0"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Foto del producto</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`relative flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl px-3 py-4 text-center cursor-pointer transition-colors ${
                    dragOver ? 'border-amber-400 bg-amber-50' : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {form.image_filename ? (
                    <img src={imageSrc(form.image_filename)} alt="preview" className="h-20 w-20 object-cover rounded-lg" />
                  ) : uploading ? (
                    <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <UploadCloud size={22} className="text-gray-400" />
                  )}
                  <p className="text-[11px] text-gray-500">
                    {uploading ? 'Subiendo...' : form.image_filename ? 'Clic o arrastra para cambiar la imagen' : 'Arrastra una imagen o haz clic para elegirla'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de vencimiento (opcional)</label>
                <DatePicker
                  value={form.expiration_date}
                  onChange={v => setForm(f => ({ ...f, expiration_date: v }))}
                  placeholder="Sin vencimiento"
                />
              </div>

              {addError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {addError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={adding || uploading}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-60"
                >
                  {adding ? 'Guardando...' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
