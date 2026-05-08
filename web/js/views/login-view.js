/**
 * LoginView — Backbone + jQuery + Materialize (Superdesign “Materialize ERP Login”)
 */
(function (global) {
  var LoginView = Backbone.View.extend({
    /* String selector so delegation runs after <body> exists (avoids broken handlers). */
    el: "body",

    events: {
      "click #btn-continue": "onContinue",
      "click #btn-import-trigger": "onImportClick",
      "click #btn-server-restore": "onServerRestore",
      "click #btn-new-entity": "onNewEntity",
      "change #marg-excel-import-file": "onExcelImportFile",
      "click .js-entity-row": "onSelectEntity",
      "input #entity_name": "onEntityInput",
    },

    initialize: function (options) {
      this.db = options.db;
    },

    render: function () {
      if (this.db.getEntityCount() === 0) {
        this.showStateA();
      } else {
        this.showStateB();
        this.renderEntityList();
      }
      if (typeof M !== "undefined") {
        M.updateTextFields();
      }
      this.prefillServerRestoreFromDb();
      this.bindLoginAccordions();
      return this;
    },

    /**
     * Delegated clicks on #login-data-hub — more reliable than Backbone+body for these buttons
     * (some browsers / load orders miss delegated handlers on document.body).
     */
    bindLoginAccordions: function () {
      var self = this;
      var $hub = $("#login-data-hub");
      if (!$hub.length) return;
      $hub.off("click.loginAcc");
      $hub.on("click.loginAcc", "#btn-toggle-excel", function (e) {
        e.preventDefault();
        e.stopPropagation();
        self.toggleImportPanel("excel");
      });
      $hub.on("click.loginAcc", "#btn-toggle-server", function (e) {
        e.preventDefault();
        e.stopPropagation();
        self.toggleImportPanel("server");
      });
    },

    /** Accordion: Import from Excel vs Connect to server */
    toggleImportPanel: function (which) {
      var isExcel = which === "excel";
      var $p = isExcel ? $("#login-import-excel-panel") : $("#login-server-restore");
      var $b = isExcel ? $("#btn-toggle-excel") : $("#btn-toggle-server");
      var $pOther = isExcel ? $("#login-server-restore") : $("#login-import-excel-panel");
      var $bOther = isExcel ? $("#btn-toggle-server") : $("#btn-toggle-excel");
      var opening = $p.hasClass("hidden");
      if (opening) {
        $pOther.addClass("hidden");
        $bOther.attr("aria-expanded", "false").removeClass("is-open");
        $p.removeClass("hidden");
        $b.attr("aria-expanded", "true").addClass("is-open");
        if (!isExcel && typeof M !== "undefined" && M.updateTextFields) {
          M.updateTextFields();
        }
      } else {
        $p.addClass("hidden");
        $b.attr("aria-expanded", "false").removeClass("is-open");
      }
    },

    prefillServerRestoreFromDb: function () {
      if (!this.db || typeof this.db.getSyncSettings !== "function") return;
      try {
        var s = this.db.getSyncSettings();
        if (s.serverUrl) {
          $("#login-sync-url").val(s.serverUrl);
        }
        if (s.username) {
          $("#login-sync-user").val(s.username);
        }
        if (typeof M !== "undefined") {
          M.updateTextFields();
        }
      } catch (e) {
        /* ignore */
      }
    },

    normalizeSyncBaseUrl: function (url) {
      var u = (url || "").trim();
      if (!u) return "";
      return u.replace(/\/+$/, "");
    },

    basicAuthHeader: function (user, pass) {
      var token = String(user || "") + ":" + String(pass != null ? pass : "");
      var bytes = new TextEncoder().encode(token);
      var bin = "";
      for (var i = 0; i < bytes.length; i++) {
        bin += String.fromCharCode(bytes[i]);
      }
      return "Basic " + btoa(bin);
    },

    onServerRestore: function (e) {
      e.preventDefault();
      if (typeof margReplaceLocalDatabaseBlob !== "function") {
        if (typeof M !== "undefined") {
          M.toast({ html: "Restore is not available (database module missing)." });
        }
        return;
      }
      var base = this.normalizeSyncBaseUrl($("#login-sync-url").val());
      var user = ($("#login-sync-user").val() || "").trim();
      var pass = $("#login-sync-pass").val() != null ? String($("#login-sync-pass").val()) : "";
      if (!base) {
        if (typeof M !== "undefined") {
          M.toast({ html: "Enter the server base URL (e.g. http://127.0.0.1:3847)." });
        }
        return;
      }
      if (!user) {
        if (typeof M !== "undefined") {
          M.toast({ html: "Enter the username (e.g. admin)." });
        }
        return;
      }
      var ok = window.confirm(
        "Replace all data in this browser with the backup from the server?\n\n" +
          "This cannot be undone. Use the same username/password as on the server (SYNC_USER / SYNC_PASS)."
      );
      if (!ok) return;
      var url = base + "/api/sync";
      var $btn = $("#btn-server-restore");
      $btn.addClass("disabled");
      var self = this;
      fetch(url, {
        method: "GET",
        headers: {
          Authorization: self.basicAuthHeader(user, pass),
        },
      })
        .then(function (res) {
          if (res.status === 401) {
            throw new Error("Unauthorized — check username and password match the server.");
          }
          if (res.status === 404) {
            throw new Error("No backup on server yet. Upload once from the app (Sync now) or use POST from curl.");
          }
          if (!res.ok) {
            return res.text().then(function (t) {
              throw new Error(t || "Request failed (" + res.status + ")");
            });
          }
          var revStr = res.headers.get("Rev");
          var serverRev =
            revStr != null && revStr !== "" ? parseInt(revStr, 10) : NaN;
          return res.arrayBuffer().then(function (buf) {
            return { buf: buf, serverRev: serverRev };
          });
        })
        .then(function (data) {
          var buf = data.buf;
          if (!buf || !buf.byteLength) {
            throw new Error("Empty response from server.");
          }
          var opts = {};
          if (!Number.isNaN(data.serverRev)) {
            opts.serverRev = data.serverRev;
          }
          return margReplaceLocalDatabaseBlob(new Uint8Array(buf), opts);
        })
        .catch(function (err) {
          if (typeof M !== "undefined") {
            M.toast({ html: err.message || String(err) });
          }
          $btn.removeClass("disabled");
        });
    },

    showStateA: function () {
      $("#state-a").removeClass("hidden");
      $("#state-b").addClass("hidden");
    },

    showStateB: function () {
      $("#state-a").addClass("hidden");
      $("#state-b").removeClass("hidden");
    },

    renderEntityList: function () {
      var rows = this.db.listEntities();
      var $ul = $("#entity-list").empty();
      rows.forEach(
        function (r) {
          var label = "";
          try {
            label = r.updated_at
              ? "Updated: " + new Date(r.updated_at).toLocaleString()
              : "";
          } catch (e) {
            label = "";
          }
          var $li = $(
            [
              '<li class="collection-item avatar js-entity-row" tabindex="0">',
              '<div class="circle"><i class="material-icons">store</i></div>',
              '<span class="title"></span>',
              '<p class="grey-text meta-line"></p>',
              '<a href="#!" class="secondary-content grey-text text-lighten-1"><i class="material-icons">chevron_right</i></a>',
              "</li>",
            ].join("")
          );
          $li.find(".title").text(r.entity_name);
          $li.find(".meta-line").text(label);
          $li.attr("data-entity-id", String(r.id));
          $ul.append($li);
        }.bind(this)
      );
    },

    onEntityInput: function () {
      $("#entity_name").removeClass("invalid");
    },

    onContinue: function (e) {
      e.preventDefault();
      var name = ($("#entity_name").val() || "").trim();
      if (!name) {
        $("#entity_name").addClass("invalid");
        if (typeof M !== "undefined") {
          M.toast({ html: "Please enter an entity (shop) name." });
        }
        return;
      }
      var $btn = $("#btn-continue");
      $btn.addClass("disabled");
      var self = this;
      this.db
        .createEntity(name)
        .then(function () {
          global.location.href = "entity-setup.html";
        })
        .catch(function (err) {
          if (typeof M !== "undefined") {
            M.toast({ html: err.message || String(err) });
          }
          $btn.removeClass("disabled");
        });
    },

    onImportClick: function (e) {
      e.preventDefault();
      $("#marg-excel-import-file").trigger("click");
    },

    /**
     * Same workbook format as Admin → Import & export (SheetJS + MargInventoryExcel).
     * Merges into the current shop, or creates "Imported pharmacy" if none exist.
     */
    onExcelImportFile: function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      if (typeof MargInventoryExcel === "undefined" || typeof XLSX === "undefined") {
        if (typeof M !== "undefined") {
          M.toast({ html: "Excel module not loaded. Refresh the page." });
        }
        return;
      }
      var self = this;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = MargInventoryExcel.parseWorkbookArrayBuffer(reader.result);
          var cust = data.customers ? data.customers.length : 0;
          var ord = data.orders ? data.orders.length : 0;
          var pr = data.prescriptions ? data.prescriptions.length : 0;
          var hasEntity =
            typeof MargInventoryExcel.entityRowHasContent === "function" &&
            MargInventoryExcel.entityRowHasContent(data.entityRow);
          var hasCommonDetails = !!(data.commonDetailsSnapshot && typeof data.commonDetailsSnapshot === "object");
          var hasStaffRows = data.staffRows && data.staffRows.length > 0;
          if (
            !hasEntity &&
            !hasCommonDetails &&
            !hasStaffRows &&
            !data.vendors.length &&
            !data.products.length &&
            !cust &&
            !ord &&
            !data.lots.length &&
            !pr
          ) {
            if (typeof M !== "undefined") {
              M.toast({
                html:
                  "No rows found. Use a workbook with sheets Entity (optional), Staff (optional), CommonDetails (optional), Products, Vendors, Customers, etc. (see Admin → Import & export).",
              });
            }
            return;
          }
          var prep = Promise.resolve();
          if (self.db.getEntityCount() === 0) {
            prep = self.db.createEntity("Imported pharmacy");
          } else if (self.db.getCurrentEntityId() == null) {
            var rows = self.db.listEntities();
            if (rows.length) {
              prep = self.db.selectEntity(rows[0].id);
            }
          }
          prep
            .then(function () {
              return MargInventoryExcel.importWorkbook(self.db, data, { fullReplace: false });
            })
            .then(function (stats) {
              var msg =
                (stats.entity ? "Entity row applied. " : "") +
                (stats.commonDetails ? "CommonDetails merged. " : "") +
                (stats.staffSheet ? "Staff sheet applied. " : "") +
                "Imported vendors " +
                stats.vendors +
                ", products " +
                stats.products +
                ", customers " +
                (stats.customers || 0) +
                ", prescriptions " +
                (stats.prescriptions != null ? stats.prescriptions : 0) +
                ", orders " +
                (stats.orders || 0) +
                ", lots " +
                stats.lots +
                ".";
              if (stats.errors && stats.errors.length) {
                msg += " " + stats.errors.join(" ");
              }
              if (typeof M !== "undefined") {
                M.toast({ html: msg });
                M.toast({ html: "Opening app…" });
              }
              global.location.href = "app.html";
            })
            .catch(function (err) {
              if (typeof M !== "undefined") {
                M.toast({ html: err.message || String(err) });
              }
            });
        } catch (err) {
          if (typeof M !== "undefined") {
            M.toast({ html: "Excel error: " + (err.message || String(err)) });
          }
        }
      };
      reader.onerror = function () {
        if (typeof M !== "undefined") {
          M.toast({ html: "Could not read file." });
        }
      };
      reader.readAsArrayBuffer(file);
    },

    onNewEntity: function (e) {
      e.preventDefault();
      $("#entity_name").val("");
      this.showStateA();
      if (typeof M !== "undefined") {
        M.updateTextFields();
      }
    },

    onSelectEntity: function (e) {
      var $t = $(e.currentTarget);
      var id = $t.data("entity-id");
      if (id == null || id === "") return;
      var self = this;
      this.db.selectEntity(Number(id)).then(function () {
        global.location.href = "app.html";
      });
    },
  });

  global.LoginView = LoginView;
})(typeof window !== "undefined" ? window : this);
