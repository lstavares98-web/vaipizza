from pathlib import Path

path = Path("apps/restaurant/src/pages/OrdersDashboard.tsx")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match, found {count}: {old[:80]!r}")
    source = source.replace(old, new, 1)


replace_once(
    'import { COURIER_INELIGIBILITY_LABELS, COURIER_STATUS_LABELS, formatGpsAge } from "../lib/courierPresentation";\n',
    'import { COURIER_INELIGIBILITY_LABELS, COURIER_STATUS_LABELS, formatGpsAge } from "../lib/courierPresentation";\nimport { useAuth } from "../context/AuthContext";\n',
)

replace_once(
    'const READY_STAGE = ["READY_FOR_PICKUP", "WAITING_FOR_COURIER", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];\nconst REASSIGNABLE_STAGE = ["WAITING_FOR_COURIER", "COURIER_ASSIGNED"];\n',
    'const READY_STAGE = ["READY_FOR_PICKUP", "WAITING_FOR_COURIER", "COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"];\nconst REASSIGNABLE_STAGE = ["WAITING_FOR_COURIER", "COURIER_ASSIGNED"];\nconst CANCELLABLE_STAGE = ["NEW", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "WAITING_FOR_COURIER", "COURIER_ASSIGNED"];\n',
)

replace_once(
    'export default function OrdersDashboard() {\n  const [orders, setOrders] = useState<OrderRow[]>([]);\n  const [busyId, setBusyId] = useState<string | null>(null);\n  const [reassignOrder, setReassignOrder] = useState<OrderRow | null>(null);\n',
    'export default function OrdersDashboard() {\n  const { user } = useAuth();\n  const [orders, setOrders] = useState<OrderRow[]>([]);\n  const [busyId, setBusyId] = useState<string | null>(null);\n  const [reassignOrder, setReassignOrder] = useState<OrderRow | null>(null);\n  const [cancelOrder, setCancelOrder] = useState<OrderRow | null>(null);\n  const canCancelOrders = user?.role === "RESTAURANT_OWNER" || user?.role === "RESTAURANT_STAFF";\n',
)

replace_once(
    '''  async function reject(order: OrderRow) {\n    const rejectionReason = window.prompt("Motivo da rejeição?") ?? "";\n    if (!rejectionReason.trim()) return;\n    setBusyId(order.id);\n    try {\n      await api.patch(`/restaurant/orders/${order.id}/status`, { status: "CANCELLED", rejectionReason });\n      load();\n    } finally {\n      setBusyId(null);\n    }\n  }\n\n''',
    '',
)

replace_once(
    '''                <button className="danger" disabled={busyId === o.id} onClick={() => reject(o)}>\n                  Rejeitar\n                </button>\n''',
    '''                {canCancelOrders && CANCELLABLE_STAGE.includes(o.status) && (\n                  <button className="danger" disabled={busyId === o.id} onClick={() => setCancelOrder(o)}>\n                    Cancelar pedido\n                  </button>\n                )}\n''',
)

replace_once(
    '''            <OrderCard key={o.id} order={o}>\n              <p className="hint">Na cozinha (KDS)</p>\n            </OrderCard>\n''',
    '''            <OrderCard key={o.id} order={o}>\n              <p className="hint">Na cozinha (KDS)</p>\n              {canCancelOrders && CANCELLABLE_STAGE.includes(o.status) && (\n                <div className="card-actions">\n                  <button className="danger" disabled={busyId === o.id} onClick={() => setCancelOrder(o)}>Cancelar pedido</button>\n                </div>\n              )}\n            </OrderCard>\n''',
)

replace_once(
    '''              {o.fulfillmentType === "DELIVERY" && REASSIGNABLE_STAGE.includes(o.status) && (\n                <button onClick={() => setReassignOrder(o)}>Reatribuir estafeta</button>\n              )}\n            </OrderCard>\n''',
    '''              {o.fulfillmentType === "DELIVERY" && REASSIGNABLE_STAGE.includes(o.status) && (\n                <button onClick={() => setReassignOrder(o)}>Reatribuir estafeta</button>\n              )}\n              {canCancelOrders && CANCELLABLE_STAGE.includes(o.status) && (\n                <div className="card-actions">\n                  <button className="danger" disabled={busyId === o.id} onClick={() => setCancelOrder(o)}>Cancelar pedido</button>\n                </div>\n              )}\n            </OrderCard>\n''',
)

replace_once(
    '''      {reassignOrder && (\n        <ReassignCourierModal\n          order={reassignOrder}\n          onClose={() => setReassignOrder(null)}\n          onDone={() => {\n            setReassignOrder(null);\n            load();\n          }}\n        />\n      )}\n    </div>\n''',
    '''      {reassignOrder && (\n        <ReassignCourierModal\n          order={reassignOrder}\n          onClose={() => setReassignOrder(null)}\n          onDone={() => {\n            setReassignOrder(null);\n            load();\n          }}\n        />\n      )}\n\n      {cancelOrder && (\n        <CancelOrderModal\n          order={cancelOrder}\n          onClose={() => setCancelOrder(null)}\n          onDone={() => {\n            setCancelOrder(null);\n            load();\n          }}\n        />\n      )}\n    </div>\n''',
)

replace_once(
    '''interface NearbyCourier {\n''',
    '''function CancelOrderModal({ order, onClose, onDone }: { order: OrderRow; onClose: () => void; onDone: () => void }) {\n  const [reason, setReason] = useState("");\n  const [error, setError] = useState<string | null>(null);\n  const [busy, setBusy] = useState(false);\n\n  async function submit(event: React.FormEvent) {\n    event.preventDefault();\n    const trimmedReason = reason.trim();\n    if (!trimmedReason) {\n      setError("Indique o motivo do cancelamento.");\n      return;\n    }\n\n    setBusy(true);\n    setError(null);\n    try {\n      await api.post(`/restaurant/orders/${order.id}/cancel`, { reason: trimmedReason });\n      onDone();\n    } catch (err: any) {\n      setError(err?.response?.data?.message ?? "Não foi possível cancelar este pedido.");\n    } finally {\n      setBusy(false);\n    }\n  }\n\n  return (\n    <div className="modal-backdrop" onClick={() => !busy && onClose()}>\n      <form className="modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}>\n        <p className="page-eyebrow">Cancelamento operacional</p>\n        <h2>Cancelar pedido #{order.orderNumber}</h2>\n        <p className="hint">Indique o motivo. O cancelamento fica registado no histórico do pedido.</p>\n        <label>\n          Motivo do cancelamento\n          <textarea\n            value={reason}\n            onChange={(event) => setReason(event.target.value)}\n            maxLength={500}\n            rows={4}\n            autoFocus\n            disabled={busy}\n          />\n        </label>\n        {error && <p className="form-error">{error}</p>}\n        <div className="modal-actions">\n          <button type="button" className="link-btn" onClick={onClose} disabled={busy}>Voltar</button>\n          <button type="submit" className="danger" disabled={busy || !reason.trim()}>\n            {busy ? "A cancelar..." : "Confirmar cancelamento"}\n          </button>\n        </div>\n      </form>\n    </div>\n  );\n}\n\ninterface NearbyCourier {\n''',
)

path.write_text(source, encoding="utf-8")
