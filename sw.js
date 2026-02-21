/* eslint-disable no-restricted-globals */

// 缓存版本号 - 更新此值可强制客户端刷新缓存
const CACHE_VERSION = "v2";
const CACHE_NAME = `timi-cache-${CACHE_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 清除所有旧版本缓存
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function isSameOrigin(requestUrl) {
  try {
    return new URL(requestUrl).origin === self.location.origin;
  } catch {
    return false;
  }
}

/**
 * 判断请求是否为核心资源（CORE_ASSETS 列表中的文件）
 */
function isCoreAsset(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const pathname = url.pathname;
    // 匹配根路径或核心资源文件
    return pathname === '/' ||
           pathname.endsWith('/index.html') ||
           pathname.endsWith('/manifest.json') ||
           pathname.endsWith('/icons/icon.svg');
  } catch {
    return false;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;
  if (!isSameOrigin(request.url)) return;

  const isNavigation =
    request.mode === "navigate" ||
    (request.destination === "document" && request.headers.get("accept")?.includes("text/html"));

  // 核心资源和导航请求：Network-First 策略（确保及时更新）
  if (isNavigation || isCoreAsset(request.url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cached = await cache.match(request);
          return cached || (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
        }
      })()
    );
    return;
  }

  // 非核心同源资源：Stale-While-Revalidate 策略
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => undefined);

      return cached || (await fetchPromise) || Response.error();
    })()
  );
});
