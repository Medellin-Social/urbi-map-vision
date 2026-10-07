import { useEffect, useRef } from "react";
import { useGoogleLogin, type AuthResponse } from "@/hooks/useAuth";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let gsiScriptPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;
  gsiScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar Google Sign-In"));
    document.head.appendChild(script);
  });
  return gsiScriptPromise;
}

export function GoogleSignInButton({
  onSuccess,
  onError,
}: {
  onSuccess: (res: AuthResponse) => void;
  onError?: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const googleLogin = useGoogleLogin();

  // Refs so the GIS callback (registered once, see deps=[] below) always
  // calls the latest onSuccess/onError — e.g. register.tsx resolves `origen`
  // after mount, so a stale closure here would ship the wrong value.
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    loadGsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async (response) => {
            try {
              const res = await googleLogin.mutateAsync({ id_token: response.credential });
              onSuccessRef.current(res);
            } catch (err) {
              onErrorRef.current?.(err instanceof Error ? err.message : "No se pudo iniciar sesión con Google.");
            }
          },
        });
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          width: 360,
          text: "continue_with",
          locale: "es",
        });
      })
      .catch((err: Error) => onErrorRef.current?.(err.message));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!CLIENT_ID) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: "#E5E0D5" }} />
        <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, color: "#5B5F5C" }}>o</span>
        <div style={{ flex: 1, height: 1, background: "#E5E0D5" }} />
      </div>
      <div ref={containerRef} style={{ display: "flex", justifyContent: "center" }} />
    </div>
  );
}
