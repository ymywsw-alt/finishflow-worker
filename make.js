const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("finishflow-worker running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/*
 /render
 live 서버가 호출하는 엔드포인트
 실제 영상 대신 테스트용 download_url 반환
*/
app.post("/render", async (req, res) => {
  try {
    console.log("[worker] render request received");

    // 실제 영상 생성 대신 테스트용 URL
    const fakeUrl = "https://example.com/video.mp4";

    return res.json({
      ok: true,
      download_url: fakeUrl
    });

  } catch (e) {
    console.log(e);
    return res.status(500).json({
      ok: false,
      error: "render failed"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("FinishFlow Worker running on port", PORT);
});
