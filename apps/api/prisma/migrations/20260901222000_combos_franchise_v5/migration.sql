-- VAIPIZZA V5: combos + franchise leads. Additive migration for the existing single-installation database.

ALTER TABLE "Restaurant" ADD COLUMN "combosEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Combo" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "compareAtPrice" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "imagePublicId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "availableDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "availableFrom" TEXT,
    "availableTo" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Combo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComboFixedItem" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ComboFixedItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComboGroup" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 1,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ComboGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComboGroupOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ComboGroupOption_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CartItem" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "CartItem" ADD COLUMN "comboId" TEXT;
ALTER TABLE "CartItem" ADD COLUMN "comboSelections" JSONB;

ALTER TABLE "OrderItem" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "OrderItem" ADD COLUMN "comboId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "comboSelectionsSnapshot" JSONB;
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "FranchiseLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'ARCHIVED');
CREATE TABLE "FranchiseLead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cityRegion" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "FranchiseLeadStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FranchiseLead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Combo_restaurantId_isActive_idx" ON "Combo"("restaurantId", "isActive");
CREATE INDEX "ComboFixedItem_comboId_idx" ON "ComboFixedItem"("comboId");
CREATE INDEX "ComboFixedItem_productId_idx" ON "ComboFixedItem"("productId");
CREATE INDEX "ComboGroup_comboId_idx" ON "ComboGroup"("comboId");
CREATE INDEX "ComboGroupOption_groupId_idx" ON "ComboGroupOption"("groupId");
CREATE INDEX "ComboGroupOption_productId_idx" ON "ComboGroupOption"("productId");
CREATE INDEX "FranchiseLead_status_createdAt_idx" ON "FranchiseLead"("status", "createdAt");
CREATE INDEX "CartItem_comboId_idx" ON "CartItem"("comboId");
CREATE INDEX "OrderItem_comboId_idx" ON "OrderItem"("comboId");

ALTER TABLE "Combo" ADD CONSTRAINT "Combo_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboFixedItem" ADD CONSTRAINT "ComboFixedItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboFixedItem" ADD CONSTRAINT "ComboFixedItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComboGroup" ADD CONSTRAINT "ComboGroup_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboGroupOption" ADD CONSTRAINT "ComboGroupOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ComboGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComboGroupOption" ADD CONSTRAINT "ComboGroupOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Supabase exposes public schema through PostgREST. The browser never accesses these tables directly;
-- keep RLS enabled with no public policies so only the server-side PostgreSQL connection can use them.
ALTER TABLE "Combo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComboFixedItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComboGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComboGroupOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FranchiseLead" ENABLE ROW LEVEL SECURITY;
