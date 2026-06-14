import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  useListProducts, 
  useCreateProduct, 
  useUpdateProduct, 
  useDeleteProduct,
  useGetMe,
  getListProductsQueryKey,
  getListSalesQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { calculateRegularPrice, formatCurrency, formatPriceDisplay, formatTireSize } from "@/lib/format";
import { isDemoMode } from "@/lib/demo-mode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit2, Trash2, AlertCircle, X, PackagePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { autoCapitalizeValue, useAutoCapitalizationEnabled } from "@/lib/autocapitalize";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Product } from "@workspace/api-client-react";

const productSchema = z.object({
  category: z.enum(["tires", "services", "other"]).default("tires"),
  serviceUnit: z.enum(["service", "pieces", "liters"]).default("service"),
  name: z.string().optional().default(""),
  brand: z.string().optional().default(""),
  width: z.coerce.number().min(0),
  aspectRatio: z.coerce.number().min(0),
  rimSize: z.coerce.number().min(0),
  netPrice: z.preprocess(
    (value) => value === "" || value === null || value === undefined ? undefined : value,
    z.coerce.number().min(0).optional(),
  ),
  price: z.coerce.number().min(0),
  stock: z.coerce.number().min(0),
  barcode: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.category === "services" || value.category === "other") {
    if (!String(value.name || "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "Name required" });
    }
    if (value.serviceUnit === "liters" && !String(value.brand || "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["brand"], message: "Brand required for liters" });
    }
    return;
  }
  if (!String(value.brand || "").trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["brand"], message: "Brand required" });
  if (value.width < 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["width"], message: "Width required" });
  if (value.aspectRatio < 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["aspectRatio"], message: "Profile required" });
  if (value.rimSize < 10) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["rimSize"], message: "Rim required" });
});

type ProductWithCategory = Product & {
  category?: string;
  serviceUnit?: "service" | "job" | "pieces" | "liters" | string | null;
};

function isServiceProduct(product: ProductWithCategory): boolean {
  return String(product.category || "").toLowerCase() === "services" || String(product.category || "").toLowerCase() === "service";
}

function isOtherProduct(product: ProductWithCategory): boolean {
  return String(product.category || "").toLowerCase() === "other";
}

function isVariablePriceProduct(product: ProductWithCategory): boolean {
  return isServiceProduct(product) || isOtherProduct(product);
}

function productUnitLabel(product: ProductWithCategory): string {
  if (!isVariablePriceProduct(product)) return formatTireSize(product.width, product.aspectRatio, product.rimSize);
  const labelPrefix = isOtherProduct(product) ? "Other" : "Service";
  if (product.serviceUnit === "pieces") return `${labelPrefix} / Pieces`;
  if (product.serviceUnit === "liters") return `${labelPrefix} / Liters`;
  return labelPrefix;
}

export default function Inventory() {
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [inventoryTab, setInventoryTab] = useState<"tires" | "services" | "other">("tires");

  const isLowStockParam = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  ).get("lowStock") === "true";
  const isAddProductParam = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  ).get("addProduct") === "true";
  const isDeliveryParam = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  ).get("delivery") === "true";

  const [showLowStockOnly, setShowLowStockOnly] = useState(isLowStockParam);
  const [isDeliveryMode, setIsDeliveryMode] = useState(isDeliveryParam);

  useEffect(() => {
    setShowLowStockOnly(isLowStockParam);
    setIsDeliveryMode(isDeliveryParam);
  }, [location]);

  useEffect(() => {
    if (isAddProductParam) openNew();
  }, [location]);

  const { data: products, isLoading } = useListProducts({
    search: search || undefined,
    lowStock: showLowStockOnly || undefined,
  });
  const { data: user } = useGetMe();
  const autoCapEnabled = useAutoCapitalizationEnabled();
  const canDelete = user?.role === "admin";
  const tireProducts = (products || []).filter((product) => !isVariablePriceProduct(product as ProductWithCategory));
  const serviceProducts = (products || []).filter((product) => isServiceProduct(product as ProductWithCategory));
  const otherProducts = (products || []).filter((product) => isOtherProduct(product as ProductWithCategory));

  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [replenishmentQty, setReplenishmentQty] = useState<Record<number, string>>({});

  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const deleteMut = useDeleteProduct();

  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      category: "tires", serviceUnit: "service", name: "", brand: "", width: 205, aspectRatio: undefined as unknown as number, rimSize: 16, netPrice: undefined, price: 0, stock: 0, barcode: ""
    }
  });
  const selectedCategory = form.watch("category");
  const selectedServiceUnit = form.watch("serviceUnit");
  const discountedPrice = Number(form.watch("price") || 0);
  const regularPrice = calculateRegularPrice(discountedPrice);
  const capField = (field: "brand" | "name") => {
    form.setValue(field, autoCapitalizeValue(String(form.getValues(field) || ""), autoCapEnabled), { shouldValidate: true });
  };

  const openNew = () => {
    setEditingProduct(null);
    form.reset({ category: "tires", serviceUnit: "service", name: "", brand: "", width: 205, aspectRatio: undefined as unknown as number, rimSize: 16, netPrice: undefined, price: 0, stock: 0, barcode: "" });
    setIsFormOpen(true);
  };

  const openEdit = (p: Product) => {
    const product = p as ProductWithCategory;
    setEditingProduct(p);
    form.reset({
      category: isOtherProduct(product) ? "other" : isServiceProduct(product) ? "services" : "tires",
      serviceUnit: product.serviceUnit === "pieces" || product.serviceUnit === "liters" ? product.serviceUnit : "service",
      name: p.name, brand: p.brand, width: p.width, aspectRatio: p.aspectRatio, rimSize: p.rimSize, netPrice: p.netPrice || undefined, price: p.price, stock: p.stock, barcode: p.barcode || ""
    });
    setIsFormOpen(true);
  };

  const invalidateInventoryRelatedQueries = () => {
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSalesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.refetchQueries({ queryKey: getListSalesQueryKey() });
  };

  const onSubmit = (values: z.infer<typeof productSchema>) => {
    const cappedValues = {
      ...values,
      brand: autoCapitalizeValue(String(values.brand || ""), autoCapEnabled),
      name: autoCapitalizeValue(String(values.name || ""), autoCapEnabled),
    };
    const productData = cappedValues.category === "services"
      ? { ...cappedValues, brand: cappedValues.serviceUnit === "liters" ? cappedValues.brand || "" : "", width: 0, aspectRatio: 0, rimSize: 0, netPrice: cappedValues.netPrice ?? 0, price: cappedValues.price || 0, stock: 0 }
      : cappedValues.category === "other"
        ? { ...cappedValues, brand: cappedValues.serviceUnit === "liters" ? cappedValues.brand || "" : "", width: 0, aspectRatio: 0, rimSize: 0, netPrice: 0, price: cappedValues.price || 0, stock: 0 }
      : { ...cappedValues, netPrice: cappedValues.netPrice ?? 0 };
    if (editingProduct) {
      updateMut.mutate({ id: editingProduct.id, data: productData }, {
        onSuccess: () => {
          invalidateInventoryRelatedQueries();
          setIsFormOpen(false);
          toast({ title: "Product updated" });
        }
      });
    } else {
      createMut.mutate({ data: productData }, {
        onSuccess: () => {
          invalidateInventoryRelatedQueries();
          setIsFormOpen(false);
          toast({ title: "Product created" });
        }
      });
    }
  };

  const confirmDelete = () => {
    if (!deletingId || !canDelete) return;
    deleteMut.mutate({ id: deletingId }, {
      onSuccess: () => {
        invalidateInventoryRelatedQueries();
        setDeletingId(null);
        toast({ title: "Product deleted" });
      }
    });
  };

  const clearLowStockFilter = () => {
    setShowLowStockOnly(false);
    setLocation("/inventory");
  };

  const openDeliveryMode = () => {
    setIsDeliveryMode(true);
    setLocation("/inventory?delivery=true");
  };

  const receiveStock = (product: Product) => {
    const addQty = Math.max(0, Number(replenishmentQty[product.id] || 0));
    if (!Number.isFinite(addQty) || addQty <= 0) {
      toast({ title: "Enter quantity to add", variant: "destructive" });
      return;
    }
    updateMut.mutate({ id: product.id, data: { stock: Number(product.stock || 0) + addQty } }, {
      onSuccess: () => {
        invalidateInventoryRelatedQueries();
        setReplenishmentQty((current) => ({ ...current, [product.id]: "" }));
        toast({ title: "Stock received", description: `${addQty} added to ${product.brand} ${product.name}`.trim() });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground mt-1">Manage tire inventory and service items.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openDeliveryMode} data-testid="btn-delivery-mode">
            <PackagePlus className="mr-2 h-4 w-4" />
            Replenishment / Delivery
          </Button>
          <Button onClick={openNew} data-testid="btn-add-product">
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      {isDeliveryMode && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-primary" data-testid="banner-delivery-mode">
          <PackagePlus className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-sm font-semibold">
            Replenishment mode: enter the delivery quantity in Add, then click Add beside the current stock.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-primary hover:bg-primary/20 hover:text-primary"
            onClick={() => {
              setIsDeliveryMode(false);
              setLocation("/inventory");
            }}
            data-testid="btn-clear-delivery-mode"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Exit
          </Button>
        </div>
      )}

      {showLowStockOnly && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive" data-testid="banner-low-stock-filter">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold flex-1">
            Showing only low stock items (5 or fewer units)
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-destructive hover:bg-destructive/20 hover:text-destructive"
            onClick={clearLowStockFilter}
            data-testid="btn-clear-low-stock-filter"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear filter
          </Button>
        </div>
      )}

      <div className="flex items-center bg-card border rounded-md px-3 py-2 max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground mr-2" />
        <Input 
          placeholder="Search products or services..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-0 focus-visible:ring-0 p-0 h-8"
          data-testid="input-search-products"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border bg-card p-1 shadow-sm max-w-md" data-testid="inventory-tabs">
        <Button
          type="button"
          variant={inventoryTab === "tires" ? "default" : "ghost"}
          className="h-10"
          onClick={() => setInventoryTab("tires")}
          data-testid="tab-inventory-tires"
        >
          Tires
        </Button>
        <Button
          type="button"
          variant={inventoryTab === "services" ? "default" : "ghost"}
          className="h-10"
          onClick={() => setInventoryTab("services")}
          data-testid="tab-inventory-services"
        >
          Services
        </Button>
        <Button
          type="button"
          variant={inventoryTab === "other" ? "default" : "ghost"}
          className="h-10"
          onClick={() => setInventoryTab("other")}
          data-testid="tab-inventory-other"
        >
          Other
        </Button>
      </div>

      <div className="space-y-8">
        {inventoryTab === "tires" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold tracking-tight">Tire Inventory</h3>
            <Badge variant="secondary">{tireProducts.length} tire{tireProducts.length === 1 ? "" : "s"}</Badge>
          </div>
          <div className="border rounded-md bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="text-right">Regular Price</TableHead>
              <TableHead className="text-right">Discounted Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="w-[150px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading products...</TableCell></TableRow>
            ) : tireProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {showLowStockOnly ? "No low stock items — all products are well stocked." : "No products found."}
                </TableCell>
              </TableRow>
            ) : tireProducts.map(p => (
              <TableRow
                key={p.id}
                className={p.stock <= 3 ? "bg-destructive/5 hover:bg-destructive/10" : ""}
                data-testid={`row-product-${p.id}`}
              >
                <TableCell className="font-medium">{p.brand}</TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell><Badge variant="secondary" className="font-mono">{formatTireSize(p.width, p.aspectRatio, p.rimSize)}</Badge></TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(calculateRegularPrice(p.price))}</TableCell>
                <TableCell className="text-right">
                  <div className="font-bold text-primary">{formatCurrency(p.price)}</div>
                  <div className="text-xs text-muted-foreground">3.5% off regular</div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {p.stock <= 3 && <AlertCircle className="h-4 w-4 text-destructive" />}
                    <span className={p.stock <= 3 ? "text-destructive font-bold" : ""}>{p.stock}</span>
                    {p.stock <= 3 && (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0">Low</Badge>
                    )}
                    {isDeliveryMode && (
                      <div className="ml-3 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Add</span>
                        <Input
                          type="number"
                          min="0"
                          className="h-8 w-20 text-right"
                          value={replenishmentQty[p.id] || ""}
                          onChange={(event) => setReplenishmentQty((current) => ({ ...current, [p.id]: event.target.value }))}
                          onClick={(event) => event.stopPropagation()}
                          data-testid={`input-receive-qty-${p.id}`}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => receiveStock(p)}
                          disabled={updateMut.isPending}
                          data-testid={`btn-add-stock-${p.id}`}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {!isDeliveryMode && (
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} data-testid={`btn-edit-${p.id}`}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => setDeletingId(p.id)} className="text-destructive hover:bg-destructive/10 hover:text-destructive" data-testid={`btn-delete-${p.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
          </div>
        </section>
        )}

        {inventoryTab === "services" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold tracking-tight">Services</h3>
            <Badge variant="secondary">{serviceProducts.length} service{serviceProducts.length === 1 ? "" : "s"}</Badge>
          </div>
          <div className="border rounded-md bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  {!isDemoMode && <TableHead className="text-right">Net Cost</TableHead>}
                  <TableHead className="w-[150px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading services...</TableCell></TableRow>
                ) : serviceProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No service products found.</TableCell>
                  </TableRow>
                ) : serviceProducts.map(p => (
                  <TableRow key={p.id} data-testid={`row-product-${p.id}`}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><Badge variant="secondary">{productUnitLabel(p as ProductWithCategory)}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{(p as ProductWithCategory).serviceUnit === "liters" ? p.brand : ""}</TableCell>
                    <TableCell className="text-right font-bold">{formatPriceDisplay(p.price)}</TableCell>
                    {!isDemoMode && <TableCell className="text-right text-muted-foreground">{formatPriceDisplay(p.netPrice || 0)}</TableCell>}
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)} data-testid={`btn-edit-${p.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeletingId(p.id)} className="text-destructive hover:bg-destructive/10 hover:text-destructive" data-testid={`btn-delete-${p.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
        )}

        {inventoryTab === "other" && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold tracking-tight">Other Items</h3>
            <Badge variant="secondary">{otherProducts.length} item{otherProducts.length === 1 ? "" : "s"}</Badge>
          </div>
          <div className="border rounded-md bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="w-[150px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading other items...</TableCell></TableRow>
                ) : otherProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No other items found.</TableCell>
                  </TableRow>
                ) : otherProducts.map(p => (
                  <TableRow key={p.id} data-testid={`row-product-${p.id}`}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><Badge variant="secondary">{productUnitLabel(p as ProductWithCategory)}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{(p as ProductWithCategory).serviceUnit === "liters" ? p.brand : ""}</TableCell>
                    <TableCell className="text-right font-bold">{p.price > 0 ? formatCurrency(p.price) : "Set per sale"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">Other</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)} data-testid={`btn-edit-${p.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeletingId(p.id)} className="text-destructive hover:bg-destructive/10 hover:text-destructive" data-testid={`btn-delete-${p.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingProduct && isDeliveryMode ? "Record Replenishment" : editingProduct ? "Edit Product" : "New Product"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Category</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={field.value}
                        onChange={(event) => {
                          field.onChange(event.target.value);
                          if (event.target.value === "services" || event.target.value === "other") {
                            form.setValue("width", 0);
                            form.setValue("aspectRatio", 0);
                            form.setValue("rimSize", 0);
                            if (event.target.value === "other") form.setValue("netPrice", undefined);
                            form.setValue("stock", 0);
                            form.setValue("brand", "");
                          } else {
                            form.setValue("width", 205);
                            form.setValue("aspectRatio", undefined as unknown as number);
                            form.setValue("rimSize", 16);
                          }
                        }}
                        data-testid="select-product-category"
                      >
                        <option value="tires">Tires</option>
                        <option value="services">Services</option>
                        <option value="other">Other</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                {(selectedCategory === "services" || selectedCategory === "other") && (
                  <FormField control={form.control} name="serviceUnit" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Unit</FormLabel>
                      <FormControl>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={field.value}
                          onChange={(event) => {
                            field.onChange(event);
                            if (event.target.value !== "liters") form.setValue("brand", "");
                          }}
                          data-testid="select-service-unit"
                        >
                          <option value="service">{selectedCategory === "other" ? "Other" : "Service"}</option>
                          <option value="pieces">Pieces</option>
                          <option value="liters">Liters</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(selectedCategory === "tires" || selectedServiceUnit === "liters") && (
                  <FormField control={form.control} name="brand" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand</FormLabel>
                      <FormControl><Input {...field} onBlur={() => { field.onBlur(); capField("brand"); }} data-testid="input-brand" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>{selectedCategory === "tires" ? "Name/Model (Optional)" : "Name"}</FormLabel><FormControl><Input {...field} onBlur={() => { field.onBlur(); capField("name"); }} data-testid="input-name" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              {selectedCategory === "tires" ? (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="width" render={({ field }) => (
                      <FormItem><FormLabel>Width</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="aspectRatio" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Profile</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            value={Number(field.value || 0) > 0 ? field.value : ""}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="rimSize" render={({ field }) => (
                      <FormItem><FormLabel>Rim</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="netPrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Net Price (Optional, Reports Only)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            placeholder="Leave blank if unknown"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="price" render={({ field }) => (
                      <FormItem><FormLabel>Discounted Price (PHP)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="stock" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{editingProduct && isDeliveryMode ? "New Stock Qty" : "Stock Qty"}</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        {editingProduct && isDeliveryMode && (
                          <p className="text-xs text-muted-foreground">Enter the total stock after receiving this delivery.</p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="rounded-md border bg-muted/40 px-3 py-2">
                    <div className="text-sm font-medium">Regular Price</div>
                    <div className="text-xl font-bold">{formatCurrency(regularPrice)}</div>
                    <div className="text-xs text-muted-foreground">Automatically calculated as discounted price + 3.5%.</div>
                  </div>
                </>
              ) : selectedCategory === "other" ? (
                <>
                  <FormField control={form.control} name="price" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Optional Default Price (PHP)</FormLabel>
                      <FormControl><Input type="number" min="0" step="0.01" {...field} placeholder="Leave 0 to define later" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Other items can keep an optional default price, but the price can still be changed during each New Sale.
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="price" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price (PHP)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" {...field} placeholder="Leave blank for free" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="netPrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Net Cost (Optional, Reports Only)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            placeholder="Leave blank if unknown"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Set the service price here. Leave blank or 0 for free services. Net cost is optional and used only in reports.
                  </div>
                </>
              )}
              <FormField control={form.control} name="barcode" render={({ field }) => (
                <FormItem><FormLabel>Barcode (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createMut.isPending || updateMut.isPending} data-testid="btn-save-product">Save Product</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the product from inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-confirm-delete">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
