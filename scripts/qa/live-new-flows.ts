import bcrypt from "bcryptjs";
import { PrismaClient, Role, RestaurantStatus } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright";

const prisma = new PrismaClient();
const API = process.env.QA_API_URL ?? "";
const CUSTOMER_URL = process.env.QA_CUSTOMER_URL ?? "";
const RESTAURANT_URL = process.env.QA_RESTAURANT_URL ?? "";
const COURIER_URL = process.env.QA_COURIER_URL ?? "";
const CONFIRM = process.env.QA_CONFIRM ?? "";

if (CONFIRM !== "VAIPIZZA_STAGING_ONLY") throw new Error("QA confirmation guard missing");
if (!API.includes("vaipizza-api-staging")) throw new Error(`Refusing non-staging API: ${API}`);
if (![CUSTOMER_URL, RESTAURANT_URL, COURIER_URL].every((url) => url.includes("staging"))) {
  throw new Error("Refusing non-staging frontend URL");
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PASSWORD = "QaFlow1234!";
const TEST_MBWAY = "+351 910 000 777";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function http(path: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers ?? {});
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { response, body };
}

async function login(kind: "customer" | "restaurant" | "courier", email: string, password: string) {
  const { response, body } = await http(`/api/auth/${kind}/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  check(response.ok, `${kind} login failed: ${response.status} ${JSON.stringify(body)}`);
  check(body?.accessToken, `${kind} login returned no access token`);
  return body.accessToken as string;
}

async function uiLogin(page: Page, baseUrl: string, email: string, password: string) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15_000 });
}

async function cleanupOrder(orderId: string | null) {
  if (!orderId) return;
  await prisma.courierEarning.deleteMany({ where: { orderId } });
  await prisma.adminAlert.deleteMany({ where: { orderId } });
  await prisma.courierAssignment.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
}

async function testMbwayAndPickup(browser: Browser) {
  console.log("[live-new-flows] MB WAY + pickup: start");
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: "vaipizza" } });
  check(restaurant, "Primary vaipizza restaurant not found");
  const oldMbwayPhone = restaurant.mbwayPhone;
  const staffEmail = `qa+mbway-staff-${stamp}@vaipizza.test`;
  const customerEmail = `qa+mbway-customer-${stamp}@vaipizza.test`;
  let staffId: string | null = null;
  let customerId: string | null = null;
  let orderId: string | null = null;

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const staff = await prisma.user.create({
      data: {
        email: staffEmail,
        passwordHash,
        name: "QA MBWAY Staff",
        phone: "+351910000771",
        role: Role.RESTAURANT_STAFF,
        restaurantId: restaurant.id,
      },
    });
    staffId = staff.id;
    const restaurantToken = await login("restaurant", staffEmail, PASSWORD);

    const settingsPatch = await http("/api/restaurant/settings", {
      method: "PATCH",
      body: JSON.stringify({ mbwayPhone: TEST_MBWAY }),
    }, restaurantToken);
    check(settingsPatch.response.ok, `Unable to configure MB WAY: ${settingsPatch.response.status}`);

    const register = await http("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "QA Pickup Customer",
        email: customerEmail,
        password: PASSWORD,
        phone: "+351911000772",
      }),
    });
    check(register.response.status === 201, `Customer registration failed: ${register.response.status} ${JSON.stringify(register.body)}`);
    customerId = register.body.user.id;
    const customerToken = register.body.accessToken as string;

    const menu = await http("/api/restaurants/vaipizza");
    check(menu.response.ok, `Menu request failed: ${menu.response.status}`);
    const products = (menu.body.restaurant?.categories ?? []).flatMap((category: any) => category.products ?? []);
    const product = products.find((p: any) => p.name === "Coca-Cola")
      ?? products.find((p: any) => (p.modifierGroups ?? []).every((g: any) => !g.required || (g.minSelect ?? 0) === 0));
    check(product, "No simple product available for MB WAY QA checkout");

    const add = await http("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ productId: product.id, quantity: 1, modifierOptionIds: [] }),
    }, customerToken);
    check(add.response.status === 201, `Add to cart failed: ${add.response.status} ${JSON.stringify(add.body)}`);

    const checkout = await http("/api/orders", {
      method: "POST",
      body: JSON.stringify({ fulfillmentType: "PICKUP", paymentMethod: "MBWAY" }),
    }, customerToken);
    check(checkout.response.status === 201, `MB WAY checkout failed: ${checkout.response.status} ${JSON.stringify(checkout.body)}`);
    orderId = checkout.body.order.id;
    const orderNumber = checkout.body.order.orderNumber as number;
    check(checkout.body.order.paymentStatus === "PENDING", "MB WAY order should start PENDING");
    check(checkout.body.order.status === "NEW", "MB WAY order should start NEW");

    const blockedAccept = await http(`/api/restaurant/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "ACCEPTED" }),
    }, restaurantToken);
    check(blockedAccept.response.status === 400, `Pending MB WAY acceptance should be blocked, got ${blockedAccept.response.status}`);
    check(blockedAccept.body?.code === "PAYMENT_PENDING", `Expected PAYMENT_PENDING, got ${JSON.stringify(blockedAccept.body)}`);

    const customerPage = await browser.newPage();
    await uiLogin(customerPage, CUSTOMER_URL, customerEmail, PASSWORD);
    await customerPage.goto(`${CUSTOMER_URL}/orders/${orderId}`, { waitUntil: "networkidle" });
    await customerPage.getByRole("heading", { name: "Pagamento MB WAY" }).waitFor();
    await customerPage.getByText(TEST_MBWAY, { exact: true }).waitFor();
    await customerPage.getByRole("link", { name: "Enviar comprovativo pelo WhatsApp" }).waitFor();

    const restaurantPage = await browser.newPage();
    await uiLogin(restaurantPage, RESTAURANT_URL, staffEmail, PASSWORD);
    await restaurantPage.goto(`${RESTAURANT_URL}/orders`, { waitUntil: "networkidle" });
    let card = restaurantPage.locator(".order-card").filter({ hasText: `#${orderNumber}` }).first();
    await card.waitFor();
    await card.getByText("MB WAY — A aguardar confirmação do pagamento", { exact: false }).waitFor();
    const acceptButton = card.getByRole("button", { name: "Aceitar", exact: true });
    check(await acceptButton.isDisabled(), "Accept must be disabled while MB WAY is pending");

    await card.getByRole("button", { name: "Confirmar pagamento recebido" }).click();
    await card.getByText("MB WAY — pago", { exact: false }).waitFor({ timeout: 10_000 });
    check(!(await acceptButton.isDisabled()), "Accept should enable after MB WAY confirmation");
    await acceptButton.click();
    await restaurantPage.getByText("Na cozinha (KDS)", { exact: true }).waitFor({ timeout: 10_000 });

    const ready = await http(`/api/restaurant/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "READY_FOR_PICKUP" }),
    }, restaurantToken);
    check(ready.response.ok && ready.body.order.status === "READY_FOR_PICKUP", `Pickup ready transition failed: ${JSON.stringify(ready.body)}`);

    await customerPage.reload({ waitUntil: "networkidle" });
    await customerPage.getByRole("heading", { name: "✅ O seu pedido está pronto para recolha" }).waitFor();

    await restaurantPage.reload({ waitUntil: "networkidle" });
    card = restaurantPage.locator(".order-card").filter({ hasText: `#${orderNumber}` }).first();
    await card.waitFor();
    await card.getByRole("link", { name: "Avisar cliente pelo WhatsApp" }).waitFor();
    await card.getByRole("button", { name: "Recolhido" }).click();

    const finalOrder = await http(`/api/orders/${orderId}`, {}, customerToken);
    check(finalOrder.response.ok, "Unable to load collected order");
    check(finalOrder.body.order.status === "COLLECTED", `Expected COLLECTED, got ${finalOrder.body.order.status}`);

    await customerPage.close();
    await restaurantPage.close();
    console.log("[live-new-flows] MB WAY + pickup: PASS");
  } finally {
    await cleanupOrder(orderId).catch(() => {});
    if (customerId) await prisma.user.deleteMany({ where: { id: customerId } }).catch(() => {});
    if (staffId) await prisma.user.deleteMany({ where: { id: staffId } }).catch(() => {});
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { mbwayPhone: oldMbwayPhone } }).catch(() => {});
  }
}

async function testQueuedDelivery(browser: Browser) {
  console.log("[live-new-flows] queued delivery: start");
  const slug = `qa-queue-${stamp}`;
  const ownerEmail = `qa+queue-owner-${stamp}@vaipizza.test`;
  const courierEmail = `qa+queue-courier-${stamp}@vaipizza.test`;
  const customerEmail = `qa+queue-customer-${stamp}@vaipizza.test`;
  let restaurantId: string | null = null;
  let ownerId: string | null = null;
  let courierUserId: string | null = null;
  let courierId: string | null = null;
  let customerId: string | null = null;
  let addressId: string | null = null;
  const orderIds: string[] = [];

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const restaurant = await prisma.restaurant.create({
      data: {
        name: "QA Queue Restaurant",
        slug,
        status: RestaurantStatus.APPROVED,
        email: `${slug}@example.test`,
        phone: "+351910000781",
        address: "QA Isolated Point",
        lat: 0.12345,
        lng: 0.12345,
        deliveryRadiusKm: 5,
        courierDispatchRadiusKm: 3,
        acceptsPickup: true,
        acceptsDelivery: true,
      },
    });
    restaurantId = restaurant.id;

    const owner = await prisma.user.create({
      data: { email: ownerEmail, passwordHash, name: "QA Queue Owner", phone: "+351910000782", role: Role.RESTAURANT_OWNER, restaurantId: restaurant.id },
    });
    ownerId = owner.id;
    const courierUser = await prisma.user.create({
      data: { email: courierEmail, passwordHash, name: "QA Queue Courier", phone: "+351910000783", role: Role.COURIER },
    });
    courierUserId = courierUser.id;
    const courier = await prisma.courier.create({
      data: {
        userId: courierUser.id,
        vehicleType: "BIKE",
        vehicleNumber: "QA-QUEUE",
        verificationStatus: "APPROVED",
        status: "DELIVERING",
        lat: restaurant.lat,
        lng: restaurant.lng,
        locationUpdatedAt: new Date(),
        locationAccuracyM: 5,
      },
    });
    courierId = courier.id;
    const customer = await prisma.user.create({
      data: { email: customerEmail, passwordHash, name: "QA Queue Customer", phone: "+351910000784", role: Role.CUSTOMER },
    });
    customerId = customer.id;
    const address = await prisma.address.create({
      data: { userId: customer.id, label: "QA", line1: "QA Delivery Point", city: "QA City", lat: restaurant.lat + 0.001, lng: restaurant.lng + 0.001, isDefault: true },
    });
    addressId = address.id;

    const makeOrder = async (status: "OUT_FOR_DELIVERY" | "PREPARING", assignedCourierId: string | null) => {
      const order = await prisma.order.create({
        data: {
          userId: customer.id,
          restaurantId: restaurant.id,
          fulfillmentType: "DELIVERY",
          addressId: address.id,
          customerLat: address.lat,
          customerLng: address.lng,
          status,
          subtotal: 10,
          discount: 0,
          deliveryFee: 2,
          total: 12,
          paymentMethod: "TERMINAL",
          paymentStatus: "PAID",
          courierId: assignedCourierId,
          items: { create: { productNameSnapshot: "QA Item", quantity: 1, unitPrice: 10, lineTotal: 10 } },
          statusHistory: { create: { status, actor: status === "OUT_FOR_DELIVERY" ? Role.COURIER : Role.RESTAURANT_OWNER } },
        },
      });
      orderIds.push(order.id);
      return order;
    };

    const active = await makeOrder("OUT_FOR_DELIVERY", courier.id);
    const next = await makeOrder("PREPARING", null);
    const ownerToken = await login("restaurant", ownerEmail, PASSWORD);
    const courierToken = await login("courier", courierEmail, PASSWORD);

    const readyNext = await http(`/api/restaurant/orders/${next.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "READY_FOR_PICKUP" }),
    }, ownerToken);
    check(readyNext.response.ok && readyNext.body.order.status === "WAITING_FOR_COURIER", `Queued candidate did not enter waiting state: ${JSON.stringify(readyNext.body)}`);

    let queuedOffer = await prisma.courierAssignment.findFirst({
      where: { orderId: next.id, courierId: courier.id, isQueued: true, status: "OFFERED" },
    });
    check(queuedOffer, "Busy courier did not receive a queued offer");

    const courierPage = await browser.newPage();
    await uiLogin(courierPage, COURIER_URL, courierEmail, PASSWORD);
    await courierPage.goto(`${COURIER_URL}/delivery`, { waitUntil: "networkidle" });
    await courierPage.getByText("Nova próxima entrega", { exact: true }).waitFor({ timeout: 10_000 });
    await courierPage.getByRole("button", { name: "Aceitar próxima" }).click();
    await courierPage.getByRole("heading", { name: "Próxima entrega reservada" }).waitFor({ timeout: 10_000 });

    queuedOffer = await prisma.courierAssignment.findUnique({ where: { id: queuedOffer.id } });
    check(queuedOffer?.status === "ACCEPTED" && queuedOffer.isQueued, "Queued offer should remain queued after acceptance");
    const stillWaiting = await prisma.order.findUnique({ where: { id: next.id } });
    check(stillWaiting?.status === "WAITING_FOR_COURIER" && !stillWaiting.courierId, "Accepted future order must not replace the active order early");

    const third = await makeOrder("PREPARING", null);
    const readyThird = await http(`/api/restaurant/orders/${third.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "READY_FOR_PICKUP" }),
    }, ownerToken);
    check(readyThird.response.ok && readyThird.body.order.status === "WAITING_FOR_COURIER", "Third order should wait for courier capacity");
    const prematureThirdAssignment = await prisma.courierAssignment.findFirst({
      where: { orderId: third.id, courierId: courier.id, isQueued: true, status: { in: ["OFFERED", "ACCEPTED"] } },
    });
    check(!prematureThirdAssignment, "Courier received a third committed delivery before a slot opened");

    await courierPage.getByRole("button", { name: /entreg/i }).last().click();
    await courierPage.getByText(`Pedido #${next.orderNumber}`, { exact: false }).first().waitFor({ timeout: 15_000 });

    const delivered = await prisma.order.findUnique({ where: { id: active.id } });
    const promoted = await prisma.order.findUnique({ where: { id: next.id } });
    const courierAfter = await prisma.courier.findUnique({ where: { id: courier.id } });
    check(delivered?.status === "DELIVERED", `Active order was not delivered: ${delivered?.status}`);
    check(promoted?.status === "COURIER_ASSIGNED" && promoted.courierId === courier.id, `Reserved order was not promoted: ${promoted?.status}`);
    check(courierAfter?.status === "GOING_TO_RESTAURANT", `Courier should move to next job, got ${courierAfter?.status}`);

    const thirdOffer = await prisma.courierAssignment.findFirst({
      where: { orderId: third.id, courierId: courier.id, isQueued: true, status: "OFFERED" },
    });
    check(thirdOffer, "Waiting third order was not offered after the future slot reopened");
    await courierPage.getByText("Nova próxima entrega", { exact: true }).waitFor({ timeout: 15_000 });

    const nextEndpoint = await http("/api/courier/orders/next", {}, courierToken);
    check(nextEndpoint.response.ok && nextEndpoint.body.assignment?.order?.id === third.id, "Courier next endpoint does not expose the newly queued third order");

    await courierPage.close();
    console.log("[live-new-flows] queued delivery: PASS");
  } finally {
    if (restaurantId) {
      await prisma.courierEarning.deleteMany({ where: { order: { restaurantId } } }).catch(() => {});
      await prisma.adminAlert.deleteMany({ where: { order: { restaurantId } } }).catch(() => {});
      await prisma.courierAssignment.deleteMany({ where: { order: { restaurantId } } }).catch(() => {});
      await prisma.order.deleteMany({ where: { restaurantId } }).catch(() => {});
    }
    if (courierId) await prisma.courier.deleteMany({ where: { id: courierId } }).catch(() => {});
    if (customerId) await prisma.user.deleteMany({ where: { id: customerId } }).catch(() => {});
    if (courierUserId) await prisma.user.deleteMany({ where: { id: courierUserId } }).catch(() => {});
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } }).catch(() => {});
    if (restaurantId) await prisma.restaurant.deleteMany({ where: { id: restaurantId } }).catch(() => {});
  }
}

let browser: Browser | null = null;
try {
  browser = await chromium.launch({ headless: true });
  await testMbwayAndPickup(browser);
  await testQueuedDelivery(browser);
  console.log("[live-new-flows] ALL PASS");
} finally {
  if (browser) await browser.close().catch(() => {});
  await prisma.$disconnect();
}
