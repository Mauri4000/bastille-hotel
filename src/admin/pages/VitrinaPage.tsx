import { useEffect, useState, useCallback } from 'react';
import { Plus, Minus, Search, Package, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../../lib/logActivity';

interface VitrinaProduct {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_filename: string;
}

export default function VitrinaPage() {
  const { profile } = useAuth();
  const [products,  setProducts]  = useState<VitrinaProduct[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [saving,    setSaving]    = useState<Record<string, boolean>>({});
  const [pending,   setPending]   = useState<Record<string, number>>({}); // unsaved qty changes

  const [fetchError, setFetchError] = useState<string | null>(null);

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

  async function saveAll() {
    const changed = Object.keys(pending);
    if (changed.length === 0) return;
    for (const id of changed) {
      const p = products.find(x => x.id === id);
      if (p) await saveOne(p);
    }
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const hasPending = Object.keys(pending).length > 0;
  const totalItems = products.reduce((s, p) => s + p.quantity, 0);
  const totalValue = products.reduce((s, p) => s + p.price * p.quantity, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stock Vitrina</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {products.length} productos · {totalItems} unidades · Bs. {totalValue.toFixed(2)} valor total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchProducts} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500">
            <RefreshCw size={16} />
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
                    src={`/vitrinas/${p.image_filename}`}
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
    </div>
  );
}
