const express = require("express");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("finishflow-worker running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// live가 호출하는 엔드포인트
app.post("/render", async (req, res) => {
  try {
    console.log("[worker] /render called");

    // TODO: 여기에 실제 렌더 로직(ffmpeg 등) 연결
    // 지금은 연결 검증용으로 fake URL 반환
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
