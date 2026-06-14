export function formatTireSize(width: number, aspectRatio: number, rimSize: number): string {
  if (!Number(aspectRatio || 0)) return `${width} R${rimSize}`;
  return `${width}/${aspectRatio}R${rimSize}`;
}

export function formatCurrency(amount: number): string {
  return "₱" + new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function formatPriceDisplay(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "";
  return formatCurrency(amount);
}

export function calculateRegularPrice(discountedPrice: number): number {
  return Number((discountedPrice * 1.035).toFixed(2));
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(dateString));
}

export function formatDateOnly(dateString: string): string {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(dateString));
}

export function formatDateTimeFormal(dateString: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(dateString));
}
