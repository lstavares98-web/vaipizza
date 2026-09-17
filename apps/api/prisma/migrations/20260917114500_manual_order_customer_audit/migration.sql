CREATE TYPE "OrderOrigin" AS ENUM ('APP', 'PHONE', 'COUNTER');

CREATE TABLE "CustomerContact" (
  "id" TEXT NOT NULL,
  "phoneNormalized" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerContact_phoneNormalized_key" ON "CustomerContact"("phoneNormalized");

ALTER TABLE "Order"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "origin" "OrderOrigin" NOT NULL DEFAULT 'APP',
  ADD COLUMN "customerContactId" TEXT,
  ADD COLUMN "customerNameSnapshot" TEXT,
  ADD COLUMN "customerPhoneSnapshot" TEXT,
  ADD COLUMN "deliveryLine1Snapshot" TEXT,
  ADD COLUMN "deliveryLine2Snapshot" TEXT,
  ADD COLUMN "deliveryCitySnapshot" TEXT,
  ADD COLUMN "deliveryPostalCodeSnapshot" TEXT;

CREATE INDEX "Order_customerContactId_idx" ON "Order"("customerContactId");
CREATE INDEX "Order_origin_idx" ON "Order"("origin");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_customerContactId_fkey"
  FOREIGN KEY ("customerContactId") REFERENCES "CustomerContact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
