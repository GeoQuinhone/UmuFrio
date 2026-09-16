import "./loadEnv.js";
import { app } from "./app.js";

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`UmuFrio API rodando em http://localhost:${port}`);
});