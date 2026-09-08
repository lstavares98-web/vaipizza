import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { PizzaIcon } from "./NavIcons";

export interface ComboForModal {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  isFeatured: boolean;
  fixedItems: Array<{ id: string; quantity: number; product: { id: string; name: string; imageUrl: string | null } }>;
  groups: Array<{
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: Array<{ id: string; priceDelta: number; product: { id: string; name: string; imageUrl: string | null } }>;
  }>;
}

interface Props {
  combo: ComboForModal;
  onClose: () => void;
  onAdded: (message: string) => void;
}

export default function ComboModal({ combo, onClose, onAdded }: Props) {
  const { user } = useAuth();
  const { addComboItem } = useCart();
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(group: ComboForModal["groups"][number], optionId: string) {
    setSelections((current) => {
      const selected = current[group.id] ?? [];
      if (group.maxSelect === 1) {
        const next = selected.includes(optionId) && group.minSelect === 0 ? [] : [optionId];
        return { ...current, [group.id]: next };
      }
      if (selected.includes(optionId)) return { ...current, [group.id]: selected.filter((id) => id !== optionId) };
      if (selected.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...selected, optionId] };
    });
  }

  const completion = useMemo(
    () => combo.groups.map((group) => ({ group, count: selections[group.id]?.length ?? 0, complete: (selections[group.id]?.length ?? 0) >= group.minSelect && (selections[group.id]?.length ?? 0) <= group.maxSelect })),
    [combo.groups, selections],
  );
  const complete = completion.every((item) => item.complete);
  const delta = useMemo(() => combo.groups.reduce((sum, group) => sum + (selections[group.id] ?? []).reduce((groupSum, optionId) => groupSum + (group.options.find((option) => option.id === optionId)?.priceDelta ?? 0), 0), 0), [combo.groups, selections]);
  const unitPrice = Math.round((combo.basePrice + delta) * 100) / 100;
  const total = Math.round(unitPrice * quantity * 100) / 100;

  async function handleAdd() {
    if (!complete) {
      setError("Complete as escolhas obrigatórias antes de adicionar.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await addComboItem({
        comboId: combo.id,
        quantity,
        selections: combo.groups.map((group) => ({ groupId: group.id, optionIds: selections[group.id] ?? [] })),
        notes: notes.trim() || undefined,
      });
      onAdded(result.restaurantSwitched ? "Carrinho anterior substituído — combo adicionado." : "Combo adicionado ao carrinho.");
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível adicionar o combo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal product-sheet editorial-product-sheet combo-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={combo.name}>
        <button className="modal-close" onClick={onClose} aria-label="Fechar">✕</button>
        <div className={`product-sheet-media${combo.imageUrl ? "" : " no-image"}`} style={combo.imageUrl ? { backgroundImage: `url(${combo.imageUrl})` } : undefined}>
          {!combo.imageUrl && <PizzaIcon />}
          <span className="product-sheet-image-shade" />
          <div className="product-sheet-media-caption"><span>VAIPIZZA · Combo</span><strong>{combo.name}</strong></div>
        </div>
        <div className="product-sheet-panel">
          <div className="product-sheet-scroll">
            <div className="product-sheet-intro">
              <div><span className="product-sheet-kicker">Escolhe e monta o teu combo</span><h2>{combo.name}</h2>{combo.description && <p>{combo.description}</p>}</div>
              <div className="combo-modal-price">{combo.compareAtPrice != null && <del>{combo.compareAtPrice.toFixed(2)} €</del>}<strong>{combo.basePrice.toFixed(2)} €</strong></div>
            </div>

            {combo.fixedItems.length > 0 && (
              <section className="modifier-group combo-included">
                <div className="modifier-heading"><div><h3>Já incluído</h3><p>Estes itens fazem parte do combo.</p></div></div>
                <div className="combo-included-list">{combo.fixedItems.map((item) => <div key={item.id}><span>{item.quantity}×</span><strong>{item.product.name}</strong></div>)}</div>
              </section>
            )}

            {combo.groups.map((group) => {
              const selected = selections[group.id] ?? [];
              return (
                <section className="modifier-group" key={group.id}>
                  <div className="modifier-heading"><div><h3>{group.name}</h3><p>{group.minSelect === group.maxSelect ? `Escolhe ${group.minSelect}` : `Escolhe de ${group.minSelect} a ${group.maxSelect}`} · {selected.length}/{group.maxSelect}</p></div>{group.minSelect > 0 && <span className="required">Obrigatório</span>}</div>
                  <div className="modifier-option-list">
                    {group.options.map((option) => {
                      const checked = selected.includes(option.id);
                      return (
                        <label key={option.id} className={`modifier-option-card${checked ? " selected" : ""}`}>
                          <input type={group.maxSelect === 1 ? "radio" : "checkbox"} name={group.id} checked={checked} onChange={() => toggle(group, option.id)} />
                          <span className="modifier-control" />
                          <span className="modifier-option-copy"><strong>{option.product.name}</strong>{option.priceDelta === 0 && <small>Sem acréscimo</small>}</span>
                          {option.priceDelta !== 0 && <span className="option-price">{option.priceDelta > 0 ? "+" : ""}{option.priceDelta.toFixed(2)} €</span>}
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <section className="modifier-group"><div className="modifier-heading"><div><h3>Observações</h3><p>Algum detalhe para a cozinha?</p></div></div><textarea className="product-sheet-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="Opcional" /></section>
            {error && <p className="form-error product-sheet-error">{error}</p>}
          </div>
          <div className="product-sheet-footer">
            <div className="quantity-row"><button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button><span>{quantity}</span><button type="button" onClick={() => setQuantity((q) => Math.min(50, q + 1))}>+</button></div>
            {user ? (
              <button className="add-to-cart-btn" onClick={handleAdd} disabled={submitting || !complete}><span>{submitting ? "A adicionar..." : complete ? "Adicionar combo" : "Complete as escolhas"}</span><strong>{total.toFixed(2)} €</strong></button>
            ) : (
              <Link to="/login" className="add-to-cart-btn"><span>Entrar para adicionar</span><strong>{total.toFixed(2)} €</strong></Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
