/**
 * Remote sync: debounced push after local save + manual "Sync now" in sidebar.
 * Requires MargDb.getSyncSettings / exportDatabaseBlob; server: server/index.js
 * Versioned sync: If-Match-Rev + rev_seen (see docs/sync-technical-design.md).
 */
(function (global) {
  var DEBOUNCE_MS = 2000;
  var _timer = null;
  var _lastDb = null;
  var _pushing = false;

  function normalizeBaseUrl(url) {
    var s = (url || "").trim();
    if (!s) return "";
    return s.replace(/\/+$/, "");
  }

  function basicAuthHeader(user, pass) {
    var token = String(user || "") + ":" + String(pass != null ? pass : "");
    var bytes = new TextEncoder().encode(token);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return "Basic " + btoa(bin);
  }

  function isConfigured(db) {
    if (!db || typeof db.getSyncSettings !== "function") return false;
    var s = db.getSyncSettings();
    return !!(s.serverUrl && s.username);
  }

  function getRevSeen(db) {
    if (db && typeof db.getSyncRevSeen === "function") {
      return db.getSyncRevSeen();
    }
    return 0;
  }

  function setRevSeenAfterSuccess(db, rev) {
    if (rev == null || typeof db.setSyncRevSeen !== "function") return Promise.resolve();
    var n = Math.max(0, Number(rev) || 0);
    return db.setSyncRevSeen(n);
  }

  function updateSidebarUi(db) {
    var $pill = $("#inv-sync-status");
    var $btn = $("#inv-sync-btn");
    if (!$pill.length) return;
    var online = typeof navigator !== "undefined" ? navigator.onLine : true;
    if (!isConfigured(db)) {
      $pill.removeClass("inv-sync-status--ok inv-sync-status--warn").addClass("inv-sync-status--muted");
      $pill.find(".inv-sync-status-text").text("Sync off");
      $btn.prop("disabled", true);
      return;
    }
    $btn.prop("disabled", !online || _pushing);
    if (!online) {
      $pill.removeClass("inv-sync-status--ok").addClass("inv-sync-status--warn");
      $pill.find(".inv-sync-status-text").text("Offline");
      return;
    }
    if (_pushing) {
      $pill.removeClass("inv-sync-status--ok inv-sync-status--warn").addClass("inv-sync-status--muted");
      $pill.find(".inv-sync-status-text").text("Syncing…");
      return;
    }
    $pill.removeClass("inv-sync-status--warn inv-sync-status--muted").addClass("inv-sync-status--ok");
    $pill.find(".inv-sync-status-text").text("Online");
  }

  function pushToServer(db) {
    if (!db || typeof db.exportDatabaseBlob !== "function" || typeof db.getSyncSettings !== "function") {
      return Promise.reject(new Error("Sync unavailable"));
    }
    var s = db.getSyncSettings();
    var base = normalizeBaseUrl(s.serverUrl);
    if (!base || !s.username) {
      return Promise.reject(new Error("Configure server URL and username in Entity setup → Persistence."));
    }
    var url = base + "/api/sync";
    var body = db.exportDatabaseBlob();
    var revSeen = getRevSeen(db);
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(s.username, s.password),
        "Content-Type": "application/octet-stream",
        "If-Match-Rev": String(revSeen),
      },
      body: body,
    }).then(function (res) {
      if (res.status === 409) {
        return res.json().then(function (j) {
          var srvRev = j && j.rev != null ? j.rev : null;
          var msg =
            (j && j.message) ||
            "Server has newer data. Pull the latest backup (login → Restore) or resolve conflicts, then sync again.";
          var err = new Error(msg);
          err.code = "SYNC_CONFLICT";
          err.serverRev = srvRev;
          return Promise.reject(err);
        });
      }
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error(t || "Sync failed (" + res.status + ")");
        });
      }
      var revHdr = res.headers.get("Rev");
      return res.json().catch(function () {
        return {};
      }).then(function (json) {
        var rev = json && json.rev != null ? json.rev : null;
        if (rev == null && revHdr != null && revHdr !== "") {
          rev = parseInt(revHdr, 10);
          if (Number.isNaN(rev)) rev = null;
        }
        if (rev != null) {
          return setRevSeenAfterSuccess(db, rev).then(function () {
            return json;
          });
        }
        return json;
      });
    });
  }

  function scheduleAfterSave(db) {
    _lastDb = db;
    if (!db || typeof db.getSyncSettings !== "function") return;
    var s = db.getSyncSettings();
    if (!s.autoSync || !normalizeBaseUrl(s.serverUrl) || !s.username) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (_timer) {
      clearTimeout(_timer);
    }
    _timer = setTimeout(function () {
      _timer = null;
      runPush(db, false);
    }, DEBOUNCE_MS);
  }

  function runPush(db, showToast) {
    if (!db || _pushing) return Promise.resolve();
    if (!isConfigured(db)) {
      if (showToast && typeof M !== "undefined" && M.toast) {
        M.toast({ html: "Add server settings under Entity setup → Persistence." });
      }
      updateSidebarUi(db);
      return Promise.resolve();
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (showToast && typeof M !== "undefined" && M.toast) {
        M.toast({ html: "You’re offline. Sync when connected." });
      }
      updateSidebarUi(db);
      return Promise.resolve();
    }
    _pushing = true;
    updateSidebarUi(db);
    return pushToServer(db)
      .then(function () {
        if (showToast && typeof M !== "undefined" && M.toast) {
          M.toast({ html: "Backed up to server." });
        }
      })
      .catch(function (err) {
        if (err && err.code === "SYNC_CONFLICT" && err.serverRev != null && typeof db.setSyncRevSeen === "function") {
          return db.setSyncRevSeen(err.serverRev).then(function () {
            if (showToast && typeof M !== "undefined" && M.toast) {
              M.toast({ html: err.message || String(err) });
            }
          });
        }
        if (showToast && typeof M !== "undefined" && M.toast) {
          M.toast({ html: err && err.message ? err.message : String(err) });
        }
      })
      .then(function () {
        _pushing = false;
        updateSidebarUi(db);
      });
  }

  function init(db) {
    _lastDb = db;
    updateSidebarUi(db);
    $("#inv-sync-btn")
      .off("click.margSync")
      .on("click.margSync", function (e) {
        e.preventDefault();
        runPush(db, true);
      });
    $(global)
      .off("online.margSync offline.margSync")
      .on("online.margSync offline.margSync", function (e) {
        updateSidebarUi(_lastDb);
        if (e.type === "online" && _lastDb) {
          scheduleAfterSave(_lastDb);
        }
        if (typeof global.margOfflineRefreshBanner === "function") {
          global.margOfflineRefreshBanner();
        }
      });
  }

  global.__margAfterLocalPersist = function (db) {
    scheduleAfterSave(db);
  };

  global.margSyncInit = init;
  global.margSyncPushNow = function (db) {
    return runPush(db || _lastDb, true);
  };
  global.margSyncRefresh = function (db) {
    _lastDb = db || _lastDb;
    updateSidebarUi(_lastDb);
  };

  /**
   * GET /api/sync/status — cheap server rev poll (optional; does not update rev_seen on mismatch).
   * @returns {Promise<{ rev: number, server_time?: string }>}
   */
  global.margSyncFetchStatus = function (db) {
    if (!db || typeof db.getSyncSettings !== "function") {
      return Promise.reject(new Error("Sync unavailable"));
    }
    var s = db.getSyncSettings();
    var base = normalizeBaseUrl(s.serverUrl);
    if (!base || !s.username) {
      return Promise.reject(new Error("Not configured"));
    }
    return fetch(base + "/api/sync/status", {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(s.username, s.password),
      },
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error(t || "Status failed (" + res.status + ")");
        });
      }
      return res.json();
    });
  };
})(typeof window !== "undefined" ? window : this);
