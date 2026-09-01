import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

export interface CartItemModifierView {
  optionId: string;
  groupName: string;
  name: string;
  priceDelta: number;
}

export interface CartItemView {
  id: string;
  kind: "PRODUCT" | "COMBO";
  productId: string | null;
  comboId: string | null;
  productName: string;
  productImageUrl: string | null;
  secondaryProductId: string | null;
  secondaryProductName: string | null;
  quantity: number;
  notes: string | null;
  unitPrice: number;
  lineTotal: number;
  modifiers: CartItemModifierView[];
  comboSelections: {
    fixedItems: { productId: string; productName: string; quantity: number }[];
    selectedOptions: { groupId: string; groupName: string; optionId: string; productId: string; productName: string; priceDelta: number }[];
  } | null;
}

interface CartView {
  cart: { id: string; restaurant: { id: string; name: string; slug: string } | null } | null;
  items: CartItemView[];
  subtotal: number;
}

interface CartContextValue extends CartView {
  loading: boolean;
  refresh: () => Promise<void>;
  addItem: (input: {
    productId: string;
    secondaryProductId?: string;
    quantity: number;
    modifierOptionIds: string[];
    notes?: string;
  }) => Promise<{ restaurantSwitched: boolean }>;
  addComboItem: (input: {
    comboId: string;
    quantity: number;
    selections: { groupId: string; optionIds: string[] }[];
    notes?: string;
  }) => Promise<{ restaurantSwitched: boolean }>;
  updateItem: (itemId: string, input: { quantity?: number; notes?: string }) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clear: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);
const EMPTY: CartView = { cart: null, items: [], subtotal: 0 };

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [view, setView] = useState<CartView>(EMPTY);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setView(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/cart");
      setView({ cart: data.cart, items: data.items, subtotal: data.subtotal });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addItem(input: {
    productId: string;
    secondaryProductId?: string;
    quantity: number;
    modifierOptionIds: string[];
    notes?: string;
  }) {
    const { data } = await api.post("/cart/items", input);
    await refresh();
    return { restaurantSwitched: Boolean(data.restaurantSwitched) };
  }

  async function addComboItem(input: {
    comboId: string;
    quantity: number;
    selections: { groupId: string; optionIds: string[] }[];
    notes?: string;
  }) {
    const { data } = await api.post("/cart/combo-items", input);
    await refresh();
    return { restaurantSwitched: Boolean(data.restaurantSwitched) };
  }

  async function updateItem(itemId: string, input: { quantity?: number; notes?: string }) {
    await api.patch(`/cart/items/${itemId}`, input);
    await refresh();
  }

  async function removeItem(itemId: string) {
    await api.delete(`/cart/items/${itemId}`);
    await refresh();
  }

  async function clear() {
    await api.delete("/cart");
    await refresh();
  }

  return (
    <CartContext.Provider value={{ ...view, loading, refresh, addItem, addComboItem, updateItem, removeItem, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
