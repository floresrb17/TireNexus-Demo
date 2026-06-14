import { useEffect, useMemo, useState } from "react";
import { CarFront, History, ReceiptText, Trash2, UserRound } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

type Vehicle = {
  carMaker: string;
  carModel: string;
  plateNumber: string;
  lastOdometer?: string;
  lastServiceAt?: string | null;
  historyCount?: number;
};

type CustomerProfile = {
  id: number;
  customerName: string;
  customerContact: string;
  vehicles: Vehicle[];
  updatedAt: string;
};

type HistoryEntry = {
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

async function fetchCustomerProfiles(): Promise<CustomerProfile[]> {
  const response = await fetch("/api/customer-profiles", { credentials: "include" });
  if (!response.ok) throw new Error((await response.json()).error || "Unable to load customer profiles");
  return response.json();
}

async function fetchVehicleHistory(plateNumber: string, customerName = ""): Promise<HistoryEntry[]> {
  const params = new URLSearchParams();
  if (plateNumber) params.set("plateNumber", plateNumber);
  if (customerName) params.set("customerName", customerName);
  const response = await fetch(`/api/vehicle-history?${params.toString()}`, { credentials: "include" });
  if (!response.ok) throw new Error((await response.json()).error || "Unable to load history");
  return response.json();
}

async function removeCustomerProfile(profileId: number): Promise<void> {
  const response = await fetch(`/api/customer-profiles/${profileId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Unable to remove customer profile");
  }
}

function vehicleTitle(vehicle: Vehicle) {
  return [vehicle.carMaker, vehicle.carModel].filter(Boolean).join(" ") || vehicle.plateNumber || "Vehicle";
}

export default function CustomersPage() {
  const { toast } = useToast();
  const { data: currentUser } = useGetMe();
  const isAdmin = currentUser?.role === "admin";
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [selected, setSelected] = useState<{ profile: CustomerProfile; vehicle?: Vehicle } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [removingProfileId, setRemovingProfileId] = useState<number | null>(null);

  useEffect(() => {
    fetchCustomerProfiles()
      .then((rows) => {
        setProfiles(rows);
        const first = rows[0];
        if (first) setSelected({ profile: first, vehicle: first.vehicles[0] });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setHistoryLoading(true);
    fetchVehicleHistory(selected.vehicle?.plateNumber || "", selected.profile.customerName)
      .then(setHistory)
      .finally(() => setHistoryLoading(false));
  }, [selected]);

  const filteredProfiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((profile) =>
      profile.customerName.toLowerCase().includes(q) ||
      profile.customerContact.toLowerCase().includes(q) ||
      profile.vehicles.some((vehicle) =>
        [vehicle.carMaker, vehicle.carModel, vehicle.plateNumber].some((value) => String(value || "").toLowerCase().includes(q))
      )
    );
  }, [profiles, search]);

  const historySummary = useMemo(() => {
    if (!history.length) return null;
    const totalSpent = history.reduce((sum, entry) => sum + Number(entry.totalAmount || 0), 0);
    const totalVisits = history.length;
    const lastVisit = history[0]?.date;
    const tireCount = history.reduce((sum, entry) => sum + entry.products.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0);
    const serviceCount = history.reduce((sum, entry) => sum + entry.services.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0);
    return { totalSpent, totalVisits, lastVisit, tireCount, serviceCount };
  }, [history]);

  const handleRemoveProfile = async (profile: CustomerProfile) => {
    if (!isAdmin) return;
    const label = profile.customerName || "this customer";
    if (!window.confirm(`Remove ${label} from customer history? Past sales stay in reports, but this profile will no longer appear.`)) return;
    setRemovingProfileId(profile.id);
    try {
      await removeCustomerProfile(profile.id);
      const nextProfiles = profiles.filter((item) => item.id !== profile.id);
      setProfiles(nextProfiles);
      if (selected?.profile.id === profile.id) {
        const next = nextProfiles[0];
        setSelected(next ? { profile: next, vehicle: next.vehicles[0] } : null);
      }
      toast({ title: "Customer removed", description: `${label} was removed from customer history.` });
    } catch (error) {
      toast({
        title: "Customer not removed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRemovingProfileId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Customer Profiles</h2>
        <p className="mt-1 text-muted-foreground">View customer, vehicle, receipt, invoice, and service history from existing transactions.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4" /> Customers</CardTitle>
            <CardDescription>{profiles.length} profile{profiles.length === 1 ? "" : "s"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, plate, or vehicle..." />
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading customers...</div>
            ) : filteredProfiles.length === 0 ? (
              <div className="rounded-md border p-5 text-center text-sm text-muted-foreground">No customer profiles yet.</div>
            ) : (
              <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
                {filteredProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelected({ profile, vehicle: profile.vehicles[0] })}
                    className={`w-full rounded-md border p-3 text-left transition hover:border-primary/50 ${selected?.profile.id === profile.id ? "border-primary bg-primary/5" : "bg-card"}`}
                  >
                    <div className="font-bold">{profile.customerName || "Unnamed customer"}</div>
                    <div className="text-xs text-muted-foreground">{profile.customerContact || "No contact number"}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {profile.vehicles.slice(0, 3).map((vehicle) => (
                        <Badge key={vehicle.plateNumber || vehicleTitle(vehicle)} variant="secondary">{vehicle.plateNumber || vehicleTitle(vehicle)}</Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!selected ? (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">No service history yet for this customer.</CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>{selected.profile.customerName || "Unnamed customer"}</CardTitle>
                    <CardDescription>{selected.profile.customerContact || "No contact number saved"}</CardDescription>
                  </div>
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemoveProfile(selected.profile)}
                      disabled={removingProfileId === selected.profile.id}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {removingProfileId === selected.profile.id ? "Removing..." : "Remove Customer"}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {historySummary && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Visits</div>
                        <div className="mt-1 text-2xl font-black">{historySummary.totalVisits}</div>
                      </div>
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Spent</div>
                        <div className="mt-1 text-2xl font-black text-primary">{formatCurrency(historySummary.totalSpent)}</div>
                      </div>
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tires / Products</div>
                        <div className="mt-1 text-2xl font-black">{historySummary.tireCount}</div>
                      </div>
                      <div className="rounded-md border bg-muted/20 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Services</div>
                        <div className="mt-1 text-2xl font-black">{historySummary.serviceCount}</div>
                      </div>
                    </div>
                  )}
                  <div className="grid gap-2 md:grid-cols-2">
                    {selected.profile.vehicles.length === 0 ? (
                      <div className="rounded-md border p-4 text-sm text-muted-foreground">No linked vehicles yet.</div>
                    ) : selected.profile.vehicles.map((vehicle) => (
                      <Button
                        key={vehicle.plateNumber || vehicleTitle(vehicle)}
                        type="button"
                        variant={selected.vehicle?.plateNumber === vehicle.plateNumber ? "default" : "outline"}
                        className="h-auto justify-start p-3 text-left"
                        onClick={() => setSelected({ profile: selected.profile, vehicle })}
                      >
                        <CarFront className="mr-3 h-4 w-4 shrink-0" />
                        <span>
                          <span className="block font-bold">{vehicleTitle(vehicle)}</span>
                          <span className="block text-xs opacity-80">{vehicle.plateNumber || "No plate"} · {vehicle.historyCount || 0} history item(s)</span>
                        </span>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Service History</CardTitle>
                  <CardDescription>{selected.vehicle ? vehicleTitle(selected.vehicle) : "All known customer history"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {historyLoading ? (
                    <div className="text-sm text-muted-foreground">Loading history...</div>
                  ) : history.length === 0 ? (
                    <div className="rounded-md border p-8 text-center text-muted-foreground">No service history yet for this customer.</div>
                  ) : history.map((entry) => (
                    <div key={entry.id} className="rounded-md border p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="font-bold">{[entry.carMaker, entry.carModel].filter(Boolean).join(" ") || entry.plateNumber || "Vehicle"}</div>
                          <div className="text-sm text-muted-foreground">{entry.customerName || selected.profile.customerName} · {entry.plateNumber || "No plate"}</div>
                          <div className="text-sm text-muted-foreground">{formatDate(entry.date)}</div>
                          {entry.odometer && <div className="text-sm">Odometer: {entry.odometer} {entry.odometerUnit || ""}</div>}
                          {entry.mechanic && <div className="text-sm">Mechanic: {entry.mechanic}</div>}
                        </div>
                        <div className="text-left md:text-right">
                          <Badge variant="outline" className="capitalize">{entry.status}</Badge>
                          <div className="mt-2 text-lg font-black text-primary">{formatCurrency(entry.totalAmount)}</div>
                          <div className="text-xs text-muted-foreground">{entry.invoiceNo ? `Invoice ${entry.invoiceNo}` : entry.receiptNumber || "No receipt"}</div>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-md bg-muted/30 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Products / Tires</div>
                          <div className="mt-2 space-y-1 text-sm">
                            {entry.products.length ? entry.products.map((item, index) => (
                              <div key={`${entry.id}-product-${index}`} className="flex justify-between gap-3">
                                <span>{item.quantity}x {item.name}{item.size ? ` (${item.size})` : ""}</span>
                                <span className="font-medium">{formatCurrency(item.unitPrice * item.quantity)}</span>
                              </div>
                            )) : <div className="text-muted-foreground">No products</div>}
                          </div>
                        </div>
                        <div className="rounded-md bg-muted/30 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Services</div>
                          <div className="mt-2 space-y-1 text-sm">
                            {entry.services.length ? entry.services.map((item, index) => (
                              <div key={`${entry.id}-service-${index}`} className="flex justify-between gap-3">
                                <span>{item.quantity}x {item.name}</span>
                                <span className="font-medium">{formatCurrency(item.unitPrice * item.quantity)}</span>
                              </div>
                            )) : <div className="text-muted-foreground">No services</div>}
                          </div>
                        </div>
                      </div>
                      {entry.notes && (
                        <div className="mt-3 rounded-md border bg-background p-3 text-sm text-muted-foreground">
                          <ReceiptText className="mr-2 inline h-4 w-4" />{entry.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
