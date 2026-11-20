import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist-pwa");

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// 1. Bundle React 19 ShoppingOptimizerApp + all 172 categories
execFileSync(
  join(ROOT, "node_modules", ".bin", "esbuild"),
  [
    "src/pwa/standalone-entry.tsx",
    "--bundle",
    "--minify",
    "--format=iife",
    "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"',
    `--outfile=${join(DIST, "app.js")}`,
  ],
  { stdio: "inherit" },
);

// 2. Collect compiled Tailwind v4 CSS from .next/static/chunks
const chunksDir = join(ROOT, ".next", "static", "chunks");
const cssFiles = readdirSync(chunksDir).filter((f) => f.endsWith(".css"));
const combinedCss = cssFiles.map((f) => readFileSync(join(chunksDir, f), "utf8")).join("\n");
writeFileSync(join(DIST, "app.css"), combinedCss, "utf8");

// 3. Copy PWA manifest and icon
cpSync(join(ROOT, "public", "manifest.webmanifest"), join(DIST, "manifest.webmanifest"));
cpSync(join(ROOT, "public", "icon.svg"), join(DIST, "icon.svg"));
writeFileSync(join(DIST, ".nojekyll"), "", "utf8");

// 4. Write offline Service Worker
const swContent = `const CACHE_NAME = "einkaufswaechter-pwa-v1";
const ASSETS = ["./", "./index.html", "./app.css", "./app.js", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match("./index.html")))
  );
});
`;
writeFileSync(join(DIST, "sw.js"), swContent, "utf8");

// 5. Write index.html
const htmlContent = `<!DOCTYPE html>
<html lang="de" class="h-full antialiased">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
  <meta name="theme-color" content="#0b7a5c" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Einkaufswächter" />
  <title>Einkaufswächter – Wocheneinkaufs-Optimierer</title>
  <link rel="manifest" href="./manifest.webmanifest" />
  <link rel="icon" href="./icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="./icon.svg" />
  <link rel="stylesheet" href="./app.css" />
</head>
<body class="min-h-full font-sans">
  <main id="root" class="min-h-screen"></main>
  <script src="./app.js" defer></script>
</body>
</html>
`;
writeFileSync(join(DIST, "index.html"), htmlContent, "utf8");
console.log("✓ Mobile PWA bundle written to dist-pwa/");
