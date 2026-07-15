#!/usr/bin/env bun
import { runDemo } from "./demo.js";

runDemo().catch((error: unknown) => {
  console.error(`[dragnet-demo] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
