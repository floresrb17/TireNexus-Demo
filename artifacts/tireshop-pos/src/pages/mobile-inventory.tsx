import { useMemo, useState } from "react";
import { AlertTriangle, Package, RefreshCw, Search } from "lucide-react";
import { useListProducts } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatTireSize } from "@/lib/format";

export default function MobileInventory() {
  const [search, setSearch] = useState("");
  const { data: products = [], isLoading, refetch, isFetching } = useListProducts({});

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;

    return products.filter((product) => {
      const size = formatTireSize(product.width, product.aspectRatio, product.rimSize);
      return [product.brand, product.name, product.barcode ?? "", size, String(product.stock)].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [products, search]);

  const totalStock = products.reduce((sum, product) => sum + product.stock, 0);
  const lowStockCount = products.filter((product) => product.stock <= 5).length;

  return (
    <main className="min-h-screen overflow-x-hidden bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black tracking-tight">WGI Inventory</h1>
              <p className="text-sm text-muted-foreground">Live local stock viewer</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh inventory"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2 landscape:grid-cols-3">
            <div className="rounded-md border bg-card px-3 py-2">
              <div className="text-sm text-muted-foreground">Items</div>
              <div className="text-lg font-bold">{products.length}</div>
            </div>
            <div className="rounded-md border bg-card px-3 py-2">
              <div className="text-sm text-muted-foreground">Stock</div>
              <div className="text-lg font-bold">{totalStock}</div>
            </div>
            <div className="rounded-md border bg-card px-3 py-2">
              <div className="text-sm text-muted-foreground">Low Stock</div>
              <div className="text-lg font-bold text-destructive">{lowStockCount}</div>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search brand, name, size..."
              className="h-10 pl-9"
              inputMode="search"
            />
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-3 p-4 landscape:grid-cols-2">
        {isLoading ? (
          <div className="rounded-md border bg-card p-6 text-center text-muted-foreground">Loading inventory...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-md border bg-card p-6 text-center text-muted-foreground">No inventory items found.</div>
        ) : (
          filteredProducts.map((product) => (
            <article key={product.id} className="rounded-md border bg-card p-4 shadow-sm">
              <div className="space-y-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <p className="truncate text-sm font-semibold text-primary">{product.brand}</p>
                  </div>
                  <h2 className="mt-1 text-lg font-bold leading-tight">{product.name}</h2>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
                    {formatTireSize(product.width, product.aspectRatio, product.rimSize)}
                  </p>
                </div>
                <div className="space-y-2 border-t pt-3">
                  <p className="text-base font-black">{formatCurrency(product.price)}</p>
                  <Badge variant={product.stock <= 5 ? "destructive" : "secondary"}>
                    {product.stock} in stock
                  </Badge>
                </div>
              </div>

              {product.stock <= 5 && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Low stock
                </div>
              )}

              {product.barcode && <p className="mt-3 text-xs text-muted-foreground">Barcode: {product.barcode}</p>}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
