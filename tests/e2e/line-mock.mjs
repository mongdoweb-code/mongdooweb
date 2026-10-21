// เซิร์ฟเวอร์ LINE Messaging API จำลองสำหรับ e2e — ตอบ {} ทุกคำขอ และบันทึก body ของทุก POST (1 บรรทัด JSON) ลงไฟล์ LINE_MOCK_LOG
// playwright.config.ts เปิดให้เองเมื่อตั้ง LINE_MOCK_LOG (แอปถูกเปิดด้วย LINE_API_BASE ชี้มาที่นี่)
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.LINE_MOCK_PORT ?? 3399);
const log = process.env.LINE_MOCK_LOG;
if (!log) throw new Error("ตั้ง LINE_MOCK_LOG ก่อน");

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.method === "POST") appendFileSync(log, body.replace(/\n/g, " ") + "\n");
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
  });
}).listen(port, () => console.log(`LINE mock on :${port} → ${log}`));
