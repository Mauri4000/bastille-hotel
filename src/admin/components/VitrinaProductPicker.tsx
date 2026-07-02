import { useEffect, useState } from 'react';
import { X, Search, Package, Minus, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface VitrinaProduct {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_filename: string;
}

interface Props {
  onSelect: (product: VitrinaProduct, qty: number, total: number) => void;
  onClose: () => void;
}

export default function VitrinaProductPicker({ onSelect, onClose }: Props) {
  const [products, setProducts]   = useState<VitrinaProduct[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [search,   setSearch]     = useState('');
  const [selected, setSelected]   = useState<VitrinaProduct | null>(null);
  const [sellQty,  setSellQty]    = useState(1);

  useEffect(() => {
    supabase.from('vitrina_products').select('*').order('name')
      .then(({ data }) => { setProducts(data ?? []); setLoading(false); });
  }, []);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function pickProduct(p: VitrinaProduct) {
    setSelected(p);
    setSellQty(1);
  }

  function confirm() {
    if (!selected) return;
    onSelect(selected, sellQty, selected.price * sellQty);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Productos Vitrina</h2>
            <p className="text-xs text-gray-500">Selecciona el producto vendido</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              type="text"
              placeholder="Buscar producto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {filtered.map(p => {
                const isSelected = selected?.id === p.id;
                const outOfStock = p.quantity === 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => !outOfStock && pickProduct(p)}
                    disabled={outOfStock}
                    className={`relative text-left rounded-xl border-2 transition-all overflow-hidden ${
                      outOfStock
                        ? 'border-gray-100 opacity-40 cursor-not-allowed'
                        : isSelected
                        ? 'border-amber-400 ring-2 ring-amber-100 shadow-md scale-[1.02]'
                        : 'border-gray-200 hover:border-amber-300 hover:shadow-sm'
                    }`}
                  >
                    {/* Image */}
                    <div className="relative">
                      <img
                        src={`/vitrinas/${p.image_filename}`}
                        alt={p.name}
                        className="w-full h-24 object-cover bg-gray-100"
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      {/* Stock badge */}
                      <div className={`absolute top-1 right-1 px-1.5 py-px rounded-full text-[10px] font-bold ${
                        outOfStock ? 'bg-red-500 text-white' : p.quantity <= 2 ? 'bg-orange-400 text-white' : 'bg-green-500 text-white'
                      }`}>
                        {outOfStock ? '✕' : p.quantity}
                      </div>
                      {/* Check overlay */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-amber-400/20 flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center text-white font-bold text-lg">✓</div>
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-2">
                      <p className="text-[10px] font-semibold text-gray-900 leading-tight line-clamp-2">{p.name}</p>
                      <p className="text-xs font-bold text-amber-600 mt-0.5">Bs. {p.price.toFixed(2)}</p>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-full text-center py-8 text-gray-400">
                  <Package size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Sin resultados</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — selected product */}
        {selected && (
          <div className="border-t border-gray-100 px-6 py-4 bg-amber-50">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <img
                  src={`/vitrinas/${selected.image_filename}`}
                  alt={selected.name}
                  className="w-12 h-12 object-cover rounded-lg bg-gray-100 flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{selected.name}</p>
                  <p className="text-xs text-gray-500">Bs. {selected.price.toFixed(2)} c/u · Stock: {selected.quantity}</p>
                </div>
              </div>

              {/* Qty selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 font-medium">Cantidad:</span>
                <button
                  onClick={() => setSellQty(q => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 flex items-center justify-center"
                >
                  <Minus size={12} />
                </button>
                <span className="w-8 text-center text-sm font-bold text-gray-900">{sellQty}</span>
                <button
                  onClick={() => setSellQty(q => Math.min(selected.quantity, q + 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 flex items-center justify-center"
                >
                  <Plus size={12} />
                </button>
              </div>

              {/* Total + confirm */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="text-lg font-bold text-amber-600">Bs. {(selected.price * sellQty).toFixed(2)}</p>
                </div>
                <button
                  onClick={confirm}
                  className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold rounded-xl text-sm transition-colors"
                >
                  ✓ Registrar venta
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
