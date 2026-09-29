import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function list(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = dir + "/" + e.name;
    if (e.isDirectory()) out.push(...(await list(p)));
    else if (e.name !== "sw.js") out.push(p);
  }
  return out;
}
const paths = await list("dist");
const hash = createHash("sha256");
hash.update(await readFile(new URL(import.meta.url)));
for (const p of paths) hash.update(await readFile(p));
const version = hash.digest("hex").slice(0, 12);
await writeFile(
  "dist/sw.js",
  `const PREFIX='xingce:'+self.registration.scope+':';const CACHE=PREFIX+'${version}';const FILES=${JSON.stringify(paths.map((p) => "./" + p.slice(5)))};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('message',e=>{if(e.data?.type==='ACTIVATE')self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!u.href.startsWith(self.registration.scope))return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(new URL('index.html',self.registration.scope).href,{ignoreVary:true}))));return;}
 // These are this app's static files. Ignore CDN Vary: Origin differences between preload and module requests.
e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request,{ignoreVary:true}))||fetch(e.request)));});`,
);
console.log(
  "Offline cache generated:",
  paths.length,
  "files, version",
  version,
);
