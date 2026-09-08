import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { api } from "../lib/api";
import { PizzaIcon } from "./NavIcons";

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
  const { user } = useAuth();
  const { addItem } = useCart();
  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const initial: Record<string, Set<string>> = {};
    for (const group of product.modifierGroups) {
      const defaults = group.options.filter((option) => option.isDefault).map((option) => option.id);
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
    setSelections((previous) => {
      const next = { ...previous };
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

  const secondaryProduct = splitCandidates.find((candidate) => candidate.id === secondaryProductId) ?? null;

  const modifiersTotal = useMemo(() => {
    let total = 0;
    for (const group of product.modifierGroups) {
      for (const optionId of selections[group.id] ?? []) {
        const option = group.options.find((candidate) => candidate.id === optionId);
        if (option) total += option.priceDelta;
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
    const modifierOptionIds = product.modifierGroups.flatMap((group) => Array.from(selections[group.id] ?? []));
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
      if (err.response?.status === 401) {
        setError("A tua sessão expirou — entra de novo para continuar.");
      } else {
        setError(err.response?.data?.message ?? "Não foi possível adicionar ao carrinho");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal product-sheet editorial-product-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={product.name}>
        <button className="modal-close" onClick={onClose} aria-label="Fechar">✕</button>

        <div
          className={`product-sheet-media${product.imageUrl ? "" : " no-image"}`}
          style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}
        >
          {!product.imageUrl && <PizzaIcon />}
          <span className="product-sheet-image-shade" />
          <div className="product-sheet-media-caption">
            <span>VAIPIZZA · Pediu? Vai.</span>
            <strong>{product.name}</strong>
          </div>
        </div>

        <div className="product-sheet-panel">
          <div className="product-sheet-scroll">
            <div className="product-sheet-intro">
              <div>
                <span className="product-sheet-kicker">Personaliza a tua escolha</span>
                <h2>{product.name}</h2>
              </div>
              <strong className="product-sheet-base-price">{product.basePrice.toFixed(2)} €</strong>
            </div>
            {product.description && <p className="product-sheet-description">{product.description}</p>}

            {product.allowsSplit && splitCandidates.length > 0 && (
              <section className="modifier-group">
                <div className="modifier-heading">
                  <div><h3>Meio a meio</h3><p>Combina este sabor com outra pizza disponível.</p></div>
                </div>
                <label className={`modifier-option-card${splitMode ? " selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={splitMode}
                    onChange={(event) => {
                      setSplitMode(event.target.checked);
                      setSecondaryProductId(null);
                    }}
                  />
                  <span className="modifier-control" />
                  <span className="modifier-option-copy"><strong>Dividir com outro sabor</strong><small>Escolher metade de outra pizza</small></span>
                </label>
                {splitMode && (
                  <select className="product-sheet-select" value={secondaryProductId ?? ""} onChange={(event) => setSecondaryProductId(event.target.value || null)}>
                    <option value="">Escolher o segundo sabor...</option>
                    {splitCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.basePrice.toFixed(2)} €)</option>
                    ))}
                  </select>
                )}
                {splitMode && secondaryProduct && (
                  <p className="hint">Preço calculado pela regra: {product.splitPricingRule === "MOST_EXPENSIVE" ? "sabor mais caro" : "média dos dois sabores"}.</p>
                )}
              </section>
            )}

            {product.modifierGroups.map((group) => (
              <section className="modifier-group" key={group.id}>
                <div className="modifier-heading">
                  <div>
                    <h3>{group.name}</h3>
                    <p>{group.maxSelect > 1 ? `Escolhe até ${group.maxSelect}${group.minSelect > 0 ? ` · mínimo ${group.minSelect}` : ""}` : group.required ? "Escolhe uma opção" : "Opcional"}</p>
                  </div>
                  {group.required && <span className="required">Obrigatório</span>}
                </div>
                <div className="modifier-option-list">
                  {group.options.map((option) => {
                    const checked = selections[group.id]?.has(option.id) ?? false;
                    return (
                      <label key={option.id} className={`modifier-option-card${checked ? " selected" : ""}`}>
                        <input type={group.maxSelect === 1 ? "radio" : "checkbox"} name={group.id} checked={checked} onChange={() => toggleOption(group, option.id)} />
                        <span className="modifier-control" />
                        <span className="modifier-option-copy"><strong>{option.name}</strong>{option.priceDelta === 0 && <small>Sem acréscimo</small>}</span>
                        {option.priceDelta !== 0 && <span className="option-price">{option.priceDelta > 0 ? "+" : ""}{option.priceDelta.toFixed(2)} €</span>}
                      </label>
                    );
                  })}
                </div>
              </section>
            ))}

            <section className="modifier-group">
              <div className="modifier-heading"><div><h3>Observações</h3><p>Algum detalhe para a cozinha?</p></div></div>
              <textarea className="product-sheet-notes" placeholder="Ex.: pizza bem passada, sem cebola..." value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} />
            </section>

            {error && <p className="form-error product-sheet-error">{error}</p>}
          </div>

          <div className="product-sheet-footer">
            <div className="quantity-row" aria-label="Quantidade">
              <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Diminuir quantidade">−</button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity((value) => value + 1)} aria-label="Aumentar quantidade">+</button>
            </div>

            {user ? (
              <button className="add-to-cart-btn" onClick={handleAdd} disabled={submitting}>
                <span>{submitting ? "A adicionar..." : "Adicionar ao pedido"}</span><strong>{total.toFixed(2)} €</strong>
              </button>
            ) : (
              <Link to="/login" className="add-to-cart-btn"><span>Entrar para adicionar</span><strong>{total.toFixed(2)} €</strong></Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
