import { useEffect, useState } from "react";
import { Download, RefreshCw, Save, RotateCcw, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { autoCapitalizeValue, notifySettingsUpdated, useAutoCapitalizationEnabled } from "@/lib/autocapitalize";
import { Switch } from "@/components/ui/switch";
import BirSettingsPage from "@/pages/bir-settings";

type PosSettings = {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  companyLogoUrl: string;
  receiptPrefix: string;
  currencySymbol: string;
  lowStockThreshold: number;
  taxRatePercent: number;
  autoCapitalizationEnabled: boolean;
};

type PosUser = {
  id: number;
  username: string;
  role: "admin" | "cashier" | "mechanic" | string;
  hasPin?: boolean;
};

type ProductWithService = {
  id: number;
  name: string;
  brand?: string;
  category?: string;
  serviceUnit?: string | null;
  sortOrder?: number | null;
};

type UpdateStatus = {
  currentVersion?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  updateDir?: string;
  notes?: string;
  message?: string;
  error?: string;
};

type CloudSyncStatus = {
  enabled?: boolean;
  table?: string;
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  productCount?: number;
  error?: string;
};

const defaultSettings: PosSettings = {
  storeName: "WGI POS",
  storeAddress: "",
  storePhone: "",
  companyLogoUrl: "/wheel-got-it-logo.png",
  receiptPrefix: "REC",
  currencySymbol: "PHP",
  lowStockThreshold: 3,
  taxRatePercent: 0,
  autoCapitalizationEnabled: true,
};

const COPYRIGHT_NOTICE = "© 2026 Wheel Got It Tire and Services / Robert Bernard Flores. All rights reserved.";
const PROPRIETARY_NOTICE =
  "WGI POS / Tire Inventory Manager is proprietary software developed for internal tire shop operations. Unauthorized copying, modification, resale, redistribution, or reverse engineering is prohibited.";

async function fetchSettings(): Promise<PosSettings> {
  const response = await fetch("/api/settings", { credentials: "include" });
  if (!response.ok) return defaultSettings;
  return { ...defaultSettings, ...(await response.json()) };
}

async function saveSettings(settings: PosSettings): Promise<PosSettings> {
  const response = await fetch("/api/settings", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Unable to save settings");
  }

  return { ...defaultSettings, ...(await response.json()) };
}

async function fetchUsers(): Promise<PosUser[]> {
  const response = await fetch("/api/users", { credentials: "include" });
  if (!response.ok) return [];
  return response.json();
}

async function createUser(input: { username: string; password: string; role: string }): Promise<PosUser> {
  const response = await fetch("/api/users", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Unable to create account");
  }

  return response.json();
}

async function changePassword(userId: number, password: string): Promise<void> {
  const response = await fetch(`/api/users/${userId}/password`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Unable to change password");
  }
}

async function changePin(userId: number, pin: string): Promise<void> {
  const response = await fetch(`/api/users/${userId}/pin`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Unable to set PIN");
  }
}

async function clearPin(userId: number): Promise<void> {
  const response = await fetch(`/api/users/${userId}/pin`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clearPin: true }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Unable to remove PIN");
  }
}

async function deleteUser(userId: number): Promise<void> {
  const response = await fetch(`/api/users/${userId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Unable to delete account");
  }
}

async function checkForUpdate(): Promise<UpdateStatus> {
  const response = await fetch("/api/desktop-update/check", { credentials: "include" });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error || "Unable to check for updates");
  }

  return body;
}

async function installUpdate(): Promise<void> {
  const response = await fetch("/api/desktop-update/install", {
    method: "POST",
    credentials: "include",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error || "Unable to install update");
  }
}

async function fetchCloudSyncStatus(): Promise<CloudSyncStatus> {
  const response = await fetch("/api/cloud-sync/status", { credentials: "include" });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error || "Unable to check cloud sync");
  }

  return body;
}

async function syncCloudProducts(): Promise<CloudSyncStatus> {
  const response = await fetch("/api/cloud-sync/products", {
    method: "POST",
    credentials: "include",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error || body?.lastError || "Unable to sync cloud products");
  }

  return body;
}

async function fetchServiceProducts(): Promise<ProductWithService[]> {
  const response = await fetch("/api/products", { credentials: "include" });
  if (!response.ok) return [];
  const products = await response.json() as ProductWithService[];
  return products
    .filter((product) => ["services", "service", "other"].includes(String(product.category || "").toLowerCase()))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || left.name.localeCompare(right.name));
}

async function updateProductSortOrder(product: ProductWithService, sortOrder: number): Promise<ProductWithService> {
  const response = await fetch(`/api/products/${product.id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sortOrder }),
  });
  if (!response.ok) throw new Error((await response.json()).error || "Unable to save service order");
  return response.json();
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetMe();
  const [settings, setSettings] = useState<PosSettings>(defaultSettings);
  const [users, setUsers] = useState<PosUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [isCheckingCloudSync, setIsCheckingCloudSync] = useState(false);
  const [isSyncingCloudProducts, setIsSyncingCloudProducts] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [newAccount, setNewAccount] = useState({ username: "", password: "", role: "cashier" });
  const [passwordChange, setPasswordChange] = useState({ userId: 0, password: "" });
  const [pinChange, setPinChange] = useState({ userId: 0, pin: "" });
  const [selfHasPin, setSelfHasPin] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [serviceProducts, setServiceProducts] = useState<ProductWithService[]>([]);
  const [savingServiceOrderId, setSavingServiceOrderId] = useState<number | null>(null);
  const [showServiceOrder, setShowServiceOrder] = useState(false);
  const isAdmin = currentUser?.role === "admin";
  const isMechanic = currentUser?.role === "mechanic";
  const canCreateAccounts = isAdmin || isMechanic;
  const autoCapEnabled = useAutoCapitalizationEnabled();
  const capText = (value: string) => autoCapitalizeValue(value, autoCapEnabled);

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    fetchSettings()
      .then((data) => {
        if (isMounted) setSettings(data);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let isMounted = true;
    fetchCloudSyncStatus()
      .then((status) => {
        if (isMounted) setCloudSyncStatus(status);
      })
      .catch(() => null);
    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let isMounted = true;
    fetchServiceProducts().then((products) => {
      if (isMounted) setServiceProducts(products);
    });
    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!currentUser) return;
    setPasswordChange((current) => ({ ...current, userId: currentUser.id }));
    setPinChange((current) => ({ ...current, userId: currentUser.id }));
    if (currentUser.role === "mechanic") {
      setNewAccount((current) => ({ ...current, role: "mechanic" }));
    }
    fetch("/api/auth/me", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((me) => {
        if (me) setSelfHasPin(Boolean(me.hasPin));
      })
      .catch(() => null);
  }, [currentUser]);

  useEffect(() => {
    if (!canCreateAccounts) return;
    let isMounted = true;
    fetchUsers().then((data) => {
      if (isMounted) setUsers(data);
    });
    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  const update = (key: keyof PosSettings, value: string | boolean) => {
    setSettings((current) => ({
      ...current,
      [key]:
        key === "lowStockThreshold" || key === "taxRatePercent"
          ? Number(value)
          : value,
    }));
  };

  const handleLogoUpload = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Logo not uploaded", description: "Choose a PNG, JPG, or other image file.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSettings((current) => ({ ...current, companyLogoUrl: String(reader.result || "") }));
    };
    reader.onerror = () => {
      toast({ title: "Logo not uploaded", description: "The image could not be read.", variant: "destructive" });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = await saveSettings(settings);
      setSettings(saved);
      queryClient.invalidateQueries({ queryKey: ["pos-settings"] });
      notifySettingsUpdated();
      toast({ title: "Settings saved", description: "Local POS settings were updated." });
    } catch (error) {
      toast({
        title: "Settings not saved",
        description: error instanceof Error ? error.message : "Check the local API.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetDefaults = () => {
    setSettings(defaultSettings);
  };

  const handleCreateAccount = async () => {
    setIsSavingAccount(true);
    try {
      const accountInput = isMechanic ? { ...newAccount, role: "mechanic" } : newAccount;
      const created = await createUser(accountInput);
      setUsers((current) => [...current, created]);
      setNewAccount({ username: "", password: "", role: isMechanic ? "mechanic" : "cashier" });
      toast({ title: "Account created", description: `${created.username} can now sign in as ${created.role}.` });
    } catch (error) {
      toast({
        title: "Account not created",
        description: error instanceof Error ? error.message : "Check the account details.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordChange.userId) return;
    setIsSavingAccount(true);
    try {
      await changePassword(passwordChange.userId, passwordChange.password);
      if (currentUser?.id === passwordChange.userId) {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      }
      setPasswordChange((current) => ({ ...current, password: "" }));
      toast({ title: "Password changed", description: "The new password is active now." });
    } catch (error) {
      toast({
        title: "Password not changed",
        description: error instanceof Error ? error.message : "Check the new password.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleChangePin = async () => {
    if (!pinChange.userId) return;
    setIsSavingAccount(true);
    try {
      await changePin(pinChange.userId, pinChange.pin);
      if (canCreateAccounts) {
        const refreshedUsers = await fetchUsers();
        setUsers(refreshedUsers);
      }
      if (currentUser?.id === pinChange.userId) {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setSelfHasPin(true);
      }
      setPinChange((current) => ({ ...current, pin: "" }));
      toast({ title: "PIN saved", description: "PIN login is now enabled for this account." });
    } catch (error) {
      toast({
        title: "PIN not saved",
        description: error instanceof Error ? error.message : "PIN must be 4 to 6 digits.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleClearPin = async () => {
    if (!pinChange.userId) return;
    setIsSavingAccount(true);
    try {
      await clearPin(pinChange.userId);
      if (canCreateAccounts) {
        const refreshedUsers = await fetchUsers();
        setUsers(refreshedUsers);
      }
      if (currentUser?.id === pinChange.userId) {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        setSelfHasPin(false);
      }
      toast({ title: "PIN removed", description: "This account can no longer sign in with PIN." });
    } catch (error) {
      toast({
        title: "PIN not removed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAccount(false);
    }
  };

  const selectedPinUser = (isAdmin ? users : currentUser ? [currentUser] : []).find((user) => user.id === (pinChange.userId || currentUser?.id || 0));
  const selectedHasPin = isAdmin ? Boolean(selectedPinUser?.hasPin) : selfHasPin;

  const handleDeleteAccount = async (user: PosUser) => {
    if (user.role === "admin" || user.id === currentUser?.id) return;
    setDeletingUserId(user.id);
    try {
      await deleteUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      if (passwordChange.userId === user.id) {
        setPasswordChange((current) => ({ ...current, userId: currentUser?.id || 0 }));
      }
      if (pinChange.userId === user.id) {
        setPinChange((current) => ({ ...current, userId: currentUser?.id || 0 }));
      }
      toast({ title: "Account deleted", description: `${user.username} can no longer sign in.` });
    } catch (error) {
      toast({
        title: "Account not deleted",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleCheckCloudSync = async () => {
    setIsCheckingCloudSync(true);
    try {
      const status = await fetchCloudSyncStatus();
      setCloudSyncStatus(status);
      toast({
        title: status.enabled ? "Cloud sync configured" : "Cloud sync not configured",
        description: status.enabled ? `Using table ${status.table || "wgi_price_products"}.` : "Set Supabase environment variables on the Windows computer.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check the local API.";
      setCloudSyncStatus({ error: message });
      toast({ title: "Cloud sync check failed", description: message, variant: "destructive" });
    } finally {
      setIsCheckingCloudSync(false);
    }
  };

  const handleSyncCloudProducts = async () => {
    setIsSyncingCloudProducts(true);
    try {
      const status = await syncCloudProducts();
      setCloudSyncStatus(status);
      toast({ title: "Products synced", description: `${status.productCount || 0} products were pushed to cloud.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check Supabase settings.";
      setCloudSyncStatus((current) => ({ ...(current || {}), lastError: message, error: message }));
      toast({ title: "Cloud sync failed", description: message, variant: "destructive" });
    } finally {
      setIsSyncingCloudProducts(false);
    }
  };

  const handleCheckForUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const status = await checkForUpdate();
      setUpdateStatus(status);
      toast({
        title: status.updateAvailable ? "Update available" : "No update available",
        description: status.updateAvailable
          ? `Version ${status.latestVersion} is ready to install.`
          : status.message || `Current version ${status.currentVersion || ""} is up to date.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check the update folder.";
      setUpdateStatus({ error: message });
      toast({ title: "Update check failed", description: message, variant: "destructive" });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    setIsInstallingUpdate(true);
    try {
      await installUpdate();
      toast({ title: "Installing update", description: "WGI POS will close while the updater runs." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check the update folder.";
      toast({ title: "Update not installed", description: message, variant: "destructive" });
      setIsInstallingUpdate(false);
    }
  };

  const saveServiceOrder = async (product: ProductWithService, sortOrder: number) => {
    setSavingServiceOrderId(product.id);
    try {
      const saved = await updateProductSortOrder(product, sortOrder);
      setServiceProducts((current) => current
        .map((item) => item.id === saved.id ? { ...item, sortOrder: saved.sortOrder } : item)
        .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || left.name.localeCompare(right.name)));
      toast({ title: "Service tile order saved", description: `${product.name} was moved.` });
    } catch (error) {
      toast({ title: "Order not saved", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSavingServiceOrderId(null);
    }
  };

  const moveService = (product: ProductWithService, direction: -1 | 1) => {
    const index = serviceProducts.findIndex((item) => item.id === product.id);
    const target = serviceProducts[index + direction];
    if (!target) return;
    const productOrder = Number(product.sortOrder || index + 1);
    const targetOrder = Number(target.sortOrder || index + direction + 1);
    setServiceProducts((current) => current.map((item) => {
      if (item.id === product.id) return { ...item, sortOrder: targetOrder };
      if (item.id === target.id) return { ...item, sortOrder: productOrder };
      return item;
    }).sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || left.name.localeCompare(right.name)));
    void saveServiceOrder(product, targetOrder).then(() => saveServiceOrder(target, productOrder));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-1">
          {isAdmin ? "Edit local business, POS, account, and update preferences." : isMechanic ? "Change your password and add mechanic accounts." : "Change your local account password."}
        </p>
      </div>

      {isAdmin && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>License / About</CardTitle>
              <CardDescription>Internal-use software ownership and usage notice.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-semibold">{COPYRIGHT_NOTICE}</p>
              <p className="text-muted-foreground">{PROPRIETARY_NOTICE}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Control how text is formatted when staff enter customer, vehicle, and product details.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-4">
                <div>
                  <div className="font-semibold">Auto Capitalization</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Automatically capitalizes names, addresses, vehicle details, brands, and service names when staff finish typing.
                  </p>
                </div>
                <Switch
                  checked={settings.autoCapitalizationEnabled}
                  onCheckedChange={(checked) => update("autoCapitalizationEnabled", checked)}
                  disabled={isLoading}
                  data-testid="switch-auto-capitalization"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Business Details</CardTitle>
              <CardDescription>Used for local records, receipts, and Excel summaries.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3 md:col-span-2">
                <Label htmlFor="companyLogo">Company logo</Label>
                <div className="flex flex-col gap-4 rounded-md border bg-muted/20 p-4 sm:flex-row sm:items-center">
                  <div className="flex h-24 w-48 items-center justify-center rounded-md border bg-black p-3">
                    {settings.companyLogoUrl ? (
                      <img src={settings.companyLogoUrl} alt="Company logo preview" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-sm text-muted-foreground">No logo</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      id="companyLogo"
                      type="file"
                      accept="image/*"
                      onChange={(event) => handleLogoUpload(event.target.files?.[0])}
                      disabled={isLoading}
                      data-testid="input-company-logo"
                    />
                    <p className="text-xs text-muted-foreground">This logo appears in the sidebar, receipts, and sales invoices after saving settings.</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="storeName">Store name</Label>
                <Input
                  id="storeName"
                  value={settings.storeName}
                  onChange={(event) => update("storeName", event.target.value)}
                  onBlur={() => update("storeName", capText(settings.storeName))}
                  disabled={isLoading}
                  data-testid="input-store-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="storePhone">Phone</Label>
                <Input
                  id="storePhone"
                  value={settings.storePhone}
                  onChange={(event) => update("storePhone", event.target.value)}
                  disabled={isLoading}
                  data-testid="input-store-phone"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="storeAddress">Address</Label>
                <Input
                  id="storeAddress"
                  value={settings.storeAddress}
                  onChange={(event) => update("storeAddress", event.target.value)}
                  onBlur={() => update("storeAddress", capText(settings.storeAddress))}
                  disabled={isLoading}
                  data-testid="input-store-address"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>POS Defaults</CardTitle>
              <CardDescription>Controls local receipt numbering and inventory alerts.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="receiptPrefix">Receipt prefix</Label>
                <Input
                  id="receiptPrefix"
                  value={settings.receiptPrefix}
                  onChange={(event) => update("receiptPrefix", event.target.value.toUpperCase())}
                  disabled={isLoading}
                  data-testid="input-receipt-prefix"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currencySymbol">Currency label</Label>
                <Input
                  id="currencySymbol"
                  value={settings.currencySymbol}
                  onChange={(event) => update("currencySymbol", event.target.value)}
                  disabled={isLoading}
                  data-testid="input-currency-symbol"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lowStockThreshold">Low-stock threshold</Label>
                <Input
                  id="lowStockThreshold"
                  type="number"
                  min={0}
                  value={settings.lowStockThreshold}
                  onChange={(event) => update("lowStockThreshold", event.target.value)}
                  disabled={isLoading}
                  data-testid="input-low-stock-threshold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxRatePercent">Tax rate (%)</Label>
                <Input
                  id="taxRatePercent"
                  type="number"
                  min={0}
                  step="0.01"
                  value={settings.taxRatePercent}
                  onChange={(event) => update("taxRatePercent", event.target.value)}
                  disabled={isLoading}
                  data-testid="input-tax-rate"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={resetDefaults} disabled={isSaving || isLoading}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Defaults
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isLoading} data-testid="btn-save-settings">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Service Tile Order</CardTitle>
                <CardDescription>Arrange Services and Other tiles as they appear in New Sale.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowServiceOrder((current) => !current)}>
                {showServiceOrder ? "Hide" : "Manage Service Order"}
              </Button>
            </CardHeader>
            {showServiceOrder && (
              <CardContent className="space-y-2">
                {serviceProducts.length === 0 ? (
                  <div className="rounded-md border p-4 text-sm text-muted-foreground">No service or other products found.</div>
                ) : serviceProducts.map((product, index) => (
                  <div key={product.id} className="grid gap-3 rounded-md border p-3 text-sm md:grid-cols-[48px_1fr_120px_160px] md:items-center">
                    <div className="font-mono text-muted-foreground">#{index + 1}</div>
                    <div>
                      <div className="font-semibold">{product.brand ? `${product.brand} ` : ""}{product.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{product.category} {product.serviceUnit ? `/ ${product.serviceUnit}` : ""}</div>
                    </div>
                    <Input
                      type="number"
                      value={Number(product.sortOrder || 0)}
                      onChange={(event) => setServiceProducts((current) => current.map((item) => item.id === product.id ? { ...item, sortOrder: Number(event.target.value || 0) } : item))}
                      onBlur={(event) => saveServiceOrder(product, Number(event.target.value || 0))}
                      disabled={savingServiceOrderId === product.id}
                      data-testid={`input-service-sort-${product.id}`}
                    />
                    <div className="flex gap-2 md:justify-end">
                      <Button type="button" variant="outline" size="sm" onClick={() => moveService(product, -1)} disabled={index === 0 || savingServiceOrderId !== null}>Up</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => moveService(product, 1)} disabled={index === serviceProducts.length - 1 || savingServiceOrderId !== null}>Down</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>

          <BirSettingsPage />
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            {isAdmin ? "Admins can change any local account password." : "Change your own local account password."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="passwordUser">Account</Label>
            <select
              id="passwordUser"
              value={passwordChange.userId || currentUser?.id || 0}
              onChange={(event) => setPasswordChange((current) => ({ ...current, userId: Number(event.target.value) }))}
              disabled={!isAdmin}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {(isAdmin ? users : currentUser ? [currentUser] : []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username} ({user.role})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              value={passwordChange.password}
              onChange={(event) => setPasswordChange((current) => ({ ...current, password: event.target.value }))}
              placeholder="Enter new password"
              data-testid="input-change-password"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={isSavingAccount || passwordChange.password.length < 4}>
            Change Password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick PIN Login</CardTitle>
          <CardDescription>
            {isAdmin ? "Set or remove a 4 to 6 digit PIN for any local account." : "Set a PIN for faster sign-in on this station."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="pinUser">Account</Label>
            <select
              id="pinUser"
              value={pinChange.userId || currentUser?.id || 0}
              onChange={(event) => setPinChange((current) => ({ ...current, userId: Number(event.target.value) }))}
              disabled={!isAdmin}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {(isAdmin ? users : currentUser ? [currentUser] : []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.username} ({user.role}){user.hasPin ? " · PIN set" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPin">New PIN</Label>
            <Input
              id="newPin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pinChange.pin}
              onChange={(event) => setPinChange((current) => ({ ...current, pin: event.target.value.replace(/\D/g, "") }))}
              placeholder="4 to 6 digits"
              data-testid="input-change-pin"
            />
          </div>
          <Button onClick={handleChangePin} disabled={isSavingAccount || pinChange.pin.length < 4}>
            Save PIN
          </Button>
          <Button variant="outline" onClick={handleClearPin} disabled={isSavingAccount || !selectedHasPin}>
            Remove PIN
          </Button>
        </CardContent>
      </Card>

      {canCreateAccounts && (
        <Card>
          <CardHeader>
            <CardTitle>Create Account</CardTitle>
            <CardDescription>
              {isAdmin ? "Add Cashier or Mechanic users for this local POS. The built-in admin account is the only admin." : "Add another Mechanic account for this station."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 md:grid-cols-[1fr_1fr_180px_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="accountUsername">Username</Label>
                <Input
                  id="accountUsername"
                  value={newAccount.username}
                  onChange={(event) => setNewAccount((current) => ({ ...current, username: event.target.value }))}
                  data-testid="input-new-account-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountPassword">Password</Label>
                <Input
                  id="accountPassword"
                  type="password"
                  value={newAccount.password}
                  onChange={(event) => setNewAccount((current) => ({ ...current, password: event.target.value }))}
                  data-testid="input-new-account-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountRole">Account type</Label>
                <select
                  id="accountRole"
                  value={newAccount.role}
                  onChange={(event) => setNewAccount((current) => ({ ...current, role: event.target.value }))}
                  disabled={isMechanic}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="select-new-account-role"
                >
                  {isAdmin && <option value="cashier">Cashier</option>}
                  <option value="mechanic">Mechanic</option>
                </select>
              </div>
              <Button
                onClick={handleCreateAccount}
                disabled={isSavingAccount || !newAccount.username.trim() || newAccount.password.length < 4}
                data-testid="btn-create-account"
              >
                Create
              </Button>
            </div>

            {isAdmin && (
            <div className="rounded-md border">
              <div className="grid grid-cols-[1fr_120px_80px_100px] gap-3 border-b px-3 py-2 text-sm font-semibold text-muted-foreground">
                <span>Username</span>
                <span>Role</span>
                <span>ID</span>
                <span className="text-right">Action</span>
              </div>
              {users.map((user) => (
                <div key={user.id} className="grid grid-cols-[1fr_120px_80px_100px] gap-3 px-3 py-2 text-sm items-center">
                  <span className="font-medium">{user.username}</span>
                  <span className="capitalize">{user.role}</span>
                  <span className="text-muted-foreground">{user.id}</span>
                  <div className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteAccount(user)}
                      disabled={user.role === "admin" || user.id === currentUser?.id || deletingUserId === user.id}
                      data-testid={`btn-delete-user-${user.id}`}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      {deletingUserId === user.id ? "Deleting" : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Cloud Price Checker Sync</CardTitle>
            <CardDescription>Push product prices and stock to Supabase for the iPhone Price Checker.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 rounded-md border bg-muted/30 p-4 text-sm md:grid-cols-2">
              <div>
                <div className="font-semibold">Status</div>
                <div className={cloudSyncStatus?.enabled ? "text-primary" : "text-muted-foreground"}>
                  {cloudSyncStatus?.enabled ? "Configured" : "Not configured"}
                </div>
              </div>
              <div>
                <div className="font-semibold">Cloud table</div>
                <div className="text-muted-foreground">{cloudSyncStatus?.table || "wgi_price_products"}</div>
              </div>
              <div>
                <div className="font-semibold">Last success</div>
                <div className="text-muted-foreground">
                  {cloudSyncStatus?.lastSuccessAt ? new Date(cloudSyncStatus.lastSuccessAt).toLocaleString() : "No successful sync yet"}
                </div>
              </div>
              <div>
                <div className="font-semibold">Products synced</div>
                <div className="text-muted-foreground">{cloudSyncStatus?.productCount ?? 0}</div>
              </div>
              {(cloudSyncStatus?.lastError || cloudSyncStatus?.error) && (
                <div className="md:col-span-2 break-words text-destructive">
                  {cloudSyncStatus.error || cloudSyncStatus.lastError}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={handleCheckCloudSync} disabled={isCheckingCloudSync || isSyncingCloudProducts}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {isCheckingCloudSync ? "Checking..." : "Check Cloud Sync"}
              </Button>
              <Button onClick={handleSyncCloudProducts} disabled={!cloudSyncStatus?.enabled || isCheckingCloudSync || isSyncingCloudProducts}>
                <Download className="mr-2 h-4 w-4" />
                {isSyncingCloudProducts ? "Syncing..." : "Sync Products Now"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Software Update</CardTitle>
            <CardDescription>Install newer WGI POS builds from the local update folder.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 rounded-md border bg-muted/30 p-4 text-sm md:grid-cols-2">
              <div>
                <div className="font-semibold">Current version</div>
                <div className="text-muted-foreground">{updateStatus?.currentVersion || "Check for updates to view"}</div>
              </div>
              <div>
                <div className="font-semibold">Latest version</div>
                <div className="text-muted-foreground">{updateStatus?.latestVersion || "No update checked yet"}</div>
              </div>
              <div className="md:col-span-2">
                <div className="font-semibold">Update folder</div>
                <div className="break-all text-muted-foreground">
                  {updateStatus?.updateDir || "C:\\Users\\Admin\\Documents\\WGI-POS\\updates"}
                </div>
              </div>
              {(updateStatus?.message || updateStatus?.error || updateStatus?.notes) && (
                <div className={`md:col-span-2 ${updateStatus?.error ? "text-destructive" : "text-muted-foreground"}`}>
                  {updateStatus.error || updateStatus.notes || updateStatus.message}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={handleCheckForUpdate} disabled={isCheckingUpdate || isInstallingUpdate}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {isCheckingUpdate ? "Checking..." : "Check for Updates"}
              </Button>
              <Button
                onClick={handleInstallUpdate}
                disabled={!updateStatus?.updateAvailable || isCheckingUpdate || isInstallingUpdate}
              >
                <Download className="mr-2 h-4 w-4" />
                {isInstallingUpdate ? "Installing..." : "Install Update"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
