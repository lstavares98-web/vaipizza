from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:100]!r}")
    p.write_text(text.replace(old, new, 1))


# Prisma: additive nullable payment destination only.
replace_once(
    "apps/api/prisma/schema.prisma",
    '  email   String @unique\n  phone   String\n\n  address',
    '  email   String @unique\n  phone   String\n  mbwayPhone String?\n\n  address',
)
migration = Path("apps/api/prisma/migrations/20260914113000_add_restaurant_mbway_phone/migration.sql")
migration.parent.mkdir(parents=True, exist_ok=True)
migration.write_text('ALTER TABLE "Restaurant" ADD COLUMN "mbwayPhone" TEXT;\n')

# Restaurant settings API.
replace_once(
    "apps/api/src/modules/restaurants/settings.routes.ts",
    '  phone: z.string().min(6).max(20).optional(),\n',
    '  phone: z.string().min(6).max(20).optional(),\n  mbwayPhone: z.preprocess((value) => value === "" ? null : value, z.string().min(6).max(30).nullable()).optional(),\n',
)

# Orders backend: configured MB WAY, server-side payment gate, customer phone payload and explicit confirmation.
replace_once(
    "apps/api/src/modules/orders/orders.service.ts",
    'import { buildComboSelectionSnapshot, isComboScheduleAvailable, priceCombo, validateComboSelection, type ComboSelectionInput } from "../combos/combo.rules.js";\n',
    'import { buildComboSelectionSnapshot, isComboScheduleAvailable, priceCombo, validateComboSelection, type ComboSelectionInput } from "../combos/combo.rules.js";\nimport { canRestaurantStartOrder } from "./paymentPolicy.js";\n',
)
replace_once(
    "apps/api/src/modules/orders/orders.service.ts",
    '  if (input.fulfillmentType === "PICKUP" && !restaurant.acceptsPickup) {\n    throw badRequest("Este restaurante não aceita recolha no local");\n  }\n\n  const pricedItems',
    '  if (input.fulfillmentType === "PICKUP" && !restaurant.acceptsPickup) {\n    throw badRequest("Este restaurante não aceita recolha no local");\n  }\n  if (input.paymentMethod === "MBWAY" && !restaurant.mbwayPhone) {\n    throw badRequest("O pagamento por MB WAY ainda não está configurado neste restaurante", "MBWAY_NOT_CONFIGURED");\n  }\n\n  const pricedItems',
)
replace_once(
    "apps/api/src/modules/orders/orders.service.ts",
    '  restaurant: true,\n  address: true,\n',
    '  restaurant: true,\n  user: { select: { name: true, phone: true } },\n  address: true,\n',
)
replace_once(
    "apps/api/src/modules/orders/orders.service.ts",
    '  if (order.status === "NEW" && input.status === "ACCEPTED") {\n    assertTransitionAllowed(order.status, "ACCEPTED", actorRole);\n',
    '  if (order.status === "NEW" && input.status === "ACCEPTED") {\n    if (!canRestaurantStartOrder(order.paymentMethod, order.paymentStatus)) {\n      throw badRequest("Confirme primeiro o pagamento MB WAY antes de aceitar o pedido", "PAYMENT_PENDING");\n    }\n    assertTransitionAllowed(order.status, "ACCEPTED", actorRole);\n',
)
replace_once(
    "apps/api/src/modules/orders/orders.service.ts",
    '// ---- Restaurant / kitchen side --------------------------------------\n\nexport async function listOrdersForRestaurant',
    '''// ---- Restaurant / kitchen side --------------------------------------\n\nexport async function confirmMbwayPayment(restaurantId: string, orderId: string) {\n  const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId } });\n  if (!order) throw notFound("Order not found");\n  if (order.paymentMethod !== "MBWAY") throw badRequest("Este pedido não usa MB WAY", "NOT_MBWAY_ORDER");\n  if (order.status === "CANCELLED") throw badRequest("Não é possível confirmar o pagamento de um pedido cancelado", "ORDER_CANCELLED");\n  if (order.paymentStatus === "PAID") return order;\n\n  const updated = await prisma.order.update({\n    where: { id: order.id },\n    data: { paymentStatus: "PAID" },\n  });\n  getIO()?.to(rooms.restaurant(restaurantId)).emit("order:payment", { orderId: order.id, paymentStatus: "PAID" });\n  getIO()?.to(rooms.customer(order.userId)).emit("order:payment", { orderId: order.id, paymentStatus: "PAID" });\n  return updated;\n}\n\nexport async function listOrdersForRestaurant''',
)

# Restaurant endpoint: KDS cannot confirm money; counter/owner can.
replace_once(
    "apps/api/src/modules/orders/restaurantOrders.routes.ts",
    'restaurantOrdersRouter.patch(\n  "/:id/status",',
    '''restaurantOrdersRouter.post(\n  "/:id/confirm-mbway-payment",\n  requireRole(Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF),\n  asyncHandler(async (req, res) => {\n    const order = await ordersService.confirmMbwayPayment(req.auth!.restaurantId!, req.params.id!);\n    res.json({ success: true, order });\n  }),\n);\n\nrestaurantOrdersRouter.patch(\n  "/:id/status",''',
)

# Gestão settings: separate number for the transfer destination.
replace_once(
    "apps/restaurant/src/pages/Settings.tsx",
    '  phone: string;\n  deliveryFeeMode:',
    '  phone: string;\n  mbwayPhone: string | null;\n  deliveryFeeMode:',
)
replace_once(
    "apps/restaurant/src/pages/Settings.tsx",
    '''        <label>\n          Telefone (usado no botão de WhatsApp da app do cliente)\n          <input value={settings.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+351 912 345 678" required />\n        </label>\n        <label className="checkbox">''',
    '''        <label>\n          Telefone (usado no botão de WhatsApp da app do cliente)\n          <input value={settings.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+351 912 345 678" required />\n        </label>\n        <label>\n          Número MB WAY\n          <input\n            value={settings.mbwayPhone ?? ""}\n            onChange={(e) => set("mbwayPhone", e.target.value || null)}\n            placeholder="+351 912 345 678"\n          />\n          <span className="hint">É este número que o cliente verá para fazer a transferência MB WAY. Pode ser diferente do WhatsApp do restaurante.</span>\n        </label>\n        <label className="checkbox">''',
)

# Customer order detail: ready pickup + MB WAY instructions and proof shortcut.
replace_once(
    "apps/customer/src/pages/OrderDetail.tsx",
    '  restaurant: { name: string };\n',
    '  restaurant: { name: string; phone: string; mbwayPhone: string | null };\n',
)
replace_once(
    "apps/customer/src/pages/OrderDetail.tsx",
    '    socket.on("order:status", handler);\n    socket.on("connect", reconcileAfterReconnect);\n',
    '    socket.on("order:status", handler);\n    socket.on("order:payment", handler);\n    socket.on("connect", reconcileAfterReconnect);\n',
)
replace_once(
    "apps/customer/src/pages/OrderDetail.tsx",
    '      socket.off("order:status", handler);\n      socket.off("connect", reconcileAfterReconnect);\n',
    '      socket.off("order:status", handler);\n      socket.off("order:payment", handler);\n      socket.off("connect", reconcileAfterReconnect);\n',
)
replace_once(
    "apps/customer/src/pages/OrderDetail.tsx",
    '  if (!order) return <p className="page">A carregar pedido...</p>;\n\n  async function handleCancel()',
    '''  if (!order) return <p className="page">A carregar pedido...</p>;\n\n  const rawWhatsapp = order.restaurant.phone.replace(/\\D/g, "");\n  const whatsappNumber = rawWhatsapp.length === 9 ? `351${rawWhatsapp}` : rawWhatsapp;\n  const paymentProofText = encodeURIComponent(\n    `Olá! Enviei o comprovativo do pagamento MB WAY do pedido #${order.orderNumber}, no valor de ${order.total.toFixed(2)} €.`\n  );\n  const paymentProofHref = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${paymentProofText}` : null;\n\n  async function handleCancel()''',
)
replace_once(
    "apps/customer/src/pages/OrderDetail.tsx",
    '      <p className="badge">{ORDER_STATUS_LABELS[order.status] ?? order.status}</p>\n\n      {order.courier && (',
    '''      <p className="badge">{ORDER_STATUS_LABELS[order.status] ?? order.status}</p>\n\n      {order.fulfillmentType === "PICKUP" && order.status === "READY_FOR_PICKUP" && (\n        <section className="modifier-group pickup-ready-notice">\n          <h2>✅ O seu pedido está pronto para recolha</h2>\n          <p>Pode dirigir-se ao restaurante para levantar o pedido.</p>\n        </section>\n      )}\n\n      {order.paymentMethod === "MBWAY" && (\n        <section className="modifier-group">\n          <h3>Pagamento MB WAY</h3>\n          {order.paymentStatus === "PAID" ? (\n            <p><strong>✅ Pagamento confirmado</strong></p>\n          ) : (\n            <>\n              <p>Envie <strong>{order.total.toFixed(2)} €</strong> por MB WAY para:</p>\n              <p><strong>{order.restaurant.mbwayPhone ?? "Número MB WAY indisponível"}</strong></p>\n              <p className="muted">Depois, envie o comprovativo pelo WhatsApp. O restaurante confirmará o pagamento antes de preparar o pedido.</p>\n              {paymentProofHref && (\n                <a className="add-to-cart-btn" href={paymentProofHref} target="_blank" rel="noreferrer">\n                  Enviar comprovativo pelo WhatsApp\n                </a>\n              )}\n            </>\n          )}\n        </section>\n      )}\n\n      {order.courier && (''',
)

# Gestão order board: payment state, confirm action, pickup notification and collection action.
replace_once(
    "apps/restaurant/src/pages/OrdersDashboard.tsx",
    '  paymentMethod: "CARD" | "CASH" | "MBWAY" | "TERMINAL";\n  amountTendered:',
    '  paymentMethod: "CARD" | "CASH" | "MBWAY" | "TERMINAL";\n  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED";\n  user: { name: string; phone: string | null };\n  amountTendered:',
)
replace_once(
    "apps/restaurant/src/pages/OrdersDashboard.tsx",
    '''  async function reject(order: OrderRow) {\n    const rejectionReason = window.prompt("Motivo da rejeição?") ?? "";\n    if (!rejectionReason.trim()) return;\n    setBusyId(order.id);\n    try {\n      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "CANCELLED", rejectionReason });\n      load();\n    } finally {\n      setBusyId(null);\n    }\n  }\n\n  return (''',
    '''  async function reject(order: OrderRow) {\n    const rejectionReason = window.prompt("Motivo da rejeição?") ?? "";\n    if (!rejectionReason.trim()) return;\n    setBusyId(order.id);\n    try {\n      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "CANCELLED", rejectionReason });\n      load();\n    } finally {\n      setBusyId(null);\n    }\n  }\n\n  async function confirmMbway(order: OrderRow) {\n    setBusyId(order.id);\n    try {\n      await api.post(`/restaurant/orders/${order.id}/confirm-mbway-payment`);\n      load();\n    } finally {\n      setBusyId(null);\n    }\n  }\n\n  async function collect(order: OrderRow) {\n    setBusyId(order.id);\n    try {\n      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "COLLECTED" });\n      load();\n    } finally {\n      setBusyId(null);\n    }\n  }\n\n  function pickupWhatsappHref(order: OrderRow) {\n    if (!order.user.phone) return null;\n    const raw = order.user.phone.replace(/\\D/g, "");\n    const number = raw.length === 9 ? `351${raw}` : raw;\n    const message = encodeURIComponent(`Olá ${order.user.name}! O seu pedido #${order.orderNumber} está pronto para recolha.`);\n    return number ? `https://wa.me/${number}?text=${message}` : null;\n  }\n\n  return (''',
)
replace_once(
    "apps/restaurant/src/pages/OrdersDashboard.tsx",
    '''              <div className="card-actions">\n                <button disabled={busyId === o.id} onClick={() => accept(o)}>\n                  Aceitar\n                </button>\n                <button className="danger" disabled={busyId === o.id} onClick={() => reject(o)}>''',
    '''              {o.paymentMethod === "MBWAY" && o.paymentStatus !== "PAID" && (\n                <p className="cash-warning">💳 MB WAY — A aguardar confirmação do pagamento</p>\n              )}\n              {o.paymentMethod === "MBWAY" && o.paymentStatus === "PAID" && (\n                <p className="hint">✅ MB WAY — pago</p>\n              )}\n              <div className="card-actions">\n                {o.paymentMethod === "MBWAY" && o.paymentStatus !== "PAID" && (\n                  <button disabled={busyId === o.id} onClick={() => confirmMbway(o)}>Confirmar pagamento recebido</button>\n                )}\n                <button\n                  disabled={busyId === o.id || (o.paymentMethod === "MBWAY" && o.paymentStatus !== "PAID")}\n                  onClick={() => accept(o)}\n                >\n                  Aceitar\n                </button>\n                <button className="danger" disabled={busyId === o.id} onClick={() => reject(o)}>''',
)
replace_once(
    "apps/restaurant/src/pages/OrdersDashboard.tsx",
    '''            <OrderCard key={o.id} order={o}>\n              {o.fulfillmentType === "DELIVERY" && REASSIGNABLE_STAGE.includes(o.status) && (\n                <button onClick={() => setReassignOrder(o)}>Reatribuir estafeta</button>\n              )}\n            </OrderCard>''',
    '''            <OrderCard key={o.id} order={o}>\n              {o.fulfillmentType === "PICKUP" && o.status === "READY_FOR_PICKUP" && (\n                <div className="card-actions">\n                  {pickupWhatsappHref(o) && (\n                    <a href={pickupWhatsappHref(o)!} target="_blank" rel="noreferrer">Avisar cliente pelo WhatsApp</a>\n                  )}\n                  <button disabled={busyId === o.id} onClick={() => collect(o)}>Recolhido</button>\n                </div>\n              )}\n              {o.fulfillmentType === "DELIVERY" && REASSIGNABLE_STAGE.includes(o.status) && (\n                <button onClick={() => setReassignOrder(o)}>Reatribuir estafeta</button>\n              )}\n            </OrderCard>''',
)
replace_once(
    "apps/restaurant/src/pages/OrdersDashboard.tsx",
    '''        <span className="payment-badge">{order.paymentMethod === "CASH" ? "Dinheiro" : order.paymentMethod === "TERMINAL" ? "Terminal" : order.paymentMethod}</span>\n      </div>''',
    '''        <span className="payment-badge">{order.paymentMethod === "CASH" ? "Dinheiro" : order.paymentMethod === "TERMINAL" ? "Terminal" : order.paymentMethod}</span>\n        {order.paymentMethod === "MBWAY" && (\n          <span className="payment-badge">{order.paymentStatus === "PAID" ? "Pago" : "Aguarda pagamento"}</span>\n        )}\n      </div>''',
)
