import http from "node:http";
import { WebSocketServer } from "ws";

export interface ServerDeps {
  version: string;
}

export function createServer(deps: ServerDeps): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "voice-gateway", version: deps.version }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ server, path: "/v1/session" });
  wss.on("connection", (ws) => {
    ws.send(
      JSON.stringify({
        type: "error",
        code: "not_implemented",
        message: "Voice sessions arrive in Phase 1",
      }),
    );
    ws.close(1000);
  });
  return server;
}
