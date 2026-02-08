import express from "express";

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("worker alive");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "finishflow-worker",
    time: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`[worker] listening on ${PORT}`);
});
