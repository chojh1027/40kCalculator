import { useEffect, useState } from "react";
import { App } from "./App";
import {
  bootstrapBrowserGameData,
  type CatalogBootstrapResult,
} from "./data/app-bootstrap";
import { CATALOG } from "./data/catalog";
import { createCatalogViewData } from "./data/catalog-view";

let browserBootstrapRequest: Promise<CatalogBootstrapResult> | null = null;

function getBrowserBootstrapRequest(): Promise<CatalogBootstrapResult> {
  browserBootstrapRequest ??= bootstrapBrowserGameData();
  return browserBootstrapRequest;
}

function restartBrowserBootstrap(): Promise<CatalogBootstrapResult> {
  browserBootstrapRequest = bootstrapBrowserGameData();
  return browserBootstrapRequest;
}

function unexpectedFallback(error: unknown): CatalogBootstrapResult {
  return Object.freeze({
    catalog: CATALOG,
    source: "bundled-fallback",
    releaseId: CATALOG.metadata.releaseId,
    effectiveDate: CATALOG.metadata.effectiveDate,
    notice: "Using bundled sample data because application data initialization failed.",
    details: error instanceof Error ? error.message : String(error),
  });
}

function LoadingApplication() {
  return (
    <main className="page-shell app-state" aria-busy="true">
      <header className="hero">
        <p className="eyebrow">WARHAMMER 40,000</p>
        <h1>Dice Servitor</h1>
      </header>
      <section className="panel loading-panel" aria-live="polite">
        <div className="loading-indicator" aria-hidden="true" />
        <div>
          <h2>Loading game data</h2>
          <p>Checking the active local release and validating its catalog.</p>
        </div>
      </section>
    </main>
  );
}

function ReadyApplication({
  result,
  onRetry,
}: {
  readonly result: CatalogBootstrapResult;
  readonly onRetry: () => void;
}) {
  const catalog = createCatalogViewData(result.catalog);
  return (
    <App
      key={`${result.source}:${result.releaseId ?? "unknown"}`}
      catalog={catalog}
      dataStatus={result}
      onRetryDataLoad={onRetry}
    />
  );
}

export function DataApplication() {
  const [request, setRequest] = useState(getBrowserBootstrapRequest);
  const [result, setResult] = useState<CatalogBootstrapResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);

    void request.then(
      (nextResult) => {
        if (!cancelled) setResult(nextResult);
      },
      (error: unknown) => {
        if (!cancelled) setResult(unexpectedFallback(error));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [request]);

  const retry = (): void => {
    setRequest(restartBrowserBootstrap());
  };

  if (result === null) return <LoadingApplication />;
  return <ReadyApplication result={result} onRetry={retry} />;
}
