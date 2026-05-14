// Config injected via window.__CONFIG__ or fallback to localhost defaults.
const cfg = window.__CONFIG__ || {
  API_BASE: "http://localhost:3000",
  KAFKA_UI: "http://localhost:8090",
  APICURIO_UI: "http://localhost:8888",
  SWAGGER: "http://localhost:3000/docs",
};

document.getElementById("api-base").textContent = cfg.API_BASE;
document.getElementById("kafka-link").href = cfg.KAFKA_UI;
document.getElementById("apicurio-link").href = cfg.APICURIO_UI;
document.getElementById("swagger-link").href = cfg.SWAGGER;

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// Scenarios mirror the artifacts published by data-schemas/tools/publish.mjs.
const scenarios = [
  {
    title: "Product published",
    endpoint: "/catalog/product-published/v1",
    desc: "Catalog item exposed to storefront. Kafka topic: catalog.product-published.",
    valid: () => ({
      productId: uuid(),
      name: "Red ceramic mug · 12oz",
      description: "Hand-glazed mug, dishwasher safe.",
      price: 14.9,
      currency: "BRL",
      category: "home",
      tags: ["kitchen", "ceramic", "limited"],
      images: ["https://example.com/mug.jpg"],
      publishedAt: now(),
    }),
    invalid: () => ({
      productId: "not-a-uuid",
      name: "",
      price: -1,
      category: "alien-tech",
      publishedAt: "yesterday",
    }),
  },
  {
    title: "Stock adjusted",
    endpoint: "/inventory/stock-adjusted/v1",
    desc: "Warehouse inventory delta. Kafka topic: inventory.stock-adjusted.",
    valid: () => ({
      sku: "WIDGET-001",
      warehouseId: uuid(),
      delta: -3,
      reason: "sale",
      operatorId: "ops-42",
      adjustedAt: now(),
    }),
    invalid: () => ({
      sku: "x",
      warehouseId: "not-a-uuid",
      delta: "muito",
      reason: "alien-abduction",
    }),
  },
  {
    title: "Email sent",
    endpoint: "/notifications/email-sent/v1",
    desc: "Transactional email dispatched. Kafka topic: notifications.email-sent.",
    valid: () => ({
      messageId: uuid(),
      to: "user@example.com",
      cc: ["copy@example.com"],
      subject: "Your order has shipped",
      template: "shipment-update",
      provider: "sendgrid",
      sentAt: now(),
    }),
    invalid: () => ({
      messageId: "nope",
      to: "definitely-not-an-email",
      subject: "",
      template: "vibes",
    }),
  },
  {
    title: "Shipment dispatched",
    endpoint: "/shipping/shipment-dispatched/v1",
    desc: "Package handed to carrier. Kafka topic: shipping.shipment-dispatched.",
    valid: () => ({
      shipmentId: uuid(),
      orderId: "ORD-1042",
      carrier: "dhl",
      trackingCode: "1Z9999W99999999999",
      estimatedDeliveryAt: new Date(Date.now() + 3 * 86400_000).toISOString(),
      dispatchedAt: now(),
    }),
    invalid: () => ({
      shipmentId: 12345,
      carrier: "pombo-correio",
      trackingCode: "x",
    }),
  },
  {
    title: "Refund issued",
    endpoint: "/payments/refund-issued/v1",
    desc: "Customer refund processed. Kafka topic: payments.refund-issued.",
    valid: () => ({
      refundId: uuid(),
      paymentId: uuid(),
      amount: 29.9,
      currency: "BRL",
      reason: "duplicate",
      partial: false,
      notes: "Customer charged twice for same order.",
      issuedAt: now(),
    }),
    invalid: () => ({
      refundId: "REF-555",
      amount: -100,
      currency: "JPY",
      reason: "vibes",
    }),
  },
];

function renderScenarios() {
  const grid = document.getElementById("scenario-grid");
  grid.innerHTML = "";
  for (const s of scenarios) {
    const card = document.createElement("div");
    card.className = "scenario";
    card.innerHTML = `
      <div class="top">
        <span class="title">${s.title}</span>
        <span class="endpoint">POST ${s.endpoint}</span>
      </div>
      <p class="desc">${s.desc}</p>
      <div class="actions">
        <button class="ok"  data-action="valid">✓ Send valid</button>
        <button class="bad" data-action="invalid">✗ Send invalid</button>
      </div>
    `;
    card.querySelector('[data-action="valid"]').addEventListener("click", () => send(s, "valid", card));
    card.querySelector('[data-action="invalid"]').addEventListener("click", () => send(s, "invalid", card));
    grid.appendChild(card);
  }
}

async function send(scenario, kind, card) {
  const payload = scenario[kind]();
  const url = `${cfg.API_BASE}${scenario.endpoint}`;
  const meta = document.getElementById("response-meta");
  const body = document.getElementById("response-body").querySelector("code");

  card.querySelectorAll("button").forEach((b) => (b.disabled = true));
  meta.className = "meta";
  meta.textContent = `POST ${scenario.endpoint} (${kind}) ...`;
  body.textContent = "...";

  const t0 = performance.now();
  let res, json;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    json = await res.json();
  } catch (err) {
    meta.className = "meta bad";
    meta.textContent = `network error: ${err.message}`;
    body.textContent = "";
    card.querySelectorAll("button").forEach((b) => (b.disabled = false));
    return;
  }
  const dt = Math.round(performance.now() - t0);

  meta.className = "meta " + (res.ok ? "ok" : "bad");
  meta.textContent = `${res.status} ${res.statusText} · ${dt}ms · POST ${scenario.endpoint}`;
  body.textContent = JSON.stringify(json, null, 2);

  card.querySelectorAll("button").forEach((b) => (b.disabled = false));
}

renderScenarios();
