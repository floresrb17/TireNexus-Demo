import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useListProducts, useCreateSale, useGetMe, getGetDashboardSummaryQueryKey, getListProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatPriceDisplay, formatTireSize } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, Minus, X, CreditCard, Banknote, Smartphone, AlertCircle, Landmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { autoCapitalizeValue, useAutoCapitalizationEnabled } from "@/lib/autocapitalize";
import type { Product } from "@workspace/api-client-react";

type ProductWithService = Product & {
  category?: string;
  serviceUnit?: "service" | "job" | "pieces" | "liters" | string | null;
  sortOrder?: number | null;
};

type CartItem = ProductWithService & { qty: number; salePrice?: number; salePriceText?: string };
type ProductMode = "tires" | "services" | "other";
type SaleDraft = {
  cart: CartItem[];
  paymentMethod: string;
  discountMode: "php" | "percent";
  discountValue: string;
  customerName: string;
  customerContact: string;
  customerAddress: string;
  carMaker: string;
  carModel: string;
  plateNumber: string;
  odometer: string;
  productMode: ProductMode;
};

const SALE_DRAFT_KEY = "wgi-pos-new-sale-draft";

function isServiceProduct(product: ProductWithService): boolean {
  return String(product.category || "").toLowerCase() === "services" || String(product.category || "").toLowerCase() === "service";
}

function isOtherProduct(product: ProductWithService): boolean {
  return String(product.category || "").toLowerCase() === "other";
}

function isVariablePriceProduct(product: ProductWithService): boolean {
  if (isServiceProduct(product)) return false;
  if (isOtherProduct(product)) return Number(product.price || 0) <= 0;
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

function TireProductTitle({ product }: { product: Product }) {
  return (
    <div className="grid w-full grid-cols-[minmax(0,1.15fr)_auto_minmax(0,0.85fr)] items-center gap-3">
      <span className="truncate text-lg font-black uppercase tracking-wide text-primary">{product.brand}</span>
      <Badge variant="secondary" className="shrink-0 px-2.5 py-1 text-base font-bold font-mono">
        {formatTireSize(product.width, product.aspectRatio, product.rimSize)}
      </Badge>
      <span className="truncate text-right text-sm font-medium text-muted-foreground">{product.name}</span>
    </div>
  );
}

function productDisplayName(product: ProductWithService): string {
  if (isOtherProduct(product)) return product.name;
  if (isServiceProduct(product) && product.serviceUnit !== "liters") return product.name;
  return [product.brand, product.name].filter(Boolean).join(" ");
}

function serviceTileUnitLabel(product: ProductWithService): string {
  if (!isServiceProduct(product)) return productUnitLabel(product);
  if (product.serviceUnit === "pieces") return "Pieces";
  if (product.serviceUnit === "liters") return "Liters";
  return "";
}

function isPmsItem(item: { name?: string; productName?: string }): boolean {
  return String(item.name || item.productName || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes("pms");
}

function normalizedServiceName(item: { name?: string; productName?: string }): string {
  return String(item.name || item.productName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSingleUseService(item: { name?: string; productName?: string }): boolean {
  const name = normalizedServiceName(item);
  return name.includes("pms") || name === "labor";
}

function parseOdometerKm(value: string): number | null {
  const amount = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? Math.floor(amount) : null;
}

function calculateCardPrice(discountedPrice: number): number {
  const regularPrice = Number(discountedPrice || 0) * 1.035;
  return Math.round(regularPrice / 50) * 50;
}

function parsePriceInput(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "free") return 0;
  const numericText = text.replace(/[^\d.-]/g, "");
  const amount = Number(numericText);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function lineUnitPrice(item: CartItem | ProductWithService, paymentMethod: string): number {
  if (isVariablePriceProduct(item)) return parsePriceInput("salePriceText" in item ? item.salePriceText ?? item.salePrice : "salePrice" in item ? item.salePrice : 0);
  if (isServiceProduct(item) || isOtherProduct(item)) return Number(item.price || 0);
  return paymentMethod === "card" ? calculateCardPrice(item.price) : item.price;
}

function matchesSearch(p: Product, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  const product = p as ProductWithService;
  const sizeOrUnit = productUnitLabel(product).toLowerCase();
  return (
    p.name.toLowerCase().includes(q) ||
    String(p.brand || "").toLowerCase().includes(q) ||
    String(product.category || "").toLowerCase().includes(q) ||
    String(product.serviceUnit || "").toLowerCase().includes(q) ||
    (p.barcode ?? "").toLowerCase().includes(q) ||
    String(p.width).includes(q) ||
    String(p.aspectRatio).includes(q) ||
    String(p.rimSize).includes(q) ||
    sizeOrUnit.includes(q)
  );
}

export default function Checkout() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe();
  const isMechanic = user?.role === "mechanic";
  const autoCapEnabled = useAutoCapitalizationEnabled();

  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [productMode, setProductMode] = useState<ProductMode>("tires");
  const [isCreateServiceOpen, setIsCreateServiceOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceUnit, setNewServiceUnit] = useState<"service" | "pieces" | "liters">("service");
  const [newServiceBrand, setNewServiceBrand] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("");
  const [isCreatingService, setIsCreatingService] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load ALL products once ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â filtering happens client-side so numbers match
  const { data: allProducts = [] } = useListProducts({});
  const createSale = useCreateSale();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [discountMode, setDiscountMode] = useState<"php" | "percent">("php");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [carMaker, setCarMaker] = useState("");
  const [carModel, setCarModel] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [odometer, setOdometer] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const freshSaleLocationRef = useRef<string | null>(null);

  const filteredProducts = useMemo(
    () => allProducts.filter((p) => {
      const serviceProduct = isServiceProduct(p as ProductWithService);
      const otherProduct = isOtherProduct(p as ProductWithService);
      const matchesCategory =
        productMode === "services" ? serviceProduct :
        productMode === "other" ? otherProduct :
        !serviceProduct && !otherProduct;
      return matchesCategory && matchesSearch(p, search);
    }).sort((left, right) => {
      if (productMode === "tires") {
        return String(left.brand || "").localeCompare(String(right.brand || "")) ||
          String(left.name || "").localeCompare(String(right.name || "")) ||
          Number(left.width || 0) - Number(right.width || 0) ||
          Number(left.rimSize || 0) - Number(right.rimSize || 0);
      }
      return String(left.name || "").localeCompare(String(right.name || ""));
    }),
    [allProducts, productMode, search]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isMechanic) {
      setPaymentMethod("cash");
      setDiscountMode("php");
      setDiscountValue("");
      setProductMode((current) => current === "tires" ? "services" : current);
    }
  }, [isMechanic]);

  useEffect(() => {
    if (draftReady) return;
    const isFreshSale = new URLSearchParams(location.split("?")[1] || "").get("new") === "1";
    if (isFreshSale) {
      localStorage.removeItem(SALE_DRAFT_KEY);
      setCart([]);
      setProductMode(isMechanic ? "services" : "tires");
      freshSaleLocationRef.current = location;
      setDraftReady(true);
      setLocation("/checkout", { replace: true });
      return;
    }
    try {
      const saved = localStorage.getItem(SALE_DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved) as Partial<SaleDraft>;
        setCart(Array.isArray(draft.cart) ? draft.cart : []);
        setPaymentMethod(draft.paymentMethod || "cash");
        setDiscountMode(draft.discountMode === "percent" ? "percent" : "php");
        setDiscountValue(String(draft.discountValue || ""));
        setCustomerName(String(draft.customerName || ""));
        setCustomerContact(String(draft.customerContact || ""));
        setCustomerAddress(String(draft.customerAddress || ""));
        setCarMaker(String(draft.carMaker || ""));
        setCarModel(String(draft.carModel || ""));
        setPlateNumber(String(draft.plateNumber || ""));
        setOdometer(String(draft.odometer || ""));
        setProductMode(draft.productMode === "services" || draft.productMode === "other" || (!isMechanic && draft.productMode === "tires") ? draft.productMode : "services");
      }
    } catch {
      localStorage.removeItem(SALE_DRAFT_KEY);
    } finally {
      setDraftReady(true);
    }
  }, [draftReady, isMechanic, location]);

  useEffect(() => {
    if (!draftReady) return;
    const draft: SaleDraft = {
      cart,
      paymentMethod,
      discountMode,
      discountValue,
      customerName,
      customerContact,
      customerAddress,
      carMaker,
      carModel,
      plateNumber,
      odometer,
      productMode,
    };
    localStorage.setItem(SALE_DRAFT_KEY, JSON.stringify(draft));
  }, [cart, paymentMethod, discountMode, discountValue, customerName, customerContact, customerAddress, carMaker, carModel, plateNumber, odometer, productMode, draftReady]);

  const addToCart = (product: Product) => {
    const isTireProduct = !isServiceProduct(product as ProductWithService) && !isOtherProduct(product as ProductWithService);
    if (isTireProduct && product.stock <= 0) {
      toast({ title: "Out of stock", variant: "destructive" });
      return;
    }
    setCart(prev => {
      if (isSingleUseService(product) && prev.some((item) => normalizedServiceName(item) === normalizedServiceName(product))) {
        toast({ title: `${productDisplayName(product as ProductWithService)} can only be availed once`, variant: "destructive" });
        return prev;
      }
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        if (isSingleUseService(existing)) {
          toast({ title: `${productDisplayName(existing)} can only be availed once`, variant: "destructive" });
          return prev;
        }
        if (isOtherProduct(existing) && existing.serviceUnit !== "pieces" && existing.serviceUnit !== "liters") return prev;
        if (isTireProduct && existing.qty >= product.stock) {
          toast({ title: "Cannot add more than available stock", variant: "destructive" });
          return prev;
        }
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      const inventoryPrice = Number(product.price || 0);
      const defaultPrice = isServiceProduct(product as ProductWithService)
        ? inventoryPrice
        : isVariablePriceProduct(product as ProductWithService) && inventoryPrice > 0
          ? inventoryPrice
          : undefined;
      const defaultPriceText = isServiceProduct(product as ProductWithService)
        ? (inventoryPrice > 0 ? String(inventoryPrice) : "")
        : defaultPrice
          ? String(defaultPrice)
          : "";
      return [...prev, { ...(product as ProductWithService), qty: 1, salePrice: defaultPrice ?? 0, salePriceText: defaultPriceText }];
    });
  };

  const clearSaleDraft = () => {
    setCart([]);
    setPaymentMethod("cash");
    setDiscountMode("php");
    setDiscountValue("");
    setCustomerName("");
    setCustomerContact("");
    setCustomerAddress("");
    setCarMaker("");
    setCarModel("");
    setPlateNumber("");
    setOdometer("");
    setSearch("");
    setShowSuggestions(false);
    localStorage.removeItem(SALE_DRAFT_KEY);
  };

  const addCreatedServiceToCart = (product: ProductWithService, salePriceText: string) => {
    setCart(prev => [...prev, { ...product, qty: 1, salePrice: parsePriceInput(salePriceText), salePriceText }]);
  };

  const resetCreateServiceForm = () => {
    setNewServiceName("");
    setNewServiceUnit("service");
    setNewServiceBrand("");
    setNewServicePrice("");
  };

  const createCustomService = async () => {
    const name = newServiceName.trim();
    const salePriceText = newServicePrice.trim();
    const salePrice = parsePriceInput(salePriceText);
    const brand = newServiceUnit === "liters" ? newServiceBrand.trim() : "";
    const isOtherMode = productMode === "other";

    if (!name) {
      toast({ title: `${isOtherMode ? "Other item" : "Service"} name is required`, variant: "destructive" });
      return;
    }
    if (newServiceUnit === "liters" && !brand) {
      toast({ title: "Brand is required for liters", variant: "destructive" });
      return;
    }
    const duplicate = allProducts.find((product) => {
      const candidate = product as ProductWithService;
      const sameCategory = isOtherMode ? isOtherProduct(candidate) : isServiceProduct(candidate);
      const sameUnit = String(candidate.serviceUnit || "service").toLowerCase() === newServiceUnit;
      const sameName = candidate.name.trim().toLowerCase() === name.toLowerCase();
      const sameBrand = newServiceUnit !== "liters" || String(candidate.brand || "").trim().toLowerCase() === brand.toLowerCase();
      return sameCategory && sameUnit && sameName && sameBrand;
    });
    if (duplicate) {
      addCreatedServiceToCart(duplicate as ProductWithService, salePriceText || "Free");
      setIsCreateServiceOpen(false);
      resetCreateServiceForm();
      toast({ title: "Already exists", description: `${name} was already in the list and was added to the order.` });
      return;
    }
    setIsCreatingService(true);
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: isOtherMode ? "other" : "services",
          serviceUnit: newServiceUnit,
          name,
          brand,
          width: 0,
          aspectRatio: 0,
          rimSize: 0,
          netPrice: 0,
          price: parsePriceInput(salePriceText),
          stock: 0,
          barcode: "",
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 409 && body.existingProduct) {
          const existing = body.existingProduct as ProductWithService;
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          addCreatedServiceToCart(existing, salePriceText || "Free");
          setIsCreateServiceOpen(false);
          resetCreateServiceForm();
          toast({ title: "Already exists", description: `${name} was already in the list and was added to the order.` });
          return;
        }
        throw new Error(body.error || "Unable to create service");
      }

      const created = await response.json() as ProductWithService;
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      setProductMode(isOtherMode ? "other" : "services");
      addCreatedServiceToCart(created, salePriceText || "Free");
      setIsCreateServiceOpen(false);
      resetCreateServiceForm();
      toast({ title: `${isOtherMode ? "Other item" : "Service"} created`, description: `${name} was saved and added to the order.` });
    } catch (error) {
      toast({
        title: `${isOtherMode ? "Other item" : "Service"} not created`,
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingService(false);
    }
  };

  const selectSuggestion = (product: Product) => {
    addToCart(product);
    setSearch("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const updateQty = (id: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        if (isOtherProduct(item) && item.serviceUnit !== "pieces" && item.serviceUnit !== "liters") return { ...item, qty: 1 };
        const newQty = item.qty + delta;
        if (!isVariablePriceProduct(item) && newQty > item.stock) {
          toast({ title: "Not enough stock", variant: "destructive" });
          return item;
        }
        return { ...item, qty: newQty };
      }
      return item;
    }).filter(i => i.qty > 0));
  };

  const remove = (id: number) => setCart(prev => prev.filter(i => i.id !== id));
  const updateServicePrice = (id: number, value: string) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, salePrice: parsePriceInput(value), salePriceText: value } : item));
  };
  const capText = (value: string) => autoCapitalizeValue(value, autoCapEnabled);
  const subtotal = cart.reduce((sum, item) => sum + (lineUnitPrice(item, paymentMethod) * item.qty), 0);
  const hasPmsService = cart.some((item) => isPmsItem(item));
  const currentOdometerKm = parseOdometerKm(odometer);
  const changeOilDueKm = hasPmsService && currentOdometerKm !== null ? currentOdometerKm + 8000 : null;
  const rawDiscountValue = Math.max(0, Number(discountValue || 0));
  const discountAmount = Math.min(
    subtotal,
    discountMode === "percent" ? subtotal * Math.min(rawDiscountValue, 100) / 100 : rawDiscountValue,
  );
  const total = Math.max(0, subtotal - discountAmount);

  const createInvoiceFromSale = async (saleId: number) => {
    const response = await fetch(`/api/invoices/from-sale/${saleId}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: capText(customerName).trim(),
        customerContact: customerContact.trim(),
        customerAddress: capText(customerAddress).trim(),
        carMaker: capText(carMaker).trim(),
        carModel: capText(carModel).trim(),
        plateNumber: plateNumber.trim(),
        odometer: odometer.trim(),
        odometerUnit: hasPmsService ? "km" : "",
        changeOilDueKm,
        amountPaid: total,
      }),
    });
    if (!response.ok) throw new Error((await response.json()).error || "Unable to create Sales Invoice");
    return response.json();
  };

  const createServiceTicket = async () => {
    if (cart.length === 0) {
      toast({ title: "Add at least one item", variant: "destructive" });
      return;
    }
    if (!carMaker.trim() || !carModel.trim() || !plateNumber.trim()) {
      toast({ title: "Customer car details are required", description: "Fill in car maker, model, and plate number.", variant: "destructive" });
      return;
    }
    if (hasPmsService && !odometer.trim()) {
      toast({ title: "Odometer is required", description: "Enter odometer for P.M.S. service.", variant: "destructive" });
      return;
    }
    const response = await fetch("/api/service-tickets", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: capText(customerName).trim(),
        customerContact: customerContact.trim(),
        customerAddress: capText(customerAddress).trim(),
        carMaker: capText(carMaker).trim(),
        carModel: capText(carModel).trim(),
        plateNumber: plateNumber.trim(),
        odometer: odometer.trim(),
        odometerUnit: hasPmsService ? "km" : "",
        changeOilDueKm,
        paymentMethod,
        subtotal,
        discountTotal: discountAmount,
        totalAmount: total,
        items: cart.map((item) => ({
          productId: item.id,
          productName: item.name,
          brand: item.brand,
          category: item.category,
          serviceUnit: item.serviceUnit,
          tireSize: productUnitLabel(item),
          quantity: item.qty,
          unitPrice: lineUnitPrice(item, paymentMethod),
          subtotal: lineUnitPrice(item, paymentMethod) * item.qty,
        })),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast({ title: "Service ticket not created", description: body.error || "Please try again.", variant: "destructive" });
      return;
    }
    toast({ title: "Service ticket created", description: `${body.id} is now visible in Live Active Clients.` });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "active-clients"] });
    queryClient.invalidateQueries({ queryKey: ["service-tickets"] });
    clearSaleDraft();
    setLocation("/active-clients");
  };

  const checkout = () => {
    if (cart.length === 0) return;
    if (!carMaker.trim() || !carModel.trim() || !plateNumber.trim()) {
      toast({ title: "Customer car details are required", description: "Fill in car maker, model, and plate number.", variant: "destructive" });
      return;
    }
    if (hasPmsService && !odometer.trim()) {
      toast({ title: "Odometer is required", description: "Enter odometer for P.M.S. service.", variant: "destructive" });
      return;
    }
    createSale.mutate({
      data: {
        items: cart.map(i => ({ productId: i.id, quantity: i.qty, unitPrice: isVariablePriceProduct(i) ? lineUnitPrice(i, paymentMethod) : undefined })),
        paymentMethod,
        discountType: discountAmount > 0 ? discountMode : "none",
        discountValue: rawDiscountValue,
        discountTotal: discountAmount,
        customerName: capText(customerName).trim(),
        carMaker: capText(carMaker).trim(),
        carModel: capText(carModel).trim(),
        plateNumber: plateNumber.trim(),
        odometer: odometer.trim(),
        odometerUnit: hasPmsService ? "km" : "",
        changeOilDueKm,
      } as any
    }, {
      onSuccess: async (sale) => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        try {
          const invoice = await createInvoiceFromSale(sale.id);
          toast({ title: "Sale completed", description: `Sales Invoice ${invoice.invoiceNo} created.` });
          clearSaleDraft();
          setLocation(`/invoices/${encodeURIComponent(invoice.invoiceNo)}`);
        } catch (error) {
          toast({
            title: "Sale completed, invoice not created",
            description: error instanceof Error ? error.message : "Open the receipt instead.",
            variant: "destructive",
          });
          clearSaleDraft();
          setLocation(`/receipts/${sale.id}`);
        }
      }
    });
  };

  const hasSuggestions = search.trim().length > 0;

  return (
    <div className="h-full flex flex-col md:flex-row gap-6">
      <div className="flex-1 flex flex-col gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">New Sale</h2>
          <p className="text-muted-foreground mt-1">Select products and complete transactions.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className={`${isMechanic ? "grid-cols-2 max-w-sm" : "grid-cols-3 max-w-md"} grid gap-2 rounded-lg border bg-card p-1 shadow-sm flex-1 min-w-[260px]`} data-testid="sale-category-switch">
            {!isMechanic && (
              <Button
                type="button"
                variant={productMode === "tires" ? "default" : "ghost"}
                className="h-10"
                onClick={() => {
                  setProductMode("tires");
                  setSearch("");
                  setShowSuggestions(false);
                  inputRef.current?.focus();
                }}
                data-testid="btn-sale-tires"
              >
                Tires
              </Button>
            )}
            <Button
              type="button"
              variant={productMode === "services" ? "default" : "ghost"}
              className="h-10"
              onClick={() => {
                setProductMode("services");
                setSearch("");
                setShowSuggestions(false);
                inputRef.current?.focus();
              }}
              data-testid="btn-sale-services"
            >
              Services
            </Button>
            <Button
              type="button"
              variant={productMode === "other" ? "default" : "ghost"}
              className="h-10"
              onClick={() => {
                setProductMode("other");
                setSearch("");
                setShowSuggestions(false);
                inputRef.current?.focus();
              }}
              data-testid="btn-sale-other"
            >
              Other
            </Button>
          </div>
        </div>

        {/* Search with live suggestion dropdown */}
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          <Input
            ref={inputRef}
            placeholder={
              productMode === "services" ? "Scan barcode or search service name..." :
              productMode === "other" ? "Search or create other sale item..." :
              "Scan barcode or type width / aspect ratio / rim size (e.g. 205, 55, 16)..."
            }
            className="pl-9 h-12 text-base shadow-sm"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => {
              if (search.trim()) setShowSuggestions(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const brandOnly = productMode === "tires" && allProducts.some((product) =>
                  !isVariablePriceProduct(product as ProductWithService) &&
                  String(product.brand || "").trim().toLowerCase() === search.trim().toLowerCase()
                );
                if (brandOnly) {
                  e.preventDefault();
                  setShowSuggestions(true);
                  return;
                }
                const exactBarcode = allProducts.find((product) => String(product.barcode || "").toLowerCase() === search.trim().toLowerCase());
                const firstMatch = exactBarcode || filteredProducts[0];
                if (firstMatch) {
                  e.preventDefault();
                  addToCart(firstMatch);
                  setSearch("");
                  setShowSuggestions(false);
                }
              }
              if (e.key === "Escape") {
                setShowSuggestions(false);
                setSearch("");
              }
            }}
            data-testid="input-pos-search"
            autoComplete="off"
            autoFocus
          />

          {/* Suggestions dropdown */}
          {hasSuggestions && showSuggestions && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-2xl overflow-hidden"
              data-testid="suggestions-dropdown"
            >
              {filteredProducts.length > 0 ? (
                <>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground border-b bg-muted/40 tracking-wide uppercase">
                    {filteredProducts.length} {productMode === "services" ? "service" : productMode === "other" ? "other item" : "tire"} match{filteredProducts.length !== 1 ? "es" : ""} - click to add to cart
                  </div>
                  <ul className="max-h-64 overflow-y-auto divide-y">
                    {filteredProducts.map((p) => (
                      <li
                        key={p.id}
                        className={`flex items-center gap-3 px-4 py-2.5 select-none transition-colors
                          ${!isVariablePriceProduct(p as ProductWithService) && p.stock <= 0
                            ? "opacity-50 cursor-not-allowed"
                            : "cursor-pointer hover:bg-accent hover:text-accent-foreground"
                          }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (isVariablePriceProduct(p as ProductWithService) || p.stock > 0) selectSuggestion(p);
                        }}
                        data-testid={`suggestion-${p.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          {productMode === "tires" ? (
                            <TireProductTitle product={p} />
                          ) : (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                {p.brand && (!isVariablePriceProduct(p as ProductWithService) || (p as ProductWithService).serviceUnit === "liters") && (
                                  <span className="text-xs font-bold text-primary uppercase tracking-wide shrink-0">{p.brand}</span>
                                )}
                                <span className="font-medium text-sm truncate">{p.name}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {!(productMode === "services" && !serviceTileUnitLabel(p as ProductWithService)) && (
                                  <Badge variant="secondary" className="font-mono text-xs px-1.5 py-0">
                                    {productMode === "services" ? serviceTileUnitLabel(p as ProductWithService) : productUnitLabel(p as ProductWithService)}
                                  </Badge>
                                )}
                                {!isVariablePriceProduct(p as ProductWithService) && p.stock > 0 && p.stock <= 5 && (
                                  <span className="flex items-center gap-0.5 text-xs text-destructive font-semibold">
                                    <AlertCircle className="h-3 w-3" />{p.stock} left
                                  </span>
                                )}
                                {!isVariablePriceProduct(p as ProductWithService) && p.stock <= 0 && (
                                  <span className="text-xs text-muted-foreground font-semibold">Out of stock</span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        {!isVariablePriceProduct(p as ProductWithService) && (
                          <div className="text-sm font-bold shrink-0">
                            {formatPriceDisplay(lineUnitPrice(p as ProductWithService, paymentMethod))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="px-4 py-5 text-sm text-muted-foreground text-center">
                  No {productMode === "services" ? "services" : productMode === "other" ? "other items" : "tires"} match <span className="font-semibold">"{search}"</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Product list — filtered live as you type */}
        <ScrollArea className="flex-1 border rounded-lg bg-card shadow-sm">
          <div className="divide-y">
            {(productMode === "services" || productMode === "other") && (
              <button
                type="button"
                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-primary/5"
                onClick={() => setIsCreateServiceOpen(true)}
                data-testid={productMode === "other" ? "card-create-other-item" : "card-create-service"}
              >
                <div className="rounded-md bg-primary p-2 text-primary-foreground shrink-0">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{productMode === "other" ? "Add Product" : "Create Service"}</div>
                  <div className="text-xs text-muted-foreground">{productMode === "other" ? "Add an item to this list" : "Add a service to this list"}</div>
                </div>
              </button>
            )}
            {filteredProducts.map((p) => {
              const outOfStock = !isVariablePriceProduct(p as ProductWithService) && p.stock <= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={outOfStock}
                  className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${outOfStock ? "cursor-not-allowed opacity-50" : ""}`}
                  onClick={() => addToCart(p)}
                  data-testid={`card-product-${p.id}`}
                >
                  <div className="min-w-0 flex-1">
                    {productMode === "tires" ? (
                      <>
                        <TireProductTitle product={p} />
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className={p.stock <= 5 ? "font-semibold text-destructive" : ""}>
                            {p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}
                          </span>
                          {paymentMethod === "card" && <span>Card price</span>}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {p.brand && (!isVariablePriceProduct(p as ProductWithService) || (p as ProductWithService).serviceUnit === "liters") && (
                            <span className="text-xs font-bold uppercase tracking-wide text-primary">{p.brand}</span>
                          )}
                          <span className="font-bold leading-tight">{p.name}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {!(productMode === "services" && !serviceTileUnitLabel(p as ProductWithService)) && (
                            <Badge variant="secondary" className="font-mono px-1.5 py-0">
                              {productMode === "services" ? serviceTileUnitLabel(p as ProductWithService) : productUnitLabel(p as ProductWithService)}
                            </Badge>
                          )}
                          {!isVariablePriceProduct(p as ProductWithService) && (
                            <span className={p.stock <= 5 ? "font-semibold text-destructive" : ""}>
                              {p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}
                            </span>
                          )}
                          {paymentMethod === "card" && !isVariablePriceProduct(p as ProductWithService) && (
                            <span>Card price</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {!isVariablePriceProduct(p as ProductWithService) && (
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-bold">
                        {formatPriceDisplay(lineUnitPrice(p as ProductWithService, paymentMethod))}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
            {filteredProducts.length === 0 && search.trim() && (
              <div className="px-4 py-12 text-center text-muted-foreground">
                No {productMode === "services" ? "services" : productMode === "other" ? "other items" : "tires"} match <span className="font-semibold">"{search}"</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Cart panel */}
      <div className="w-full md:w-[400px] flex flex-col gap-4">
        <Card className="flex-1 flex flex-col shadow-lg border-primary/20">
          <CardHeader className="bg-muted/50 border-b pb-4">
            <CardTitle className="text-xl">Customer Order</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col p-0">
            <div className="max-h-[240px] overflow-y-auto border-b p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Order</h3>
                <Badge variant="secondary">{cart.length} item{cart.length === 1 ? "" : "s"}</Badge>
              </div>
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <ShoppingCart className="mb-3 h-10 w-10 opacity-20" />
                  <p className="text-sm">Customer order is empty</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.id} className="flex flex-col gap-2 rounded-md border bg-background p-3" data-testid={`cart-item-${item.id}`}>
                      <div className="flex justify-between">
                        <span className="text-sm font-bold leading-tight">{productDisplayName(item)}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => remove(item.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">{productUnitLabel(item)}</div>
                      {isVariablePriceProduct(item) && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground">{isOtherProduct(item) ? "Other Price" : "Sale Price"}</p>
                          <Input
                            type="text"
                            value={item.salePriceText ?? (item.salePrice ? String(item.salePrice) : "")}
                            onChange={(event) => updateServicePrice(item.id, event.target.value)}
                            placeholder={isOtherProduct(item) ? "Enter item price or Free" : "Enter service price or Free"}
                            data-testid={`input-service-price-${item.id}`}
                          />
                        </div>
                      )}
                      <div className="mt-1 flex items-center justify-between">
                        <div className="flex items-center rounded-md border">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => updateQty(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                          <span className="w-8 text-center text-sm font-semibold">{item.qty}</span>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => updateQty(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-primary">{formatPriceDisplay(lineUnitPrice(item, paymentMethod) * item.qty)}</div>
                          {paymentMethod === "card" && !isVariablePriceProduct(item) && <div className="text-[11px] text-muted-foreground">Card price</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 border-b p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Customer</h3>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Customer Name</p>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} onBlur={() => setCustomerName((value) => capText(value))} placeholder="Customer name" data-testid="input-customer-name" />
              </div>
              <h3 className="pt-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">Unit</h3>
              <div className="space-y-2">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Car Maker <span className="text-destructive">*</span></p>
                  <Input value={carMaker} onChange={(e) => setCarMaker(e.target.value)} onBlur={() => setCarMaker((value) => capText(value))} placeholder="Toyota, Honda, Ford..." data-testid="input-car-maker" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Car Model <span className="text-destructive">*</span></p>
                  <Input value={carModel} onChange={(e) => setCarModel(e.target.value)} onBlur={() => setCarModel((value) => capText(value))} placeholder="Vios, Civic, Ranger..." data-testid="input-car-model" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">Plate Number <span className="text-destructive">*</span></p>
                  <Input value={plateNumber} onChange={(e) => setPlateNumber(e.target.value.toUpperCase())} placeholder="Plate number" data-testid="input-plate-number" />
                </div>
                {hasPmsService && (
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Odometer <span className="text-destructive">*</span></p>
                    <div className="relative">
                      <Input value={odometer} onChange={(e) => setOdometer(e.target.value)} className="pr-12" placeholder="Current odometer" data-testid="input-odometer" />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">km</span>
                    </div>
                    {changeOilDueKm !== null && (
                      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        Change oil due: <span className="font-bold">{changeOilDueKm.toLocaleString()} km</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t bg-muted/20 p-4">
              {!isMechanic && (
                <>
                  <div className="space-y-2 mb-4">
                    <p className="text-sm font-medium mb-2">Payment Method</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant={paymentMethod === 'cash' ? 'default' : 'outline'} className="h-12 justify-start" onClick={() => setPaymentMethod('cash')}><Banknote className="mr-2 h-4 w-4" /> Cash</Button>
                      <Button variant={paymentMethod === 'card' ? 'default' : 'outline'} className="h-12 justify-start" onClick={() => setPaymentMethod('card')}><CreditCard className="mr-2 h-4 w-4" /> Card</Button>
                      <Button variant={paymentMethod === 'gcash' ? 'default' : 'outline'} className="h-12 justify-start" onClick={() => setPaymentMethod('gcash')}><Smartphone className="mr-2 h-4 w-4" /> GCash</Button>
                      <Button variant={paymentMethod === 'maya' ? 'default' : 'outline'} className="h-12 justify-start" onClick={() => setPaymentMethod('maya')}><Smartphone className="mr-2 h-4 w-4" /> Maya</Button>
                      <Button variant={paymentMethod === 'financing' ? 'default' : 'outline'} className="h-12 justify-start col-span-2" onClick={() => setPaymentMethod('financing')}><Landmark className="mr-2 h-4 w-4" /> Financing</Button>
                    </div>
                  </div>
                  <div className="space-y-3 mb-5 rounded-md border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">Other Discount</span>
                      <div className="flex overflow-hidden rounded-md border">
                        <Button type="button" size="sm" variant={discountMode === "php" ? "default" : "ghost"} className="rounded-none" onClick={() => setDiscountMode("php")}>PHP</Button>
                        <Button type="button" size="sm" variant={discountMode === "percent" ? "default" : "ghost"} className="rounded-none" onClick={() => setDiscountMode("percent")}>%</Button>
                      </div>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountMode === "percent" ? "Discount percent" : "Discount amount"}
                      data-testid="input-other-discount"
                    />
                  </div>
                </>
              )}
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{paymentMethod === "card" ? "Card Subtotal" : "Subtotal"}</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>Other Discount</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center border-t pt-3">
                  <span className="text-lg font-bold">Total</span>
                  <span className="text-3xl font-black text-primary">{formatCurrency(total)}</span>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full h-12 text-base font-bold mb-3"
                size="lg"
                disabled={cart.length === 0 || createSale.isPending}
                onClick={createServiceTicket}
                data-testid="btn-create-service-ticket"
              >
                {isMechanic ? "Create Ticket" : "Create Service Ticket"}
              </Button>
              {!isMechanic && (
                <Button
                  className="w-full h-14 text-lg font-bold shadow-md"
                  size="lg"
                  disabled={cart.length === 0 || createSale.isPending}
                  onClick={checkout}
                  data-testid="btn-checkout"
                >
                  {createSale.isPending ? "Processing..." : "Complete Sale"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={isCreateServiceOpen}
        onOpenChange={(open) => {
          setIsCreateServiceOpen(open);
          if (!open) resetCreateServiceForm();
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{productMode === "other" ? "Create Other Item" : "Create Service"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">{productMode === "other" ? "Item Name" : "Service Name"}</p>
              <Input
                value={newServiceName}
                onChange={(event) => setNewServiceName(event.target.value)}
                onBlur={() => setNewServiceName((value) => capText(value))}
                placeholder={productMode === "other" ? "Miscellaneous item, shop supply..." : "Wheel alignment, brake cleaning..."}
                data-testid={productMode === "other" ? "input-new-other-name" : "input-new-service-name"}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Unit</p>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newServiceUnit}
                  onChange={(event) => {
                    const unit = event.target.value as "service" | "pieces" | "liters";
                    setNewServiceUnit(unit);
                    if (unit !== "liters") setNewServiceBrand("");
                  }}
                  data-testid="select-new-service-unit"
                >
                  <option value="service">{productMode === "other" ? "Other" : "Service"}</option>
                  <option value="pieces">Pieces</option>
                  <option value="liters">Liters</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Sale Price</p>
                <Input
                  type="text"
                  value={newServicePrice}
                  onChange={(event) => setNewServicePrice(event.target.value)}
                  placeholder="Enter price or Free"
                  data-testid="input-new-service-price"
                />
              </div>
            </div>

            {newServiceUnit === "liters" && (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">Brand</p>
                <Input
                  value={newServiceBrand}
                  onChange={(event) => setNewServiceBrand(event.target.value)}
                  onBlur={() => setNewServiceBrand((value) => capText(value))}
                  placeholder="Oil or fluid brand"
                  data-testid="input-new-service-brand"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateServiceOpen(false)}
                disabled={isCreatingService}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={createCustomService}
                disabled={isCreatingService}
                data-testid={productMode === "other" ? "btn-save-new-other" : "btn-save-new-service"}
              >
                {isCreatingService ? "Saving..." : "Save and Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShoppingCart({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>;
}


