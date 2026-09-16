from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# Admin service: operational state lifecycle.
p = Path("apps/api/src/modules/admin/admin.service.ts")
s = p.read_text()
s = replace_once(
    s,
    'import type { OrderStatus, RestaurantStatus, VerificationStatus } from "@prisma/client";',
    'import type { CourierOperationalState, OrderStatus, RestaurantStatus, VerificationStatus } from "@prisma/client";',
    "admin type import",
)
anchor = '''export async function rejectCourier(id: string) {
  return prisma.courier.update({ where: { id }, data: { verificationStatus: "REJECTED" } });
}
'''
addition = anchor + '''
const ACTIVE_COURIER_ORDER_STATUSES = ["COURIER_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"] as const;

export async function setCourierOperationalState(id: string, state: CourierOperationalState) {
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const courier = await tx.courier.findUnique({ where: { id } });
    if (!courier) throw notFound("Courier not found");

    const activeOrder = await tx.order.findFirst({
      where: { courierId: id, status: { in: [...ACTIVE_COURIER_ORDER_STATUSES] } },
      select: { id: true, status: true },
    });
    if (activeOrder) {
      throw badRequest(
        "Resolva ou reatribua a entrega ativa antes de alterar o estado deste estafeta",
        "NOT_ALLOWED_WITH_ACTIVE_DELIVERY",
      );
    }

    if (state === "ACTIVE") {
      return tx.courier.update({
        where: { id },
        data: { operationalState: "ACTIVE", status: "OFFLINE" },
        include: { user: true },
      });
    }

    await tx.courierAssignment.updateMany({
      where: { courierId: id, status: "OFFERED" },
      data: { status: "CANCELLED", respondedAt: now },
    });

    return tx.courier.update({
      where: { id },
      data: {
        operationalState: state,
        status: "OFFLINE",
        sessionVersion: { increment: 1 },
      },
      include: { user: true },
    });
  });

  if (state !== "ACTIVE") {
    const io = getIO();
    const room = rooms.courier(updated.userId);
    io?.to(room).emit("courier:operational-state", { state });
    io?.in(room).disconnectSockets(true);
  }

  return updated;
}
'''
s = replace_once(s, anchor, addition, "admin rejectCourier")
p.write_text(s)

# Admin route.
p = Path("apps/api/src/modules/admin/admin.routes.ts")
s = p.read_text()
anchor = '''adminRouter.post(
  "/couriers/:id/reject",
  asyncHandler(async (req, res) => {
    const courier = await adminService.rejectCourier(req.params.id!);
    res.json({ success: true, courier });
  }),
);
'''
addition = anchor + '''
adminRouter.patch(
  "/couriers/:id/operational-state",
  asyncHandler(async (req, res) => {
    const { state } = z.object({ state: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]) }).parse(req.body);
    const courier = await adminService.setCourierOperationalState(req.params.id!, state);
    res.json({ success: true, courier });
  }),
);
'''
s = replace_once(s, anchor, addition, "admin courier reject route")
p.write_text(s)

# Courier online gate.
p = Path("apps/api/src/modules/couriers/courier.service.ts")
s = p.read_text()
anchor = '''  if (courier.verificationStatus !== "APPROVED") {
    throw badRequest("A sua conta ainda não foi aprovada", "COURIER_NOT_APPROVED");
  }

  if (!online) {'''
replacement = '''  if (courier.verificationStatus !== "APPROVED") {
    throw badRequest("A sua conta ainda não foi aprovada", "COURIER_NOT_APPROVED");
  }
  if (courier.operationalState === "SUSPENDED") {
    throw badRequest("A sua conta está temporariamente suspensa", "COURIER_SUSPENDED");
  }
  if (courier.operationalState === "DEACTIVATED") {
    throw badRequest("A sua conta está desativada", "COURIER_DEACTIVATED");
  }

  if (!online) {'''
s = replace_once(s, anchor, replacement, "courier online verification")
p.write_text(s)

# Dispatch discovery and transactional race guards.
p = Path("apps/api/src/modules/dispatch/dispatch.service.ts")
s = p.read_text()
s = replace_once(
    s,
    '      status: "AVAILABLE",\n      verificationStatus: "APPROVED",',
    '      status: "AVAILABLE",\n      verificationStatus: "APPROVED",\n      operationalState: "ACTIVE",',
    "available dispatch candidate",
)
s = replace_once(
    s,
    '      status: { in: [...BUSY_COURIER_STATUSES] },\n      verificationStatus: "APPROVED",',
    '      status: { in: [...BUSY_COURIER_STATUSES] },\n      verificationStatus: "APPROVED",\n      operationalState: "ACTIVE",',
    "busy dispatch candidate",
)
s = replace_once(
    s,
    '        status: "AVAILABLE",\n        verificationStatus: "APPROVED",\n        locationUpdatedAt:',
    '        status: "AVAILABLE",\n        verificationStatus: "APPROVED",\n        operationalState: "ACTIVE",\n        locationUpdatedAt:',
    "available transactional claim",
)
s = replace_once(
    s,
    '    if (!restaurant || !claimedCourier || claimedCourier.verificationStatus !== "APPROVED") return false;',
    '    if (!restaurant || !claimedCourier || claimedCourier.verificationStatus !== "APPROVED" || claimedCourier.operationalState !== "ACTIVE") return false;',
    "queued offer transactional recheck",
)
s = replace_once(
    s,
    '        if (!targetOrder || !claimedCourier || targetOrder.status !== "WAITING_FOR_COURIER") {',
    '        if (!targetOrder || !claimedCourier || claimedCourier.operationalState !== "ACTIVE" || targetOrder.status !== "WAITING_FOR_COURIER") {',
    "queued acceptance recheck",
)
s = replace_once(
    s,
    '        where: { id: courierId, status: "ASSIGNED" },\n        data: { status: "GOING_TO_RESTAURANT" },',
    '        where: { id: courierId, status: "ASSIGNED", verificationStatus: "APPROVED", operationalState: "ACTIVE" },\n        data: { status: "GOING_TO_RESTAURANT" },',
    "normal acceptance transactional claim",
)

old = '''function operationalReason(status: string, geoReasons: CourierGeoEligibilityReason[]) {
  if (status === "OFFLINE") return "OFFLINE";
  if (status === "ASSIGNED") return "OFFER_PENDING";
  if (status !== "AVAILABLE") return "BUSY";
  return geoReasons[0] ?? null;
}'''
new = '''function operationalReason(status: string, operationalState: string, geoReasons: CourierGeoEligibilityReason[]) {
  if (operationalState === "SUSPENDED") return "SUSPENDED";
  if (operationalState === "DEACTIVATED") return "DEACTIVATED";
  if (status === "OFFLINE") return "OFFLINE";
  if (status === "ASSIGNED") return "OFFER_PENDING";
  if (status !== "AVAILABLE") return "BUSY";
  return geoReasons[0] ?? null;
}'''
s = replace_once(s, old, new, "operational reason")
s = replace_once(
    s,
    '    const eligibleForDispatch = courier.status === "AVAILABLE" && geo.eligible;',
    '    const eligibleForDispatch = courier.operationalState === "ACTIVE" && courier.status === "AVAILABLE" && geo.eligible;',
    "live feed eligibility",
)
s = replace_once(
    s,
    '      status: courier.status,\n      lat: courier.lat,',
    '      status: courier.status,\n      operationalState: courier.operationalState,\n      lat: courier.lat,',
    "live feed operational state",
)
s = replace_once(
    s,
    '      ineligibilityReason: eligibleForDispatch ? null : operationalReason(courier.status, geo.reasons),',
    '      ineligibilityReason: eligibleForDispatch ? null : operationalReason(courier.status, courier.operationalState, geo.reasons),',
    "live feed ineligibility reason",
)
s = replace_once(
    s,
    '  if (!newCourier || newCourier.status !== "AVAILABLE" || newCourier.verificationStatus !== "APPROVED") {',
    '  if (!newCourier || newCourier.status !== "AVAILABLE" || newCourier.verificationStatus !== "APPROVED" || newCourier.operationalState !== "ACTIVE") {',
    "manual reassign gate",
)
p.write_text(s)

# Admin UI: expose verification and operational state separately.
Path("apps/admin/src/pages/Couriers.tsx").write_text(r'''import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

type OperationalState = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

interface CourierRow {
  id: string;
  verificationStatus: string;
  operationalState: OperationalState;
  vehicleType: string;
  vehicleNumber: string | null;
  totalEarnings: number;
  lifetimeDeliveries: number;
  user: { name: string; email: string; phone: string | null };
}

const OPERATIONAL_LABELS: Record<OperationalState, string> = {
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  DEACTIVATED: "Desativado",
};

export default function Couriers() {
  const [couriers, setCouriers] = useState<CourierRow[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get("/admin/couriers", { params: { status: filter || undefined } })
      .then(({ data }) => setCouriers(data.couriers));
  }, [filter]);

  useEffect(load, [load]);

  async function approve(id: string) {
    await api.post(`/admin/couriers/${id}/approve`);
    load();
  }

  async function reject(id: string) {
    if (!window.confirm("Rejeitar este estafeta?")) return;
    await api.post(`/admin/couriers/${id}/reject`);
    load();
  }

  async function setOperationalState(courier: CourierRow, state: OperationalState) {
    const copy = state === "SUSPENDED"
      ? `Suspender temporariamente ${courier.user.name}?`
      : state === "DEACTIVATED"
        ? `Desativar ${courier.user.name}? O estafeta deixará de conseguir iniciar sessão.`
        : `Reativar ${courier.user.name}? O estafeta continuará offline até escolher Ficar online.`;
    if (!window.confirm(copy)) return;
    setError(null);
    try {
      await api.patch(`/admin/couriers/${courier.id}/operational-state`, { state });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Não foi possível alterar o estado do estafeta.");
    }
  }

  return (
    <div>
      <h1>Estafetas</h1>
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos os estados</option>
          <option value="PENDING">Pendentes</option>
          <option value="APPROVED">Aprovados</option>
          <option value="REJECTED">Rejeitados</option>
        </select>
      </div>
      {error && <p className="form-error">{error}</p>}
      <table className="data-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Contacto</th>
            <th>Veículo</th>
            <th>Validação</th>
            <th>Operação</th>
            <th>Entregas</th>
            <th>Ganhos</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {couriers.map((c) => (
            <tr key={c.id}>
              <td>{c.user.name}</td>
              <td>{c.user.email}<br /><span className="hint">{c.user.phone}</span></td>
              <td>{c.vehicleType} {c.vehicleNumber ?? ""}</td>
              <td><span className={`badge badge-${c.verificationStatus.toLowerCase()}`}>{c.verificationStatus}</span></td>
              <td><span className={`badge badge-${c.operationalState.toLowerCase()}`}>{OPERATIONAL_LABELS[c.operationalState]}</span></td>
              <td>{c.lifetimeDeliveries}</td>
              <td>{c.totalEarnings.toFixed(2)} €</td>
              <td className="actions">
                {c.verificationStatus === "PENDING" && (
                  <>
                    <button onClick={() => approve(c.id)}>Aprovar</button>
                    <button className="danger" onClick={() => reject(c.id)}>Rejeitar</button>
                  </>
                )}
                {c.verificationStatus === "APPROVED" && c.operationalState === "ACTIVE" && (
                  <>
                    <button onClick={() => setOperationalState(c, "SUSPENDED")}>Suspender</button>
                    <button className="danger" onClick={() => setOperationalState(c, "DEACTIVATED")}>Desativar</button>
                  </>
                )}
                {c.verificationStatus === "APPROVED" && c.operationalState !== "ACTIVE" && (
                  <button onClick={() => setOperationalState(c, "ACTIVE")}>Reativar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
''')
