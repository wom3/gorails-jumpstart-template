#!/usr/bin/env node

// Esbuild is configured with 3 modes:
//
// `yarn build` - Build JavaScript and exit
// `yarn build --watch` - Rebuild JavaScript on change
// `yarn build --reload` - Reloads page when views, JavaScript, or stylesheets change
//
// Minify is enabled when "RAILS_ENV=production"
// Sourcemaps are enabled in non-production environments

import * as esbuild from "esbuild";
import path from "path";
import rails from "esbuild-rails";
import chokidar from "chokidar";
import http from "http";
import { setTimeout } from "timers/promises";

const sseClients = new Set();
const entryPoints = ["application.js"];
const watchDirectories = [
  "./app/javascript/**/*.js",
  "./app/views/**/*.erb",
  "./app/assets/builds/**/*.css", // Wait for cssbundling changes
];

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function startReloadServer(port) {
  // Reload uses an HTTP server as an event stream to reload the browser
  return http
    .createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
        Connection: "keep-alive",
      });

      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
    })
    .listen(port);
}

const buildConfig = {
  absWorkingDir: path.join(process.cwd(), "app/javascript"),
  bundle: true,
  entryPoints: entryPoints,
  minify: process.env.RAILS_ENV == "production",
  outdir: path.join(process.cwd(), "app/assets/builds"),
  plugins: [rails()],
  sourcemap: process.env.RAILS_ENV != "production",
};

async function buildAndReload() {
  // Foreman & Overmind assign a separate PORT for each process
  const portEnv = process.env.ESBUILD_RELOAD_PORT ?? process.env.PORT;
  const reloadPort = parsePort(portEnv, 3036);
  const context = await esbuild.context({
    ...buildConfig,
    banner: {
      js: ` (() => new EventSource("http://localhost:${reloadPort}").onmessage = () => location.reload())();`,
    },
  });

  startReloadServer(reloadPort);

  await context.rebuild();
  console.log(`[reload] listening on http://localhost:${reloadPort}`);
  console.log("[reload] initial build succeeded");

  let ready = false;
  chokidar
    .watch(watchDirectories)
    .on("ready", () => {
      console.log("[reload] ready");
      ready = true;
    })
    .on("all", async (event, changedPath) => {
      if (ready === false) return;

      if (changedPath.includes("javascript")) {
        try {
          await setTimeout(20);
          await context.rebuild();
          console.log("[reload] build succeeded");
        } catch (error) {
          console.error("[reload] build failed", error);
        }
      }

      sseClients.forEach((res) => res.write("data: update\n\n"));
    });
}

if (process.argv.includes("--reload")) {
  buildAndReload();
} else if (process.argv.includes("--watch")) {
  let context = await esbuild.context({ ...buildConfig, logLevel: "info" });
  context.watch();
} else {
  esbuild.build(buildConfig);
}
