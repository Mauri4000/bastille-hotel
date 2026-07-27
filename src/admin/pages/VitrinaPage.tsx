import { useEffect, useState, useCallback, useRef } from 'react';
import type { FormEvent, DragEvent } from 'react';
import { Plus, Minus, Search, Package, RefreshCw, Trash2, X, UploadCloud, Pencil, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../../lib/logActivity';
import DatePicker from '../components/DatePicker';

type Location =
  | 'vitrina_recepcion'
  | 'vitrina_ascensor'
  | 'baulera1'
  | 'baulera2'
  | 'baulera3'
  | 'cocina'
  | 'administracion';

const LOCATIONS: { value: Location; label: string }[] = [
  { value: 'vitrina_recepcion', label: 'Vitrina Recepción' },
  { value: 'vitrina_ascensor',  label: 'Vitrina Ascensor' },
  { value: 'baulera1',          label: 'Baulera 1' },
  { value: 'baulera2',          label: 'Baulera 2' },
  { value: 'baulera3',          label: 'Baulera 3' },
  { value: 'cocina',            label: 'Cocina' },
  { value: 'administracion',    label: 'Administración' },
];

const LOC_LABEL: Record<string, string> = Object.fromEntries(
  LOCATIONS.map(l => [l.value, l.label])
);

interface VitrinaProduct {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_filename: string;
  expiration_date: string | null;
  expiry_notes: string | null;
  location: Location | null;
}

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

function formatDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ── Location pill selector ──
function LocationPicker({ value, onChange }: { value: Location | ''; onChange: (v: Location | '') => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <button type="button" onClick={() => onChange('')}
        className={`px-3 py-2 text-xs font-semibold rounded-xl border-2 transition-all ${
          value === '' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
        }`}>
        Sin asignar
      </button>
      {LOCATIONS.map(l => (
        <button key={l.value} type="button" onClick={() => onChange(l.value)}
          className={`px-3 py-2 text-xs font-semibold rounded-xl border-2 transition-all ${
            value === l.value ? 'border-amber-400 bg-amber-400 text-gray-900' : 'border-gray-200 text-gray-500 hover:border-amber-300 hover:text-gray-700'
          }`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

export default function VitrinaPage() {
  const { profile } = useAuth();
  const [products,   setProducts]   = useState<VitrinaProduct[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [tab,        setTab]        = useState<'todos' | 'sin_asignar' | Location>('todos');
  const [saving,     setSaving]     = useState<Record<string, boolean>>({});
  const [pending,    setPending]    = useState<Record<string, number>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Add modal ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding,    setAdding]    = useState(false);
  const [addError,  setAddError]  = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emptyForm = {
    name: '', price: '', quantity: '',
    image_filename: '', expiration_date: '',
    expiry_notes: '', location: '' as Location | '',
  };
  const [form, setForm] = useState(emptyForm);

  // ── Edit modal ──
  const [editModal,  setEditModal]  = useState<VitrinaProduct | null>(null);
  const [editForm,   setEditForm]   = useState({
    name: '', price: '', quantity: '',
    location:        '' as Location | '',
    hasExpiry:       false,
    expiryCount:     1,
    expiration_date: '',
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError,  setEditError]  = useState<string | null>(null);

  // ── Delete confirmation modal ──
  const [deleteTarget, setDeleteTarget] = useState<VitrinaProduct | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase.from('vitrina_products').select('*').order('name');
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
    setPending(prev => ({ ...prev, [p.id]: Math.max(0, qtyFor(p) + delta) }));
  }

  async function saveOne(p: VitrinaProduct) {
    const newQty = pending[p.id];
    if (newQty === undefined || newQty === p.quantity) return;
    setSaving(prev => ({ ...prev, [p.id]: true }));
    await supabase.from('vitrina_products').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', p.id);
    logActivity(profile?.id, profile?.name, 'Stock actualizado', 'vitrina', p.id, `${p.name}: ${p.quantity} → ${newQty}`);
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, quantity: newQty } : x));
    setPending(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    setSaving(prev => ({ ...prev, [p.id]: false }));
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('vitrina_products').delete().eq('id', deleteTarget.id);
    setDeleting(false);
    if (error) { setFetchError(error.message); setDeleteTarget(null); return; }
    logActivity(profile?.id, profile?.name, 'Producto eliminado', 'vitrina', deleteTarget.id, deleteTarget.name);
    setProducts(prev => prev.filter(x => x.id !== deleteTarget.id));
    setPending(prev => { const n = { ...prev }; delete n[deleteTarget.id]; return n; });
    setDeleteTarget(null);
  }

  function openEditModal(p: VitrinaProduct) {
    const hasExpiry = !!p.expiration_date;
    // parse expiry count from notes if present
    let expiryCount = 1;
    if (p.expiry_notes) {
      const m = p.expiry_notes.match(/^(\d+)\s*ud/);
      if (m) expiryCount = Math.min(parseInt(m[1], 10), p.quantity);
    }
    setEditModal(p);
    setEditForm({
      name:            p.name,
      price:           p.price.toString(),
      quantity:        p.quantity.toString(),
      location:        p.location ?? '',
      hasExpiry,
      expiryCount:     hasExpiry ? expiryCount : 1,
      expiration_date: p.expiration_date ?? '',
    });
    setEditError(null);
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editModal) return;
    const name     = editForm.name.trim();
    const price    = parseFloat(editForm.price);
    const quantity = parseInt(editForm.quantity, 10);
    if (!name) { setEditError('El nombre es obligatorio.'); return; }
    if (isNaN(price) || price < 0) { setEditError('Precio inválido.'); return; }
    if (editForm.hasExpiry && !editForm.expiration_date) { setEditError('Selecciona la fecha de vencimiento.'); return; }
    setEditSaving(true); setEditError(null);

    const expiry_date  = editForm.hasExpiry ? editForm.expiration_date : null;
    const expiry_notes = editForm.hasExpiry
      ? `${editForm.expiryCount} ud vencen el ${formatDate(editForm.expiration_date)}`
      : null;

    const updates = {
      name,
      price,
      quantity:        isNaN(quantity) ? editModal.quantity : Math.max(0, quantity),
      location:        editForm.location || null,
      expiration_date: expiry_date,
      expiry_notes,
      updated_at:      new Date().toISOString(),
    };
    const { error } = await supabase.from('vitrina_products').update(updates).eq('id', editModal.id);
    setEditSaving(false);
    if (error) { setEditError(error.message); return; }
    logActivity(profile?.id, profile?.name, 'Producto editado', 'vitrina', editModal.id, name);
    setProducts(prev => prev.map(x => x.id === editModal.id ? { ...x, ...updates } as VitrinaProduct : x));
    setPending(prev => { const n = { ...prev }; delete n[editModal.id]; return n; });
    setEditModal(null);
  }

  async function saveAll() {
    for (const id of Object.keys(pending)) {
      const p = products.find(x => x.id === id);
      if (p) await saveOne(p);
    }
  }

  async function uploadImage(file: File) {
    if (!file.type.startsWith('image/')) { setAddError('Selecciona una imagen válida.'); return; }
    setUploading(true); setAddError(null);
    const ext  = file.name.split('.').pop() || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('vitrina-images').upload(path, file);
    if (error) { setUploading(false); setAddError(`Error: ${error.message}`); return; }
    const { data: pub } = supabase.storage.from('vitrina-images').getPublicUrl(path);
    setForm(f => ({ ...f, image_filename: pub.publicUrl }));
    setUploading(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadImage(file);
  }

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    const name     = form.name.trim();
    const price    = parseFloat(form.price);
    const quantity = parseInt(form.quantity, 10) || 0;
    if (!name) { setAddError('El nombre es obligatorio.'); return; }
    if (isNaN(price) || price < 0) { setAddError('Precio inválido.'); return; }
    setAdding(true); setAddError(null);
    const { data, error } = await supabase.from('vitrina_products').insert({
      name, price, quantity,
      image_filename:  form.image_filename.trim(),
      expiration_date: form.expiration_date || null,
      expiry_notes:    form.expiry_notes.trim() || null,
      location:        form.location || null,
    }).select().single();
    setAdding(false);
    if (error) { setAddError(error.message); return; }
    logActivity(profile?.id, profile?.name, 'Producto agregado', 'vitrina', data.id, `${name} (${quantity} ud, Bs. ${price})`);
    setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setShowAddModal(false);
  }

  const filtered = products
    .filter(p =>
      tab === 'todos'       ? true :
      tab === 'sin_asignar' ? !p.location :
      p.location === tab
    )
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const hasPending  = Object.keys(pending).length > 0;
  const totalItems  = filtered.reduce((s, p) => s + p.quantity, 0);
  const totalValue  = filtered.reduce((s, p) => s + p.price * p.quantity, 0);
  const tabCounts: Record<string, number> = {
    todos: products.length,
    sin_asignar: products.filter(p => !p.location).length,
  };
  for (const loc of LOCATIONS) tabCounts[loc.value] = products.filter(p => p.location === loc.value).length;

  // Max expiry count based on current quantity in edit form
  const maxExpiryCount = Math.max(1, parseInt(editForm.quantity, 10) || 1);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stock Hotel</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} productos · {totalItems} unidades · Bs. {totalValue.toFixed(2)} valor total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchProducts} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => { setForm(emptyForm); setAddError(null); setShowAddModal(true); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm rounded-lg transition-colors">
            <Plus size={16} /> Nuevo producto
          </button>
          {hasPending && (
            <button onClick={saveAll}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold text-sm rounded-lg transition-colors">
              Guardar cambios ({Object.keys(pending).length})
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
        {([['todos', 'Todos'], ['sin_asignar', 'Sin asignar'], ...LOCATIONS.map(l => [l.value, l.label])] as [string, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as typeof tab)}
            className={`flex-shrink-0 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === key ? 'border-amber-400 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {label} <span className="text-xs font-normal text-gray-400">({tabCounts[key] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
      </div>

      {fetchError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">Error: {fetchError}</div>}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map(p => {
            const qty      = qtyFor(p);
            const isDirty  = pending[p.id] !== undefined && pending[p.id] !== p.quantity;
            const isSaving = saving[p.id];
            const expiryDays = p.expiration_date ? daysUntil(p.expiration_date) : null;
            return (
              <div key={p.id} className={`bg-white rounded-2xl shadow-sm border transition-all ${
                isDirty ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-200'
              }`}>
                <div className="relative">
                  <img src={imageSrc(p.image_filename)} alt={p.name}
                    className="w-full h-32 object-cover rounded-t-2xl bg-gray-100"
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }} />
                  <div className="hidden w-full h-32 rounded-t-2xl bg-gray-100 flex items-center justify-center">
                    <Package size={32} className="text-gray-300" />
                  </div>
                  <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    qty === 0 ? 'bg-red-500 text-white' : qty <= 2 ? 'bg-orange-400 text-white' : 'bg-green-500 text-white'
                  }`}>{qty === 0 ? 'Agotado' : `${qty} ud`}</div>
                  <button onClick={() => setDeleteTarget(p)} disabled={isSaving}
                    className="absolute top-2 left-2 w-6 h-6 rounded-full bg-white/90 hover:bg-red-500 text-gray-500 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50">
                    <Trash2 size={12} />
                  </button>
                  <button onClick={() => openEditModal(p)}
                    className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-white/90 hover:bg-amber-400 text-gray-500 hover:text-gray-900 flex items-center justify-center transition-colors">
                    <Pencil size={12} />
                  </button>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                  <p className="text-sm font-bold text-amber-600 mt-1">Bs. {p.price.toFixed(2)}</p>
                  {p.location ? (
                    <span className="inline-block mt-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">{LOC_LABEL[p.location]}</span>
                  ) : (
                    <span className="inline-block mt-1 text-[10px] bg-orange-50 text-orange-400 px-1.5 py-0.5 rounded font-medium">Sin asignar</span>
                  )}
                  {expiryDays !== null && (
                    <div className={`mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      expiryDays < 0 ? 'bg-red-50 text-red-600' : expiryDays <= 30 ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-400'
                    }`}>
                      {expiryDays < 0 ? '⚠️ Vencido' : expiryDays === 0 ? '⚠️ Vence hoy' : `Vence en ${expiryDays}d`}
                    </div>
                  )}
                  {p.expiry_notes && (
                    <p className="mt-1 text-[10px] text-gray-400 leading-tight">{p.expiry_notes}</p>
                  )}
                  <div className="flex items-center justify-between mt-2 gap-1">
                    <button onClick={() => change(p, -1)} disabled={qty === 0}
                      className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 flex items-center justify-center disabled:opacity-30 transition-colors">
                      <Minus size={13} />
                    </button>
                    <span className={`text-sm font-bold w-8 text-center ${isDirty ? 'text-amber-600' : 'text-gray-900'}`}>{qty}</span>
                    <button onClick={() => change(p, +1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-green-100 text-gray-600 hover:text-green-600 flex items-center justify-center transition-colors">
                      <Plus size={13} />
                    </button>
                  </div>
                  {isDirty && (
                    <button onClick={() => saveOne(p)} disabled={isSaving}
                      className="w-full mt-2 py-1 text-[11px] font-semibold bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-lg transition-colors disabled:opacity-60">
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

      {/* ── Add modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Nuevo producto</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddSubmit} className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input type="text" autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="Ej. CHOCOLATE PEQUEÑO" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Precio (Bs.)</label>
                  <input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="0.00" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
                  <input type="number" min="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Ubicación</label>
                <LocationPicker value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Foto del producto</label>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
                <div onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl px-3 py-4 text-center cursor-pointer transition-colors ${
                    dragOver ? 'border-amber-400 bg-amber-50' : 'border-gray-300 hover:border-gray-400'
                  }`}>
                  {form.image_filename ? (
                    <img src={imageSrc(form.image_filename)} alt="preview" className="h-20 w-20 object-cover rounded-lg" />
                  ) : uploading ? (
                    <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  ) : <UploadCloud size={22} className="text-gray-400" />}
                  <p className="text-[11px] text-gray-500">{uploading ? 'Subiendo...' : form.image_filename ? 'Clic para cambiar' : 'Arrastra o haz clic para subir'}</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de vencimiento (opcional)</label>
                <DatePicker value={form.expiration_date} onChange={v => setForm(f => ({ ...f, expiration_date: v }))} placeholder="Sin vencimiento" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas de vencimiento</label>
                <textarea value={form.expiry_notes} onChange={e => setForm(f => ({ ...f, expiry_notes: e.target.value }))}
                  rows={2} placeholder="Ej: 5 ud vencen el 15/09, 10 ud vencen el 01/10"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
              </div>
              {addError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</div>}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" disabled={adding || uploading}
                  className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-60">
                  {adding ? 'Guardando...' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit modal ── */}
      {editModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[92vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-900">Editar producto</h3>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <form onSubmit={handleEditSubmit} className="flex flex-col flex-1 min-h-0">

              {/* Scrollable fields (name, price, qty, location) */}
              <div className="px-5 pt-4 pb-3 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                  <input type="text" autoFocus value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Precio (Bs.)</label>
                    <input type="number" step="0.01" min="0" value={editForm.price}
                      onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad total</label>
                    <input type="number" min="0" value={editForm.quantity}
                      onChange={e => setEditForm(f => ({
                        ...f,
                        quantity: e.target.value,
                        expiryCount: Math.min(f.expiryCount, parseInt(e.target.value, 10) || 1),
                      }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Ubicación</label>
                  <LocationPicker value={editForm.location} onChange={v => setEditForm(f => ({ ...f, location: v }))} />
                </div>

                {/* Expiry checkbox */}
                <div className={`rounded-xl border-2 transition-all ${editForm.hasExpiry ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                  <label className="flex items-start gap-3 px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.hasExpiry}
                      onChange={e => setEditForm(f => ({ ...f, hasExpiry: e.target.checked, expiration_date: '', expiryCount: 1 }))}
                      className="mt-0.5 w-4 h-4 accent-orange-400 cursor-pointer flex-shrink-0"
                    />
                    <span className={`text-xs font-semibold leading-tight ${editForm.hasExpiry ? 'text-orange-700' : 'text-gray-600'}`}>
                      ¿Este producto tiene fecha de vencimiento?
                    </span>
                  </label>

                  {/* Stepper — only when checked */}
                  {editForm.hasExpiry && (
                    <div className="px-4 pb-4 space-y-3">
                      <div>
                        <p className="text-xs text-orange-600 font-medium mb-2">
                          ¿Cuántas de las {editForm.quantity} unidades vencen?
                        </p>
                        <div className="flex items-center gap-3">
                          <button type="button"
                            onClick={() => setEditForm(f => ({ ...f, expiryCount: Math.max(1, f.expiryCount - 1) }))}
                            disabled={editForm.expiryCount <= 1}
                            className="w-9 h-9 rounded-xl bg-white border-2 border-orange-200 hover:border-orange-400 text-orange-600 font-bold text-lg flex items-center justify-center disabled:opacity-30 transition-colors">
                            −
                          </button>
                          <span className="text-xl font-bold text-orange-700 w-8 text-center">{editForm.expiryCount}</span>
                          <button type="button"
                            onClick={() => setEditForm(f => ({ ...f, expiryCount: Math.min(maxExpiryCount, f.expiryCount + 1) }))}
                            disabled={editForm.expiryCount >= maxExpiryCount}
                            className="w-9 h-9 rounded-xl bg-white border-2 border-orange-200 hover:border-orange-400 text-orange-600 font-bold text-lg flex items-center justify-center disabled:opacity-30 transition-colors">
                            +
                          </button>
                          <span className="text-xs text-orange-500">de {editForm.quantity} ud</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Date picker — OUTSIDE overflow-y-auto to avoid clipping ── */}
              {editForm.hasExpiry && (
                <div className="px-5 py-3 border-t border-orange-100 bg-orange-50 flex-shrink-0">
                  <label className="block text-xs font-semibold text-orange-700 mb-2">
                    📅 ¿Cuándo vencen?
                  </label>
                  <DatePicker
                    value={editForm.expiration_date}
                    onChange={v => setEditForm(f => ({ ...f, expiration_date: v }))}
                    placeholder="Escribe o selecciona la fecha"
                    accentClass="border-orange-400 ring-orange-100"
                    useFixed
                  />
                  {editForm.expiration_date && (
                    <p className="mt-2 text-xs text-orange-600 font-medium">
                      → {editForm.expiryCount} ud vencen el {formatDate(editForm.expiration_date)}
                    </p>
                  )}
                </div>
              )}

              {/* Error + Buttons — always visible */}
              <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
                {editError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{editError}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setEditModal(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                  <button type="submit" disabled={editSaving}
                    className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold text-sm rounded-lg transition-colors disabled:opacity-60">
                    {editSaving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
            <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <AlertTriangle size={28} className="text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">¿Eliminar producto?</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Vas a eliminar <span className="font-semibold text-gray-900">"{deleteTarget.name}"</span> del inventario. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex border-t border-gray-100">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-3.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <div className="w-px bg-gray-100" />
              <button onClick={confirmDelete} disabled={deleting}
                className="flex-1 py-3.5 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60">
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
