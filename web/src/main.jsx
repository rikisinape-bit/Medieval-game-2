import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/im-fell-english/400.css";
import "@fontsource/im-fell-english/400-italic.css";
import "@fontsource/vt323/400.css";
import "./index.css";
import Village3D from "./pages/Village3D";

createRoot(document.getElementById("root")).render(<Village3D />);
