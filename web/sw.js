/**
 * Marg ERP — offline cache: app shell, static assets, local fonts (Roboto + Material Icons).
 * Bump CACHE_NAME when precache list changes materially.
 */
const CACHE_NAME = "marg-erp-offline-v36";

const PRECACHE = [
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "index.html",
  "new-session.html",
  "app.html",
  "inventory.html",
  "customers.html",
  "customer-detail.html",
  "orders.html",
  "prescriptions.html",
  "prescription-edit.html",
  "prescription-detail.html",
  "product-new.html",
  "product-detail.html",
  "vendor-detail.html",
  "lot-new.html",
  "lot-edit.html",
  "lot-detail.html",
  "entity-setup.html",
  "staff.html",
  "import-export.html",
  "terms.html",
  "invoice-format.html",
  "invoice-samples.html",
  "css/inventory.css",
  "css/login.css",
  "css/brand.css",
  "css/entity-setup.css",
  "vendor/css/materialize.min.css",
  "vendor/css/fonts-local.css",
  "vendor/fonts/roboto/roboto-latin-variable.woff2",
  "vendor/fonts/material-icons/material-icons.woff2",
  "vendor/js/jquery.min.js",
  "vendor/js/underscore-min.js",
  "vendor/js/backbone-min.js",
  "vendor/js/materialize.min.js",
  "vendor/js/sql-wasm.js",
  "vendor/js/xlsx.full.min.js",
  "js/db.js",
  "js/marg-sync.js",
  "js/marg-offline.js",
  "js/invoice-format-defaults.js",
  "js/terms-defaults.js",
  "js/index.js",
  "js/new-session.js",
  "js/app-shell.js",
  "js/dashboard-main.js",
  "js/inventory-main.js",
  "js/inventory-csv.js",
  "js/inventory-excel.js",
  "js/customers-main.js",
  "js/customer-detail-main.js",
  "js/orders-main.js",
  "js/prescriptions-main.js",
  "js/prescription-edit-main.js",
  "js/prescription-detail-main.js",
  "js/prescription-csv.js",
  "js/product-new-main.js",
  "js/product-detail-main.js",
  "js/vendor-detail-main.js",
  "js/lot-new-main.js",
  "js/lot-edit-main.js",
  "js/lot-detail-main.js",
  "js/entity-setup-main.js",
  "js/staff-main.js",
  "js/import-export-main.js",
  "js/terms-main.js",
  "js/invoice-format-main.js",
  "js/invoice-samples-main.js",
  "js/invoice-html.js",
  "js/global-search.js",
  "js/views/app-layout-view.js",
  "js/views/login-view.js",
  "js/views/entity-setup-view.js",
];

function precacheUrl(path) {
  return new URL(path, self.location.href).href;
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return Promise.all(
          PRECACHE.map(function (path) {
            var url = precacheUrl(path);
            return cache.add(url).catch(function (err) {
              console.warn("[sw] precache skip:", path, err && err.message);
            });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k !== CACHE_NAME;
            })
            .map(function (k) {
              return caches.delete(k);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          var u = new URL(req.url);
          var name = u.pathname.replace(/^\//, "") || "index.html";
          return caches.match(precacheUrl(name)).then(function (h2) {
            if (h2) return h2;
            return caches.match(precacheUrl("index.html"));
          });
        });
      })
    );
    return;
  }

  /* Same-origin assets: network-first when online, cache when offline. */
  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req);
      })
  );
});
