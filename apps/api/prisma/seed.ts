import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role, RestaurantStatus } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "Demo1234!";

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function upsertUser(email: string, name: string, role: Role, restaurantId?: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      role,
      passwordHash: await hash(DEMO_PASSWORD),
      restaurantId,
      phone: "+351900000000",
    },
  });
}

async function main() {
  console.log("Seeding Yummix demo data...");

  // ---- Super admin --------------------------------------------------
  await upsertUser("admin@demo.local", "Plataforma Admin", Role.SUPER_ADMIN);

  // ---- Restaurant 1: VaiPizza (pizza, split-topping demo) -------
  const bella = await prisma.restaurant.upsert({
    where: { slug: "vaipizza" },
    update: {},
    create: {
      name: "VaiPizza",
      slug: "vaipizza",
      description: "Pediu? Vai. Pizza artesanal, forno a lenha.",
      status: RestaurantStatus.APPROVED,
      email: "contact@vaipizza.demo",
      phone: "+351910000001",
      address: "Rua das Flores 12, Braga",
      lat: 41.5454,
      lng: -8.4265,
      deliveryRadiusKm: 8,
      deliveryFeeMode: "BASE_PLUS_PER_KM",
      deliveryFeeBase: 2,
      deliveryFeePerKm: 0.5,
      deliveryFeeFreeKm: 2,
      commissionPercent: 18,
    },
  });
  const bellaOwner = await upsertUser("restaurante@demo.local", "VaiPizza", Role.RESTAURANT_OWNER, bella.id);
  await upsertUser("cozinha@demo.local", "Cozinha VaiPizza", Role.KITCHEN, bella.id);

  const bellaPizzas = await prisma.category.upsert({
    where: { restaurantId_name: { restaurantId: bella.id, name: "Pizzas" } },
    update: {},
    create: { restaurantId: bella.id, name: "Pizzas", sortOrder: 1 },
  });
  const bellaDrinks = await prisma.category.upsert({
    where: { restaurantId_name: { restaurantId: bella.id, name: "Bebidas" } },
    update: {},
    create: { restaurantId: bella.id, name: "Bebidas", sortOrder: 2 },
  });

  const existingMargherita = await prisma.product.findFirst({
    where: { restaurantId: bella.id, name: "Pizza Margherita" },
  });
  const margherita =
    existingMargherita ??
    (await prisma.product.create({
      data: {
        restaurantId: bella.id,
        categoryId: bellaPizzas.id,
        name: "Pizza Margherita",
        description: "Molho de tomate, mozzarella, manjericão fresco.",
        basePrice: 9,
        allowsSplit: true,
        splitPricingRule: "MOST_EXPENSIVE",
        modifierGroups: {
          create: [
            {
              name: "Tamanho",
              required: true,
              minSelect: 1,
              maxSelect: 1,
              sortOrder: 1,
              options: {
                create: [
                  { name: "Média", priceDelta: 0, isDefault: true, sortOrder: 1 },
                  { name: "Grande", priceDelta: 3, sortOrder: 2 },
                  { name: "Família", priceDelta: 6, sortOrder: 3 },
                ],
              },
            },
            {
              name: "Massa",
              required: true,
              minSelect: 1,
              maxSelect: 1,
              sortOrder: 2,
              options: {
                create: [
                  { name: "Tradicional", priceDelta: 0, isDefault: true, sortOrder: 1 },
                  { name: "Fina", priceDelta: 0, sortOrder: 2 },
                ],
              },
            },
            {
              name: "Extras",
              required: false,
              minSelect: 0,
              maxSelect: 5,
              sortOrder: 3,
              options: {
                create: [
                  { name: "Bacon", priceDelta: 2, sortOrder: 1 },
                  { name: "Queijo extra", priceDelta: 1.5, sortOrder: 2 },
                  { name: "Cogumelos", priceDelta: 1, sortOrder: 3 },
                  { name: "Ovo", priceDelta: 1, sortOrder: 4 },
                ],
              },
            },
            {
              name: "Remover ingredientes",
              required: false,
              minSelect: 0,
              maxSelect: 3,
              sortOrder: 4,
              options: {
                create: [
                  { name: "Sem cebola", priceDelta: 0, sortOrder: 1 },
                  { name: "Sem manjericão", priceDelta: 0, sortOrder: 2 },
                ],
              },
            },
          ],
        },
      },
    }));

  const existingPepperoni = await prisma.product.findFirst({
    where: { restaurantId: bella.id, name: "Pizza Pepperoni" },
  });
  const pepperoni =
    existingPepperoni ??
    (await prisma.product.create({
      data: {
        restaurantId: bella.id,
        categoryId: bellaPizzas.id,
        name: "Pizza Pepperoni",
        description: "Molho de tomate, mozzarella, pepperoni picante.",
        basePrice: 11,
        allowsSplit: true,
        splitPricingRule: "MOST_EXPENSIVE",
        modifierGroups: {
          create: [
            {
              name: "Tamanho",
              required: true,
              minSelect: 1,
              maxSelect: 1,
              sortOrder: 1,
              options: {
                create: [
                  { name: "Média", priceDelta: 0, isDefault: true, sortOrder: 1 },
                  { name: "Grande", priceDelta: 3, sortOrder: 2 },
                  { name: "Família", priceDelta: 6, sortOrder: 3 },
                ],
              },
            },
          ],
        },
      },
    }));

  await prisma.product.upsert({
    where: { id: (await prisma.product.findFirst({ where: { restaurantId: bella.id, name: "Coca-Cola" } }))?.id ?? "__none__" },
    update: {},
    create: {
      restaurantId: bella.id,
      categoryId: bellaDrinks.id,
      name: "Coca-Cola",
      description: "33cl",
      basePrice: 2,
    },
  });

  // ---- Restaurant 2: Burger House ------------------------------------
  const burgerHouse = await prisma.restaurant.upsert({
    where: { slug: "burger-house" },
    update: {},
    create: {
      name: "Burger House",
      slug: "burger-house",
      description: "Hambúrgueres artesanais e batatas fritas crocantes.",
      status: RestaurantStatus.APPROVED,
      email: "contact@burgerhouse.demo",
      phone: "+351910000002",
      address: "Av. Central 45, Braga",
      lat: 41.5518,
      lng: -8.4229,
      deliveryFeeMode: "TIERED",
      deliveryFeeTiers: {
        create: [
          { upToKm: 3, fee: 2 },
          { upToKm: 5, fee: 3 },
          { upToKm: 8, fee: 4.5 },
        ],
      },
      commissionPercent: 20,
    },
  });
  await upsertUser("burger-owner@demo.local", "Dono Burger House", Role.RESTAURANT_OWNER, burgerHouse.id);
  const burgers = await prisma.category.upsert({
    where: { restaurantId_name: { restaurantId: burgerHouse.id, name: "Hambúrgueres" } },
    update: {},
    create: { restaurantId: burgerHouse.id, name: "Hambúrgueres", sortOrder: 1 },
  });
  const existingCheeseburger = await prisma.product.findFirst({
    where: { restaurantId: burgerHouse.id, name: "Cheeseburger Clássico" },
  });
  if (!existingCheeseburger) {
    await prisma.product.create({
      data: {
        restaurantId: burgerHouse.id,
        categoryId: burgers.id,
        name: "Cheeseburger Clássico",
        description: "Pão brioche, carne 150g, queijo cheddar, alface, tomate.",
        basePrice: 7.5,
        modifierGroups: {
          create: [
            {
              name: "Ponto da carne",
              required: true,
              minSelect: 1,
              maxSelect: 1,
              options: {
                create: [
                  { name: "Ao ponto", priceDelta: 0, isDefault: true },
                  { name: "Bem passado", priceDelta: 0 },
                ],
              },
            },
            {
              name: "Extras",
              required: false,
              minSelect: 0,
              maxSelect: 4,
              options: {
                create: [
                  { name: "Bacon", priceDelta: 1.5 },
                  { name: "Ovo estrelado", priceDelta: 1 },
                  { name: "Queijo extra", priceDelta: 1 },
                ],
              },
            },
          ],
        },
      },
    });
  }

  // ---- Restaurant 3: Frango Real -------------------------------------
  const frangoReal = await prisma.restaurant.upsert({
    where: { slug: "frango-real" },
    update: {},
    create: {
      name: "Frango Real",
      slug: "frango-real",
      description: "Frango grelhado no espeto, à moda antiga.",
      status: RestaurantStatus.APPROVED,
      email: "contact@frangoreal.demo",
      phone: "+351910000003",
      address: "Praça do Comércio 3, Braga",
      lat: 41.5503,
      lng: -8.4200,
      deliveryFeeMode: "BASE_PLUS_PER_KM",
      deliveryFeeBase: 2,
      deliveryFeePerKm: 0.5,
      deliveryFeeFreeKm: 3,
      commissionPercent: 20,
    },
  });
  await upsertUser("frango-owner@demo.local", "Dono Frango Real", Role.RESTAURANT_OWNER, frangoReal.id);
  const grelhados = await prisma.category.upsert({
    where: { restaurantId_name: { restaurantId: frangoReal.id, name: "Grelhados" } },
    update: {},
    create: { restaurantId: frangoReal.id, name: "Grelhados", sortOrder: 1 },
  });
  const existingFrango = await prisma.product.findFirst({
    where: { restaurantId: frangoReal.id, name: "Meio Frango Piri-Piri" },
  });
  if (!existingFrango) {
    await prisma.product.create({
      data: {
        restaurantId: frangoReal.id,
        categoryId: grelhados.id,
        name: "Meio Frango Piri-Piri",
        description: "Grelhado na brasa, molho piri-piri à parte.",
        basePrice: 8,
      },
    });
  }

  // ---- Customer + courier demo accounts ------------------------------
  const customer = await upsertUser("cliente@demo.local", "Cliente Demo", Role.CUSTOMER);
  await prisma.address.upsert({
    where: { id: (await prisma.address.findFirst({ where: { userId: customer.id } }))?.id ?? "__none__" },
    update: {},
    create: {
      userId: customer.id,
      label: "Casa",
      line1: "Rua Nova 10",
      city: "Braga",
      lat: 41.5489,
      lng: -8.4265,
      isDefault: true,
    },
  });

  const courierUser = await upsertUser("estafeta@demo.local", "Estafeta Demo", Role.COURIER);
  await prisma.courier.upsert({
    where: { userId: courierUser.id },
    update: {},
    create: {
      userId: courierUser.id,
      vehicleType: "BIKE",
      vehicleNumber: "AA-00-BR",
      verificationStatus: "APPROVED",
      status: "OFFLINE",
      lat: 41.5495,
      lng: -8.4255,
    },
  });

  await prisma.coupon.upsert({
    where: { code: "BEMVINDO15" },
    update: {},
    create: {
      code: "BEMVINDO15",
      percentOff: 15,
      maxUsesPerUser: 1,
      isActive: true,
    },
  });

  console.log("Seed complete.");
  console.log("Demo accounts (password for all: %s):", DEMO_PASSWORD);
  console.log("  Cliente:     cliente@demo.local");
  console.log("  Restaurante: restaurante@demo.local");
  console.log("  Cozinha:     cozinha@demo.local");
  console.log("  Estafeta:    estafeta@demo.local");
  console.log("  Admin:       admin@demo.local");
  console.log("Restaurant seeded product with modifiers: %s (id=%s)", margherita.name, margherita.id);
  console.log("Second pizza for split/half-and-half testing: %s (id=%s)", pepperoni.name, pepperoni.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
