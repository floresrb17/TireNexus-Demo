import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";

type TicketItem = {
  productName: string;
  tireSize?: string;
  category?: string;
  quantity: number;
};

type ServiceTicket = {
  id: string;
  status: "active" | "completed" | "canceled";
  customerName?: string;
  carMaker?: string;
  carModel?: string;
  plateNumber?: string;
  totalAmount: number;
  items: TicketItem[];
  createdAt: string;
};

async function fetchServiceTickets(): Promise<ServiceTicket[]> {
  const response = await fetch("/api/service-tickets", { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load active clients");
  return response.json();
}

function ticketTitle(ticket: ServiceTicket): string {
  return [ticket.carMaker, ticket.carModel].filter(Boolean).join(" ") || ticket.plateNumber || "Unit not recorded";
}

function serviceList(ticket: ServiceTicket): string {
  const services = ticket.items
    .filter((item) => {
      const category = String(item.category || "").toLowerCase();
      return category === "services" || /^service\b/i.test(String(item.tireSize || ""));
    })
    .map((item) => item.productName)
    .filter(Boolean);
  return services.length ? services.join(", ") : "No services listed";
}

function itemList(ticket: ServiceTicket): string {
  const items = ticket.items
    .filter((item) => {
      const category = String(item.category || "").toLowerCase();
      return category !== "services" && !/^service\b/i.test(String(item.tireSize || ""));
    })
    .map((item) => `${item.quantity || 1}x ${item.productName}`)
    .filter(Boolean);
  return items.length ? items.join(", ") : "No items listed";
}

export default function LiveWidget() {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["service-tickets", "live-widget"],
    queryFn: fetchServiceTickets,
    refetchInterval: 3000,
  });

  const activeTickets = tickets.filter((ticket) => ticket.status === "active");

  useEffect(() => {
    document.title = activeTickets.length > 0 ? "WGI Live Clients" : "WGI Live Clients - Empty";
  }, [activeTickets.length]);

  if (!isLoading && activeTickets.length === 0) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-950 p-3 text-slate-50">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold">
          <UsersRound className="h-4 w-4 text-blue-400" />
          Live Clients
        </div>
        <Badge className="bg-blue-600 text-white">{activeTickets.length}</Badge>
      </div>

      {isLoading ? (
        <div className="rounded-md border border-slate-800 p-4 text-sm text-slate-400">Loading...</div>
      ) : (
        <div className="space-y-2">
          {activeTickets.slice(0, 6).map((ticket) => (
            <section key={ticket.id} className="rounded-md border border-slate-800 bg-slate-900 p-3 shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black">{ticketTitle(ticket)}</div>
                  <div className="truncate text-xs text-slate-400">{ticket.plateNumber || ticket.id}</div>
                </div>
                <div className="text-right text-xs font-bold text-blue-300">{formatCurrency(ticket.totalAmount)}</div>
              </div>
              <div className="mt-2 rounded border border-slate-800 bg-slate-950/70 p-2 text-xs">
                <div className="font-semibold text-slate-300">Services</div>
                <div className="mt-1 text-slate-400">{serviceList(ticket)}</div>
              </div>
              <div className="mt-2 rounded border border-slate-800 bg-slate-950/70 p-2 text-xs">
                <div className="font-semibold text-slate-300">Items</div>
                <div className="mt-1 text-slate-400">{itemList(ticket)}</div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>{ticket.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} item(s)</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(ticket.createdAt)}
                </span>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
