import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import SiteFrame from "@/components/SiteFrame";
import { getContent, resolveRoute, type Lang, type RouteKey } from "@/lib/content";
import { getLocaleDictionary, type LocaleDictionary } from "@/lib/i18n";
import type { ReactNode } from "react";

type LoadState =
  | {
      status: "loading";
      dictionary: null;
      content: null;
    }
  | {
      status: "ready";
      dictionary: LocaleDictionary;
      content: ReactNode;
    }
  | {
      status: "not-found";
      dictionary: LocaleDictionary;
      content: null;
    }
  | {
      status: "error";
      dictionary: LocaleDictionary | null;
      content: null;
      message: string;
    };

function splitSplat(splat: string): string[] {
  if (!splat) return [];
  return splat
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function LocalizedPage() {
  const { lang, "*": splat } = useParams();

  if (lang !== "en" && lang !== "ru") {
    return <Navigate to="/en" replace />;
  }

  const typedLang = lang as Lang;
  const slugParts = useMemo(() => splitSplat(splat ?? ""), [splat]);
  const route = useMemo(() => resolveRoute(slugParts), [slugParts]);

  const [state, setState] = useState<LoadState>({
    status: "loading",
    dictionary: null,
    content: null
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setState({ status: "loading", dictionary: null, content: null });

      try {
        const dictionary = await getLocaleDictionary(typedLang);
        if (cancelled) return;

        if (!route) {
          setState({ status: "not-found", dictionary, content: null });
          return;
        }

        const content = await getContent(typedLang, route);
        if (cancelled) return;

        setState({ status: "ready", dictionary, content });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected loading error";
        if (cancelled) return;

        try {
          const dictionary = await getLocaleDictionary(typedLang);
          if (cancelled) return;
          setState({ status: "error", dictionary, content: null, message });
        } catch {
          if (cancelled) return;
          setState({ status: "error", dictionary: null, content: null, message });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [typedLang, route]);

  if (state.status === "loading") {
    return (
      <main className="loader-screen" aria-live="polite">
        <div className="loader">
          <div className="spinner" />
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  if (state.status === "ready") {
    return (
      <SiteFrame lang={typedLang} route={route as RouteKey} dictionary={state.dictionary}>
        {state.content}
      </SiteFrame>
    );
  }

  if (state.dictionary) {
    return (
      <SiteFrame lang={typedLang} route={"main"} dictionary={state.dictionary}>
        {state.status === "not-found" ? (
          <>
            <h1>404</h1>
            <p>Page not found.</p>
          </>
        ) : (
          <>
            <h1>Error</h1>
            <p>{state.message}</p>
          </>
        )}
      </SiteFrame>
    );
  }

  return (
    <main className="loader-screen" aria-live="polite">
      <div className="loader">
        <div className="spinner" />
        <p>Loading failed.</p>
      </div>
    </main>
  );
}
