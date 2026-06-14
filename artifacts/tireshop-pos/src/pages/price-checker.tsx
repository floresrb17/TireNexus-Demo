import { useMemo, useState } from "react";
import { Barcode, CheckCircle2, PackageSearch, Search, Tag } from "lucide-react";
import { useListProducts } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { calculateRegularPrice, formatCurrency, formatTireSize } from "@/lib/format";

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizedTireSize(product: { width: number; aspectRatio: number; rimSize: number }): string {
  return normalizeSearchText(formatTireSize(product.width, product.aspectRatio, product.rimSize));
}

function looksLikeTireSizeSearch(value: string): boolean {
  const normalized = normalizeSearchText(value);
  return /^\d{3}\d{2}r?\d{2}$/.test(normalized);
}

function isServiceProduct(product: { category?: string | null }): boolean {
  const category = String(product.category || "").toLowerCase();
  return category === "service" || category === "services";
}

function isOtherProduct(product: { category?: string | null }): boolean {
  return String(product.category || "").toLowerCase() === "other";
}

export default function PriceChecker() {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { data: products = [], isLoading } = useListProducts({});
  const tireProducts = useMemo(() => products.filter((product) => !isServiceProduct(product as { category?: string | null }) && !isOtherProduct(product as { category?: string | null })), [products]);

  const matches = useMemo(() => {
    const value = query.trim().toLowerCase();
    const normalizedValue = normalizeSearchText(query);
    if (!value) return tireProducts;

    return tireProducts.filter((product) => {
      const tireSize = formatTireSize(product.width, product.aspectRatio, product.rimSize);
      const searchFields = [
        product.brand,
        product.name,
        product.barcode ?? "",
        tireSize,
        `${product.width}/${product.aspectRatio} R${product.rimSize}`,
        `${product.width} ${product.aspectRatio} ${product.rimSize}`,
        String(product.width),
        String(product.aspectRatio),
        String(product.rimSize),
      ];

      return searchFields.some((field) => {
        const lowerField = field.toLowerCase();
        return lowerField.includes(value) || normalizeSearchText(field).includes(normalizedValue);
      });
    });
  }, [tireProducts, query]);

  const sameSizeMatches = useMemo(() => {
    const normalizedValue = normalizeSearchText(query);
    if (!looksLikeTireSizeSearch(query)) return [];
    return tireProducts.filter((product) => normalizedTireSize(product) === normalizedValue || normalizedTireSize(product).replace("r", "") === normalizedValue.replace("r", ""));
  }, [tireProducts, query]);

  const isSizeSearch = sameSizeMatches.length > 0;
  const displayedMatches = isSizeSearch ? sameSizeMatches : matches;
  const featuredProduct = matches[0];
  const visibleSuggestions = query.trim() ? displayedMatches.slice(0, 8) : [];
  const sizeBrandGroups = useMemo(() => {
    const grouped = new Map<string, { brand: string; count: number; stock: number; lowestPrice: number }>();
    for (const product of sameSizeMatches) {
      const key = product.brand.toLowerCase();
      const current = grouped.get(key) || { brand: product.brand, count: 0, stock: 0, lowestPrice: Number(product.price || 0) };
      current.count += 1;
      current.stock += Number(product.stock || 0);
      current.lowestPrice = Math.min(current.lowestPrice, Number(product.price || 0));
      grouped.set(key, current);
    }
    return Array.from(grouped.values()).sort((left, right) => left.brand.localeCompare(right.brand));
  }, [sameSizeMatches]);

  const selectSuggestion = (product: (typeof products)[number]) => {
    const tireSize = formatTireSize(product.width, product.aspectRatio, product.rimSize);
    setQuery(product.barcode || `${product.brand} ${product.name} ${tireSize}`);
    setShowSuggestions(false);
  };

  const submitSearch = () => {
    setShowSuggestions(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Price Checker</h2>
        <p className="text-muted-foreground mt-1">Quickly check tire prices, size, barcode, and stock.</p>
      </div>

      <div className="relative max-w-3xl">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-4 h-5 w-5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (looksLikeTireSizeSearch(query)) {
                    submitSearch();
                    return;
                  }
                  if (visibleSuggestions[0]) {
                    selectSuggestion(visibleSuggestions[0]);
                  } else {
                    submitSearch();
                  }
                }
              }}
              placeholder="Scan barcode or search brand, model, size..."
              className="h-14 pl-12 text-lg shadow-sm"
              autoFocus
              data-testid="input-price-checker"
            />
          </div>
          <Button type="button" className="h-14 px-6" onClick={submitSearch} data-testid="btn-price-checker-search">
            Search
          </Button>
        </div>
        {showSuggestions && query.trim() && (
          <div className="absolute left-0 right-0 top-16 z-20 overflow-hidden rounded-md border bg-background shadow-lg">
            {visibleSuggestions.length > 0 ? (
              <div className="max-h-80 overflow-y-auto py-1">
                {visibleSuggestions.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(product)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <div className={`truncate text-sm font-bold ${product.stock <= 0 ? "text-destructive" : ""}`}>
                        {product.brand} {product.name}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{formatTireSize(product.width, product.aspectRatio, product.rimSize)}</span>
                        {product.barcode && <span>{product.barcode}</span>}
                        <span className={product.stock <= 0 ? "font-semibold text-destructive" : ""}>
                          {product.stock <= 0 ? "Out of stock" : `Stock ${product.stock}`}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-black text-foreground">
                      {formatCurrency(product.price)}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-muted-foreground">No matching product found.</div>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">Loading products...</CardContent>
        </Card>
      ) : !featuredProduct ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <PackageSearch className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-xl font-bold">No product found</h3>
            <p className="mt-1 text-muted-foreground">Try another barcode, brand, model, or tire size.</p>
          </CardContent>
        </Card>
      ) : isSizeSearch ? (
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-black">Same Size Results</h3>
                <p className="text-sm text-muted-foreground">
                  Showing every product matching {formatTireSize(sameSizeMatches[0].width, sameSizeMatches[0].aspectRatio, sameSizeMatches[0].rimSize)}.
                </p>
              </div>
              <Badge variant="secondary">{sameSizeMatches.length} match{sameSizeMatches.length !== 1 ? "es" : ""}</Badge>
            </div>

            <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sizeBrandGroups.map((group) => (
                <div key={group.brand} className="rounded-md border bg-muted/20 p-3">
                  <div className="text-lg font-black text-primary">{group.brand}</div>
                  <div className="text-sm text-muted-foreground">{group.count} model{group.count !== 1 ? "s" : ""} / {group.stock} stock</div>
                  <div className="mt-1 text-sm font-black text-foreground">From {formatCurrency(group.lowestPrice)}</div>
                </div>
              ))}
            </div>

            <div className="mb-5 overflow-hidden rounded-md border">
              <div className="grid grid-cols-[1fr_1fr_120px_120px_80px] gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <div>Brand</div>
                <div>Model</div>
                <div className="text-right">Discounted</div>
                <div className="text-right">Regular</div>
                <div className="text-right">Stock</div>
              </div>
              <div className="divide-y">
                {sameSizeMatches.map((product) => (
                  <div
                    key={`price-list-${product.id}`}
                    className={`grid grid-cols-[1fr_1fr_120px_120px_80px] gap-3 px-4 py-3 text-sm ${
                      product.stock <= 0 ? "bg-destructive/5 text-destructive" : "bg-background"
                    }`}
                  >
                    <div className="font-black uppercase">{product.brand}</div>
                    <div className="min-w-0 truncate font-semibold">{product.name}</div>
                    <div className="text-right font-black text-foreground">{formatCurrency(product.price)}</div>
                    <div className="text-right font-semibold">{formatCurrency(calculateRegularPrice(product.price))}</div>
                    <div className={`text-right font-black ${product.stock <= 5 ? "text-destructive" : ""}`}>{product.stock}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              {sameSizeMatches.map((product) => (
                <div
                  key={product.id}
                  className={`grid gap-4 rounded-md border p-4 md:grid-cols-[1fr_150px_180px_120px] md:items-center ${
                    product.stock <= 0 ? "border-destructive/40 bg-destructive/5" : "bg-background"
                  }`}
                >
                  <div className="min-w-0">
                    <Badge variant="secondary" className="mb-2 font-mono">
                      {formatTireSize(product.width, product.aspectRatio, product.rimSize)}
                    </Badge>
                    <div className={`text-2xl font-black uppercase tracking-tight ${product.stock <= 0 ? "text-destructive" : "text-primary"}`}>
                      {product.brand}
                    </div>
                    <div className={`text-lg font-bold ${product.stock <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {product.name}
                    </div>
                    {product.barcode && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Barcode className="h-3.5 w-3.5" />
                        {product.barcode}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Regular Price</div>
                    <div className="text-lg font-black">{formatCurrency(calculateRegularPrice(product.price))}</div>
                  </div>

                  <div className="rounded-md border bg-background p-3">
                    <div className="text-xs font-semibold text-muted-foreground">Discounted Price</div>
                    <div className="text-2xl font-black text-foreground">{formatCurrency(product.price)}</div>
                  </div>

                  <div className="text-left md:text-right">
                    <div className="text-xs font-semibold text-muted-foreground">Stock</div>
                    <div className={`text-2xl font-black ${product.stock <= 5 ? "text-destructive" : ""}`}>{product.stock}</div>
                    <div className={`text-xs ${product.stock <= 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                      {product.stock <= 0 ? "Out of stock" : "available"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card className={`shadow-sm ${featuredProduct.stock <= 0 ? "border-destructive/40" : "border-primary/20"}`}>
            <CardContent className="p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div>
                  <Badge variant="secondary" className="mb-3">
                    {formatTireSize(featuredProduct.width, featuredProduct.aspectRatio, featuredProduct.rimSize)}
                  </Badge>
                  <p
                    className={`text-4xl font-black uppercase tracking-tight ${
                      featuredProduct.stock <= 0 ? "text-destructive" : "text-primary"
                    }`}
                  >
                    {featuredProduct.brand}
                  </p>
                  <h3
                    className={`mt-1 text-2xl font-bold tracking-tight ${
                      featuredProduct.stock <= 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {featuredProduct.name}
                  </h3>
                  {featuredProduct.barcode && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Barcode className="h-4 w-4" />
                      {featuredProduct.barcode}
                    </div>
                  )}
                </div>

                <div className="rounded-md border bg-muted/30 p-4 text-right">
                  <div className="text-sm text-muted-foreground">Stock</div>
                  <div className={`text-3xl font-black ${featuredProduct.stock <= 5 ? "text-destructive" : ""}`}>
                    {featuredProduct.stock}
                  </div>
                  <div className={`text-sm ${featuredProduct.stock <= 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                    {featuredProduct.stock <= 0 ? "out of stock" : "available"}
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <div className="rounded-md border bg-background p-6">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" />
                    Discounted Price
                  </div>
                  <div className="mt-2 text-5xl font-black text-foreground">{formatCurrency(featuredProduct.price)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">3.5% less than regular price</div>
                </div>
                <div className="rounded-md border p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Tag className="h-4 w-4" />
                    Regular Price
                  </div>
                  <div className="mt-2 text-3xl font-black">
                    {formatCurrency(calculateRegularPrice(featuredProduct.price))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-bold">Matching Products</h3>
                <Badge variant="secondary">{matches.length}</Badge>
              </div>
              <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {displayedMatches.map((product, index) => (
                  <div
                    key={product.id}
                    className="rounded-md border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`text-sm font-bold ${product.stock <= 0 ? "text-destructive" : ""}`}>
                          {product.brand} {product.name}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">
                            {formatTireSize(product.width, product.aspectRatio, product.rimSize)}
                          </span>
                          <span className={product.stock <= 0 ? "font-semibold text-destructive" : ""}>
                            {product.stock <= 0 ? "Out of stock" : `Stock ${product.stock}`}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-black text-foreground">{formatCurrency(product.price)}</div>
                        <div className="text-xs text-muted-foreground">Discounted</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
