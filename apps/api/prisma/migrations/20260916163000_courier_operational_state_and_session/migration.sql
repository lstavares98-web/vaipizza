CREATE TYPE "CourierOperationalState" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');
ALTER TABLE "Courier"
  ADD COLUMN "operationalState" "CourierOperationalState" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
