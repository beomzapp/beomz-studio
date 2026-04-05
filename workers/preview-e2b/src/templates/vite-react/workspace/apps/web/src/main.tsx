import React from "react";
import ReactDOM from "react-dom/client";

import { PreviewApp } from "./preview/App";
import "./preview/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>,
);
