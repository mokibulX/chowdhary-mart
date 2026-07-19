const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8090);

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const fileName = requestPath === "/" ? "ChowdharyMart-debug-v1.0.15.apk" : requestPath.slice(1);
  const filePath = path.resolve(root, fileName);

  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Length": stat.size,
    "Content-Type": filePath.endsWith(".apk") ? "application/vnd.android.package-archive" : "application/octet-stream",
    "Content-Disposition": `attachment; filename="${path.basename(filePath)}"`,
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, "0.0.0.0");
