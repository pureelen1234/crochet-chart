// 맥/리눅스용 로컬 미리보기 서버: node serve.mjs → http://localhost:8765
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const root = path.dirname(new URL(import.meta.url).pathname);
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".webmanifest":"application/manifest+json" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(8765, () => console.log("http://localhost:8765"));
