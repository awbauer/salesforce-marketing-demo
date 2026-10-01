import { INSTANCE_PROFILE } from "@workbench/contracts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

document.title = `${INSTANCE_PROFILE.client.brand} · Marketing workbench`;

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
