import { useMemo, useState } from "react";
import { CalendarDays, Download, FileBarChart, Printer, TrendingUp } from "lucide-react";
import { useListSales, useListProducts, type Product, type Sale } from "@workspace/api-client-react";
import { exportSalesReport } from "@/lib/export";
import { formatCurrency, formatDate, formatPriceDisplay } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDemoMode } from "@/lib/demo-mode";

const showFinancialMetrics = !isDemoMode;

type RangeMode = "today" | "weekly" | "monthly" | "yearly";

function localDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateInputValue(date: Date) {
  return localDateKey(date);
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function rangeForMode(mode: RangeMode) {
  const now = new Date();
  const start = startOfDay(now);
  const end = endOfDay(now);

  if (mode === "weekly") {
    const day = start.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + mondayOffset);
  }

  if (mode === "monthly") {
    start.setDate(1);
  }

  if (mode === "yearly") {
    start.setMonth(0, 1);
  }

  return { from: dateInputValue(start), to: dateInputValue(end) };
}

function saleInRange(sale: Sale, from: string, to: string) {
  const createdAt = new Date(sale.createdAt).getTime();
  return createdAt >= startOfDay(parseLocalDate(from)).getTime() && createdAt <= endOfDay(parseLocalDate(to)).getTime();
}

function isSaleToday(sale: Sale) {
  const today = dateInputValue(new Date());
  return saleInRange(sale, today, today);
}

function resolveItemNetPrice(item: Sale["items"][number], products: Product[], useLiveNetPrice: boolean) {
  if (useLiveNetPrice) {
    const product = products.find((candidate) => Number(candidate.id) === Number(item.productId));
    if (product != null && product.netPrice != null && product.netPrice !== undefined) {
      return Number(product.netPrice);
    }
  }
  return Number(item.netPrice ?? 0);
}

function shouldUseLiveNetPrice(sale: Sale, referenceDate: string) {
  const today = dateInputValue(new Date());
  return referenceDate === today && saleInRange(sale, referenceDate, referenceDate);
}

function saleCost(sale: Sale, products: Product[] = [], referenceDate?: string) {
  const useLiveNetPrice = referenceDate
    ? shouldUseLiveNetPrice(sale, referenceDate)
    : isSaleToday(sale);
  return sale.items.reduce((sum, item) => sum + resolveItemNetPrice(item, products, useLiveNetPrice) * item.quantity, 0);
}

function isTireItem(item: Sale["items"][number]) {
  const category = String((item as any).category || "").toLowerCase();
  if (category) return category === "tires";
  return !/^(service|other)\b/i.test(String(item.tireSize || ""));
}

function isServiceItem(item: Sale["items"][number]) {
  const category = String((item as any).category || "").toLowerCase();
  return category === "services" || /^service\b/i.test(String(item.tireSize || ""));
}

function itemLabel(item: Sale["items"][number]) {
  return [item.brand, item.productName].filter(Boolean).join(" ") || item.productName;
}

type TransactionRow = ReturnType<typeof buildTransactionRows>[number];

function buildTransactionRows(salesInScope: Sale[], products: Product[] = [], referenceDate?: string) {
  return salesInScope
    .map((sale) => {
      const cost = saleCost(sale, products, referenceDate);
      const tireItems = sale.items.filter(isTireItem);
      const serviceItems = sale.items.filter(isServiceItem);
      const otherItems = sale.items.filter((item) => !isTireItem(item) && !isServiceItem(item));
      const customerName = String((sale as any).customerName || "").trim();
      const unit = [(sale as any).carMaker, (sale as any).carModel].filter(Boolean).join(" ");
      return {
        id: sale.id,
        receiptNumber: sale.receiptNumber,
        createdAt: sale.createdAt,
        paymentMethod: sale.paymentMethod,
        customerName: customerName || "Walk-in customer",
        unit: unit || (sale as any).plateNumber || "Unit not recorded",
        plateNumber: (sale as any).plateNumber || "",
        tireItems,
        serviceItems,
        otherItems,
        tiresSold: saleTireQty(sale),
        discount: Number((sale as any).discountTotal || 0),
        cost,
        total: sale.totalAmount,
        profit: sale.totalAmount - cost,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function printLineItemClass(item: Sale["items"][number]) {
  if (isServiceItem(item)) return "line-item-service";
  return "line-item-tire";
}

function printItemDescription(item: Sale["items"][number]) {
  const label = itemLabel(item);
  const size = String(item.tireSize || "").trim();
  const showSize = size && !/^(service|other)\b/i.test(size);
  const sizePart = showSize ? ` (${size})` : "";
  return `${item.quantity}x ${label}${sizePart}`;
}

function itemLineMetrics(item: Sale["items"][number], products: Product[], useLiveNetPrice: boolean) {
  const quantity = Number(item.quantity || 0);
  const subtotal = Number(item.subtotal || Number(item.unitPrice || 0) * quantity);
  const netPrice = resolveItemNetPrice(item, products, useLiveNetPrice);
  const netCost = netPrice * quantity;
  return { sale: subtotal, netCost, profit: subtotal - netCost };
}

function buildPrintDetailRows(rows: TransactionRow[]) {
  const output: Array<{
    key: string;
    row: TransactionRow;
    item: Sale["items"][number] | null;
    isFirst: boolean;
    rowSpan: number;
  }> = [];

  for (const row of rows) {
    const items = [...row.tireItems, ...row.otherItems, ...row.serviceItems];
    if (!items.length) {
      output.push({ key: `empty-${row.id}`, row, item: null, isFirst: true, rowSpan: 1 });
      continue;
    }
    items.forEach((item, index) => {
      output.push({
        key: `${row.id}-${index}-${item.productId}`,
        row,
        item,
        isFirst: index === 0,
        rowSpan: items.length,
      });
    });
  }

  return output;
}

function VehicleCell({ row }: { row: TransactionRow }) {
  return (
    <>
      <div className="unit-title">{row.unit}</div>
      <div className="unit-subtitle">{row.customerName}</div>
      {row.plateNumber ? <div className="unit-plate">Plate: {row.plateNumber}</div> : null}
    </>
  );
}

function groupItems(items: Sale["items"]): Array<{ key: string; label: string; size: string; unitPrice: number; quantity: number; totalSales: number }> {
  const groups = new Map<string, { key: string; label: string; size: string; unitPrice: number; quantity: number; totalSales: number }>();
  for (const item of items) {
    const label = itemLabel(item);
    const size = String(item.tireSize || "");
    const unitPrice = Number(item.unitPrice || 0);
    const key = `${label}|${size}|${unitPrice}`;
    const current = groups.get(key) || { key, label, size, unitPrice, quantity: 0, totalSales: 0 };
    current.quantity += Number(item.quantity || 0);
    current.totalSales += Number(item.subtotal || unitPrice * Number(item.quantity || 0));
    groups.set(key, current);
  }
  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label) || a.size.localeCompare(b.size) || a.unitPrice - b.unitPrice);
}

function saleTireQty(sale: Sale) {
  return sale.items.filter(isTireItem).reduce((sum, item) => sum + item.quantity, 0);
}

export default function SalesReport() {
  const { toast } = useToast();
  const { data: sales = [], isLoading } = useListSales();
  const { data: products = [] } = useListProducts();
  const [mode, setMode] = useState<RangeMode>("today");
  const [printDate, setPrintDate] = useState(dateInputValue(new Date()));
  const initialRange = rangeForMode("today");
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);

  const applyMode = (nextMode: RangeMode) => {
    setMode(nextMode);
    const range = rangeForMode(nextMode);
    setFromDate(range.from);
    setToDate(range.to);
  };

  const filteredSales = useMemo(
    () => sales.filter((sale) => saleInRange(sale, fromDate, toDate)),
    [sales, fromDate, toDate],
  );

  const totals = useMemo(() => {
    const grossSales = filteredSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const netCost = filteredSales.reduce((sum, sale) => sum + saleCost(sale, products), 0);
    const tiresSold = filteredSales.reduce((sum, sale) => sum + saleTireQty(sale), 0);
    return {
      grossSales,
      netCost,
      profit: grossSales - netCost,
      transactions: filteredSales.length,
      tiresSold,
    };
  }, [filteredSales, products]);

  const dailyRows = useMemo(() => {
    const groups = new Map<string, { date: string; transactions: number; tires: number; sales: number; cost: number }>();
    for (const sale of filteredSales) {
      const key = localDateKey(new Date(sale.createdAt));
      const current = groups.get(key) || { date: key, transactions: 0, tires: 0, sales: 0, cost: 0 };
      current.transactions += 1;
      current.tires += saleTireQty(sale);
      current.sales += sale.totalAmount;
      current.cost += saleCost(sale, products);
      groups.set(key, current);
    }
    return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredSales, products]);

  const printDaySales = useMemo(
    () => sales.filter((sale) => saleInRange(sale, printDate, printDate)),
    [sales, printDate],
  );

  const transactionRows = useMemo(() => buildTransactionRows(filteredSales, products), [filteredSales, products]);
  const printTransactionRows = useMemo(() => buildTransactionRows(printDaySales, products, printDate), [printDaySales, products, printDate]);

  const paymentRows = useMemo(() => {
    const groups = new Map<string, { method: string; transactions: number; sales: number }>();
    for (const sale of filteredSales) {
      const current = groups.get(sale.paymentMethod) || { method: sale.paymentMethod, transactions: 0, sales: 0 };
      current.transactions += 1;
      current.sales += sale.totalAmount;
      groups.set(sale.paymentMethod, current);
    }
    return Array.from(groups.values()).sort((a, b) => b.sales - a.sales);
  }, [filteredSales]);

  const buildTiresSoldRows = (salesInScope: Sale[]) => salesInScope
      .flatMap((sale) =>
        sale.items.filter(isTireItem).map((item, index) => {
          const quantity = item.quantity || 0;
          const grossSales = item.subtotal || (item.unitPrice || 0) * quantity;
          const netCost = resolveItemNetPrice(item, products, isSaleToday(sale)) * quantity;
          return {
            id: `${sale.id}-${item.productId}-${index}`,
            createdAt: sale.createdAt,
            paymentMethod: sale.paymentMethod,
            productName: item.productName,
            brand: item.brand || "",
            tireSize: item.tireSize || "",
            unitPrice: Number(item.unitPrice || 0),
            quantity,
            grossSales,
            netCost,
            grossProfit: grossSales - netCost,
            netProfit: grossSales - netCost,
          };
        }),
      );

  const tiresSoldRows = useMemo(() => buildTiresSoldRows(filteredSales), [filteredSales, products]);
  const printTireSummary = useMemo(
    () => groupItems(printDaySales.flatMap((sale) => sale.items.filter(isTireItem))),
    [printDaySales],
  );
  const printServiceSummary = useMemo(
    () => groupItems(printDaySales.flatMap((sale) => sale.items.filter(isServiceItem))),
    [printDaySales],
  );

  const printDetailRows = useMemo(() => buildPrintDetailRows(printTransactionRows), [printTransactionRows]);

  const printTotals = useMemo(() => {
    const grossSales = printDaySales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const netCost = printDaySales.reduce((sum, sale) => sum + saleCost(sale, products, printDate), 0);
    return {
      grossSales,
      netCost,
      profit: grossSales - netCost,
      transactions: printDaySales.length,
      tirePieces: printTireSummary.reduce((sum, item) => sum + item.quantity, 0),
      serviceCount: printServiceSummary.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, [printDaySales, printTireSummary, printServiceSummary, products, printDate]);

  const printUsesLiveNetPrice = printDate === dateInputValue(new Date());

  const rangeLabel = mode === "today" ? "today" : `${fromDate} to ${toDate}`;

  const handleExport = async () => {
    if (!showFinancialMetrics) return;
    try {
      await exportSalesReport(filteredSales);
      toast({ title: "Sales report exported", description: "Check your Downloads folder." });
    } catch {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const rangeButtons: Array<{ value: RangeMode; label: string }> = [
    { value: "today", label: "Today" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales Report</h2>
          <p className="mt-1 text-muted-foreground">{showFinancialMetrics ? "Review sales, cost, profit, and transactions by date range." : "Review demo sales activity and transactions by date range."}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="print-date" className="text-sm text-muted-foreground">Print report for</Label>
            <Input
              id="print-date"
              type="date"
              value={printDate}
              onChange={(event) => setPrintDate(event.target.value)}
              className="w-[180px]"
            />
          </div>
          <Button onClick={() => window.print()} disabled={isLoading || printDaySales.length === 0} variant="outline" className="gap-2">
            <Printer className="h-4 w-4" />
            Print Daily Transactions
          </Button>
          {showFinancialMetrics && (
          <Button onClick={handleExport} disabled={isLoading || filteredSales.length === 0} className="gap-2">
            <Download className="h-4 w-4" />
            Export Report
          </Button>
          )}
        </div>
      </div>

      <section className="daily-print hidden bg-white text-black">
        <style>{`
          .daily-print { font-family: Calibri, "Segoe UI", Candara, sans-serif; color: #111; font-size: 13px; }
          .daily-print table { width: 100%; border-collapse: collapse; font-size: 13px; }
          .daily-print th, .daily-print td { border: 1px solid #333; padding: 6px 8px; vertical-align: middle; }
          .daily-print th { background: #f3f3f3; text-align: left; font-weight: 700; font-size: 13px; }
          .daily-print th.text-right, .daily-print td.text-right { text-align: right; }
          .daily-print .transactions-table { table-layout: auto; width: 100%; }
          .daily-print .transactions-table .col-vehicle { width: 18%; min-width: 130px; vertical-align: middle; }
          .daily-print .transactions-table .col-line-item { width: auto; }
          .daily-print .transactions-table .col-money { text-align: right; white-space: nowrap; padding-left: 12px; padding-right: 12px; min-width: 88px; }
          .daily-print .line-item-text { font-size: 13px; line-height: 1.4; }
          .daily-print .line-item-tire { color: #111; }
          .daily-print .line-item-service { color: #b91c1c; }
          .daily-print .unit-title { font-weight: 700; font-size: 13px; }
          .daily-print .unit-subtitle { font-size: 12px; color: #444; margin-top: 3px; }
          .daily-print .unit-plate { font-size: 12px; font-family: ui-monospace, monospace; margin-top: 4px; font-weight: 600; }
          .daily-print .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }
          .daily-print .summary-card { border: 1px solid #333; padding: 8px; }
          .daily-print .summary-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #444; }
          .daily-print .summary-card .value { font-size: 15px; font-weight: 700; margin-top: 2px; }
          .daily-print .transactions-table tr.item-continued td {
            border-top: none;
          }
          .daily-print .print-summary-columns {
            display: block;
          }
          .daily-print .print-summary-columns > div {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 20px;
          }
          .daily-print .print-summary-columns table {
            width: 100%;
            table-layout: fixed;
          }
        `}</style>
        <div className="space-y-5 p-6">
          <div className="border-b-2 border-black pb-3 text-center">
            <h1 className="text-2xl font-black tracking-wide">Daily Transaction Report</h1>
            <p className="mt-1 text-sm font-semibold">Report Date: {printDate}</p>
            <p className="text-xs text-gray-600">Generated {formatDate(new Date().toISOString())}</p>
          </div>

          <div className="summary-grid text-sm">
            <div className="summary-card"><div className="label">Transactions</div><div className="value">{printTotals.transactions}</div></div>
            <div className="summary-card"><div className="label">Tire Pieces</div><div className="value">{printTotals.tirePieces}</div></div>
            <div className="summary-card"><div className="label">Services</div><div className="value">{printTotals.serviceCount}</div></div>
            <div className="summary-card"><div className="label">Gross Sales</div><div className="value">{formatCurrency(printTotals.grossSales)}</div></div>
            {showFinancialMetrics && <div className="summary-card"><div className="label">Net Cost</div><div className="value">{formatCurrency(printTotals.netCost)}</div></div>}
            {showFinancialMetrics && <div className="summary-card"><div className="label">Profit</div><div className="value">{formatCurrency(printTotals.profit)}</div></div>}
          </div>

          <div>
            <h2 className="mb-2 border-b border-black pb-1 text-base font-black uppercase tracking-wide">Transactions</h2>
            {printTransactionRows.length === 0 ? (
              <p className="text-sm text-gray-600">No transactions recorded for {printDate}.</p>
            ) : (
              <table className="transactions-table">
                <thead>
                  <tr>
                    <th className="col-vehicle">Vehicle / Customer</th>
                    <th className="col-line-item">Line Item</th>
                    <th className="col-money text-right">Sale</th>
                    {showFinancialMetrics && <th className="col-money text-right">Net Cost</th>}
                    {showFinancialMetrics && <th className="col-money text-right">Profit</th>}
                    <th className="col-money text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {printDetailRows.map((detail) => {
                    if (!detail.item) {
                      return (
                        <tr key={detail.key} className="break-inside-avoid">
                          <td className="col-vehicle"><VehicleCell row={detail.row} /></td>
                          <td className="col-line-item text-gray-500">No line items</td>
                          <td className="col-money text-right">{formatCurrency(0)}</td>
                          <td className="col-money text-right">{formatCurrency(0)}</td>
                          <td className="col-money text-right">{formatCurrency(0)}</td>
                          <td className="col-money text-right font-bold">{formatCurrency(detail.row.total)}</td>
                        </tr>
                      );
                    }

                    const metrics = itemLineMetrics(detail.item, products, printUsesLiveNetPrice);
                    return (
                      <tr key={detail.key} className={detail.isFirst ? "transaction-group-start break-inside-avoid" : "item-continued break-inside-avoid"}>
                        {detail.isFirst ? (
                          <td className="col-vehicle" rowSpan={detail.rowSpan}>
                            <VehicleCell row={detail.row} />
                          </td>
                        ) : null}
                          <td className="col-line-item">
                          <div className={`line-item-text ${printLineItemClass(detail.item)}`}>{printItemDescription(detail.item)}</div>
                        </td>
                        <td className="col-money text-right">{formatPriceDisplay(metrics.sale)}</td>
                        {showFinancialMetrics && <td className="col-money text-right">{formatPriceDisplay(metrics.netCost)}</td>}
                        {showFinancialMetrics && <td className="col-money text-right">{formatPriceDisplay(metrics.profit)}</td>}
                        {detail.isFirst ? (
                          <td className="col-money text-right font-bold" rowSpan={detail.rowSpan}>
                            {formatCurrency(detail.row.total)}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="print-summary-columns">
            <div>
              <h2 className="mb-2 border-b border-black pb-1 text-base font-black uppercase tracking-wide">Tires Summary</h2>
              <table>
                <thead><tr><th className="border p-1 text-left">Tire</th><th className="border p-1 text-left">Size</th><th className="border p-1 text-right">Price</th><th className="border p-1 text-right">Qty</th><th className="border p-1 text-right">Sales</th></tr></thead>
                <tbody>
                  {printTireSummary.map((item) => (
                    <tr key={item.key}><td className="border p-1">{item.label}</td><td className="border p-1">{item.size}</td><td className="border p-1 text-right">{formatCurrency(item.unitPrice)}</td><td className="border p-1 text-right">{item.quantity}</td><td className="border p-1 text-right">{formatCurrency(item.totalSales)}</td></tr>
                  ))}
                  {printTireSummary.length === 0 && <tr><td className="border p-2 text-center" colSpan={5}>No tires sold today.</td></tr>}
                </tbody>
              </table>
            </div>
            <div>
              <h2 className="mb-2 border-b border-black pb-1 text-base font-black uppercase tracking-wide">Services Summary</h2>
              <table>
                <thead><tr><th className="border p-1 text-left">Service</th><th className="border p-1 text-right">Price</th><th className="border p-1 text-right">Qty</th><th className="border p-1 text-right">Sales</th></tr></thead>
                <tbody>
                  {printServiceSummary.map((item) => (
                    <tr key={item.key}><td className="border p-1">{item.label}</td><td className="border p-1 text-right">{formatCurrency(item.unitPrice)}</td><td className="border p-1 text-right">{item.quantity}</td><td className="border p-1 text-right">{formatCurrency(item.totalSales)}</td></tr>
                  ))}
                  {printServiceSummary.length === 0 && <tr><td className="border p-2 text-center" colSpan={4}>No services availed today.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <Card className="screen-report">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            Report Range
          </CardTitle>
          <CardDescription>Choose today, weekly, monthly, or yearly report totals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {rangeButtons.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant={mode === item.value ? "default" : "outline"}
                onClick={() => applyMode(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Showing {fromDate} to {toDate}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Gross Sales</div>
            <div className="mt-2 text-2xl font-black text-primary">{formatCurrency(totals.grossSales)}</div>
          </CardContent>
        </Card>
        {showFinancialMetrics && (
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Net Cost</div>
            <div className="mt-2 text-2xl font-black">{formatCurrency(totals.netCost)}</div>
          </CardContent>
        </Card>
        )}
        {showFinancialMetrics && (
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Profit</div>
            <div className={`mt-2 text-2xl font-black ${totals.profit < 0 ? "text-destructive" : "text-emerald-600"}`}>
              {formatCurrency(totals.profit)}
            </div>
          </CardContent>
        </Card>
        )}
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Transactions</div>
            <div className="mt-2 text-2xl font-black">{totals.transactions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Tires Sold</div>
            <div className="mt-2 text-2xl font-black">{totals.tiresSold}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              Daily Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Tires</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyRows.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="text-right">{row.transactions}</TableCell>
                    <TableCell className="text-right">{row.tires}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.sales)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.cost)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.sales - row.cost)}</TableCell>
                  </TableRow>
                ))}
                {!isLoading && dailyRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No sales found for this date range.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileBarChart className="h-4 w-4" />
              Payment Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentRows.map((row) => (
              <div key={row.method} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Badge variant="outline" className="capitalize">{row.method}</Badge>
                  <div className="mt-1 text-xs text-muted-foreground">{row.transactions} transaction{row.transactions !== 1 ? "s" : ""}</div>
                </div>
                <div className="font-bold">{formatCurrency(row.sales)}</div>
              </div>
            ))}
            {!isLoading && paymentRows.length === 0 && (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">No payment data for this range.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{mode === "today" ? "Tires Sold Today" : "Tires Sold"}</CardTitle>
          <CardDescription>
            {mode === "today"
              ? "Only tire products sold today are listed here."
              : `Tire products sold from ${rangeLabel}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Tire</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Pieces</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiresSoldRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                  <TableCell className="font-medium">{row.brand} {row.productName}</TableCell>
                  <TableCell className="font-mono text-xs">{row.tireSize}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{row.paymentMethod}</Badge></TableCell>
                  <TableCell className="text-right">{row.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.unitPrice)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(row.grossSales)}</TableCell>
                </TableRow>
              ))}
              {!isLoading && tiresSoldRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {mode === "today" ? "No tires sold today." : "No tires sold for this date range."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{mode === "today" ? "Daily Transactions" : "Transactions"}</CardTitle>
          <CardDescription>
            {transactionRows.length} transaction{transactionRows.length !== 1 ? "s" : ""} {mode === "today" ? "today" : `from ${rangeLabel}`}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {transactionRows.map((row) => (
            <div key={row.id} className="rounded-md border bg-card p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-lg font-black">{row.unit}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {row.customerName}{row.plateNumber ? ` · ${row.plateNumber}` : ""} · {formatDate(row.createdAt)}
                  </div>
                </div>
                <div className="text-left md:text-right">
                  <Badge variant="outline" className="capitalize">{row.paymentMethod}</Badge>
                  <div className="mt-2 text-xl font-black text-primary">{formatCurrency(row.total)}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tires Bought</div>
                  <div className="mt-2 space-y-1 text-sm">
                    {row.tireItems.length ? row.tireItems.map((item, index) => (
                      <div key={`${row.id}-tire-${index}`} className="flex justify-between gap-3">
                        <span>{item.quantity}x {itemLabel(item)}</span>
                        <span className="text-muted-foreground">{item.tireSize} · {formatCurrency(item.unitPrice)}</span>
                      </div>
                    )) : <span className="text-muted-foreground">No tires bought</span>}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Services Availed</div>
                  <div className="mt-2 space-y-1 text-sm">
                    {row.serviceItems.length ? row.serviceItems.map((item, index) => (
                      <div key={`${row.id}-service-${index}`} className="flex justify-between gap-3">
                        <span>{item.quantity}x {item.productName}</span>
                        <span className="font-semibold">{formatCurrency(item.unitPrice)} / {formatCurrency(item.subtotal || 0)}</span>
                      </div>
                    )) : <span className="text-muted-foreground">No services availed</span>}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Totals</div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between"><span>Tires Sold</span><span className="font-semibold">{row.tiresSold}</span></div>
                    <div className="flex justify-between"><span>Discount</span><span>{formatCurrency(row.discount)}</span></div>
                    <div className="flex justify-between"><span>Cost</span><span>{formatCurrency(row.cost)}</span></div>
                    <div className="flex justify-between"><span>Profit</span><span className={row.profit < 0 ? "font-semibold text-destructive" : "font-semibold text-emerald-600"}>{formatCurrency(row.profit)}</span></div>
                    {row.otherItems.length > 0 && (
                      <div className="pt-2 text-xs text-muted-foreground">
                        Other: {row.otherItems.map((item) => `${item.quantity}x ${item.productName}`).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!isLoading && transactionRows.length === 0 && (
            <div className="rounded-md border p-8 text-center text-muted-foreground">
              {mode === "today" ? "No transactions found today." : "No transactions found for this date range."}
            </div>
          )}
        </CardContent>
      </Card>

      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .daily-print,
          .daily-print * {
            visibility: visible !important;
          }
          .daily-print {
            display: block !important;
            position: absolute;
            inset: 0;
            width: 100%;
          }
          @page {
            margin: 12mm;
          }
        }
      `}</style>
    </div>
  );
}
