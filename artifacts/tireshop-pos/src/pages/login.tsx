import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { isDemoMode } from "@/lib/demo-mode";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertCircle, KeyRound, LockKeyhole, UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";

const passwordLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginMode = "password" | "pin";

async function loginRequest(payload: { username: string; password?: string; pin?: string }) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Login failed");
  }
  return body as { user: { id: number; username: string; role: string; hasPin?: boolean } };
}

export default function Login() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>("password");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sharedUsername, setSharedUsername] = useState("");
  const [pinValue, setPinValue] = useState("");

  const { data: user, isLoading: authLoading } = useGetMe({
    query: {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  });

  const nextPath = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
  const safeNextPath = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : null;

  useEffect(() => {
    if (!user) return;
    setLocation(safeNextPath || (user.role === "mechanic" || user.role === "cashier" ? "/checkout?new=1" : "/"));
  }, [safeNextPath, setLocation, user]);

  const passwordForm = useForm<z.infer<typeof passwordLoginSchema>>({
    resolver: zodResolver(passwordLoginSchema),
    mode: "onSubmit",
    defaultValues: { username: "", password: "" },
  });

  const onPasswordSubmit = async (values: z.infer<typeof passwordLoginSchema>) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const data = await loginRequest(values);
      setSharedUsername(values.username);
      await queryClient.invalidateQueries();
      setLocation(safeNextPath || (data.user.role === "mechanic" || data.user.role === "cashier" ? "/checkout?new=1" : "/"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onPinSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const username = sharedUsername.trim();
    const pin = pinValue.trim();

    if (!username) {
      setError("Username is required");
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN must be 4 to 6 digits");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await loginRequest({ username, pin });
      await queryClient.invalidateQueries();
      setLocation(safeNextPath || (data.user.role === "mechanic" || data.user.role === "cashier" ? "/checkout?new=1" : "/"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (mode: LoginMode) => {
    if (mode === "pin") {
      const currentUsername = passwordForm.getValues("username");
      if (currentUsername) setSharedUsername(currentUsername);
    } else {
      passwordForm.setValue("username", sharedUsername);
    }
    setLoginMode(mode);
    setError(null);
  };

  if (authLoading || user) {
    return <div className="min-h-screen flex items-center justify-center bg-[#070707] text-zinc-300">Loading...</div>;
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#070707] p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,#4a3a15_0%,transparent_35%),linear-gradient(135deg,#050505_0%,#111111_45%,#050505_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f5b938]/10" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[390px] w-[390px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />

      <Card className="relative z-10 w-full max-w-[460px] overflow-hidden border border-[#f7bd3f]/35 bg-[#0d0d0d]/95 text-white shadow-2xl shadow-black/60">
        <div className="h-1.5 bg-gradient-to-r from-[#f7bd3f] via-[#ffe29a] to-[#f7bd3f]" />
        <CardHeader className="items-center space-y-4 px-8 pt-8 text-center">
          <div className="flex w-full justify-center rounded-md bg-black px-5 py-4 ring-1 ring-[#f7bd3f]/20">
            <img
              src="/wheel-got-it-logo.png"
              alt="Wheel Got It Tires & Services"
              className="h-auto w-full max-w-[360px]"
            />
          </div>
          <CardDescription className="text-sm text-zinc-300">
            {isDemoMode ? "Portfolio demo — use admin / demo1234, cashier / demo1234, or mechanic / demo1234." : "Sign in to access the tire shop point of sale."}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-md border border-zinc-800 bg-zinc-950/80 p-1">
            <Button
              type="button"
              variant={loginMode === "password" ? "default" : "ghost"}
              className={loginMode === "password" ? "bg-[#f7bd3f] text-black hover:bg-[#ffd36b]" : "text-zinc-300 hover:bg-zinc-900"}
              onClick={() => switchMode("password")}
            >
              Password
            </Button>
            <Button
              type="button"
              variant={loginMode === "pin" ? "default" : "ghost"}
              className={loginMode === "pin" ? "bg-[#f7bd3f] text-black hover:bg-[#ffd36b]" : "text-zinc-300 hover:bg-zinc-900"}
              onClick={() => switchMode("pin")}
            >
              PIN
            </Button>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6 border-red-500/40 bg-red-950/60 text-red-100">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loginMode === "password" ? (
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-200">Username</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <UserRound className="absolute left-3 top-3 h-4 w-4 text-[#f7bd3f]" />
                          <Input
                            placeholder="admin"
                            {...field}
                            onChange={(event) => {
                              field.onChange(event);
                              setSharedUsername(event.target.value);
                            }}
                            className="h-11 border-zinc-700 bg-zinc-950 pl-10 text-white placeholder:text-zinc-500 focus-visible:ring-[#f7bd3f]"
                            data-testid="input-username"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-zinc-200">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-[#f7bd3f]" />
                          <Input
                            type="password"
                            {...field}
                            className="h-11 border-zinc-700 bg-zinc-950 pl-10 text-white focus-visible:ring-[#f7bd3f]"
                            data-testid="input-password"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="h-11 w-full bg-[#f7bd3f] font-black text-black shadow-lg shadow-[#f7bd3f]/20 hover:bg-[#ffd36b]"
                  disabled={isSubmitting}
                  data-testid="btn-login"
                >
                  {isSubmitting ? "Signing in..." : "Sign In"}
                </Button>
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto px-2 py-1 text-sm text-[#f7bd3f] hover:bg-[#f7bd3f]/10 hover:text-[#ffd36b]"
                    onClick={() => setIsForgotPasswordOpen(true)}
                    data-testid="btn-forgot-password"
                  >
                    Forgot password?
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <form onSubmit={onPinSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="pin-login-username" className="text-sm font-medium text-zinc-200">Username</label>
                <div className="relative">
                  <UserRound className="absolute left-3 top-3 h-4 w-4 text-[#f7bd3f]" />
                  <Input
                    id="pin-login-username"
                    name="username"
                    autoComplete="username"
                    placeholder="admin"
                    value={sharedUsername}
                    onChange={(event) => setSharedUsername(event.target.value)}
                    className="h-11 border-zinc-700 bg-zinc-950 pl-10 text-white placeholder:text-zinc-500 focus-visible:ring-[#f7bd3f]"
                    data-testid="input-username-pin"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="pin-login-pin" className="text-sm font-medium text-zinc-200">PIN</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 h-4 w-4 text-[#f7bd3f]" />
                  <Input
                    id="pin-login-pin"
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    placeholder="4 to 6 digits"
                    value={pinValue}
                    onChange={(event) => setPinValue(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="h-11 border-zinc-700 bg-zinc-950 pl-10 text-white tracking-[0.3em] focus-visible:ring-[#f7bd3f]"
                    data-testid="input-pin"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="h-11 w-full bg-[#f7bd3f] font-black text-black shadow-lg shadow-[#f7bd3f]/20 hover:bg-[#ffd36b]"
                disabled={isSubmitting}
                data-testid="btn-login-pin"
              >
                {isSubmitting ? "Signing in..." : "Sign In with PIN"}
              </Button>
              <p className="text-center text-xs text-zinc-400">
                PIN login works only for accounts that have set a PIN in Settings.
              </p>
            </form>
          )}
        </CardContent>
      </Card>

      <Dialog open={isForgotPasswordOpen} onOpenChange={setIsForgotPasswordOpen}>
        <DialogContent className="border border-[#f7bd3f]/30 bg-[#0d0d0d] text-white sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-xl text-[#f7bd3f]">Password Recovery</DialogTitle>
            <DialogDescription className="text-zinc-300">
              WGI POS is a local offline app, so passwords are not recovered by email or text message.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-6 text-zinc-200">
            <div className="rounded-md border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="font-semibold text-white">Cashier or Mechanic</div>
              <p className="mt-1 text-zinc-300">
                Ask the Admin to sign in, open Settings, choose your account in Change Password, and enter a new password.
              </p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="font-semibold text-white">Admin</div>
              <p className="mt-1 text-zinc-300">
                {isDemoMode
                  ? "Demo credentials are fixed for portfolio use. Reset the demo dataset from Settings if needed."
                  : "The default Admin password is admin123 only when the data file is new. If it was changed and forgotten, use the latest backup or have the local data file reset by the shop owner or technician."}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
