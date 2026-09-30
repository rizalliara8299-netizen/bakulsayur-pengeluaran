const CACHE='bakul-sayur-shell-v7';
const SHELL=['./','./index.html','./styles.css','./polish.css','./monthly.css','./premium.css','./app.js','./monthly.js','./history-summary.js','./manifest.webmanifest','./assets/bakul-sayur-logo.svg','./assets/bakul-sayur-mark.svg','./assets/favicon.svg','./assets/app-icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
async function networkFirst(req,fallback){
  const cache=await caches.open(CACHE);
  try{
    const res=await fetch(req,{cache:'no-store'});
    if(res&&res.ok)cache.put(req,res.clone());
    return res;
  }catch{
    const cached=await cache.match(req)||(fallback?await cache.match(fallback):null);return cached||new Response('Offline',{status:503});
  }
}
async function staleWhileRevalidate(req){
  const cache=await caches.open(CACHE);
  const cached=await cache.match(req);
  const fresh=fetch(req).then(res=>{if(res&&res.ok)cache.put(req,res.clone());return res}).catch(()=>null);
  return cached||await fresh||new Response('Offline',{status:503});
}
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  const freshAsset=req.mode==='navigate'||/\.(?:html|css|js|webmanifest)$/.test(url.pathname);
  event.respondWith(freshAsset?networkFirst(req,req.mode==='navigate'?'./index.html':undefined):staleWhileRevalidate(req));
});