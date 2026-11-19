import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";
import "./mobile.css";
import "./dark.css";
import "./dark-extra.css";
import { iniciarTabelasDeCelular } from "./mobileTables.js";

iniciarTabelasDeCelular();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>

);
