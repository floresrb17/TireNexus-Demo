import { useGetMe, useListSales } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { formatCurrency, formatDate } from "@/lib/format";
import { exportSalesReport } from "@/lib/export";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Eye, Download, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListSalesQueryKey, type Sale } from "@workspace/api-client-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export default function ReceiptsList() {
  const { data: sales = [], isLoading } = useListSales();
  const { data: user } = useGetMe();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canDelete = user?.role === "admin";

  const handleExport = async () => {
    try {
      await exportSalesReport(sales);
      toast({ title: "Sales report downloaded", description: "Check your Downloads folder." });
    } catch {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const viewSale = (sale: Sale) => {
    setLocation(`/receipts/${sale.id}`);
  };

  const printSale = (sale: Sale) => {
    window.open(`/receipts/${sale.id}?print=1`, "_blank", "noopener,noreferrer");
  };

  const deleteSale = async (sale: Sale) => {
    if (!canDelete) return;
    const confirmed = window.confirm(`Delete receipt ${sale.receiptNumber}? This cannot be undone.`);
    if (!confirmed) return;

    const response = await fetch(`/api/sales/${sale.id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      toast({ title: "Sale not deleted", description: "Check the local API.", variant: "destructive" });
      return;
    }

    queryClient.invalidateQueries({ queryKey: getListSalesQueryKey() });
    toast({ title: "Sale deleted", description: `${sale.receiptNumber} was removed.` });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales History</h2>
          <p className="text-muted-foreground mt-1">View past transactions and receipts.</p>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={isLoading || sales.length === 0}
          className="gap-2 shrink-0"
          data-testid="btn-export-sales"
        >
          <Download className="h-4 w-4" />
          Export to Excel
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>All Sales</CardTitle>
          <CardDescription>
            {isLoading ? "Loading…" : `${sales.length} transaction${sales.length !== 1 ? "s" : ""} total — all records are stored in the database.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt No.</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading sales...</TableCell></TableRow>
              ) : sales.map(sale => (
                <ContextMenu key={sale.id}>
                  <ContextMenuTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => viewSale(sale)} data-testid={`row-sale-${sale.id}`}>
                      <TableCell className="font-mono font-medium">{sale.receiptNumber}</TableCell>
                      <TableCell>{formatDate(sale.createdAt)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{sale.paymentMethod}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={sale.status === 'completed' ? 'default' : 'secondary'} className="capitalize bg-green-500 hover:bg-green-600 text-white">
                          {sale.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(sale.totalAmount)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); viewSale(sale); }}>
                          <Eye className="h-4 w-4 mr-2" /> View
                        </Button>
                      </TableCell>
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuLabel>{sale.receiptNumber}</ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => viewSale(sale)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View Receipt
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => printSale(sale)}>
                      <Printer className="mr-2 h-4 w-4" />
                      Print Receipt
                    </ContextMenuItem>
                    {canDelete && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem className="text-destructive focus:text-destructive" onSelect={() => deleteSale(sale)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Sale
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              ))}
              {sales.length === 0 && !isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No sales found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
