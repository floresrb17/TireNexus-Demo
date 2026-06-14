import type { Product, Sale } from "@workspace/api-client-react";
import { calculateRegularPrice, formatTireSize } from "./format";

type XlsxModule = typeof import("xlsx");

let xlsxPromise: Promise<XlsxModule> | null = null;

async function getXlsx() {
  if (!xlsxPromise) {
    xlsxPromise = import("xlsx");
  }
  return xlsxPromise;
}

async function saveWorkbook(wb: XlsxModule["WorkBook"], filename: string) {
  const XLSX = await getXlsx();
  XLSX.writeFile(wb, filename);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function todayLabel() {
  return new Date().toISOString().slice(0, 10);
}

export async function exportSalesReport(sales: Sale[]) {
  const XLSX = await getXlsx();
  const wb = XLSX.utils.book_new();

  const itemRows: unknown[][] = [
    ["Receipt No.", "Date & Time", "Payment Method", "Status", "Product", "Brand", "Tire Size", "Qty", "Net Price", "Total Cost", "Unit Price", "Subtotal", "Profit", "Sale Total"],
  ];

  for (const sale of sales) {
    const dateTime = formatDateTime(sale.createdAt);
    if (sale.items.length === 0) {
      itemRows.push([sale.receiptNumber, dateTime, sale.paymentMethod, sale.status, "", "", "", "", "", "", sale.totalAmount]);
    } else {
      for (const item of sale.items) {
        itemRows.push([
          sale.receiptNumber,
          dateTime,
          sale.paymentMethod,
          sale.status,
          item.productName,
          item.brand ?? "",
          item.tireSize ?? "",
          item.quantity,
          item.netPrice ?? 0,
          (item.netPrice ?? 0) * item.quantity,
          item.unitPrice,
          item.subtotal,
          item.subtotal - ((item.netPrice ?? 0) * item.quantity),
          sale.totalAmount,
        ]);
      }
    }
  }

  const ws1 = XLSX.utils.aoa_to_sheet(itemRows);
  ws1["!cols"] = [
    { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 12 },
    { wch: 24 }, { wch: 14 }, { wch: 12 },
    { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "Sales Detail");

  const summaryRows: unknown[][] = [
    ["Receipt No.", "Date & Time", "Payment Method", "Status", "Items", "Total"],
  ];
  for (const sale of sales) {
    summaryRows.push([
      sale.receiptNumber,
      formatDateTime(sale.createdAt),
      sale.paymentMethod,
      sale.status,
      sale.items.reduce((s, i) => s + i.quantity, 0),
      sale.totalAmount,
    ]);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws2["!cols"] = [
    { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "Sales Summary");

  await saveWorkbook(wb, `WGI-POS_Sales-Report_${todayLabel()}.xlsx`);
}

export async function exportInventory(products: Product[]) {
  const XLSX = await getXlsx();
  const wb = XLSX.utils.book_new();

  const rows = buildProductRows(products);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = productColumns();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");

  await saveWorkbook(wb, `WGI-POS_Inventory-Backup_${todayLabel()}.xlsx`);
}

export async function exportFullBackup(sales: Sale[], products: Product[]) {
  const XLSX = await getXlsx();
  const wb = XLSX.utils.book_new();

  const wsProd = XLSX.utils.aoa_to_sheet(buildProductRows(products));
  wsProd["!cols"] = productColumns();
  XLSX.utils.book_append_sheet(wb, wsProd, "Products");

  const sumRows: unknown[][] = [
    ["Receipt No.", "Date & Time", "Payment Method", "Status", "Items", "Total"],
  ];
  for (const s of sales) {
    sumRows.push([
      s.receiptNumber,
      formatDateTime(s.createdAt),
      s.paymentMethod,
      s.status,
      s.items.reduce((acc, i) => acc + i.quantity, 0),
      s.totalAmount,
    ]);
  }
  const wsSum = XLSX.utils.aoa_to_sheet(sumRows);
  wsSum["!cols"] = [
    { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSum, "Sales Summary");

  const detailRows: unknown[][] = [
    ["Receipt No.", "Date & Time", "Payment Method", "Product", "Brand", "Tire Size", "Qty", "Net Price", "Total Cost", "Unit Price", "Subtotal", "Profit", "Sale Total"],
  ];
  for (const s of sales) {
    for (const item of s.items) {
      detailRows.push([
        s.receiptNumber,
        formatDateTime(s.createdAt),
        s.paymentMethod,
        item.productName,
        item.brand ?? "",
        item.tireSize ?? "",
        item.quantity,
        item.netPrice ?? 0,
        (item.netPrice ?? 0) * item.quantity,
        item.unitPrice,
        item.subtotal,
        item.subtotal - ((item.netPrice ?? 0) * item.quantity),
        s.totalAmount,
      ]);
    }
  }
  const wsDet = XLSX.utils.aoa_to_sheet(detailRows);
  wsDet["!cols"] = [
    { wch: 22 }, { wch: 20 }, { wch: 16 },
    { wch: 24 }, { wch: 14 }, { wch: 12 },
    { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDet, "Sales Detail");

  await saveWorkbook(wb, `WGI-POS_Full-Backup_${todayLabel()}.xlsx`);
}

function buildProductRows(products: Product[]): unknown[][] {
  const rows: unknown[][] = [
    ["ID", "Brand", "Name / Model", "Tire Size", "Width", "Aspect Ratio", "Rim Size", "Net Price", "Regular Price", "Discounted Price", "Stock Qty", "Barcode", "Created At"],
  ];

  for (const p of products) {
    rows.push([
      p.id,
      p.brand,
      p.name,
      formatTireSize(p.width, p.aspectRatio, p.rimSize),
      p.width,
      p.aspectRatio,
      p.rimSize,
      p.netPrice ?? 0,
      calculateRegularPrice(p.price),
      p.price,
      p.stock,
      p.barcode ?? "",
      formatDateTime(p.createdAt),
    ]);
  }

  return rows;
}

function productColumns() {
  return [
    { wch: 6 }, { wch: 16 }, { wch: 24 }, { wch: 12 },
    { wch: 8 }, { wch: 14 }, { wch: 10 },
    { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 16 }, { wch: 20 },
  ];
}
