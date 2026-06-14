import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetSale, getGetSaleQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDateTimeFormal } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function itemUnitLabel(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw || /^service\b/i.test(raw) || /^other\b/i.test(raw)) return "";
  return raw.replace(/^Service\s*\/\s*Job$/i, "");
}

function itemName(item: { brand?: string | null; productName?: string | null }): string {
  return [item.brand, item.productName].filter(Boolean).join(" ");
}

function hasPmsService(items: Array<{ productName?: string | null }>): boolean {
  return items.some((item) => String(item.productName || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes("pms"));
}

function parseKm(value: unknown): number {
  const amount = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) ? Math.floor(amount) : 0;
}

export default function ReceiptView() {
  const [, params] = useRoute("/receipts/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;

  const { data: sale, isLoading } = useGetSale(id, { query: { enabled: !!id, queryKey: getGetSaleQueryKey(id) } });
  const [invoiceNo, setInvoiceNo] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [settings, setSettings] = useState<{ storeName?: string; companyLogoUrl?: string; storeAddress?: string; storePhone?: string }>({});

  useEffect(() => {
    let isMounted = true;
    fetch("/api/settings", { credentials: "include" })
      .then((response) => response.ok ? response.json() : {})
      .then((data) => {
        if (isMounted) setSettings(data || {});
      })
      .catch(() => undefined);
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!sale) return;
    let isMounted = true;
    fetch("/api/invoices", { credentials: "include" })
      .then((response) => response.ok ? response.json() : [])
      .then((invoices) => {
        if (!isMounted || !Array.isArray(invoices)) return;
        const invoice = invoices.find((item) => item.saleId === sale.id || item.originalSaleId === sale.id);
        setInvoiceNo(invoice?.invoiceNo || null);
      })
      .catch(() => undefined);
    return () => { isMounted = false; };
  }, [sale]);

  const openSalesInvoice = async () => {
    if (!sale) return;
    if (invoiceNo) {
      setLocation(`/invoices/${encodeURIComponent(invoiceNo)}`);
      return;
    }
    setInvoiceLoading(true);
    try {
      const response = await fetch(`/api/invoices/from-sale/${sale.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: "Walk-in Customer", amountPaid: sale.totalAmount }),
      });
      const invoice = await response.json();
      if (!response.ok) throw new Error(invoice.error || "Unable to create Sales Invoice");
      setInvoiceNo(invoice.invoiceNo);
      setLocation(`/invoices/${encodeURIComponent(invoice.invoiceNo)}`);
    } finally {
      setInvoiceLoading(false);
    }
  };

  useEffect(() => {
    if (!sale) return;
    const shouldPrint = new URLSearchParams(window.location.search).get("print") === "1";
    if (!shouldPrint) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [sale]);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading receipt...</div>;
  }

  if (!sale) {
    return <div className="p-8 text-center text-destructive font-medium">Receipt not found.</div>;
  }

  const saleWithDetails = sale as typeof sale & {
    customerName?: string;
    carMaker?: string;
    carModel?: string;
    plateNumber?: string;
    odometer?: string;
    odometerUnit?: string;
    changeOilDueKm?: number | null;
  };
  const showPmsDue = hasPmsService(sale.items || []) && saleWithDetails.odometer;
  const storeName = settings.storeName || "Wheel Got It Tires & Services";
  const customerName = String(saleWithDetails.customerName || "").trim() || "Walk-in Customer";
  const vehicleTitle = [saleWithDetails.carMaker, saleWithDetails.carModel].filter(Boolean).join(" ");
  const plateNumber = String(saleWithDetails.plateNumber || "").trim();

  return (
    <div className="space-y-6 max-w-3xl mx-auto receipt-page">
      <style>{`
        .receipt-document {
          font-family: Georgia, "Times New Roman", serif;
          color: #111;
          background: #fff;
        }
        .receipt-document .receipt-title {
          letter-spacing: 0.18em;
        }
        .receipt-document .receipt-meta-label {
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #555;
        }
        .receipt-document .receipt-table {
          width: 100%;
          border-collapse: collapse;
        }
        .receipt-document .receipt-table th,
        .receipt-document .receipt-table td {
          border: 1px solid #222;
          padding: 8px 10px;
          vertical-align: top;
        }
        .receipt-document .receipt-table th {
          background: #f4f4f4;
          font-size: 12px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .receipt-document .receipt-table td.num {
          text-align: right;
          white-space: nowrap;
        }
        .receipt-document .receipt-table td.qty {
          text-align: center;
          width: 72px;
        }
        .receipt-document .item-name {
          font-weight: 700;
        }
        .receipt-document .item-meta {
          font-size: 12px;
          color: #555;
          margin-top: 2px;
        }
        @media print {
          .receipt-toolbar, aside, header { display: none !important; }
          main { padding: 0 !important; background: white !important; }
          .receipt-page { max-width: none !important; margin: 0 !important; }
          .receipt-document {
            box-shadow: none !important;
            border: 0 !important;
          }
        }
      `}</style>

      <div className="receipt-toolbar flex justify-between items-center print:hidden">
        <Button variant="ghost" onClick={() => setLocation("/receipts")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to History
        </Button>
        <div className="flex gap-2">
          <Button onClick={openSalesInvoice} variant="outline" disabled={invoiceLoading}>
            <FileText className="mr-2 h-4 w-4" /> {invoiceNo ? "View Sales Invoice" : "Create Sales Invoice"}
          </Button>
          <Button onClick={() => window.print()} variant="outline">
            <Printer className="mr-2 h-4 w-4" /> Print Receipt
          </Button>
        </div>
      </div>

      <article className="receipt-document border-2 border-black/80 shadow-lg print:shadow-none">
        <header className="border-b-2 border-black px-8 py-6 text-center">
          <img
            src={settings.companyLogoUrl || "/wheel-got-it-logo.png"}
            alt={storeName}
            className="mx-auto mb-4 max-h-24 max-w-[320px] object-contain"
            data-testid="img-receipt-company-logo"
          />
          <div className="text-sm uppercase tracking-[0.2em] text-gray-600">{storeName}</div>
          {settings.storeAddress && <div className="mt-1 text-sm text-gray-600">{settings.storeAddress}</div>}
          {settings.storePhone && <div className="mt-1 text-sm text-gray-600">{settings.storePhone}</div>}
          <h1 className="receipt-title mt-5 text-xl font-black uppercase">Sales Receipt</h1>
          <div className="mt-3 font-mono text-sm">Receipt No. {sale.receiptNumber}</div>
        </header>

        <section className="grid gap-4 border-b border-black/20 px-8 py-6 md:grid-cols-2">
          <div>
            <div className="receipt-meta-label">Date & Time</div>
            <div className="mt-1 font-medium">{formatDateTimeFormal(sale.createdAt)}</div>
          </div>
          <div className="md:text-right">
            <div className="receipt-meta-label">Payment Method</div>
            <div className="mt-1">
              <Badge variant="outline" className="capitalize px-3 py-1 text-sm">{sale.paymentMethod}</Badge>
            </div>
          </div>
          <div>
            <div className="receipt-meta-label">Customer</div>
            <div className="mt-1 font-semibold">{customerName}</div>
          </div>
          <div className="md:text-right">
            <div className="receipt-meta-label">Vehicle / Unit</div>
            <div className="mt-1 font-semibold">{vehicleTitle || "Not recorded"}</div>
            {plateNumber && <div className="mt-1 font-mono text-sm">Plate: {plateNumber}</div>}
          </div>
          {showPmsDue && (
            <div className="md:col-span-2 grid gap-4 rounded border border-black/15 bg-gray-50 p-4 md:grid-cols-2">
              <div>
                <div className="receipt-meta-label">Current Odometer</div>
                <div className="mt-1 font-bold">{parseKm(saleWithDetails.odometer).toLocaleString()} km</div>
              </div>
              <div>
                <div className="receipt-meta-label">Change Oil Due</div>
                <div className="mt-1 font-bold">{parseKm(saleWithDetails.changeOilDueKm || parseKm(saleWithDetails.odometer) + 8000).toLocaleString()} km</div>
              </div>
            </div>
          )}
        </section>

        <section className="px-8 py-6">
          <table className="receipt-table">
            <thead>
              <tr>
                <th>Description</th>
                <th className="qty">Qty</th>
                <th className="num">Unit Price</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <div className="item-name">{itemName(item)}</div>
                    {itemUnitLabel(item.tireSize) ? <div className="item-meta">{itemUnitLabel(item.tireSize)}</div> : null}
                  </td>
                  <td className="qty">{item.quantity}</td>
                  <td className="num">{formatCurrency(item.unitPrice)}</td>
                  <td className="num font-semibold">{formatCurrency(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="border-t-2 border-black px-8 py-6">
          <div className="ml-auto w-full max-w-sm space-y-3">
            <div className="flex items-center justify-between text-base">
              <span className="font-semibold uppercase tracking-wide text-gray-600">Amount Due</span>
              <span className="text-3xl font-black">{formatCurrency(sale.totalAmount)}</span>
            </div>
          </div>
          <div className="mt-10 border-t border-black/15 pt-4 text-center text-sm text-gray-600">
            <p className="font-semibold uppercase tracking-wide">Thank you for your business.</p>
            <p className="mt-2">This document serves as your official proof of purchase.</p>
            <p className="mt-1">Please keep this receipt for warranty and service reference.</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
