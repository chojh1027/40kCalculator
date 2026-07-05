import React from "react";
import { createRoot } from "react-dom/client";
import { DataApplication } from "./DataApplication";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <DataApplication />
  </React.StrictMode>,
);
