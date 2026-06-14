/**
 * WGI POS Demo API — portfolio demonstration backend only.
 * Copyright © Robert Flores. All rights reserved.
 * This file is NOT the production API. Proprietary business logic remains private.
 */
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");

const dataDir = process.env.WGI_DEMO_DATA_DIR || path.join(__dirname, "demo-data");
const dataFile = path.join(dataDir, "wgi-pos-demo.json");
const seedFile = path.join(__dirname, "demo-data", "demo-seed.json");
const port = Number(process.env.WGI_DEMO_API_PORT || 8080);
const host = process.env.WGI_DEMO_API_HOST || "127.0.0.1";

const sessions = new Map();

function hashPassword(password) {
  return crypto.createHash("sha256").update(`wgi-demo:${password}`).digest("hex");
}

function loadSeed() {
  const raw = JSON.parse(fs.readFileSync(seedFile, "utf8"));
  return {
    ...raw,
    users: raw.users.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      passwordHash: hashPassword(user.password),
      createdAt: new Date().toISOString(),
    })),
  };
}

function ensureDataFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(loadSeed(), null, 2));
  }
}

function loadData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-WGI-Demo-Mode": "1",
  });
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, decodeURIComponent(rest.join("=") || "")];
    }).filter(([key]) => key),
  );
}

function getSessionUser(req, data) {
  const cookies = parseCookies(req);
  const username = cookies.wgi_demo_user;
  if (!username) return null;
  return data.users.find((user) => user.username === username) || null;
}

function publicProduct(product) {
  const { netPrice, ...safe } = product;
  return safe;
}

function publicSale(sale) {
  return {
    ...sale,
    items: sale.items.map(({ netPrice, ...item }) => item),
  };
}

function tireSize(product) {
  if (product.category === "services") return "Service";
  if (product.category === "other") return "Other";
  return `${product.width}/${product.aspectRatio}R${product.rimSize}`;
}

function isToday(value) {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function isTireItem(item) {
  const size = String(item.tireSize || "");
  return size && !/^(service|other)/i.test(size);
}

function countTiresSold(sales) {
  let total = 0;
  for (const sale of sales) {
    for (const item of sale.items || []) {
      if (isTireItem(item)) total += Number(item.quantity || 0);
    }
  }
  return total;
}

function resetDemoData() {
  const seed = loadSeed();
  saveData(seed);
  return seed;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname;

  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    if (route === "/api/healthz") {
      return sendJson(res, 200, { status: "ok", mode: "demo" });
    }

    const data = loadData();

    if (route === "/api/auth/login" && req.method === "POST") {
      const body = await readBody(req);
      const user = data.users.find((entry) => entry.username === body.username);
      if (!user || user.passwordHash !== hashPassword(String(body.password || ""))) {
        return sendJson(res, 401, { error: "Invalid username or password" });
      }
      res.setHeader("Set-Cookie", `wgi_demo_user=${encodeURIComponent(user.username)}; Path=/; HttpOnly; SameSite=Lax`);
      return sendJson(res, 200, { user: { id: user.id, username: user.username, role: user.role } });
    }

    if (route === "/api/auth/logout") {
      res.setHeader("Set-Cookie", "wgi_demo_user=; Path=/; Max-Age=0");
      return sendJson(res, 200, { success: true });
    }

    if (route === "/api/auth/me") {
      const user = getSessionUser(req, data);
      if (!user) return sendJson(res, 401, { error: "Not authenticated" });
      return sendJson(res, 200, { id: user.id, username: user.username, role: user.role });
    }

    const user = getSessionUser(req, data);
    if (!user) return sendJson(res, 401, { error: "Not authenticated" });

    if (route === "/api/demo/reset" && req.method === "POST") {
      if (user.role !== "admin") return sendJson(res, 403, { error: "Admin only" });
      resetDemoData();
      return sendJson(res, 200, { success: true });
    }

    if (route === "/api/settings" && req.method === "GET") {
      return sendJson(res, 200, data.settings);
    }

    if (route === "/api/settings" && req.method === "PUT") {
      if (user.role !== "admin") return sendJson(res, 403, { error: "Admin only" });
      const body = await readBody(req);
      data.settings = { ...data.settings, ...body };
      saveData(data);
      return sendJson(res, 200, data.settings);
    }

    if (route === "/api/products" && req.method === "GET") {
      let products = data.products.map(publicProduct);
      const search = url.searchParams.get("search")?.toLowerCase();
      if (search) {
        products = products.filter((product) =>
          [product.brand, product.name, product.barcode, tireSize(product)]
            .join(" ")
            .toLowerCase()
            .includes(search),
        );
      }
      return sendJson(res, 200, products);
    }

    if (route.startsWith("/api/products/barcode/") && req.method === "GET") {
      const barcode = decodeURIComponent(route.split("/").pop());
      const product = data.products.find((entry) => entry.barcode === barcode);
      if (!product) return sendJson(res, 404, { error: "Product not found" });
      return sendJson(res, 200, publicProduct(product));
    }

    if (route.startsWith("/api/products/") && req.method === "GET") {
      const id = Number(route.split("/").pop());
      const product = data.products.find((entry) => entry.id === id);
      if (!product) return sendJson(res, 404, { error: "Product not found" });
      return sendJson(res, 200, publicProduct(product));
    }

    if (route === "/api/products" && req.method === "POST") {
      const body = await readBody(req);
      const product = {
        id: data.nextProductId++,
        brand: body.brand,
        name: body.name,
        width: Number(body.width || 0),
        aspectRatio: Number(body.aspectRatio || 0),
        rimSize: Number(body.rimSize || 0),
        price: Number(body.price || 0),
        stock: Number(body.stock || 0),
        barcode: body.barcode || `DEMO-${data.nextProductId}`,
        category: body.category || "tires",
        serviceUnit: body.serviceUnit,
        createdAt: new Date().toISOString(),
      };
      data.products.push(product);
      saveData(data);
      return sendJson(res, 201, publicProduct(product));
    }

    if (route.startsWith("/api/products/") && req.method === "PATCH") {
      const id = Number(route.split("/").pop());
      const index = data.products.findIndex((entry) => entry.id === id);
      if (index < 0) return sendJson(res, 404, { error: "Product not found" });
      const body = await readBody(req);
      data.products[index] = { ...data.products[index], ...body, id };
      saveData(data);
      return sendJson(res, 200, publicProduct(data.products[index]));
    }

    if (route === "/api/sales" && req.method === "GET") {
      return sendJson(res, 200, data.sales.map(publicSale));
    }

    if (route.startsWith("/api/sales/") && req.method === "GET") {
      const id = Number(route.split("/").pop());
      const sale = data.sales.find((entry) => entry.id === id);
      if (!sale) return sendJson(res, 404, { error: "Sale not found" });
      return sendJson(res, 200, publicSale(sale));
    }

    if (route === "/api/sales" && req.method === "POST") {
      const body = await readBody(req);
      const items = [];
      let totalAmount = 0;
      for (const line of body.items || []) {
        const product = data.products.find((entry) => entry.id === line.productId);
        if (!product) return sendJson(res, 400, { error: `Unknown product ${line.productId}` });
        const quantity = Number(line.quantity || 1);
        if (product.category === "tires" && product.stock < quantity) {
          return sendJson(res, 400, { error: `Insufficient stock for ${product.name}` });
        }
        const unitPrice = Number(line.unitPrice ?? product.price);
        const subtotal = unitPrice * quantity;
        totalAmount += subtotal;
        items.push({
          productId: product.id,
          productName: product.name,
          brand: product.brand,
          tireSize: tireSize(product),
          quantity,
          unitPrice,
          subtotal,
        });
        if (product.category === "tires") product.stock -= quantity;
      }
      const sale = {
        id: data.nextSaleId++,
        receiptNumber: `${data.settings.receiptPrefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(data.nextSaleId).padStart(5, "0")}`,
        totalAmount,
        paymentMethod: body.paymentMethod || "cash",
        status: "completed",
        syncStatus: "demo",
        notes: body.notes || null,
        createdAt: new Date().toISOString(),
        items,
      };
      data.sales.unshift(sale);
      saveData(data);
      return sendJson(res, 201, publicSale(sale));
    }

    if (route === "/api/customer-profiles" && req.method === "GET") {
      return sendJson(res, 200, data.customerProfiles);
    }

    if (route === "/api/customer-profiles" && req.method === "POST") {
      const body = await readBody(req);
      const profile = {
        id: data.nextCustomerProfileId++,
        customerName: body.customerName,
        plateNumber: body.plateNumber,
        vehicleMake: body.vehicleMake || "",
        vehicleModel: body.vehicleModel || "",
        phoneNumber: body.phoneNumber || "",
        lastOdometer: Number(body.lastOdometer || 0),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.customerProfiles.unshift(profile);
      saveData(data);
      return sendJson(res, 201, profile);
    }

    if (route === "/api/vehicle-history" && req.method === "GET") {
      const plate = url.searchParams.get("plateNumber")?.toLowerCase();
      const history = data.sales.filter((sale) =>
        sale.items.some((item) => String(item.tireSize || "").toLowerCase().includes(plate || "___no_match___")),
      );
      return sendJson(res, 200, history.map(publicSale));
    }

    if (route === "/api/service-tickets" && req.method === "GET") {
      return sendJson(res, 200, data.serviceTickets);
    }

    if (route === "/api/service-tickets" && req.method === "POST") {
      const body = await readBody(req);
      const ticket = {
        id: (data.serviceTickets.at(-1)?.id || 0) + 1,
        customerProfileId: body.customerProfileId,
        customerName: body.customerName,
        plateNumber: body.plateNumber,
        vehicleMake: body.vehicleMake || "",
        vehicleModel: body.vehicleModel || "",
        status: body.status || "waiting",
        odometerReading: Number(body.odometerReading || 0),
        notes: body.notes || "",
        lineItems: body.lineItems || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.serviceTickets.unshift(ticket);
      saveData(data);
      return sendJson(res, 201, ticket);
    }

    if (route.startsWith("/api/service-tickets/") && req.method === "PATCH") {
      const id = Number(route.split("/").pop());
      const index = data.serviceTickets.findIndex((entry) => entry.id === id);
      if (index < 0) return sendJson(res, 404, { error: "Ticket not found" });
      const body = await readBody(req);
      data.serviceTickets[index] = { ...data.serviceTickets[index], ...body, updatedAt: new Date().toISOString() };
      saveData(data);
      return sendJson(res, 200, data.serviceTickets[index]);
    }

    if (route === "/api/inventory-movements" && req.method === "GET") {
      return sendJson(res, 200, data.inventoryMovements || []);
    }

    if (route === "/api/dashboard/summary" && req.method === "GET") {
      const todaySales = data.sales.filter((sale) => isToday(sale.createdAt));
      return sendJson(res, 200, {
        totalSalesToday: todaySales.length,
        totalRevenueToday: todaySales.reduce((sum, sale) => sum + sale.totalAmount, 0),
        tiresSoldToday: countTiresSold(todaySales),
        totalProducts: data.products.length,
        lowStockCount: data.products.filter((product) => product.category === "tires" && product.stock <= data.settings.lowStockThreshold).length,
        pendingSyncCount: 0,
        totalSalesAllTime: data.sales.length,
        totalRevenueAllTime: data.sales.reduce((sum, sale) => sum + sale.totalAmount, 0),
      });
    }

    if (route === "/api/dashboard/recent-sales" && req.method === "GET") {
      return sendJson(res, 200, data.sales.filter((sale) => isToday(sale.createdAt)).slice(0, 5).map(publicSale));
    }

    if (route === "/api/dashboard/active-clients" && req.method === "GET") {
      return sendJson(res, 200, data.serviceTickets.filter((ticket) => ticket.status !== "completed").slice(0, 10));
    }

    if (route === "/api/dashboard/low-stock" && req.method === "GET") {
      return sendJson(res, 200, data.products.filter((product) => product.category === "tires" && product.stock <= data.settings.lowStockThreshold).map(publicProduct));
    }

    if (route === "/api/dashboard/sales-by-payment" && req.method === "GET") {
      const todaySales = data.sales.filter((sale) => isToday(sale.createdAt));
      const groups = new Map();
      for (const sale of todaySales) {
        const current = groups.get(sale.paymentMethod) || { paymentMethod: sale.paymentMethod, count: 0, total: 0 };
        current.count += 1;
        current.total += sale.totalAmount;
        groups.set(sale.paymentMethod, current);
      }
      return sendJson(res, 200, [...groups.values()]);
    }

    if (route === "/api/dashboard/best-sellers-week" && req.method === "GET") {
      const counts = new Map();
      for (const sale of data.sales) {
        for (const item of sale.items) {
          if (!isTireItem(item)) continue;
          const key = `${item.brand || ""} ${item.productName}`.trim();
          counts.set(key, (counts.get(key) || 0) + item.quantity);
        }
      }
      const rows = [...counts.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
      return sendJson(res, 200, rows);
    }

    if (route.startsWith("/api/bir") || route.startsWith("/api/cloud-sync") || route.startsWith("/api/desktop-update") || route === "/api/invoices" || route === "/api/z-readings" || route === "/api/reports/bir-summary" || route === "/api/users") {
      return sendJson(res, 403, { error: "Not available in demo mode" });
    }

    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("[demo-api]", error);
    return sendJson(res, 500, { error: "Demo server error" });
  }
});

server.listen(port, host, () => {
  ensureDataFile();
  console.log(`WGI POS Demo API listening on http://${host}:${port}`);
});
