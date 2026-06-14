import { useCallback, useEffect, useState } from "react";

type AutoCapSettings = {
  autoCapitalizationEnabled?: boolean;
};

const SETTINGS_UPDATED_EVENT = "wgi-settings-updated";

function capitalizeToken(token: string): string {
  if (!/[A-Za-z0-9]/.test(token)) return token;
  if (token.length > 1 && token === token.toUpperCase() && /[A-Z]/.test(token)) return token;

  return token
    .split(/([.'’])/)
    .map((part) => {
      if (!/[A-Za-z0-9]/.test(part)) return part;
      if (part.length > 1 && part === part.toUpperCase() && /[A-Z]/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

export function capitalizeWords(value: string): string {
  return String(value || "").replace(/[A-Za-z0-9]+(?:[-.'’][A-Za-z0-9]+)*/g, (token) => {
    if (token.includes("-")) {
      return token.split("-").map((part) => capitalizeToken(part)).join("-");
    }
    return capitalizeToken(token);
  });
}

export function autoCapitalizeValue(value: string, enabled = true): string {
  if (!enabled) return value;
  return capitalizeWords(value.trim().replace(/\s+/g, " "));
}

export function notifySettingsUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
  }
}

async function fetchAutoCapitalizationEnabled(): Promise<boolean> {
  const response = await fetch("/api/settings", { credentials: "include" });
  if (!response.ok) return true;
  const settings: AutoCapSettings = await response.json();
  return settings.autoCapitalizationEnabled !== false;
}

export function useAutoCapitalizationEnabled(): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = () => {
      fetchAutoCapitalizationEnabled()
        .then((value) => {
          if (mounted) setEnabled(value);
        })
        .catch(() => {
          if (mounted) setEnabled(true);
        });
    };

    load();
    window.addEventListener(SETTINGS_UPDATED_EVENT, load);
    window.addEventListener("focus", load);

    return () => {
      mounted = false;
      window.removeEventListener(SETTINGS_UPDATED_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, []);

  return enabled;
}

export function useCapText() {
  const enabled = useAutoCapitalizationEnabled();
  return useCallback((value: string) => autoCapitalizeValue(value, enabled), [enabled]);
}
