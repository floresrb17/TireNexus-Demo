import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DEMO_NOTICE, isDemoMode } from "@/lib/demo-mode";

const Login = lazy(() => import("@/pages/login"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Inventory = lazy(() => import("@/pages/inventory"));
const Checkout = lazy(() => import("@/pages/checkout"));
const PriceChecker = lazy(() => import("@/pages/price-checker"));
const ActiveClients = lazy(() => import("@/pages/active-clients"));
const CustomersPage = lazy(() => import("@/pages/customers"));
const ReceiptsList = lazy(() => import("@/pages/receipts/index"));
const ReceiptView = lazy(() => import("@/pages/receipts/view"));
const SalesReport = lazy(() => import("@/pages/sales-report"));
const Settings = lazy(() => import("@/pages/settings"));
const LiveWidget = lazy(() => import("@/pages/live-widget"));
const MobileInventory = lazy(() => import("@/pages/mobile-inventory"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const isCloudOnlyPriceChecker = import.meta.env.VITE_PRICE_CHECKER_CLOUD_ONLY === "1";

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-background text-sm text-muted-foreground">
      Loading page...
    </div>
  );
}

function AuthFallback() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background text-muted-foreground">
      Loading...
    </div>
  );
}

function DemoBanner() {
  if (!isDemoMode) return null;
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900">
      {DEMO_NOTICE}
    </div>
  );
}

function ProtectedLayoutPage({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppLayout>
        <DemoBanner />
        <Suspense fallback={<PageFallback />}>
          {children}
        </Suspense>
      </AppLayout>
    </AuthGuard>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useGetMe();
  const [location] = useLocation();
  const pathOnly = location.split("?")[0];

  if (isCloudOnlyPriceChecker && location === "/mobile/price-checker") {
    return <>{children}</>;
  }

  if (isLoading) {
    return <AuthFallback />;
  }

  if (isError || !user) {
    return <Redirect to={`/login?next=${encodeURIComponent(location)}`} />;
  }

  if (user.role === "mechanic" && !["/checkout", "/active-clients", "/price-checker", "/mobile/price-checker", "/settings", "/live-widget"].includes(pathOnly)) {
    return <Redirect to="/checkout?new=1" />;
  }

  if (user.role === "cashier" && pathOnly === "/") {
    return <Redirect to="/checkout?new=1" />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login">
        <Suspense fallback={<AuthFallback />}>
          <Login />
        </Suspense>
      </Route>
      <Route path="/mobile/inventory">
        <AuthGuard>
          <Suspense fallback={<PageFallback />}>
            <MobileInventory />
          </Suspense>
        </AuthGuard>
      </Route>
      <Route path="/live-widget">
        <AuthGuard>
          <Suspense fallback={<PageFallback />}>
            <LiveWidget />
          </Suspense>
        </AuthGuard>
      </Route>
      <Route path="/">
        <ProtectedLayoutPage>
          <Dashboard />
        </ProtectedLayoutPage>
      </Route>
      <Route path="/inventory">
        <ProtectedLayoutPage>
          <Inventory />
        </ProtectedLayoutPage>
      </Route>
      <Route path="/checkout">
        <ProtectedLayoutPage>
          <Checkout />
        </ProtectedLayoutPage>
      </Route>
      <Route path="/price-checker">
        <ProtectedLayoutPage>
          <PriceChecker />
        </ProtectedLayoutPage>
      </Route>
      <Route path="/active-clients">
        <ProtectedLayoutPage>
          <ActiveClients />
        </ProtectedLayoutPage>
      </Route>
      <Route path="/customers">
        <ProtectedLayoutPage>
          <CustomersPage />
        </ProtectedLayoutPage>
      </Route>
      <Route path="/receipts">
        <ProtectedLayoutPage>
          <ReceiptsList />
        </ProtectedLayoutPage>
      </Route>
      <Route path="/receipts/:id">
        <ProtectedLayoutPage>
          <ReceiptView />
        </ProtectedLayoutPage>
      </Route>
      <Route path="/sales-report">
        <ProtectedLayoutPage>
          <SalesReport />
        </ProtectedLayoutPage>
      </Route>
      <Route path="/settings">
        <ProtectedLayoutPage>
          <Settings />
        </ProtectedLayoutPage>
      </Route>
      <Route>
        <ProtectedLayoutPage>
          <NotFound />
        </ProtectedLayoutPage>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
