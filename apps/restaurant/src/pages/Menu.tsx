import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import ProductForm, { type ProductFormValues } from "../components/ProductForm";

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}
export interface ModifierOption {
  id?: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  sortOrder?: number;
}
export interface ModifierGroup {
  id?: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder?: number;
  options: ModifierOption[];
}
export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePrice: number;
  imageUrl: string | null;
  isAvailable: boolean;
  allowsSplit: boolean;
  splitPricingRule: "MOST_EXPENSIVE" | "AVERAGE";
  defaultPrepTimeMinutes: number | null;
  modifierGroups: ModifierGroup[];
}

export default function Menu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | "new" | null>(null);

  const load = useCallback(async () => {
    const [{ data: catData }, { data: prodData }] = await Promise.all([
      api.get("/restaurant/catalog/categories"),
      api.get("/restaurant/catalog/products"),
    ]);
    setCategories(catData.categories);
    setProducts(prodData.products);
    setActiveCategory((prev) => prev ?? catData.categories[0]?.id ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    await api.post("/restaurant/catalog/categories", { name: newCategoryName.trim() });
    setNewCategoryName("");
    load();
  }

  async function removeCategory(id: string) {
    if (!window.confirm("Remover esta categoria?")) return;
    await api.delete(`/restaurant/catalog/categories/${id}`);
    load();
  }

  async function toggleAvailable(product: Product) {
    await api.patch(`/restaurant/catalog/products/${product.id}`, { isAvailable: !product.isAvailable });
    load();
  }

  async function removeProduct(id: string) {
    if (!window.confirm("Desativar este produto? (deixa de aparecer no menu)")) return;
    await api.delete(`/restaurant/catalog/products/${id}`);
    load();
  }

  async function handleSave(values: ProductFormValues, productId?: string) {
    if (productId) {
      await api.patch(`/restaurant/catalog/products/${productId}`, values);
    } else {
      await api.post("/restaurant/catalog/products", values);
    }
    setEditingProduct(null);
    load();
  }

  const visibleProducts = products.filter((p) => p.categoryId === activeCategory);

  return (
    <div className="page-content">
      <div className="menu-toolbar">
        <h1>Cardápio</h1>
        <button onClick={() => setEditingProduct("new")} disabled={!activeCategory}>
          + Novo produto
        </button>
      </div>

      <div className="category-tabs">
        {categories.map((c) => (
          <button
            key={c.id}
            className={c.id === activeCategory ? "active" : ""}
            onClick={() => setActiveCategory(c.id)}
          >
            {c.name}
            {" "}
            <span className="link-danger" onClick={(e) => { e.stopPropagation(); removeCategory(c.id); }}>
              ×
            </span>
          </button>
        ))}
        <input
          placeholder="Nova categoria..."
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategory()}
          style={{ maxWidth: 160 }}
        />
        <button onClick={addCategory}>Adicionar</button>
      </div>

      <ul className="product-list">
        {visibleProducts.map((p) => (
          <li key={p.id}>
            <div className="product-thumb" style={{ backgroundImage: p.imageUrl ? `url(${p.imageUrl})` : undefined }} />
            <div className="product-info">
              <strong>{p.name}</strong> — {p.basePrice.toFixed(2)} €
              {!p.isAvailable && <span className="badge badge-rejected">Indisponível</span>}
              <p className="hint">{p.modifierGroups.length} grupo(s) de modificadores</p>
            </div>
            <button onClick={() => setEditingProduct(p)}>Editar</button>
            <button onClick={() => toggleAvailable(p)}>{p.isAvailable ? "Desativar" : "Ativar"}</button>
            <button className="danger" onClick={() => removeProduct(p.id)}>
              Remover
            </button>
          </li>
        ))}
        {visibleProducts.length === 0 && <p className="hint">Sem produtos nesta categoria ainda.</p>}
      </ul>

      {editingProduct && (
        <ProductForm
          categories={categories}
          defaultCategoryId={activeCategory}
          product={editingProduct === "new" ? null : editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
