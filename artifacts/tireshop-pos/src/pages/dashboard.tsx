import { 
  useGetDashboardSummary, 
  useGetRecentSales,
  useGetSalesByPayment
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { AlertTriangle, TrendingUp, ShoppingCart, PackagePlus, Trophy, UsersRound, Clock, ExternalLink, Disc } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

type WeeklyBestSeller = {
  productId: number | null;
  productName: string;
  brand: string;
  tireSize: string;
  quantity: number;
  revenue: number;
};

type WeeklyBestSellerResult = {
  startDate: string;
  endDate: string;
  items: WeeklyBestSeller[];
};

type ActiveClient = {
  id: string;
  customerName: string;
  carMaker: string;
  carModel: string;
  plateNumber: string;
  paymentMethod: string;
  subtotal: number;
  discountTotal: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  status: "active" | "completed";
  items: Array<{
    productName: string;
    brand: string;
    tireSize: string;
    category?: string;
    serviceUnit?: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
};

async function fetchWeeklyBestSellers(): Promise<WeeklyBestSellerResult> {
  const response = await fetch("/api/dashboard/best-sellers-week", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Unable to load weekly best sellers");
  }
  return response.json();
}

async function fetchActiveClients(): Promise<ActiveClient[]> {
  const response = await fetch("/api/service-tickets", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Unable to load active clients");
  }
  return response.json();
}

function unitLabel(client: ActiveClient): string {
  return [client.carMaker, client.carModel].filter(Boolean).join(" ") || client.plateNumber || "Unit not recorded";
}

function serviceItems(client: ActiveClient) {
  return client.items.filter((item) => {
    const category = String(item.category || "").toLowerCase();
    return category === "services" || /^service\b/i.test(String(item.tireSize || ""));
  });
}

function serviceLabel(client: ActiveClient): string {
  const services = serviceItems(client).map((item) => `${item.quantity || 1}x ${item.productName}`).filter(Boolean);
  if (services.length === 0) return "No services listed";
  return services.join(", ");
}

function availedItemLabel(client: ActiveClient): string {
  const items = client.items
    .filter((item) => {
      const category = String(item.category || "").toLowerCase();
      return category !== "services" && !/^service\b/i.test(String(item.tireSize || ""));
    })
    .map((item) => `${item.quantity || 1}x ${[item.brand, item.productName].filter(Boolean).join(" ")}`)
    .filter(Boolean);
  return items.length ? items.join(", ") : "No items listed";
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: recentSales, isLoading: loadingSales } = useGetRecentSales();
  const { data: paymentStats, isLoading: loadingPayments } = useGetSalesByPayment();
  const { data: bestSellers, isLoading: loadingBestSellers } = useQuery({
    queryKey: ["dashboard", "best-sellers-week"],
    queryFn: fetchWeeklyBestSellers,
  });
  const { data: activeClients, isLoading: loadingActiveClients } = useQuery({
    queryKey: ["dashboard", "active-clients"],
    queryFn: fetchActiveClients,
    refetchInterval: 10000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const statCards = [
    {
      title: "Today's Revenue",
      icon: TrendingUp,
      value: loadingSummary ? null : formatCurrency(summary?.totalRevenueToday || 0),
      href: "/receipts",
      accent: "text-primary",
      description: "View today's sales",
      testId: "text-revenue-today",
    },
    {
      title: "Tires Sold Today",
      icon: Disc,
      value: loadingSummary ? null : String(summary?.tiresSoldToday || 0),
      href: "/sales-report",
      accent: "",
      description: "View sales report",
      testId: "text-tires-sold-today",
    },
    {
      title: "Low Stock Alerts",
      icon: AlertTriangle,
      value: loadingSummary ? null : String(summary?.lowStockCount || 0),
      href: "/inventory?lowStock=true",
      accent: summary?.lowStockCount ? "text-destructive" : "",
      iconClass: summary?.lowStockCount ? "text-destructive" : "text-muted-foreground",
      description: "View low stock items",
      testId: "text-low-stock",
    },
  ];

  const actionCards = [
    {
      title: "New Sale",
      description: "Open checkout",
      icon: ShoppingCart,
      href: "/checkout?new=1",
      testId: "card-new-sale",
    },
    {
      title: "Delivery / Replenishment",
      description: "Receive inventory",
      icon: PackagePlus,
      href: "/inventory?delivery=true",
      testId: "card-delivery-replenishment",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">Overview of today's shop activity.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5"
              onClick={() => setLocation(card.href)}
              data-testid={`card-stat-${card.testId}`}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon className={`h-4 w-4 ${card.iconClass ?? "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                {card.value === null ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <>
                    <div className={`text-2xl font-bold ${card.accent}`} data-testid={card.testId}>
                      {card.value}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{card.description} →</p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {actionCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className="cursor-pointer border-primary/20 bg-primary/5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              onClick={() => setLocation(card.href)}
              data-testid={card.testId}
            >
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{card.description}</p>
                  <h3 className="mt-1 text-2xl font-black tracking-tight">{card.title}</h3>
                </div>
                <div className="rounded-md bg-primary p-3 text-primary-foreground">
                  <Icon className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card data-testid="widget-live-active-clients">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-primary" />
              Live Active Clients
              <Badge variant="secondary">{activeClients?.length || 0}</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">Open service tickets refresh every 2 seconds.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/active-clients")} data-testid="btn-open-active-clients">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Page
          </Button>
        </CardHeader>
        <CardContent>
          {loadingActiveClients ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}
            </div>
          ) : activeClients?.length ? (
            <div className="grid gap-4">
              {activeClients.map((client) => (
                <div
                  key={client.id}
                  className="flex cursor-pointer flex-col gap-4 rounded-md border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
                  onClick={() => setLocation(`/active-clients?ticket=${encodeURIComponent(client.id)}`)}
                  data-testid={`row-active-client-${client.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-bold">{unitLabel(client)}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{client.plateNumber || "Plate not recorded"}</div>
                    </div>
                    <Badge variant="default">{client.status}</Badge>
                  </div>
                  <div className="grid gap-3 text-sm md:grid-cols-[160px_1fr_1fr]">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Ticket</div>
                      <div className="font-mono text-xs">{client.id}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Services</div>
                      <div className="font-medium">{serviceLabel(client)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Items</div>
                      <div className="font-medium">{availedItemLabel(client)}</div>
                      <div className="text-xs text-muted-foreground">{client.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} piece(s)</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">Started</div>
                      <div className="flex items-center gap-1 font-medium">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatDate(client.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border p-6 text-center text-muted-foreground">
              No active clients right now.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSales ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSales?.map((sale) => (
                    <TableRow
                      key={sale.id}
                      className="cursor-pointer hover:bg-muted/60"
                      onClick={() => setLocation(`/receipts/${sale.id}`)}
                      data-testid={`row-recent-sale-${sale.id}`}
                    >
                      <TableCell className="font-medium">{sale.receiptNumber}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(sale.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{sale.paymentMethod}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(sale.totalAmount)}</TableCell>
                    </TableRow>
                  ))}
                  {recentSales?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No sales yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Payment Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPayments ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {paymentStats?.map((stat) => (
                  <div key={stat.paymentMethod} className="flex items-center" data-testid={`stat-payment-${stat.paymentMethod}`}>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none capitalize">{stat.paymentMethod}</p>
                      <p className="text-sm text-muted-foreground">
                        {stat.count} transaction{stat.count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="font-medium">
                      {formatCurrency(stat.total)}
                    </div>
                  </div>
                ))}
                {paymentStats?.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">No data available</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Weekly Best Sellers
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Monday to Saturday{bestSellers?.startDate && bestSellers?.endDate ? ` · ${bestSellers.startDate} to ${bestSellers.endDate}` : ""}
          </p>
        </CardHeader>
        <CardContent>
          {loadingBestSellers ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}
            </div>
          ) : bestSellers?.items.length ? (
            <div className="grid gap-3">
              {bestSellers.items.map((item, index) => (
                <div key={`${item.productId}-${item.tireSize}-${index}`} className="grid gap-3 rounded-md border p-4 md:grid-cols-[56px_1fr_130px_150px] md:items-center">
                  <div className="text-2xl font-black text-primary">#{index + 1}</div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-bold">
                      {item.brand} {item.productName}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{item.tireSize || "No tire size recorded"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Sold</div>
                    <div className="text-xl font-black">{item.quantity}</div>
                  </div>
                  <div className="md:text-right">
                    <div className="text-xs font-semibold text-muted-foreground">Revenue</div>
                    <div className="text-lg font-bold">{formatCurrency(item.revenue)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border p-6 text-center text-muted-foreground">
              No products sold yet for this Monday to Saturday period.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
