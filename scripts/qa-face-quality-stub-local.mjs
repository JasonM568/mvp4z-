#!/usr/bin/env node
// Deterministic local-only geometry service: first request rejects, then passes.
import { createServer } from "node:http";

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Pass a local TCP port");
let calls = 0;
createServer(async (request, response) => {
  for await (const _chunk of request) { /* consume synthetic PNG */ }
  calls++;
  const accepted = calls > 1;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({
    faceCount: accepted ? 1 : 0,
    faceCoverage: accepted ? 0.5 : 0,
    pose: { yaw: 0, pitch: 0, roll: 0 },
    occlusion: { eyes: false, nose: false, mouth: false }
  }));
}).listen(port, "127.0.0.1", () => console.log(`local face-quality stub ready on ${port}`));
