import express from "express";

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("finishflow-worker running");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "finishflow-worker",
    time: new Date().toISOString()
  });
});

// live가 호출하는 엔드포인트
app.post("/render", async (req, res) => {
  try {
    console.log("[worker] /render called");

    // 연결 검증용: 임시 URL
    const fakeUrl = "https://example.com/video.mp4";

    return res.json({
      ok: true,
      download_url: fakeUrl
    });
  } catch (e) {
    console.log("[worker] render error:", e);
    return res.status(500).json({ ok: false, error: "render failed" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[worker] listening on ${PORT}`);
});
