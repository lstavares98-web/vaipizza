import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";

export default function Cart() {
  const { cart, items, subtotal, loading, updateItem, removeItem } = useCart();

  if (loading) return <p className="page">A carregar carrinho...</p>;

  if (!cart || items.length === 0) {
    return (
      <div className="page empty-state">
        <h1>O seu carrinho está vazio</h1>
        <Link to="/" className="btn-gold">
          Ver o menu
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <p className="eyebrow">A minha seleção</p>
      <h1>Carrinho</h1>
      <p className="muted" style={{ marginTop: "-0.5rem" }}>
        {cart.restaurant?.name}
      </p>

      <div className="cart-layout">
        <ul className="cart-list">
          {items.map((item) => (
            <li key={item.id} className="cart-item">
              <div
                className="cart-item-thumb"
                style={item.productImageUrl ? { backgroundImage: `url(${item.productImageUrl})` } : undefined}
              />
              <div className="cart-item-main">
                <div className="cart-item-title-row">
                  <strong>
                    {item.productName}
                    {item.secondaryProductName ? ` / ${item.secondaryProductName}` : ""}
                  </strong>
                  <span className="price">{item.lineTotal.toFixed(2)} €</span>
                </div>
                {item.comboSelections && (
                  <ul className="cart-item-modifiers combo-cart-details">
                    {item.comboSelections.fixedItems.map((fixed) => (
                      <li key={`fixed-${fixed.productId}`}>{fixed.quantity}x {fixed.productName}</li>
                    ))}
                    {item.comboSelections.selectedOptions.map((selected) => (
                      <li key={selected.optionId}>
                        {selected.groupName}: {selected.productName}
                        {selected.priceDelta !== 0 ? ` (+${selected.priceDelta.toFixed(2)} €)` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {item.modifiers.length > 0 && (
                  <ul className="cart-item-modifiers">
                    {item.modifiers.map((m) => (
                      <li key={m.optionId}>
                        {m.name}
                        {m.priceDelta !== 0 ? ` (${m.priceDelta > 0 ? "+" : ""}${m.priceDelta.toFixed(2)} €)` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {item.notes && <p className="muted">Obs: {item.notes}</p>}
                <div className="cart-item-actions">
                  <div className="quantity-row">
                    <button type="button" onClick={() => updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}>
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })}>
                      +
                    </button>
                  </div>
                  <button type="button" className="link-danger" onClick={() => removeItem(item.id)}>
                    Remover
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="cart-summary-panel">
          <div className="cart-summary-row">
            <span>Subtotal</span>
            <span>{subtotal.toFixed(2)} €</span>
          </div>
          <div className="cart-summary-total">
            <span>Total</span>
            <span>{subtotal.toFixed(2)} €</span>
          </div>
          <p className="cart-summary-hint">A taxa de entrega é calculada no próximo passo, consoante a sua morada.</p>
          <Link to="/checkout" className="checkout-btn">
            Continuar para pagamento
          </Link>
        </aside>
      </div>
    </div>
  );
}
