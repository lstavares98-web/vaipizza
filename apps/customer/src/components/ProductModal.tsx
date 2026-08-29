import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useCart } from "../context/CartContext";

interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
}
interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
}
export interface ProductForModal {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  imageUrl: string | null;
  allowsSplit: boolean;
  splitPricingRule: "MOST_EXPENSIVE" | "AVERAGE";
  modifierGroups: ModifierGroup[];
}

interface Props {
  restaurantSlug: string;
  product: ProductForModal;
  onClose: () => void;
  onAdded: (message: string) => void;
}

export default function ProductModal({ restaurantSlug, product, onClose, onAdded }: Props) {
  const { addItem } = useCart();
  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const initial: Record<string, Set<string>> = {};
    for (const group of product.modifierGroups) {
      const defaults = group.options.filter((o) => o.isDefault).map((o) => o.id);
      initial[group.id] = new Set(defaults.slice(0, group.maxSelect));
    }
    return initial;
  });
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [splitCandidates, setSplitCandidates] = useState<{ id: string; name: string; basePrice: number }[]>([]);
  const [secondaryProductId, setSecondaryProductId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!product.allowsSplit) return;
    api
      .get(`/restaurants/${restaurantSlug}/products/${product.id}/split-candidates`)
      .then(({ data }) => setSplitCandidates(data.products));
  }, [restaurantSlug, product.id, product.allowsSplit]);

  function toggleOption(group: ModifierGroup, optionId: string) {
    setSelections((prev) => {
      const next = { ...prev };
      const current = new Set(next[group.id]);
      if (group.maxSelect === 1) {
        next[group.id] = current.has(optionId) && !group.required ? new Set() : new Set([optionId]);
        return next;
      }
      if (current.has(optionId)) {
        current.delete(optionId);
      } else if (current.size < group.maxSelect) {
        current.add(optionId);
      }
      next[group.id] = current;
      return next;
    });
  }

  const secondaryProduct = splitCandidates.find((p) => p.id === secondaryProductId) ?? null;

  const modifiersTotal = useMemo(() => {
    let total = 0;
    for (const group of product.modifierGroups) {
      for (const optionId of selections[group.id] ?? []) {
        const opt = group.options.find((o) => o.id === optionId);
        if (opt) total += opt.priceDelta;
      }
    }
    return total;
  }, [selections, product.modifierGroups]);

  const baseForPricing = useMemo(() => {
    if (splitMode && secondaryProduct) {
      return product.splitPricingRule === "MOST_EXPENSIVE"
        ? Math.max(product.basePrice, secondaryProduct.basePrice)
        : (product.basePrice + secondaryProduct.basePrice) / 2;
    }
    return product.basePrice;
  }, [splitMode, secondaryProduct, product]);

  const unitPrice = Math.round((baseForPricing + modifiersTotal) * 100) / 100;
  const total = Math.round(unitPrice * quantity * 100) / 100;

  async function handleAdd() {
    setError(null);
    const modifierOptionIds = product.modifierGroups.flatMap((g) => Array.from(selections[g.id] ?? []));
    setSubmitting(true);
    try {
      const result = await addItem({
        productId: product.id,
        secondaryProductId: splitMode && secondaryProductId ? secondaryProductId : undefined,
        quantity,
        modifierOptionIds,
        notes: notes || undefined,
      });
      onAdded(result.restaurantSwitched ? "Carrinho anterior substituído — novo item adicionado." : "Adicionado ao carrinho.");
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível adicionar ao carrinho");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
        <h2>{product.name}</h2>
        {product.description && <p className="muted">{product.description}</p>}
        <p className="price">{product.basePrice.toFixed(2)} €</p>

        {product.allowsSplit && splitCandidates.length > 0 && (
          <section className="modifier-group">
            <h3>Meio a meio</h3>
            <label className="checkbox">
              <input type="checkbox" checked={splitMode} onChange={(e) => { setSplitMode(e.target.checked); setSecondaryProductId(null); }} />
              Dividir este produto com outro sabor
            </label>
            {splitMode && (
              <select value={secondaryProductId ?? ""} onChange={(e) => setSecondaryProductId(e.target.value || null)}>
                <option value="">Escolher o segundo sabor...</option>
                {splitCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.basePrice.toFixed(2)} €)
                  </option>
                ))}
              </select>
            )}
            {splitMode && secondaryProduct && (
              <p className="hint">
                Preço: {product.splitPricingRule === "MOST_EXPENSIVE" ? "sabor mais caro" : "média dos dois sabores"}
              </p>
            )}
          </section>
        )}

        {product.modifierGroups.map((group) => (
          <section className="modifier-group" key={group.id}>
            <h3>
              {group.name} {group.required && <span className="required">obrigatório</span>}
            </h3>
            {group.maxSelect > 1 && (
              <p className="hint">
                Escolha até {group.maxSelect}
                {group.minSelect > 0 ? `, no mínimo ${group.minSelect}` : ""}
              </p>
            )}
            <ul className="option-list">
              {group.options.map((option) => {
                const checked = selections[group.id]?.has(option.id) ?? false;
                return (
                  <li key={option.id}>
                    <label className={group.maxSelect === 1 ? "radio" : "checkbox"}>
                      <input
                        type={group.maxSelect === 1 ? "radio" : "checkbox"}
                        name={group.id}
                        checked={checked}
                        onChange={() => toggleOption(group, option.id)}
                      />
                      {option.name}
                      {option.priceDelta !== 0 && (
                        <span className="option-price">
                          {option.priceDelta > 0 ? "+" : ""}
                          {option.priceDelta.toFixed(2)} €
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section className="modifier-group">
          <h3>Observações</h3>
          <textarea
            placeholder="Ex.: pizza bem passada, sem cebola..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={300}
          />
        </section>

        <div className="quantity-row">
          <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
            −
          </button>
          <span>{quantity}</span>
          <button type="button" onClick={() => setQuantity((q) => q + 1)}>
            +
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="add-to-cart-btn" onClick={handleAdd} disabled={submitting}>
          {submitting ? "A adicionar..." : `Adicionar — ${total.toFixed(2)} €`}
        </button>
      </div>
    </div>
  );
}
