/**
 * Seed extra demo products/services into demo-data/demo-seed.json.
 * Idempotent by barcode — skips items that already exist. Broadens the
 * demo catalog across more rim sizes so the Inventory page has more to
 * browse. Fictional brands only (matches the rest of demo-seed.json) —
 * no real tire brand names, per DEMO_SANITIZATION_REPORT.md.
 *
 *   node scripts/seed-smoke-products.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const seedFile = path.join(__dirname, "..", "demo-data", "demo-seed.json");

const NOW = "2026-02-20T08:00:00.000Z";

const NEW_PRODUCTS = [
  // --- R15 ---
  { brand: "CityTread", name: "Comfort Ride", width: 185, aspectRatio: 65, rimSize: 15, price: 3900, stock: 14, barcode: "DM1856515", category: "tires" },
  { brand: "MetroGrip", name: "Value Runner", width: 195, aspectRatio: 60, rimSize: 15, price: 4100, stock: 9, barcode: "DM1956015", category: "tires" },
  { brand: "RoadMaster", name: "Tour Plus", width: 205, aspectRatio: 65, rimSize: 15, price: 4450, stock: 11, barcode: "DM2056515", category: "tires" },
  // --- R16 ---
  { brand: "RoadMaster", name: "Tour Plus", width: 205, aspectRatio: 60, rimSize: 16, price: 5350, stock: 16, barcode: "DM2056016", category: "tires" },
  { brand: "TrailPro", name: "AllTerra HT", width: 225, aspectRatio: 70, rimSize: 16, price: 6200, stock: 6, barcode: "DM2257016", category: "tires" },
  // --- R17 ---
  { brand: "CityTread", name: "Sport Line", width: 205, aspectRatio: 45, rimSize: 17, price: 6450, stock: 8, barcode: "DM2054517", category: "tires" },
  { brand: "Summit Grip", name: "Highway Elite", width: 215, aspectRatio: 50, rimSize: 17, price: 6700, stock: 5, barcode: "DM2155017", category: "tires" },
  { brand: "Summit Grip", name: "Highway Elite", width: 225, aspectRatio: 50, rimSize: 17, price: 6900, stock: 7, barcode: "DM2255017", category: "tires" },
  // --- R18 ---
  { brand: "MetroGrip", name: "All Season", width: 235, aspectRatio: 60, rimSize: 18, price: 8100, stock: 4, barcode: "DM2356018", category: "tires" },
  { brand: "TrailPro", name: "AllTerra HT", width: 245, aspectRatio: 45, rimSize: 18, price: 8600, stock: 3, barcode: "DM2454518", category: "tires" },
  // --- R19 ---
  { brand: "Summit Grip", name: "Performance X", width: 245, aspectRatio: 40, rimSize: 19, price: 9800, stock: 2, barcode: "DM2454019", category: "tires" },
  // --- R20 ---
  { brand: "Summit Grip", name: "Performance X", width: 265, aspectRatio: 35, rimSize: 20, price: 11200, stock: 2, barcode: "DM2653520", category: "tires" },
  // --- Mag / wheel (non-tire, category "other") ---
  { brand: "SpinForge", name: "Alloy Wheel Rim 17-inch", width: 0, aspectRatio: 0, rimSize: 0, price: 8500, stock: 4, barcode: "OTH-RIM-17", category: "other" },
  // --- Services ---
  { brand: "Shop Service", name: "Wheel Alignment", width: 0, aspectRatio: 0, rimSize: 0, price: 450, stock: 999, barcode: "SVC-ALIGN", category: "services", serviceUnit: "Service" },
  { brand: "Shop Service", name: "Mag Cleaning", width: 0, aspectRatio: 0, rimSize: 0, price: 250, stock: 999, barcode: "SVC-MAGCLEAN", category: "services", serviceUnit: "Service" },
];

function main() {
  const seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));

  const existingBarcodes = new Set(seed.products.map((p) => p.barcode));
  let nextId = seed.nextProductId;
  let added = 0;
  let skipped = 0;

  for (const item of NEW_PRODUCTS) {
    if (existingBarcodes.has(item.barcode)) {
      console.log(`  skip ${item.barcode} (${item.name}) — already exists`);
      skipped++;
      continue;
    }
    seed.products.push({
      id: nextId,
      ...item,
      createdAt: NOW,
    });
    console.log(`  + ${item.barcode} ${item.brand} ${item.name}`);
    nextId++;
    added++;
  }

  seed.nextProductId = nextId;

  fs.writeFileSync(seedFile, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(`Done. Added ${added}, skipped ${skipped}. Catalog now has ${seed.products.length} products.`);
}

main();
