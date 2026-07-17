import { useEffect, useState } from 'react';
import { X, Search, Package, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface VitrinaProduct {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_filename: string;
}

export interface CartItem {
  product: VitrinaProduct;
  qty: number;
  total: number;
}

interface Props {
  onConfirm: (items: CartItem[]) => void;
  onClose: () => void;
}

export default function VitrinaProductPicker({ onConfirm, onClose }: Props) {
  const [products, setProducts] = useState<VitrinaProduct[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState<VitrinaProduct | null>(null);
  const [sellQty,  setSellQty]  = useState(1);
  const [cart,     setCart]     = useState<CartItem[]>([]);

  useEffect(() => {
    supabase.from('vitrina_products').select('*').order('name')
      .then(({ data }) => { setProducts(data ?? []); setLoading(false); });
  }, []);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  // Stock remaining after accounting for items already in cart
  function availableStock(p: VitrinaProduct) {
    const inCart = cart.find(i => i.product.id === p.id)?.qty ?? 0;
    return p.quantity - inCart;
  }

  function pickProduct(p: VitrinaProduct) {
    setSelected(p);
    setSellQty(1);
  }

  function addToCart() {
    if (!selected || sellQty <= 0) return;
    setCart(prev => {
      const idx = prev.findIndex(i => i.product.id === selected.id);
      if (idx >= 0) {
        const updated = [...prev];
        const newQty = Math.min(selected.quantity, updated[idx].qty + sellQty);
        updated[idx] = { ...updated[idx], qty: newQty, total: newQty * selected.price };
        return updated;
      }
      return [...prev, { product: selected, qty: sellQty, total: selected.price * sellQty }];
    });
    setSelected(null);
    setSellQty(1);
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.product.id !== productId));
  }

  function updateCartQty(productId: string, delta: number) {
    setCart(prev => prev.map(i => {
      if (i.product.id !== productId) return i;
      const newQty = Math.max(1, Math.min(i.product.quantity, i.qty + delta));
      return { ...i, qty: newQty, total: newQty * i.product.price };
    }));
  }

  const cartTotal = cart.reduce((s, i) => s + i.total, 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Productos Vitrina</h2>
            <p className="text-xs text-gray-500">Agrega productos al carrito del huésped</p>
          </div>
          <div className="flex items-center gap-3">
            {cart.length > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-full">
                <ShoppingCart size={13} />
                {cart.length} ítem{cart.length > 1 ? 's' : ''} · Bs. {cartTotal.toFixed(2)}
              </div>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
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

        {/* Body: product grid + cart sidebar */}
        <div className="flex flex-1 overflow-hidden">
          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {filtered.map(p => {
                  const isSelected = selected?.id === p.id;
                  const avail = availableStock(p);
                  const outOfStock = avail <= 0;
                  const inCart = cart.find(i => i.product.id === p.id);
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
                          : inCart
                          ? 'border-green-400 ring-1 ring-green-100'
                          : 'border-gray-200 hover:border-amber-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="relative">
                        <img
                          src={`/vitrinas/${p.image_filename}`}
                          alt={p.name}
                          className="w-full h-24 object-cover bg-gray-100"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className={`absolute top-1 right-1 px-1.5 py-px rounded-full text-[10px] font-bold ${
                          outOfStock ? 'bg-red-500 text-white' : avail <= 2 ? 'bg-orange-400 text-white' : 'bg-green-500 text-white'
                        }`}>
                          {outOfStock ? '✕' : avail}
                        </div>
                        {inCart && (
                          <div className="absolute bottom-1 left-1 bg-green-500 text-white text-[10px] font-bold px-1.5 py-px rounded-full">
                            ✓ {inCart.qty}
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute inset-0 bg-amber-400/20 flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center text-white font-bold text-lg">✓</div>
                          </div>
                        )}
                      </div>
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

          {/* Cart sidebar — shown when cart has items */}
          {cart.length > 0 && (
            <div className="w-56 flex-shrink-0 border-l border-gray-100 flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Carrito</p>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {cart.map(item => (
                  <div key={item.product.id} className="px-3 py-2 border-b border-gray-50">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-semibold text-gray-800 leading-tight flex-1">{item.product.name}</p>
                      <button onClick={() => removeFromCart(item.product.id)} className="text-gray-300 hover:text-red-400 flex-shrink-0">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateCartQty(item.product.id, -1)}
                          className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
                          <Minus size={10} />
                        </button>
                        <span className="text-xs font-bold text-gray-900 w-5 text-center">{item.qty}</span>
                        <button onClick={() => updateCartQty(item.product.id, 1)}
                          disabled={item.qty >= item.product.quantity}
                          className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center disabled:opacity-40">
                          <Plus size={10} />
                        </button>
                      </div>
                      <span className="text-xs font-bold text-amber-600">Bs. {item.total.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-3 py-3 border-t border-gray-100">
                <div className="flex justify-between text-xs font-bold text-gray-900 mb-2">
                  <span>Total</span>
                  <span className="text-amber-600">Bs. {cartTotal.toFixed(2)}</span>
                </div>
                <button
                  onClick={() => { onConfirm(cart); onClose(); }}
                  className="w-full py-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold rounded-xl text-xs transition-colors"
                >
                  ✓ Agregar al huésped
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer — selected product qty picker */}
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
                  <p className="text-xs text-gray-500">Bs. {selected.price.toFixed(2)} c/u · Disponible: {availableStock(selected)}</p>
                </div>
              </div>

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
                  onClick={() => setSellQty(q => Math.min(availableStock(selected), q + 1))}
                  className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 flex items-center justify-center"
                >
                  <Plus size={12} />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-gray-500">Subtotal</p>
                  <p className="text-lg font-bold text-amber-600">Bs. {(selected.price * sellQty).toFixed(2)}</p>
                </div>
                <button
                  onClick={addToCart}
                  className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold rounded-xl text-sm transition-colors whitespace-nowrap"
                >
                  + Al carrito
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state footer CTA when nothing selected and cart is empty */}
        {!selected && cart.length === 0 && (
          <div className="border-t border-gray-100 px-6 py-3 text-center text-xs text-gray-400">
            Selecciona un producto para agregarlo al carrito
          </div>
        )}
      </div>
    </div>
  );
}
