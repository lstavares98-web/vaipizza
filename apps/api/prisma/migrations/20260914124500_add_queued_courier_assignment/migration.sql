ALTER TABLE "CourierAssignment"
ADD COLUMN "isQueued" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "CourierAssignment_courierId_isQueued_status_idx"
ON "CourierAssignment"("courierId", "isQueued", "status");

-- Hard race guard: a courier may have at most one live future slot.
-- Historical queued rows remain unrestricted once rejected/expired/cancelled.
CREATE UNIQUE INDEX "CourierAssignment_one_live_queued_per_courier"
ON "CourierAssignment"("courierId")
WHERE "isQueued" = true AND "status" IN ('OFFERED', 'ACCEPTED');
