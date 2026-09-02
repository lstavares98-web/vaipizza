-- Separate the customer delivery radius from the courier dispatch radius.
ALTER TABLE "Restaurant"
ADD COLUMN "courierDispatchRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 12;

-- Browser Geolocation accuracy (metres, 95% confidence radius).
ALTER TABLE "Courier"
ADD COLUMN "locationAccuracyM" DOUBLE PRECISION;

-- Dispatch repeatedly filters by work status and GPS freshness.
CREATE INDEX "Courier_status_locationUpdatedAt_idx"
ON "Courier"("status", "locationUpdatedAt");
