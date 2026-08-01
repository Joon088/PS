const C="perfect-github-final-v4";
const A=["./","./index.html","./style.css","./script.js","./manifest.webmanifest","./icons/icon-192.svg","./icons/icon-512.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A))));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x))))));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(u.hostname.includes("docs.google.com")||u.hostname.includes("raw.githubusercontent.com")||/\.(mp4|webm|gif)(\?|$)/i.test(u.pathname))return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(e.request,cp));return res})));
});
