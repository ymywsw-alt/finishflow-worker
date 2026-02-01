// make.js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("FinishFlow Worker started");

(async () => {
  try {
    // ✅ 실제 작업 로직 자리
    console.log("FinishFlow Worker job done");

    // ✅ Render UI가 'exited early'로 오인하는 케이스 방지용
    await sleep(3000);

    process.exitCode = 0; // 성공 명시
  } catch (err) {
    console.error("Worker error:", err);
    await sleep(3000);
    process.exitCode = 1; // 실패 명시
  }
})();
