import "dotenv/config";
import { app } from "./app.js";

const port = process.env.port || 3001;

app.listen(port, () => {
    console.log (`UmuFrio API rodando em http://localhost:${port}`);
});