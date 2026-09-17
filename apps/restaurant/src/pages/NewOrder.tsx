import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import "./NewOrder.css";

type Address = {
  id?: string;
  label?: string;
  line1: string;
  line2?: string | null;
  city: string;
  postalCode?: string | null;
  lat: number;
  lng: number;
};

type ModifierOption = { id: string; name: string; priceDelta: number; isDefault: boolean };
type ModifierGroup = { id: string; name: string; minSelect: number; maxSelect: number; options: ModifierOption[] };
type Product = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePrice: number;
  isAvailable: boolean;
  stock: number | null;
  allowsSplit: boolean;
  splitPricingRule: "MOST_EXPENSIVE" | "AVERAGE";
  modifierGroups: ModifierGroup[];
};
type Category = { id: string; name: string; sortOrder: number };
type ComboOption = { id: string; productId: string; priceDelta: number; product: { id: string; name: string; isAvailable?: boolean } };
type ComboGroup = { id: string; name: string; minSelect: number; maxSelect: number; options: ComboOption[] };
type Combo = {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  isActive: boolean;
  fixedItems: Array<{ id: string; quantity: number; product: { id: string; name: string } }>;
  groups: ComboGroup[];
};

type CartLine = {
  key: string;
  type: "PRODUCT" | "COMBO";
  name: string;
  unitPrice: number;
  quantity: number;
  productId?: string;
  comboId?: string;
  secondaryProductId?: string;
  modifierOptionIds?: string[];
  comboSelections?: Array<{ groupId: string; optionIds: string[] }>;
  notes?: string;
};

type LookupResult =
  | { type: "REGISTERED"; customer: { id: string; name: string; phone: string; addresses: Address[] } }
  | { type: "CONTACT"; customer: { id: string; name: string; phone: string }; lastDelivery: Address | null }
  | { type: "NOT_FOUND"; phone: string };

type AddressSuggestion = Address & { displayName: string };

export default function NewOrder() {
  const navigate = useNavigate();
  const [origin, setOrigin] = useState<"PHONE" | "COUNTER">("PHONE");
  const [fulfillmentType, setFulfillmentType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [registeredUserId, setRegisteredUserId] = useState<string | undefined>();
  const [selectedAddressId, setSelectedAddressId] = useState<string | undefined>();
  const [delivery, setDelivery] = useState<Address | null>(null);
  const [addressLine1, setAddressLine1] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressBusy, setAddressBusy] = useState(false);
  const [deliveryInstructions, setDeliveryInstructions] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [configProduct, setConfigProduct] = useState<Product | null>(null);
  const [configCombo, setConfigCombo] = useState<Combo | null>(null);
  const [configQty, setConfigQty] = useState(1);
  const [configNotes, setConfigNotes] = useState("");
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [secondaryProductId, setSecondaryProductId] = useState<string>("");
  const [comboSelections, setComboSelections] = useState<Record<string, string[]>>({});

  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "MBWAY" | "TERMINAL">("CASH");
  const [amountTendered, setAmountTendered] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get("/restaurant/catalog/categories"),
      api.get("/restaurant/catalog/products"),
      api.get("/restaurant/combos"),
    ]).then(([categoriesResult, productsResult, combosResult]) => {
      setCategories(categoriesResult.data.categories ?? []);
      setProducts(productsResult.data.products ?? []);
      setCombos((combosResult.data.combos ?? []).filter((combo: Combo) => combo.isActive));
    }).catch(() => setError("Não foi possível carregar o menu."));
  }, []);

  useEffect(() => {
    if (origin === "COUNTER" && fulfillmentType === "PICKUP" && !phoneSearch.trim()) {
      setLookup(null);
      setRegisteredUserId(undefined);
      setCustomerName("");
      setCustomerPhone("");
    }
  }, [origin, fulfillmentType, phoneSearch]);

  function populateAddressSearch(address: Address) {
    setAddressLine1(address.line1);
    setAddressPostalCode(address.postalCode ?? "");
    setAddressCity(address.city);
  }

  async function searchCustomer() {
    if (!phoneSearch.trim()) return;
    setLookupBusy(true);
    setError(null);
    try {
      const { data } = await api.get("/restaurant/orders/customer-lookup", { params: { phone: phoneSearch } });
      const result = data as LookupResult;
      setLookup(result);
      setSelectedAddressId(undefined);
      setDelivery(null);
      setAddressSuggestions([]);
      setAddressLine1("");
      setAddressPostalCode("");
      setAddressCity("");
      setDeliveryInstructions("");
      if (result.type === "REGISTERED") {
        setRegisteredUserId(result.customer.id);
        setCustomerName(result.customer.name);
        setCustomerPhone(result.customer.phone);
        const preferred = result.customer.addresses.find((address) => (address as Address & { isDefault?: boolean }).isDefault) ?? result.customer.addresses[0];
        if (preferred) setSelectedAddressId(preferred.id);
      } else if (result.type === "CONTACT") {
        setRegisteredUserId(undefined);
        setCustomerName(result.customer.name);
        setCustomerPhone(result.customer.phone);
        if (result.lastDelivery?.lat != null && result.lastDelivery?.lng != null && result.lastDelivery.line1 && result.lastDelivery.city) {
          setDelivery(result.lastDelivery);
          populateAddressSearch(result.lastDelivery);
        }
      } else {
        setRegisteredUserId(undefined);
        setCustomerName("");
        setCustomerPhone(result.phone);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Não foi possível procurar o cliente.");
    } finally {
      setLookupBusy(false);
    }
  }

  async function searchAddress() {
    if (addressLine1.trim().length < 2) return;
    setAddressBusy(true);
    setError(null);
    try {
      const { data } = await api.get("/restaurant/orders/address-search", {
        params: {
          line1: addressLine1.trim(),
          postalCode: addressPostalCode.trim() || undefined,
          city: addressCity.trim() || undefined,
        },
      });
      setAddressSuggestions(data.suggestions ?? []);
      if (!(data.suggestions ?? []).length) {
        setError("Não encontrei essa morada. Confirme a rua e, se possível, indique também o código postal e a localidade.");
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Não foi possível pesquisar a morada.");
    } finally {
      setAddressBusy(false);
    }
  }

  function chooseSuggestion(suggestion: AddressSuggestion) {
    setDelivery(suggestion);
    setSelectedAddressId(undefined);
    populateAddressSearch(suggestion);
    setAddressSuggestions([]);
    setError(null);
  }

  const visibleProducts = useMemo(
    () => products.filter((product) => product.isAvailable && (activeCategory === "ALL" || product.categoryId === activeCategory)),
    [products, activeCategory],
  );

  const cartSubtotal = useMemo(() => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [cart]);

  function openProduct(product: Product) {
    setConfigProduct(product);
    setConfigCombo(null);
    setConfigQty(1);
    setConfigNotes("");
    setSecondaryProductId("");
    setSelectedModifiers(product.modifierGroups.flatMap((group) => group.options.filter((option) => option.isDefault).map((option) => option.id)));
  }

  function toggleModifier(group: ModifierGroup, optionId: string) {
    setSelectedModifiers((current) => {
      const inGroup = group.options.map((option) => option.id);
      const selectedInGroup = current.filter((id) => inGroup.includes(id));
      const already = current.includes(optionId);
      if (already) return current.filter((id) => id !== optionId);
      if (group.maxSelect === 1) return [...current.filter((id) => !inGroup.includes(id)), optionId];
      if (selectedInGroup.length >= group.maxSelect) return current;
      return [...current, optionId];
    });
  }

  function addConfiguredProduct() {
    if (!configProduct) return;
    for (const group of configProduct.modifierGroups) {
      const count = group.options.filter((option) => selectedModifiers.includes(option.id)).length;
      if (count < group.minSelect || count > group.maxSelect) {
        setError(`Selecione ${group.minSelect === group.maxSelect ? group.minSelect : `${group.minSelect}–${group.maxSelect}`} opção(ões) em ${group.name}.`);
        return;
      }
    }
    const modifierTotal = configProduct.modifierGroups
      .flatMap((group) => group.options)
      .filter((option) => selectedModifiers.includes(option.id))
      .reduce((sum, option) => sum + option.priceDelta, 0);
    let base = configProduct.basePrice;
    if (secondaryProductId) {
      const secondary = products.find((product) => product.id === secondaryProductId);
      if (secondary) base = configProduct.splitPricingRule === "AVERAGE" ? (configProduct.basePrice + secondary.basePrice) / 2 : Math.max(configProduct.basePrice, secondary.basePrice);
    }
    setCart((current) => [...current, {
      key: `${Date.now()}-${Math.random()}`,
      type: "PRODUCT",
      name: secondaryProductId ? `${configProduct.name} / ${products.find((p) => p.id === secondaryProductId)?.name ?? ""}` : configProduct.name,
      productId: configProduct.id,
      secondaryProductId: secondaryProductId || undefined,
      modifierOptionIds: selectedModifiers,
      notes: configNotes.trim() || undefined,
      unitPrice: Math.round((base + modifierTotal) * 100) / 100,
      quantity: configQty,
    }]);
    setConfigProduct(null);
    setError(null);
  }

  function openCombo(combo: Combo) {
    setConfigCombo(combo);
    setConfigProduct(null);
    setConfigQty(1);
    setConfigNotes("");
    const defaults: Record<string, string[]> = {};
    for (const group of combo.groups) defaults[group.id] = [];
    setComboSelections(defaults);
  }

  function toggleComboOption(group: ComboGroup, optionId: string) {
    setComboSelections((current) => {
      const selected = current[group.id] ?? [];
      if (selected.includes(optionId)) return { ...current, [group.id]: selected.filter((id) => id !== optionId) };
      if (group.maxSelect === 1) return { ...current, [group.id]: [optionId] };
      if (selected.length >= group.maxSelect) return current;
      return { ...current, [group.id]: [...selected, optionId] };
    });
  }

  function addConfiguredCombo() {
    if (!configCombo) return;
    for (const group of configCombo.groups) {
      const count = (comboSelections[group.id] ?? []).length;
      if (count < group.minSelect || count > group.maxSelect) {
        setError(`Selecione ${group.minSelect === group.maxSelect ? group.minSelect : `${group.minSelect}–${group.maxSelect}`} opção(ões) em ${group.name}.`);
        return;
      }
    }
    const extra = configCombo.groups.flatMap((group) => group.options)
      .filter((option) => Object.values(comboSelections).flat().includes(option.id))
      .reduce((sum, option) => sum + option.priceDelta, 0);
    setCart((current) => [...current, {
      key: `${Date.now()}-${Math.random()}`,
      type: "COMBO",
      name: configCombo.name,
      comboId: configCombo.id,
      comboSelections: configCombo.groups.map((group) => ({ groupId: group.id, optionIds: comboSelections[group.id] ?? [] })),
      notes: configNotes.trim() || undefined,
      unitPrice: Math.round((configCombo.basePrice + extra) * 100) / 100,
      quantity: configQty,
    }]);
    setConfigCombo(null);
    setError(null);
  }

  function updateLineQuantity(key: string, quantity: number) {
    if (quantity < 1) return setCart((current) => current.filter((line) => line.key !== key));
    setCart((current) => current.map((line) => line.key === key ? { ...line, quantity: Math.min(50, quantity) } : line));
  }

  async function submitOrder() {
    setError(null);
    if (!cart.length) return setError("Adicione pelo menos um item ao pedido.");
    const anonymousCounterPickup = origin === "COUNTER" && fulfillmentType === "PICKUP" && !customerName.trim() && !customerPhone.trim();
    if (!anonymousCounterPickup && (!customerName.trim() || !customerPhone.trim())) return setError("Indique o nome e o telefone do cliente.");
    if (fulfillmentType === "DELIVERY" && !selectedAddressId && !delivery) return setError("Selecione ou pesquise a morada de entrega.");

    setBusy(true);
    try {
      const payload: any = {
        origin,
        fulfillmentType,
        registeredUserId,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        addressId: fulfillmentType === "DELIVERY" ? selectedAddressId : undefined,
        delivery: fulfillmentType === "DELIVERY" && !selectedAddressId && delivery ? {
          line1: delivery.line1,
          line2: delivery.line2 || undefined,
          city: delivery.city,
          postalCode: delivery.postalCode || undefined,
          lat: delivery.lat,
          lng: delivery.lng,
        } : undefined,
        deliveryInstructions: fulfillmentType === "DELIVERY" ? deliveryInstructions.trim() || undefined : undefined,
        paymentMethod,
        amountTendered: paymentMethod === "CASH" && amountTendered ? Number(amountTendered.replace(",", ".")) : undefined,
        notes: orderNotes.trim() || undefined,
        items: cart.map((line) => ({
          productId: line.productId,
          comboId: line.comboId,
          secondaryProductId: line.secondaryProductId,
          quantity: line.quantity,
          modifierOptionIds: line.modifierOptionIds ?? [],
          comboSelections: line.comboSelections ?? [],
          notes: line.notes,
        })),
      };
      await api.post("/restaurant/orders/manual", payload);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Não foi possível criar o pedido.");
    } finally {
      setBusy(false);
    }
  }

  const registeredAddresses = lookup?.type === "REGISTERED" ? lookup.customer.addresses : [];
  const selectedSavedAddress = selectedAddressId ? registeredAddresses.find((address) => address.id === selectedAddressId) : undefined;

  return (
    <div className="page-content manual-order-page">
      <div className="menu-toolbar">
        <div>
          <p className="page-eyebrow">Atendimento assistido</p>
          <h1>Novo pedido</h1>
          <p className="page-subtitle">Telefone ou balcão — entra no mesmo fluxo da app, cozinha e estafeta.</p>
        </div>
        <button className="secondary-action" onClick={() => navigate("/")}>Voltar aos pedidos</button>
      </div>

      <div className="manual-order-layout">
        <section className="manual-order-main">
          <div className="manual-section">
            <h2>1. Origem e cliente</h2>
            <div className="segmented-control">
              <button className={origin === "PHONE" ? "active" : ""} onClick={() => setOrigin("PHONE")}>Telefone</button>
              <button className={origin === "COUNTER" ? "active" : ""} onClick={() => setOrigin("COUNTER")}>Balcão</button>
            </div>
            <div className="customer-search-row">
              <input value={phoneSearch} onChange={(e) => setPhoneSearch(e.target.value)} placeholder="Telefone do cliente" onKeyDown={(e) => e.key === "Enter" && searchCustomer()} />
              <button onClick={searchCustomer} disabled={lookupBusy || !phoneSearch.trim()}>{lookupBusy ? "A procurar..." : "Procurar"}</button>
            </div>
            {lookup?.type === "REGISTERED" && <p className="success-note">✓ Cliente registado encontrado. O pedido ficará no histórico da conta.</p>}
            {lookup?.type === "CONTACT" && <p className="success-note">✓ Cliente já atendido por telefone/balcão.</p>}
            {lookup?.type === "NOT_FOUND" && <p className="hint">Cliente novo — preencha apenas os dados necessários. Não será criada uma password.</p>}
            {(lookup || origin === "PHONE" || fulfillmentType === "DELIVERY") && (
              <div className="manual-two-cols">
                <label>Nome<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" /></label>
                <label>Telefone<input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="912 345 678" /></label>
              </div>
            )}
            {origin === "COUNTER" && fulfillmentType === "PICKUP" && !lookup && <p className="hint">Para venda rápida ao balcão, nome e telefone podem ficar vazios.</p>}
          </div>

          <div className="manual-section">
            <h2>2. Entrega ou recolha</h2>
            <div className="segmented-control">
              <button className={fulfillmentType === "DELIVERY" ? "active" : ""} onClick={() => setFulfillmentType("DELIVERY")}>Entrega</button>
              <button className={fulfillmentType === "PICKUP" ? "active" : ""} onClick={() => setFulfillmentType("PICKUP")}>Recolha</button>
            </div>
            {fulfillmentType === "DELIVERY" && (
              <div className="delivery-box">
                {selectedSavedAddress && (
                  <div className="selected-address-card">
                    <strong>✓ Morada habitual selecionada</strong>
                    <p>{selectedSavedAddress.line1}{selectedSavedAddress.line2 ? `, ${selectedSavedAddress.line2}` : ""}</p>
                    <p>{[selectedSavedAddress.postalCode, selectedSavedAddress.city].filter(Boolean).join(" ")}</p>
                    <small>Confirme com o cliente. Se hoje estiver noutro local, pesquise outra morada abaixo.</small>
                  </div>
                )}
                {registeredAddresses.length > 0 && (
                  <div className="saved-addresses">
                    <strong>Moradas guardadas</strong>
                    {registeredAddresses.map((address) => (
                      <button key={address.id} className={selectedAddressId === address.id ? "selected" : ""} onClick={() => { setSelectedAddressId(address.id); setDelivery(null); setAddressSuggestions([]); }}>
                        <b>{selectedAddressId === address.id ? "✓ " : ""}{address.label || "Morada"}</b><span>{address.line1}{address.line2 ? `, ${address.line2}` : ""} · {[address.postalCode, address.city].filter(Boolean).join(" ")}</span>
                      </button>
                    ))}
                  </div>
                )}
                {lookup?.type === "CONTACT" && lookup.lastDelivery?.line1 && lookup.lastDelivery?.city && (
                  <button className="last-address-btn" onClick={() => { setDelivery(lookup.lastDelivery); setSelectedAddressId(undefined); populateAddressSearch(lookup.lastDelivery); setAddressSuggestions([]); }}>
                    Usar última entrega: {lookup.lastDelivery.line1}{lookup.lastDelivery.postalCode ? ` · ${lookup.lastDelivery.postalCode}` : ""}, {lookup.lastDelivery.city}
                  </button>
                )}

                <strong>{selectedSavedAddress || delivery ? "Pesquisar outra morada" : "Pesquisar morada de entrega"}</strong>
                <div className="manual-two-cols">
                  <label>Rua e número<input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Ex.: Rua do Souto, 10" onKeyDown={(e) => e.key === "Enter" && searchAddress()} /></label>
                  <label>Código postal<input value={addressPostalCode} onChange={(e) => setAddressPostalCode(e.target.value)} placeholder="Ex.: 4700-329" onKeyDown={(e) => e.key === "Enter" && searchAddress()} /></label>
                  <label>Localidade<input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="Ex.: Braga" onKeyDown={(e) => e.key === "Enter" && searchAddress()} /></label>
                </div>
                <button onClick={searchAddress} disabled={addressBusy || addressLine1.trim().length < 2}>{addressBusy ? "A procurar..." : "Pesquisar morada"}</button>
                <small className="hint">O código postal e a localidade ajudam a evitar resultados de ruas semelhantes noutros bairros.</small>

                {addressSuggestions.length > 0 && (
                  <div className="address-suggestions">
                    {addressSuggestions.map((suggestion, index) => (
                      <button key={`${suggestion.lat}-${suggestion.lng}-${index}`} onClick={() => chooseSuggestion(suggestion)}>{suggestion.displayName}</button>
                    ))}
                  </div>
                )}
                {delivery && !selectedAddressId && (
                  <div className="selected-address-card">
                    <strong>✓ Morada encontrada — confirme com o cliente</strong>
                    <p>{delivery.line1}</p>
                    <p>{[delivery.postalCode, delivery.city].filter(Boolean).join(" ")}</p>
                    <label>Andar / porta / complemento<input value={delivery.line2 ?? ""} onChange={(e) => setDelivery({ ...delivery, line2: e.target.value })} placeholder="Ex.: 3.º esquerdo, porta B" /></label>
                    <small>As coordenadas ficam associadas à morada escolhida. Se a rua estiver errada, pesquise e selecione outra sugestão.</small>
                  </div>
                )}

                {(selectedAddressId || delivery) && (
                  <label>
                    Referência / instruções para o estafeta
                    <textarea rows={2} value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} maxLength={300} placeholder="Ex.: portão azul, perto da escola, tocar no 3.º esquerdo" />
                  </label>
                )}
              </div>
            )}
          </div>

          <div className="manual-section">
            <h2>3. Itens</h2>
            <div className="category-tabs manual-categories">
              <button className={activeCategory === "ALL" ? "active" : ""} onClick={() => setActiveCategory("ALL")}>Todos</button>
              {categories.map((category) => <button key={category.id} className={activeCategory === category.id ? "active" : ""} onClick={() => setActiveCategory(category.id)}>{category.name}</button>)}
            </div>
            <div className="manual-product-grid">
              {visibleProducts.map((product) => (
                <button key={product.id} className="manual-product-card" onClick={() => openProduct(product)}>
                  <span><strong>{product.name}</strong><small>{product.description || "Produto"}</small></span>
                  <b>{product.basePrice.toFixed(2)} €</b>
                </button>
              ))}
            </div>
            {combos.length > 0 && (
              <>
                <h3 className="manual-subheading">Combos</h3>
                <div className="manual-product-grid">
                  {combos.map((combo) => <button key={combo.id} className="manual-product-card combo-card" onClick={() => openCombo(combo)}><span><strong>{combo.name}</strong><small>{combo.description || "Combo"}</small></span><b>{combo.basePrice.toFixed(2)} €</b></button>)}
                </div>
              </>
            )}
          </div>
        </section>

        <aside className="manual-order-summary">
          <h2>Pedido</h2>
          {cart.length === 0 ? <p className="hint">Ainda não adicionou itens.</p> : cart.map((line) => (
            <div className="manual-cart-line" key={line.key}>
              <div><strong>{line.name}</strong><small>{line.unitPrice.toFixed(2)} € cada</small></div>
              <div className="qty-control"><button onClick={() => updateLineQuantity(line.key, line.quantity - 1)}>−</button><span>{line.quantity}</span><button onClick={() => updateLineQuantity(line.key, line.quantity + 1)}>+</button></div>
              <b>{(line.unitPrice * line.quantity).toFixed(2)} €</b>
            </div>
          ))}
          <div className="manual-total"><span>Subtotal estimado</span><strong>{cartSubtotal.toFixed(2)} €</strong></div>
          <small className="hint">A taxa de entrega e o total final são calculados pelo servidor conforme a morada.</small>

          <label>Pagamento<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}><option value="CASH">Dinheiro</option><option value="MBWAY">MB WAY</option><option value="TERMINAL">Terminal</option></select></label>
          {paymentMethod === "CASH" && <label>Cliente paga com (opcional)<input inputMode="decimal" value={amountTendered} onChange={(e) => setAmountTendered(e.target.value)} placeholder="Ex.: 20,00" /></label>}
          <label>Observações do pedido<textarea rows={3} value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Ex.: sem cebola, atenção à preparação" /></label>
          {error && <p className="form-error notice-error">{error}</p>}
          <button className="manual-submit" disabled={busy || cart.length === 0} onClick={submitOrder}>{busy ? "A criar pedido..." : "Criar pedido"}</button>
        </aside>
      </div>

      {configProduct && (
        <div className="modal-backdrop" onClick={() => setConfigProduct(null)}>
          <div className="modal manual-config-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{configProduct.name}</h2><p className="hint">{configProduct.basePrice.toFixed(2)} € base</p>
            {configProduct.allowsSplit && <label>Meio a meio (opcional)<select value={secondaryProductId} onChange={(e) => setSecondaryProductId(e.target.value)}><option value="">Sem segundo sabor</option>{products.filter((product) => product.isAvailable && product.id !== configProduct.id).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.basePrice.toFixed(2)} €</option>)}</select></label>}
            {configProduct.modifierGroups.map((group) => <div className="option-group" key={group.id}><strong>{group.name}</strong><small>Escolha {group.minSelect === group.maxSelect ? group.minSelect : `${group.minSelect}–${group.maxSelect}`}</small>{group.options.map((option) => <label className="option-row" key={option.id}><input type="checkbox" checked={selectedModifiers.includes(option.id)} onChange={() => toggleModifier(group, option.id)} /><span>{option.name}</span><b>{option.priceDelta ? `+${option.priceDelta.toFixed(2)} €` : "Incluído"}</b></label>)}</div>)}
            <div className="manual-two-cols"><label>Quantidade<input type="number" min={1} max={50} value={configQty} onChange={(e) => setConfigQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></label><label>Nota do item<input value={configNotes} onChange={(e) => setConfigNotes(e.target.value)} placeholder="Sem cebola..." /></label></div>
            <div className="modal-actions"><button className="link-btn" onClick={() => setConfigProduct(null)}>Cancelar</button><button onClick={addConfiguredProduct}>Adicionar ao pedido</button></div>
          </div>
        </div>
      )}

      {configCombo && (
        <div className="modal-backdrop" onClick={() => setConfigCombo(null)}>
          <div className="modal manual-config-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{configCombo.name}</h2><p className="hint">{configCombo.basePrice.toFixed(2)} € base</p>
            {configCombo.fixedItems.length > 0 && <p className="hint">Inclui: {configCombo.fixedItems.map((item) => `${item.quantity}× ${item.product.name}`).join(" · ")}</p>}
            {configCombo.groups.map((group) => <div className="option-group" key={group.id}><strong>{group.name}</strong><small>Escolha {group.minSelect === group.maxSelect ? group.minSelect : `${group.minSelect}–${group.maxSelect}`}</small>{group.options.map((option) => <label className="option-row" key={option.id}><input type="checkbox" checked={(comboSelections[group.id] ?? []).includes(option.id)} onChange={() => toggleComboOption(group, option.id)} /><span>{option.product.name}</span><b>{option.priceDelta ? `+${option.priceDelta.toFixed(2)} €` : "Incluído"}</b></label>)}</div>)}
            <div className="manual-two-cols"><label>Quantidade<input type="number" min={1} max={50} value={configQty} onChange={(e) => setConfigQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></label><label>Nota do item<input value={configNotes} onChange={(e) => setConfigNotes(e.target.value)} /></label></div>
            <div className="modal-actions"><button className="link-btn" onClick={() => setConfigCombo(null)}>Cancelar</button><button onClick={addConfiguredCombo}>Adicionar ao pedido</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
