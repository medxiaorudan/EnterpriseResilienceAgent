import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { buildMcpServer } from "./server.js";

serveStdio(() => buildMcpServer());
