import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useGetMe, useListProducts, getGetDashboardSummaryQueryKey, getListProductsQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDate, formatPriceDisplay, formatTireSize } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { autoCapitalizeValue, useAutoCapitalizationEnabled } from "@/lib/autocapitalize";
import { Clock, History, PenLine, Plus, Receipt, Save, Search, Trash2, UsersRound, X } from "lucide-react";
import type { Product } from "@workspace/api-client-react";

type ProductWithService = Product & {
  category?: string;
  serviceUnit?: "service" | "job" | "pieces" | "liters" | string | null;
};

type ProductMode = "tires" | "services" | "other";

type TicketItem = {
  productId: number;
  productName: string;
  brand: string;
  category: string;
  serviceUnit?: string | null;
  tireSize: string;
  quantity: number;
  quantityText?: string;
  unitPrice: number;
  unitPriceText?: string;
  subtotal: number;
};

type ServiceTicket = {
  id: string;
  status: "active" | "completed";
  customerName: string;
  customerContact: string;
  customerAddress: string;
  carMaker: string;
  carModel: string;
  plateNumber: string;
  odometer: string;
  paymentMethod: string;
  subtotal: number;
  discountTotal: number;
  totalAmount: number;
  items: TicketItem[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

type VehicleHistoryEntry = {
  id: string;
  date: string;
  customerName: string;
  carMaker: string;
  carModel: string;
  plateNumber: string;
  odometer?: string;
  odometerUnit?: string;
  changeOilDueKm?: number | null;
  mechanic?: string;
  status: string;
  receiptNumber?: string;
  invoiceNo?: string;
  totalAmount: number;
  notes?: string;
  services: Array<{ name: string; quantity: number; unitPrice: number }>;
  products: Array<{ name: string; size: string; quantity: number; unitPrice: number }>;
};

async function fetchServiceTickets(): Promise<ServiceTicket[]> {
  const response = await fetch("/api/service-tickets", { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load active clients");
  return response.json();
}

async function saveServiceTicket(ticket: ServiceTicket): Promise<ServiceTicket> {
  const response = await fetch(`/api/service-tickets/${encodeURIComponent(ticket.id)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ticket),
  });
  if (!response.ok) throw new Error((await response.json()).error || "Unable to save ticket");
  return response.json();
}

async function completeServiceTicket(ticket: ServiceTicket): Promise<{ invoice?: { invoiceNo?: string } }> {
  const response = await fetch(`/api/service-tickets/${encodeURIComponent(ticket.id)}/complete`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ticket),
  });
  if (!response.ok) throw new Error((await response.json()).error || "Unable to complete ticket");
  return response.json();
}

async function cancelServiceTicket(ticketId: string): Promise<void> {
  const response = await fetch(`/api/service-tickets/${encodeURIComponent(ticketId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error((await response.json()).error || "Unable to cancel ticket");
}

async function fetchVehicleHistory(plateNumber: string, customerName = ""): Promise<VehicleHistoryEntry[]> {
  const params = new URLSearchParams();
  if (plateNumber) params.set("plateNumber", plateNumber);
  if (customerName) params.set("customerName", customerName);
  const response = await fetch(`/api/vehicle-history?${params.toString()}`, { credentials: "include" });
  if (!response.ok) throw new Error((await response.json()).error || "Unable to load vehicle history");
  return response.json();
}

function itemLabel(item: TicketItem): string {
  return [item.brand, item.productName].filter(Boolean).join(" ") || item.productName || "Item";
}

function ticketUnitTitle(ticket: ServiceTicket): string {
  return [ticket.carMaker, ticket.carModel].filter(Boolean).join(" ") || ticket.plateNumber || "Unit not recorded";
}

function isServiceTicketItem(item: TicketItem): boolean {
  const category = String(item.category || "").toLowerCase();
  return category === "services" || /^service\b/i.test(String(item.tireSize || ""));
}

function ticketServices(ticket: ServiceTicket): TicketItem[] {
  return ticket.items.filter(isServiceTicketItem);
}

function ticketProducts(ticket: ServiceTicket): TicketItem[] {
  return ticket.items.filter((item) => !isServiceTicketItem(item));
}

function ticketList(items: TicketItem[], emptyLabel: string): string {
  if (items.length === 0) return emptyLabel;
  return items.map((item) => `${item.quantity || 1}x ${itemLabel(item)}`).join(", ");
}

function isServiceProduct(product: ProductWithService): boolean {
  return String(product.category || "").toLowerCase() === "services" || String(product.category || "").toLowerCase() === "service";
}

function isOtherProduct(product: ProductWithService): boolean {
  return String(product.category || "").toLowerCase() === "other";
}

function isVariablePriceProduct(product: ProductWithService | TicketItem): boolean {
  if (isServiceProduct(product as ProductWithService)) return false;
  if (isOtherProduct(product as ProductWithService)) return Number((product as ProductWithService).price || 0) <= 0;
  return false;
}

function productUnitLabel(product: ProductWithService): string {
  if (isOtherProduct(product)) {
    if (product.serviceUnit === "pieces") return "Other / Pieces";
    if (product.serviceUnit === "liters") return "Other / Liters";
    return "Other";
  }
  if (!isServiceProduct(product)) return formatTireSize(product.width, product.aspectRatio, product.rimSize);
  if (product.serviceUnit === "pieces") return "Service / Pieces";
  if (product.serviceUnit === "liters") return "Service / Liters";
  return "Service";
}

function productDisplayName(product: ProductWithService): string {
  if (isOtherProduct(product)) return product.name;
  if (isServiceProduct(product) && product.serviceUnit !== "liters") return product.name;
  return [product.brand, product.name].filter(Boolean).join(" ");
}

function matchesSearch(product: ProductWithService, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  const sizeOrUnit = productUnitLabel(product).toLowerCase();
  return (
    product.name.toLowerCase().includes(q) ||
    String(product.brand || "").toLowerCase().includes(q) ||
    String(product.category || "").toLowerCase().includes(q) ||
    String(product.serviceUnit || "").toLowerCase().includes(q) ||
    String(product.barcode || "").toLowerCase().includes(q) ||
    String(product.width).includes(q) ||
    String(product.aspectRatio).includes(q) ||
    String(product.rimSize).includes(q) ||
    sizeOrUnit.includes(q)
  );
}

function isPmsItem(item: TicketItem): boolean {
  return String(item.productName || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes("pms");
}

function normalizedServiceName(item: { name?: string; productName?: string }): string {
  return String(item.name || item.productName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSingleUseService(item: { name?: string; productName?: string }): boolean {
  const name = normalizedServiceName(item);
  return name.includes("pms") || name === "labor";
}

function ticketHasPmsService(ticket: ServiceTicket): boolean {
  return ticket.items.some(isPmsItem);
}

function parsePriceInput(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "free") return 0;
  const numericText = text.replace(/[^\d.-]/g, "");
  const amount = Number(numericText);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function parseQuantityInput(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const amount = Number(text);
  return Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
}

function parseOdometerKm(value: string): number | null {
  const amount = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? Math.floor(amount) : null;
}

function recalcTicket(ticket: ServiceTicket): ServiceTicket {
  const items = ticket.items.map((item) => {
    const quantity = parseQuantityInput(item.quantityText ?? item.quantity);
    const unitPrice = parsePriceInput(item.unitPriceText ?? item.unitPrice);
    return { ...item, quantity, unitPrice, subtotal: quantity * unitPrice };
  });
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const discountTotal = Math.min(subtotal, Math.max(0, Number(ticket.discountTotal || 0)));
  return { ...ticket, items, subtotal, discountTotal, totalAmount: Math.max(0, subtotal - discountTotal) };
}

export default function ActiveClients() {
  const [location, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { data: allProducts = [] } = useListProducts({});
  const isMechanic = user?.role === "mechanic";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const autoCapEnabled = useAutoCapitalizationEnabled();
  const [editing, setEditing] = useState<ServiceTicket | null>(null);
  const [addMode, setAddMode] = useState<ProductMode>("tires");
  const [addSearch, setAddSearch] = useState("");
  const [discountMode, setDiscountMode] = useState<"php" | "percent">("php");
  const [discountValue, setDiscountValue] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<VehicleHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const editingIdRef = useRef<string | null>(null);

  useEffect(() => {
    editingIdRef.current = editing?.id || null;
  }, [editing?.id]);

  const markInputFocus = () => setInputFocused(true);
  const markInputBlur = () => setInputFocused(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["service-tickets"],
    queryFn: fetchServiceTickets,
    refetchInterval: editing || inputFocused ? false : 5000,
  });

  const activeTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === "active"),
    [tickets],
  );

  const filteredProducts = useMemo(
    () => allProducts.filter((product) => {
      const candidate = product as ProductWithService;
      const serviceProduct = isServiceProduct(candidate);
      const otherProduct = isOtherProduct(candidate);
      const matchesCategory =
        addMode === "services" ? serviceProduct :
        addMode === "other" ? otherProduct :
        !serviceProduct && !otherProduct;
      return matchesCategory && matchesSearch(candidate, addSearch);
    }),
    [addMode, addSearch, allProducts],
  );

  useEffect(() => {
    if (editing || activeTickets.length === 0) return;
    const ticketId = new URLSearchParams(location.split("?")[1] || "").get("ticket");
    if (!ticketId) return;
    const ticket = activeTickets.find((item) => item.id === ticketId);
    if (ticket) setEditing(recalcTicket(ticket));
  }, [activeTickets, editing, location]);

  useEffect(() => {
    if (isMechanic && addMode === "tires") {
      setAddMode("services");
    }
  }, [addMode, isMechanic]);

  useEffect(() => {
    setDiscountMode("php");
    setDiscountValue(editing?.discountTotal ? String(editing.discountTotal) : "");
  }, [editing?.id]);

  const saveMutation = useMutation({
    mutationFn: saveServiceTicket,
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["service-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "active-clients"] });
      if (editingIdRef.current === ticket.id) {
        toast({ title: "Active client updated", description: `${ticket.customerName || ticket.id} was saved.` });
      }
    },
    onError: (error) => {
      toast({ title: "Ticket not saved", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (ticket: ServiceTicket) => completeServiceTicket(ticket),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["service-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "active-clients"] });
      queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      setEditing(null);
      toast({ title: "Ticket completed", description: "The active client was converted to a sale." });
      if (result.invoice?.invoiceNo) setLocation(`/invoices/${encodeURIComponent(result.invoice.invoiceNo)}`);
    },
    onError: (error) => {
      toast({ title: "Ticket not completed", description: error instanceof Error ? error.message : "Please check stock and prices.", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelServiceTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "active-clients"] });
      setEditing(null);
      toast({ title: "Ticket canceled", description: "The active client was removed from the live list." });
    },
    onError: (error) => {
      toast({ title: "Ticket not canceled", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    },
  });

  const updateEditing = (patch: Partial<ServiceTicket>) => {
    setEditing((current) => current ? recalcTicket({ ...current, ...patch }) : current);
  };
  const capText = (value: string) => autoCapitalizeValue(value, autoCapEnabled);

  const updateItem = (index: number, patch: Partial<TicketItem>) => {
    setEditing((current) => {
      if (!current) return current;
      const items = current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
      return recalcTicket({ ...current, items });
    });
  };

  const updateTicketDiscount = (mode: "php" | "percent", value: string) => {
    setDiscountMode(mode);
    setDiscountValue(value);
    setEditing((current) => {
      if (!current) return current;
      const subtotal = current.items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
      const rawValue = Math.max(0, Number(value || 0));
      const discountTotal = mode === "percent" ? subtotal * Math.min(rawValue, 100) / 100 : rawValue;
      return recalcTicket({ ...current, discountTotal });
    });
  };

  const openVehicleHistory = async () => {
    if (!editing) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      setHistoryRows(await fetchVehicleHistory(editing.plateNumber, editing.customerName));
    } catch (error) {
      toast({ title: "History not loaded", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setHistoryLoading(false);
    }
  };

  const removeItem = (index: number) => {
    if (!editing) return;
    const item = editing.items[index];
    if (!item) return;
    if (!window.confirm(`Remove ${itemLabel(item)} from this active ticket?`)) return;

    const items = editing.items.filter((_, itemIndex) => itemIndex !== index);
    if (items.length === 0) {
      if (!window.confirm("This is the last item. Cancel the whole active ticket instead?")) return;
      cancelMutation.mutate(editing.id);
      return;
    }

    const nextTicket = recalcTicket({ ...editing, items });
    setEditing(nextTicket);
    saveMutation.mutate(nextTicket);
  };

  const addProductToTicket = (product: ProductWithService) => {
    if (!editing) return;
    const variableProduct = isVariablePriceProduct(product);
    const existingIndex = editing.items.findIndex((item) => item.productId === product.id);
    const isTireProduct = !isServiceProduct(product) && !isOtherProduct(product);
    if (isTireProduct && product.stock <= 0) {
      toast({ title: "Out of stock", variant: "destructive" });
      return;
    }
    if (isSingleUseService(product) && editing.items.some((item) => normalizedServiceName(item) === normalizedServiceName(product))) {
      toast({ title: `${productDisplayName(product)} can only be availed once`, variant: "destructive" });
      return;
    }
    if (existingIndex >= 0 && isSingleUseService(product)) {
      toast({ title: `${productDisplayName(product)} can only be availed once`, variant: "destructive" });
      return;
    }

    const items = existingIndex >= 0
      ? editing.items.map((item, index) => {
          if (index !== existingIndex) return item;
          const nextQuantity = parseQuantityInput(item.quantityText ?? item.quantity) + 1;
          if (isTireProduct && nextQuantity > product.stock) {
            toast({ title: "Cannot add more than available stock", variant: "destructive" });
            return item;
          }
          return { ...item, quantity: nextQuantity, quantityText: String(nextQuantity) };
        })
      : [
          ...editing.items,
          {
            productId: product.id,
            productName: product.name,
            brand: product.brand || "",
            category: product.category || "tires",
            serviceUnit: product.serviceUnit || null,
            tireSize: productUnitLabel(product),
            quantity: 1,
            quantityText: "1",
            unitPrice: variableProduct ? 0 : Number(product.price || 0),
            unitPriceText: variableProduct ? "" : (Number(product.price || 0) > 0 ? String(product.price) : ""),
            subtotal: variableProduct ? 0 : Number(product.price || 0),
          },
        ];

    const nextTicket = recalcTicket({ ...editing, items });
    setEditing(nextTicket);
    setAddSearch("");
    toast({ title: "Item added", description: `${productDisplayName(product)} was added to the active ticket.` });
  };

  const validateTicketForSale = (ticket: ServiceTicket): boolean => {
    if (ticket.items.length === 0) {
      toast({ title: "Add at least one item before saving", variant: "destructive" });
      return false;
    }
    if (ticket.items.some((item) => parseQuantityInput(item.quantityText ?? item.quantity) < 1)) {
      toast({ title: "Quantity is required", description: "Each item must have at least 1 quantity.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (!editing) return;
    if (!validateTicketForSale(editing)) return;
    if (!editing.carMaker.trim() || !editing.carModel.trim() || !editing.plateNumber.trim()) {
      toast({ title: "Unit details are required", description: "Fill in car maker, model, and plate number.", variant: "destructive" });
      return;
    }
    if (ticketHasPmsService(editing) && !String(editing.odometer || "").trim()) {
      toast({ title: "Odometer is required", description: "Enter odometer for P.M.S. service.", variant: "destructive" });
      return;
    }
    saveMutation.mutate(recalcTicket({
      ...editing,
      customerName: capText(editing.customerName),
      carMaker: capText(editing.carMaker),
      carModel: capText(editing.carModel),
    }));
  };

  const handleComplete = (ticket: ServiceTicket) => {
    const recalculated = recalcTicket(ticket);
    if (!validateTicketForSale(recalculated)) return;
    if (!recalculated.carMaker.trim() || !recalculated.carModel.trim() || !recalculated.plateNumber.trim()) {
      setEditing(recalculated);
      toast({ title: "Complete unit details first", variant: "destructive" });
      return;
    }
    if (ticketHasPmsService(recalculated) && !String(recalculated.odometer || "").trim()) {
      setEditing(recalculated);
      toast({ title: "Odometer is required", description: "Enter odometer for P.M.S. service.", variant: "destructive" });
      return;
    }
    completeMutation.mutate(recalcTicket({
      ...recalculated,
      customerName: capText(recalculated.customerName),
      carMaker: capText(recalculated.carMaker),
      carModel: capText(recalculated.carModel),
    }));
  };

  const handleCancel = (ticket: ServiceTicket) => {
    if (!window.confirm(`Cancel ${ticket.id}?`)) return;
    cancelMutation.mutate(ticket.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Live Active Clients</h2>
        <p className="mt-1 text-muted-foreground">Open service tickets, edit job details, and finish active orders.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-primary" />
            Ongoing Clients
            <Badge variant="secondary">{activeTickets.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading active clients...</div>
          ) : activeTickets.length === 0 ? (
            <div className="rounded-md border p-8 text-center text-muted-foreground">No ongoing active clients.</div>
          ) : (
            <div className="grid gap-4">
              {activeTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex flex-col gap-4 rounded-md border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm"
                  onClick={() => setEditing(recalcTicket(ticket))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setEditing(recalcTicket(ticket));
                  }}
                  data-testid={`active-ticket-${ticket.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-bold">{ticketUnitTitle(ticket)}</span>
                      <Badge>Active</Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{ticket.plateNumber || "Plate not recorded"}</div>
                    <div className="text-xs font-mono text-muted-foreground">{ticket.id}</div>
                  </div>
                  <div className="grid gap-3 text-sm md:grid-cols-[160px_1fr_1fr]">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Timestamp</div>
                      <div className="flex items-center gap-1 font-medium"><Clock className="h-3.5 w-3.5" />{formatDate(ticket.createdAt)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Services Availed</div>
                      <div className="font-medium">{ticketList(ticketServices(ticket), "No services availed")}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Products Availed</div>
                      <div className="font-medium">{ticketList(ticketProducts(ticket), "No products availed")}</div>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Order</div>
                      <div className="font-medium">{ticket.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} item(s)</div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); setEditing(recalcTicket(ticket)); }}>
                      <PenLine className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary" />
                  {editing.id}
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[72vh] pr-4">
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold">Customer Name</p>
                      <Input value={editing.customerName} onFocus={markInputFocus} onBlur={() => { markInputBlur(); updateEditing({ customerName: capText(editing.customerName) }); }} onChange={(event) => updateEditing({ customerName: event.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold">Car Maker <span className="text-destructive">*</span></p>
                      <Input value={editing.carMaker} onFocus={markInputFocus} onBlur={() => { markInputBlur(); updateEditing({ carMaker: capText(editing.carMaker) }); }} onChange={(event) => updateEditing({ carMaker: event.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold">Car Model <span className="text-destructive">*</span></p>
                      <Input value={editing.carModel} onFocus={markInputFocus} onBlur={() => { markInputBlur(); updateEditing({ carModel: capText(editing.carModel) }); }} onChange={(event) => updateEditing({ carModel: event.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold">Plate Number <span className="text-destructive">*</span></p>
                      <Input value={editing.plateNumber} onFocus={markInputFocus} onBlur={markInputBlur} onChange={(event) => updateEditing({ plateNumber: event.target.value.toUpperCase() })} />
                    </div>
                    {ticketHasPmsService(editing) && (
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold">Odometer <span className="text-destructive">*</span></p>
                        <div className="relative">
                          <Input value={editing.odometer || ""} onFocus={markInputFocus} onBlur={markInputBlur} onChange={(event) => updateEditing({ odometer: event.target.value })} className="pr-12" placeholder="Current odometer" />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">km</span>
                        </div>
                        {parseOdometerKm(editing.odometer || "") !== null && (
                          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                            Change oil due: <span className="font-bold">{(parseOdometerKm(editing.odometer || "")! + 8000).toLocaleString()} km</span>
                          </div>
                        )}
                      </div>
                    )}
                    {!isMechanic && (
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold">Payment Method</p>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={editing.paymentMethod || "cash"}
                          onChange={(event) => updateEditing({ paymentMethod: event.target.value })}
                        >
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="gcash">GCash</option>
                          <option value="maya">Maya</option>
                          <option value="financing">Financing</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border">
                    <div className="relative flex flex-col gap-2 border-b bg-muted/20 p-3 md:flex-row md:items-center">
                      <div className="text-sm font-semibold text-muted-foreground md:w-36">Add product</div>
                      <select
                        className="h-9 rounded-md border bg-background px-3 text-sm md:w-32"
                        value={addMode}
                        onChange={(event) => {
                          setAddMode(event.target.value as ProductMode);
                          setAddSearch("");
                        }}
                      >
                        {!isMechanic && <option value="tires">Tires</option>}
                        <option value="services">Services</option>
                        <option value="other">Other</option>
                      </select>
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={addSearch}
                          onFocus={markInputFocus}
                          onBlur={markInputBlur}
                          onChange={(event) => setAddSearch(event.target.value)}
                          className="pl-9"
                          placeholder={`Optional: search ${addMode} to add`}
                        />
                        {addSearch.trim() && (
                          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border bg-background shadow-lg">
                            {filteredProducts.length === 0 ? (
                              <div className="p-3 text-sm text-muted-foreground">No matching items.</div>
                            ) : filteredProducts.slice(0, 10).map((product) => {
                              const candidate = product as ProductWithService;
                              const variableProduct = isVariablePriceProduct(candidate);
                              const disabled = !variableProduct && candidate.stock <= 0;
                              return (
                                <button
                                  key={candidate.id}
                                  type="button"
                                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                  onClick={() => addProductToTicket(candidate)}
                                  disabled={disabled}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate font-semibold">{productDisplayName(candidate)}</span>
                                    <span className="block truncate text-xs font-mono text-muted-foreground">{productUnitLabel(candidate)}</span>
                                  </span>
                                  <span className="flex shrink-0 items-center gap-2">
                                    <span className={disabled ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                                      {variableProduct ? productUnitLabel(candidate) : `${candidate.stock} stock`}
                                    </span>
                                    <Plus className="h-4 w-4" />
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer Order</TableHead>
                          <TableHead className="w-24">Qty</TableHead>
                          <TableHead className="w-36">Price</TableHead>
                          <TableHead className="w-36 text-right">Subtotal</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editing.items.map((item, index) => (
                          <TableRow key={`${item.productId}-${index}`}>
                            <TableCell>
                              <div className="font-semibold">{itemLabel(item)}</div>
                              <div className="text-xs font-mono text-muted-foreground">{item.tireSize}</div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="1"
                                onFocus={markInputFocus}
                                onBlur={markInputBlur}
                                value={item.quantityText ?? (item.quantity ? String(item.quantity) : "")}
                                onChange={(event) => updateItem(index, { quantityText: event.target.value, quantity: parseQuantityInput(event.target.value) })}
                              />
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const itemProduct = allProducts.find((product) => product.id === item.productId) as ProductWithService | undefined;
                                const needsPriceInput = itemProduct ? isVariablePriceProduct(itemProduct) : false;
                                if (needsPriceInput) {
                                  return (
                                    <Input
                                      type="text"
                                      onFocus={markInputFocus}
                                      onBlur={markInputBlur}
                                      value={item.unitPriceText ?? (item.unitPrice ? String(item.unitPrice) : "")}
                                      onChange={(event) => updateItem(index, { unitPrice: parsePriceInput(event.target.value), unitPriceText: event.target.value })}
                                      placeholder="Free"
                                    />
                                  );
                                }
                                return (
                                  <span className="text-sm font-semibold">
                                    {formatPriceDisplay(item.unitPrice)}
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(item.subtotal)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => removeItem(index)}
                                aria-label={`Remove ${itemLabel(item)}`}
                                title="Remove item"
                                disabled={saveMutation.isPending || cancelMutation.isPending}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-3">
                      <div className="grid gap-2 rounded-md border bg-muted/20 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold">Ticket Discount</div>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            onFocus={markInputFocus}
                            onBlur={markInputBlur}
                            value={discountValue}
                            onChange={(event) => updateTicketDiscount(discountMode, event.target.value)}
                            placeholder={discountMode === "percent" ? "Discount percent" : "Discount amount"}
                            data-testid="input-active-ticket-discount"
                          />
                        </div>
                        <div className="flex overflow-hidden rounded-md border">
                          <Button type="button" size="sm" variant={discountMode === "php" ? "default" : "ghost"} className="rounded-none" onClick={() => updateTicketDiscount("php", discountValue)}>PHP</Button>
                          <Button type="button" size="sm" variant={discountMode === "percent" ? "default" : "ghost"} className="rounded-none" onClick={() => updateTicketDiscount("percent", discountValue)}>%</Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm text-muted-foreground">Subtotal {formatCurrency(editing.subtotal)}{editing.discountTotal > 0 ? ` - Discount ${formatCurrency(editing.discountTotal)}` : ""}</div>
                        <div className="text-3xl font-black text-primary">{formatCurrency(editing.totalAmount)}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={openVehicleHistory} disabled={!editing.plateNumber.trim() || historyLoading}>
                        <History className="mr-2 h-4 w-4" />
                        Service History
                      </Button>
                      <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleCancel(editing)} disabled={cancelMutation.isPending}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {cancelMutation.isPending ? "Canceling..." : "Cancel Ticket"}
                      </Button>
                      <Button variant="outline" onClick={handleSave} disabled={saveMutation.isPending}>
                        <Save className="mr-2 h-4 w-4" />
                        {saveMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                      {!isMechanic && (
                        <Button onClick={() => handleComplete(editing)} disabled={completeMutation.isPending}>
                          {completeMutation.isPending ? "Completing..." : "Complete Sale"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Vehicle Service History</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[68vh] pr-4">
            {historyLoading ? (
              <div className="text-sm text-muted-foreground">Loading service history...</div>
            ) : historyRows.length === 0 ? (
              <div className="rounded-md border p-6 text-center text-muted-foreground">No previous history found for this vehicle.</div>
            ) : (
              <div className="space-y-3">
                {historyRows.map((entry) => (
                  <div key={entry.id} className="rounded-md border p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="font-bold">{[entry.carMaker, entry.carModel].filter(Boolean).join(" ") || "Vehicle"}</div>
                        <div className="text-sm text-muted-foreground">{entry.plateNumber} · {formatDate(entry.date)}</div>
                        {entry.odometer && <div className="text-sm">Odometer: {entry.odometer} {entry.odometerUnit || ""}</div>}
                        {entry.changeOilDueKm && <div className="text-sm">Change oil due: {Number(entry.changeOilDueKm).toLocaleString()} km</div>}
                      </div>
                      <div className="text-left md:text-right">
                        <Badge variant="outline">{entry.status}</Badge>
                        <div className="mt-1 font-bold">{formatCurrency(entry.totalAmount)}</div>
                        <div className="text-xs text-muted-foreground">{entry.invoiceNo || entry.receiptNumber}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-md bg-muted/30 p-3">
                        <div className="text-xs font-semibold uppercase text-muted-foreground">Services</div>
                        <div className="mt-1 text-sm">{entry.services.length ? entry.services.map((item) => `${item.quantity}x ${item.name}`).join(", ") : "No services"}</div>
                      </div>
                      <div className="rounded-md bg-muted/30 p-3">
                        <div className="text-xs font-semibold uppercase text-muted-foreground">Products</div>
                        <div className="mt-1 text-sm">{entry.products.length ? entry.products.map((item) => `${item.quantity}x ${item.name}${item.size ? ` (${item.size})` : ""}`).join(", ") : "No products"}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
