import http from "http";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import Busboy from "busboy";
import { nanoid } from "nanoid";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 3000;

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL;

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_BASE_URL) {
  console.error("[worker] Missing R2 env vars");
}

const s3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY
  }
});

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function runFFmpeg(args) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  return execFileAsync(ffmpeg, args, { maxBuffer: 1024 * 1024 * 20 });
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function writeDefaultImage(outPath) {
  // ffmpeg로 단색 배경 이미지(1280x720) 생성
  // (이미지/자산이 없더라도 mp4 생성 가능하게 하는 최소 안전장치)
  await runFFmpeg([
    "-y",
    "-f", "lavfi",
    "-i", "color=c=black:s=1280x720:d=1",
    "-frames:v", "1",
    outPath
  ]);
}

async function makeVideo({ workDir, scriptObj }) {
  const imagesDir = path.join(workDir, "images");
  await ensureDir(imagesDir);

  const img1 = path.join(imagesDir, "bg1.png");
  const img2 = path.join(imagesDir, "bg2.png");
  const img3 = path.join(imagesDir, "bg3.png");

  // 이미지가 없으면 기본 이미지 생성
  if (!fs.existsSync(img1)) await writeDefaultImage(img1);
  if (!fs.existsSync(img2)) await writeDefaultImage(img2);
  if (!fs.existsSync(img3)) await writeDefaultImage(img3);

  // 자막 텍스트 (Retention 구조는 live에서 이미 삽입했다고 가정)
  const title = (scriptObj?.title || "시니어를 위한 오늘의 핵심").slice(0, 60);
  const lines = (scriptObj?.captions?.length ? scriptObj.captions : [
    "오늘 핵심만 정리해드립니다.",
    "결론 먼저, 그리고 바로 행동.",
    "끝까지 보시면 손해 안 봅니다."
  ]).slice(0, 3);

  const outMp4 = path.join(workDir, "out.mp4");

  // 3장 슬라이드 + 간단 자막(텍스트 drawtext)
  // 주의: 폰트/한글 이슈가 있으면 FONT_PATH를 지정하세요.
  const fontOpt = process.env.FONT_PATH ? `:fontfile=${process.env.FONT_PATH}` : "";

  const draw = (txt, y) =>
    `drawtext=text='${txt.replace(/:/g, "\\:").replace(/'/g, "\\\\'")}':x=(w-text_w)/2:y=${y}:fontsize=48:fontcolor=white${fontOpt}`;

  const filter =
    `[0:v]scale=1280:720,format=yuv420p,${draw(title, 80)},${draw(lines[0], 260)},${draw(lines[1], 340)},${draw(lines[2], 420)}[v0];` +
    `[1:v]scale=1280:720,format=yuv420p[ v1 ];` +
    `[2:v]scale=1280:720,format=yuv420p[ v2 ];` +
    `[v0][v1][v2]concat=n=3:v=1:a=0,format=yuv420p[v]`;

  // 기본: 12분을 “확장”하려면 오디오/컷/자막 타임라인이 필요하지만,
  // 지금 목표는 “실제 mp4 생성 + 다운로드 URL 반환”이므로 우선 mp4 파이프라인을 완성합니다.
  // 길이는 최소 30초로 생성(각 이미지 10초) → 이후 길이/타임라인 고도화.
  await runFFmpeg([
    "-y",
    "-loop", "1", "-t", "10", "-i", img1,
    "-loop", "1", "-t", "10", "-i", img2,
    "-loop", "1", "-t", "10", "-i", img3,
    "-filter_complex", filter,
    "-map", "[v]",
    "-r", "30",
    "-movflags", "+faststart",
    outMp4
  ]);

  return { outMp4, durationSec: 30 };
}

async function uploadToR2(localPath, key) {
  const body = fs.createReadStream(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: "video/mp4",
    CacheControl: "public, max-age=31536000, immutable"
  }));
  const url = `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  return url;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true, service: "finishflow-worker" });
    }

    if (req.method === "POST" && req.url === "/make") {
      const bb = Busboy({ headers: req.headers });
      const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "ffw-"));
      const imagesDir = path.join(workDir, "images");
      await ensureDir(imagesDir);

      let scriptRaw = null;

      bb.on("file", (name, file, info) => {
        const { filename } = info;
        const ext = (filename || "").split(".").pop()?.toLowerCase();

        if (name === "script.json") {
          const chunks = [];
          file.on("data", d => chunks.push(d));
          file.on("end", () => { scriptRaw = Buffer.concat(chunks).toString("utf-8"); });
          return;
        }

        // (선택) 단순 업로드: bg1.png/bg2.png/bg3.png
        if (name === "bg" && ["png", "jpg", "jpeg"].includes(ext)) {
          const out = path.join(imagesDir, `bg${nanoid(6)}.${ext}`);
          const ws = fs.createWriteStream(out);
          file.pipe(ws);
          return;
        }

        // 그 외는 버림
        file.resume();
      });

      bb.on("finish", async () => {
        try {
          let scriptObj = {};
          if (scriptRaw) {
            scriptObj = JSON.parse(scriptRaw);
          }

          // 이미지가 여러 장 들어와도, 최소 3장을 bg1~3로 맞춤
          const files = (await fsp.readdir(imagesDir)).filter(f => /\.(png|jpg|jpeg)$/i.test(f));
          const pick = files.slice(0, 3);
          const targets = ["bg1.png", "bg2.png", "bg3.png"];
          for (let i = 0; i < pick.length; i++) {
            await fsp.copyFile(path.join(imagesDir, pick[i]), path.join(imagesDir, targets[i]));
          }

          const { outMp4, durationSec } = await makeVideo({ workDir, scriptObj });
          const assetKey = `finishflow/${new Date().toISOString().slice(0, 10)}/${nanoid(12)}.mp4`;
          const download_url = await uploadToR2(outMp4, assetKey);

          return json(res, 200, { ok: true, download_url, asset_key: assetKey, durationSec });
        } catch (e) {
          console.error(e);
          return json(res, 500, { ok: false, error: String(e?.message || e) });
        }
      });

      req.pipe(bb);
      return;
    }

    return json(res, 404, { ok: false, error: "Not Found" });
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, error: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`[worker] listening on :${PORT}`);
});
