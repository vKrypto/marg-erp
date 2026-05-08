/**
 * Offline UX: connectivity banner + service worker registration (see ../sw.js).
 */
(function (global) {
  function updateOfflineBanner() {
    var online = typeof navigator !== "undefined" && navigator.onLine;
    var el = document.getElementById("inv-offline-banner");
    if (!el) return;
    if (online) {
      el.setAttribute("hidden", "");
    } else {
      el.removeAttribute("hidden");
    }
  }

  function bindConnectivity() {
    if (global.addEventListener) {
      global.addEventListener("online", updateOfflineBanner);
      global.addEventListener("offline", updateOfflineBanner);
    }
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", updateOfflineBanner);
      } else {
        updateOfflineBanner();
      }
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    global.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (e) {
        console.warn("marg-offline: service worker register failed", e);
      });
    });
  }

  bindConnectivity();
  registerServiceWorker();

  global.margOfflineRefreshBanner = updateOfflineBanner;
})(typeof window !== "undefined" ? window : this);
