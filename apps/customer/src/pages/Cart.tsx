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
      <h1>Carrinho — {cart.restaurant?.name}</h1>
      <ul className="cart-list">
        {items.map((item) => (
          <li key={item.id} className="cart-item">
            <div className="cart-item-main">
              <strong>
                {item.quantity}x {item.productName}
                {item.secondaryProductName ? ` / ${item.secondaryProductName}` : ""}
              </strong>
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
            </div>
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
              <span className="price">{item.lineTotal.toFixed(2)} €</span>
              <button type="button" className="link-danger" onClick={() => removeItem(item.id)}>
                Remover
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="cart-summary">
        <span>Subtotal</span>
        <span>{subtotal.toFixed(2)} €</span>
      </div>
      <Link to="/checkout" className="checkout-btn">
        Continuar para pagamento
      </Link>
    </div>
  );
}
