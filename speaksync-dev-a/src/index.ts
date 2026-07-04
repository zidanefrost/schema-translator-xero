import "dotenv/config";
import express from "express";
import cors from "cors";
import { mapRouter } from "./routes/map";
import { executeRouter } from "./routes/execute";

const app = express();
app.use(cors()); // open for hackathon; tighten to Dev B's + Make's origins if needed
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/map", mapRouter);
app.use("/execute", executeRouter);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`SpeakSync Dev A service listening on http://localhost:${PORT}`);
  console.log(`  GET  /health`);
  console.log(`  POST /map     { recipe, profile, record } -> MappedPayload`);
  console.log(`  POST /execute MappedPayload -> { id, deep_link, status }`);
});
