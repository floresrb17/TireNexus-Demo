import { Link, useLocation } from "wouter";
import { LayoutDashboard, Package, ShoppingCart, Receipt, LogOut, Settings, ScanBarcode, FileBarChart, UsersRound } from "lucide-react";
import { useGetMe, useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/demo-mode";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

type PosSettings = {
  storeName?: string;
  companyLogoUrl?: string;
};

const COPYRIGHT_NOTICE = isDemoMode
  ? "© 2026 Robert Flores. Demo build for portfolio purposes only."
  : "© 2026 Wheel Got It Tire and Services / Robert Bernard Flores. All rights reserved.";

async function fetchSettings(): Promise<PosSettings> {
  const response = await fetch("/api/settings", { credentials: "include" });
  if (!response.ok) return {};
  return response.json();
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const appVersion = import.meta.env.VITE_APP_VERSION;
  const { data: settings } = useQuery({
    queryKey: ["pos-settings"],
    queryFn: fetchSettings,
    staleTime: 30_000,
  });
  const companyLogoUrl = settings?.companyLogoUrl || "/wheel-got-it-logo.png";

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(getGetMeQueryKey(), null);
        setLocation("/login");
      }
    });
  };

  const rawNavItems: NavItem[] = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "New Sale", href: "/checkout?new=1", icon: ShoppingCart },
    { label: "Active Clients", href: "/active-clients", icon: UsersRound },
    { label: "Customers", href: "/customers", icon: UsersRound },
    { label: "Price Checker", href: "/price-checker", icon: ScanBarcode },
    { label: "Inventory", href: "/inventory", icon: Package },
    { label: "Receipts", href: "/receipts", icon: Receipt },
    { label: "Sales Report", href: "/sales-report", icon: FileBarChart },
    { label: user?.role === "admin" ? "Settings" : "Change Password", href: "/settings", icon: Settings },
  ];
  const navItems = rawNavItems.filter((item) => {
    if (item.adminOnly && user?.role !== "admin") return false;
    if (user?.role === "mechanic") {
      const itemPath = item.href.split("?")[0];
      return itemPath === "/checkout" || itemPath === "/active-clients" || itemPath === "/price-checker" || itemPath === "/settings";
    }
    return true;
  });

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border shrink-0">
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex h-12 items-center">
            <img
              src={companyLogoUrl}
              alt={settings?.storeName || "Company logo"}
              className="max-h-12 max-w-[180px] object-contain"
              data-testid="img-sidebar-company-logo"
            />
          </div>
          <p className="text-sm mt-1 text-sidebar-foreground/60">{user?.username} ({user?.role})</p>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const itemPath = item.href.split("?")[0];
            const isActive = location === item.href || (itemPath !== "/" && location.startsWith(itemPath));
            const Icon = item.icon;
            return (
              <Link 
                key={item.href} 
                href={item.href} 
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${isActive ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm" : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground font-medium text-sidebar-foreground/80"}`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={handleLogout} data-testid="btn-logout">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
          <div className="mt-3 px-3 text-[11px] font-medium text-sidebar-foreground/35" data-testid="text-app-version">
            v{appVersion}
          </div>
          <div className="mt-2 px-3 text-[10px] leading-snug text-sidebar-foreground/35" data-testid="text-copyright-notice">
            {COPYRIGHT_NOTICE}
          </div>
        </div>
      </aside>
      
      <main className="flex-1 flex flex-col h-full overflow-y-auto bg-muted/30">
        <div className="flex-1 p-8 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
