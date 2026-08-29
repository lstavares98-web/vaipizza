import type { ProductInput } from "@yummix/validation";
import { prisma } from "../../config/prisma.js";
import { badRequest, notFound } from "../../utils/AppError.js";

// ---- Categories ---------------------------------------------------------

export async function listCategories(restaurantId: string) {
  return prisma.category.findMany({
    where: { restaurantId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createCategory(restaurantId: string, name: string, sortOrder?: number) {
  const existing = await prisma.category.findFirst({ where: { restaurantId, name } });
  if (existing) throw badRequest("Já existe uma categoria com esse nome", "CATEGORY_DUPLICATE");
  return prisma.category.create({ data: { restaurantId, name, sortOrder: sortOrder ?? 0 } });
}

export async function updateCategory(restaurantId: string, id: string, input: { name?: string; sortOrder?: number }) {
  const existing = await prisma.category.findFirst({ where: { id, restaurantId } });
  if (!existing) throw notFound("Category not found");
  return prisma.category.update({ where: { id }, data: input });
}

export async function deleteCategory(restaurantId: string, id: string) {
  const existing = await prisma.category.findFirst({ where: { id, restaurantId }, include: { products: true } });
  if (!existing) throw notFound("Category not found");
  if (existing.products.length > 0) {
    throw badRequest("Mova ou remova os produtos desta categoria antes de a apagar", "CATEGORY_NOT_EMPTY");
  }
  await prisma.category.delete({ where: { id } });
}

// ---- Products -------------------------------------------------------------

const productInclude = {
  modifierGroups: { include: { options: true }, orderBy: { sortOrder: "asc" as const } },
};

export async function listProducts(restaurantId: string) {
  return prisma.product.findMany({
    where: { restaurantId },
    include: productInclude,
    orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }],
  });
}

async function assertCategoryBelongsToRestaurant(restaurantId: string, categoryId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, restaurantId } });
  if (!category) throw badRequest("Categoria inválida", "INVALID_CATEGORY");
}

export async function createProduct(restaurantId: string, input: ProductInput) {
  await assertCategoryBelongsToRestaurant(restaurantId, input.categoryId);

  return prisma.product.create({
    data: {
      restaurantId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      basePrice: input.basePrice,
      isAvailable: input.isAvailable ?? true,
      stock: input.stock ?? null,
      allowsSplit: input.allowsSplit ?? false,
      splitPricingRule: input.splitPricingRule ?? "MOST_EXPENSIVE",
      modifierGroups: input.modifierGroups
        ? {
            create: input.modifierGroups.map((g, gi) => ({
              name: g.name,
              required: g.required,
              minSelect: g.minSelect,
              maxSelect: g.maxSelect,
              sortOrder: g.sortOrder ?? gi,
              options: {
                create: g.options.map((o, oi) => ({
                  name: o.name,
                  priceDelta: o.priceDelta,
                  isDefault: o.isDefault ?? false,
                  sortOrder: o.sortOrder ?? oi,
                })),
              },
            })),
          }
        : undefined,
    },
    include: productInclude,
  });
}

interface UpdateProductInput extends Partial<ProductInput> {
  imageUrl?: string;
  imagePublicId?: string;
  defaultPrepTimeMinutes?: number | null;
}

// Modifier groups are replaced wholesale on update — simpler and safer than
// diffing nested arrays, and product configuration changes are infrequent
// enough that this isn't a performance concern. Existing OrderItem/CartItem
// snapshots are unaffected since they store their own copies of names/prices.
export async function updateProduct(restaurantId: string, id: string, input: UpdateProductInput) {
  const existing = await prisma.product.findFirst({ where: { id, restaurantId } });
  if (!existing) throw notFound("Product not found");
  if (input.categoryId) await assertCategoryBelongsToRestaurant(restaurantId, input.categoryId);

  if (input.modifierGroups) {
    await prisma.modifierGroup.deleteMany({ where: { productId: id } });
  }

  return prisma.product.update({
    where: { id },
    data: {
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.basePrice !== undefined ? { basePrice: input.basePrice } : {}),
      ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
      ...(input.stock !== undefined ? { stock: input.stock } : {}),
      ...(input.allowsSplit !== undefined ? { allowsSplit: input.allowsSplit } : {}),
      ...(input.splitPricingRule ? { splitPricingRule: input.splitPricingRule } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.imagePublicId !== undefined ? { imagePublicId: input.imagePublicId } : {}),
      ...(input.defaultPrepTimeMinutes !== undefined ? { defaultPrepTimeMinutes: input.defaultPrepTimeMinutes } : {}),
      ...(input.modifierGroups
        ? {
            modifierGroups: {
              create: input.modifierGroups.map((g, gi) => ({
                name: g.name,
                required: g.required,
                minSelect: g.minSelect,
                maxSelect: g.maxSelect,
                sortOrder: g.sortOrder ?? gi,
                options: {
                  create: g.options.map((o, oi) => ({
                    name: o.name,
                    priceDelta: o.priceDelta,
                    isDefault: o.isDefault ?? false,
                    sortOrder: o.sortOrder ?? oi,
                  })),
                },
              })),
            },
          }
        : {}),
    },
    include: productInclude,
  });
}

export async function deleteProduct(restaurantId: string, id: string) {
  const existing = await prisma.product.findFirst({ where: { id, restaurantId } });
  if (!existing) throw notFound("Product not found");
  // Soft delete: an OrderItem may reference this product historically, so we
  // never hard-delete — just hide it from the menu.
  await prisma.product.update({ where: { id }, data: { isAvailable: false } });
}
