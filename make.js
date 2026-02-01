// make.js
console.log("FinishFlow Worker started");

(async () => {
  try {
    // 🔧 여기에 실제 작업 로직이 들어갈 자리
    // 예: 영상 생성, 파일 처리, API 호출 등

    console.log("FinishFlow Worker job done");
    process.exit(0); // 정상 종료
  } catch (err) {
    console.error("Worker error:", err);
    process.exit(1); // 실패 종료
  }
})();
