import { useCallback, useEffect, useState } from "react";
import ComboForm from "../components/ComboForm";
import { api } from "../lib/api";
import type { Product } from "./Menu";

export interface ComboFixedDraft { productId: string; quantity: number; sortOrder?: number }
export interface ComboGroupDraft {
  name: string;
  minSelect: number;
  maxSelect: number;
  sortOrder?: number;
  options: Array<{ productId: string; priceDelta: number; sortOrder?: number }>;
}
export interface ComboFormValues {
  name: string;
  description?: string;
  basePrice: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  imagePublicId: string | null;
  isActive: boolean;
  isFeatured: boolean;
  startsAt: string | null;
  endsAt: string | null;
  availableDays: number[];
  availableFrom: string | null;
  availableTo: string | null;
  fixedItems: ComboFixedDraft[];
  groups: ComboGroupDraft[];
}
export interface Combo {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  imagePublicId: string | null;
  isActive: boolean;
  isFeatured: boolean;
  startsAt: string | null;
  endsAt: string | null;
  availableDays: number[];
  availableFrom: string | null;
  availableTo: string | null;
  fixedItems: Array<{ id: string; productId: string; quantity: number; product: { id: string; name: string } }>;
  groups: Array<{ id: string; name: string; minSelect: number; maxSelect: number; options: Array<{ id: string; productId: string; priceDelta: number; product: { id: string; name: string } }> }>;
}

export default function Combos() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [combosEnabled, setCombosEnabled] = useState(false);
  const [editing, setEditing] = useState<Combo | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ data: comboData }, { data: productData }] = await Promise.all([
        api.get("/restaurant/combos"),
        api.get("/restaurant/catalog/products"),
      ]);
      setCombos(comboData.combos ?? []);
      setCombosEnabled(Boolean(comboData.combosEnabled));
      setProducts(productData.products ?? []);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível carregar os combos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(values: ComboFormValues, id?: string) {
    if (id) await api.patch(`/restaurant/combos/${id}`, values);
    else await api.post("/restaurant/combos", values);
    setEditing(null);
    await load();
  }

  async function toggle(combo: Combo) {
    const values: ComboFormValues = {
      name: combo.name,
      description: combo.description ?? undefined,
      basePrice: combo.basePrice,
      compareAtPrice: combo.compareAtPrice,
      imageUrl: combo.imageUrl,
      imagePublicId: combo.imagePublicId,
      isActive: !combo.isActive,
      isFeatured: combo.isFeatured,
      startsAt: combo.startsAt,
      endsAt: combo.endsAt,
      availableDays: combo.availableDays,
      availableFrom: combo.availableFrom,
      availableTo: combo.availableTo,
      fixedItems: combo.fixedItems.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      groups: combo.groups.map((group) => ({ name: group.name, minSelect: group.minSelect, maxSelect: group.maxSelect, options: group.options.map((option) => ({ productId: option.productId, priceDelta: option.priceDelta })) })),
    };
    await api.patch(`/restaurant/combos/${combo.id}`, values);
    await load();
  }

  async function remove(combo: Combo) {
    if (!window.confirm(`Desativar “${combo.name}”? O combo deixa de aparecer ao cliente.`)) return;
    await api.delete(`/restaurant/combos/${combo.id}`);
    await load();
  }

  return (
    <div className="page-content combos-page">
      <div className="menu-toolbar">
        <div>
          <p className="page-eyebrow">Ofertas da loja</p>
          <h1>Combos</h1>
          <p className="page-subtitle">Monte ofertas fixas ou com escolhas, preços e horários próprios.</p>
        </div>
        <button onClick={() => setEditing("new")}>+ Novo combo</button>
      </div>

      {!combosEnabled && (
        <div className="feature-warning">
          <strong>Combos estão desligados no Admin técnico.</strong>
          <span>Pode preparar e editar ofertas aqui, mas elas só aparecem ao cliente quando a funcionalidade for ativada.</span>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      {loading && <p className="hint">A carregar combos...</p>}

      <ul className="product-list combo-list">
        {combos.map((combo) => (
          <li key={combo.id} className={!combo.isActive ? "product-is-off" : ""}>
            <div className="product-thumb combo-thumb" style={{ backgroundImage: combo.imageUrl ? `url(${combo.imageUrl})` : undefined }}>{!combo.imageUrl && <span>COMBO</span>}</div>
            <div className="product-info">
              <div className="product-title-row">
                <strong>{combo.name}</strong>
                <span className="product-price">{combo.basePrice.toFixed(2)} €</span>
              </div>
              <p className="product-description">{combo.description || "Sem descrição"}</p>
              <div className="product-meta">
                <span>{combo.fixedItems.length} fixo(s) · {combo.groups.length} grupo(s)</span>
                {combo.isFeatured && <span className="availability-badge highlight">Destaque</span>}
                <span className={`availability-badge ${combo.isActive ? "on" : "off"}`}>{combo.isActive ? "Ativo" : "Pausado"}</span>
              </div>
            </div>
            <div className="product-actions">
              <button className="secondary" onClick={() => setEditing(combo)}>Editar</button>
              <button className="secondary" onClick={() => toggle(combo)}>{combo.isActive ? "Pausar" : "Ativar"}</button>
              <button className="danger" onClick={() => remove(combo)}>Remover</button>
            </div>
          </li>
        ))}
      </ul>
      {!loading && combos.length === 0 && <div className="empty-combos"><strong>Ainda não há combos.</strong><span>Crie a primeira oferta quando quiser.</span><button onClick={() => setEditing("new")}>Criar combo</button></div>}

      {editing && <ComboForm combo={editing === "new" ? null : editing} products={products} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}
