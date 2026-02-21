#!/usr/bin/env node

const { startServer } = require("./index");

startServer().catch((error) => {
  console.error("[startup] Fatal error:", error);
  process.exit(1);
});
