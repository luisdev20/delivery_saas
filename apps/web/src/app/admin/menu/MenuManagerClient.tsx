'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowLeft, Save, X } from 'lucide-react';
import type { Product, Restaurant } from '@/lib/supabase/types';

interface Props {
  restaurant: Restaurant;
  initialProducts: Product[];
}

const DAYS = [
  { num: 1, label: 'L' },
  { num: 2, label: 'M' },
  { num: 3, label: 'X' },
  { num: 4, label: 'J' },
  { num: 5, label: 'V' },
  { num: 6, label: 'S' },
  { num: 7, label: 'D' },
];

const CATEGORIES = ['Menú del Día', 'A la Carta', 'Bebidas', 'Postres', 'Entradas'];

const emptyForm = (): Partial<Product> => ({
  name: '',
  description: '',
  category: 'A la Carta',
  price: 0,
  is_available: true,
  available_days: [1, 2, 3, 4, 5, 6, 7],
});

export default function MenuManagerClient({ restaurant, initialProducts }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  const toggleAvailability = useCallback(async (product: Product) => {
    const newVal = !product.is_available;
    const { error } = await supabase
      .from('products')
      .update({ is_available: newVal })
      .eq('id', product.id);

    if (!error) {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_available: newVal } : p));
      toast.success(newVal ? `"${product.name}" activado` : `"${product.name}" marcado como agotado`);
    }
  }, [supabase]);

  const toggleDay = (day: number) => {
    if (!editingProduct) return;
    const days = editingProduct.available_days || [];
    const newDays = days.includes(day)
      ? days.filter(d => d !== day)
      : [...days, day].sort();
    setEditingProduct({ ...editingProduct, available_days: newDays });
  };

  const handleSave = async () => {
    if (!editingProduct?.name || !editingProduct.price) {
      toast.error('Nombre y precio son obligatorios');
      return;
    }
    setSaving(true);

    const payload = {
      restaurant_id: restaurant.id,
      name: editingProduct.name,
      description: editingProduct.description || null,
      category: editingProduct.category,
      price: Number(editingProduct.price),
      is_available: editingProduct.is_available ?? true,
      available_days: editingProduct.available_days || [1, 2, 3, 4, 5, 6, 7],
    };

    if (isNew) {
      const { data, error } = await supabase.from('products').insert(payload).select().single();
      if (!error && data) {
        setProducts(prev => [...prev, data as Product]);
        toast.success(`"${data.name}" creado`);
        setEditingProduct(null);
      } else {
        toast.error('Error al crear el producto');
      }
    } else if (editingProduct.id) {
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', editingProduct.id)
        .select()
        .single();
      if (!error && data) {
        setProducts(prev => prev.map(p => p.id === data.id ? data as Product : p));
        toast.success(`"${data.name}" actualizado`);
        setEditingProduct(null);
      } else {
        toast.error('Error al guardar');
      }
    }
    setSaving(false);
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`¿Eliminar "${product.name}"?`)) return;
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    if (!error) {
      setProducts(prev => prev.filter(p => p.id !== product.id));
      toast.success(`"${product.name}" eliminado`);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-secondary)', fontFamily: 'Inter, sans-serif' }}>
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
          <div className="flex items-center gap-3">
            <a href="/admin" className="btn btn-ghost btn-sm">
              <ArrowLeft size={16} />
            </a>
            <div>
              <h1 className="font-bold" style={{ color: 'var(--text-primary)' }}>Gestión de Menú</h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {products.length} {products.length === 1 ? 'plato registrado' : 'platos registrados'}
              </p>
            </div>
          </div>
          <button
            onClick={() => { setEditingProduct(emptyForm()); setIsNew(true); }}
            className="btn btn-primary btn-sm"
            style={{ background: restaurant.brand_color }}
            id="btn-add-product"
          >
            <Plus size={16} /> Nuevo plato
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {Object.keys(grouped).length === 0 ? (
            <div className="text-center py-16">
              <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
                No hay productos en el menú
              </p>
              <p className="text-sm mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>
                Agregue su primer plato para empezar
              </p>
              <button
                onClick={() => { setEditingProduct(emptyForm()); setIsNew(true); }}
                className="btn btn-primary"
                style={{ background: restaurant.brand_color }}
              >
                <Plus size={16} /> Agregar primer plato
              </button>
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <section key={category} className="mb-6">
                <h2 className="font-bold text-sm uppercase tracking-wide mb-3 flex items-center gap-2"
                  style={{ color: 'var(--text-muted)' }}>
                  {category}
                  <span className="font-normal">({items.length})</span>
                </h2>
                <div className="space-y-2">
                  {items.map(product => (
                    <div key={product.id}
                      className="card p-3 flex items-center gap-3"
                      style={{ opacity: product.is_available ? 1 : 0.6 }}>
                      <label className="toggle flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={product.is_available}
                          onChange={() => toggleAvailability(product)}
                          id={`toggle-${product.id}`}
                        />
                        <span className="toggle-slider" />
                      </label>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                            {product.name}
                          </p>
                          {!product.is_available && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                              style={{ background: 'var(--gray-100)', color: 'var(--text-muted)' }}>
                              Agotado
                            </span>
                          )}
                        </div>
                        {product.description && (
                          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {product.description}
                          </p>
                        )}
                        <div className="flex gap-1 mt-1.5">
                          {DAYS.map(d => (
                            <span key={d.num}
                              className="w-5 h-5 rounded text-xs flex items-center justify-center font-medium"
                              style={{
                                background: product.available_days?.includes(d.num) ? `${restaurant.brand_color}20` : 'var(--gray-100)',
                                color: product.available_days?.includes(d.num) ? restaurant.brand_color : 'var(--text-muted)',
                              }}>
                              {d.label}
                            </span>
                          ))}
                        </div>
                      </div>

                      <span className="font-bold text-sm flex-shrink-0" style={{ color: restaurant.brand_color }}>
                        S/ {product.price.toFixed(2)}
                      </span>

                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setEditingProduct({ ...product }); setIsNew(false); }}
                          className="btn btn-ghost btn-sm"
                          id={`edit-${product.id}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(product)}
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--status-cancelado)' }}
                          id={`delete-${product.id}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      {editingProduct && (
        <>
          <div className="fixed inset-0 bg-black/30 z-20 md:hidden" onClick={() => setEditingProduct(null)} />
          <aside className="w-80 flex-shrink-0 flex flex-col border-l overflow-y-auto animate-fade-in z-30 fixed right-0 top-0 bottom-0 md:relative"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>

            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <h2 className="font-bold" style={{ color: 'var(--text-primary)' }}>
                {isNew ? 'Nuevo plato' : 'Editar plato'}
              </h2>
              <button onClick={() => setEditingProduct(null)} className="btn btn-ghost btn-sm">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={editingProduct.name || ''} id="edit-name"
                  onChange={e => setEditingProduct(p => ({ ...p, name: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea className="form-input" rows={2} value={editingProduct.description || ''} id="edit-desc"
                  onChange={e => setEditingProduct(p => ({ ...p, description: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Categoría</label>
                <select className="form-input form-select" value={editingProduct.category || 'A la Carta'} id="edit-category"
                  onChange={e => setEditingProduct(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Precio (S/.) *</label>
                <input className="form-input" type="number" min="0" step="0.50" id="edit-price"
                  value={editingProduct.price || ''} onChange={e => setEditingProduct(p => ({ ...p, price: parseFloat(e.target.value) }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Disponible hoy</label>
                <label className="toggle">
                  <input type="checkbox" id="edit-available"
                    checked={editingProduct.is_available ?? true}
                    onChange={e => setEditingProduct(p => ({ ...p, is_available: e.target.checked }))} />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Días de la semana</label>
                <div className="flex gap-1.5 mt-1">
                  {DAYS.map(d => (
                    <button key={d.num} type="button"
                      onClick={() => toggleDay(d.num)}
                      className="w-9 h-9 rounded-lg text-sm font-bold transition-all"
                      style={{
                        background: (editingProduct.available_days || []).includes(d.num) ? restaurant.brand_color : 'var(--gray-100)',
                        color: (editingProduct.available_days || []).includes(d.num) ? 'white' : 'var(--text-muted)',
                      }}
                      id={`day-${d.num}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-full"
                style={{ background: restaurant.brand_color }} id="btn-save-product">
                {saving ? <div className="spinner" /> : <><Save size={16} /> Guardar plato</>}
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
