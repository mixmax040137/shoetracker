/* ShoeTracker Service Worker — ทำให้เปิดแบบ offline ได้และติดตั้งเป็นแอพได้
 * กลยุทธ์: stale-while-revalidate สำหรับไฟล์แอพ (same-origin GET)
 *  - ตอบจากแคชทันที (เร็ว/ออฟไลน์ได้) แล้วอัปเดตแคชเบื้องหลังสำหรับครั้งถัดไป
 *  - คำขอข้ามโดเมน (เช่น ซิงค์ไป Apps Script) และที่ไม่ใช่ GET จะปล่อยผ่านไปเน็ตเสมอ
 */
const CACHE = "shoetracker-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // ปล่อยผ่าน POST (ซิงค์)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ปล่อยผ่านคำขอข้ามโดเมน (Apps Script/Strava)

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        // มีในแคช → ตอบทันที; ไม่มี → รอเน็ต; เน็ตล่ม+ไม่มีแคช+เป็นการเปิดหน้า → ใช้ index.html
        return cached || network.then((r) => r || (req.mode === "navigate" ? cache.match("./index.html") : undefined));
      })
    )
  );
});
