/**
 * Entity Setup — Backbone model + view (session setup form)
 * Payments: only Cash is supported; other methods are shown disabled.
 */
(function (global) {
  var SUPPORTED_PAYMENTS = ["cash"];

  function parsePaymentsJson(raw) {
    if (!raw) return SUPPORTED_PAYMENTS.slice();
    try {
      var p = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!p || !p.length) return SUPPORTED_PAYMENTS.slice();
      var filtered = p.filter(function (x) {
        return SUPPORTED_PAYMENTS.indexOf(x) >= 0;
      });
      return filtered.length ? filtered : SUPPORTED_PAYMENTS.slice();
    } catch (e) {
      return SUPPORTED_PAYMENTS.slice();
    }
  }

  var EntitySetupModel = Backbone.Model.extend({
    defaults: {
      entity_name: "",
      dl_number: "",
      line1: "",
      auto_reorder_level: 50,
      expiry_alert_days: 90,
      accepted_payments: ["cash"],
    },
  });

  var EntitySetupView = Backbone.View.extend({
    events: {
      "submit #entity-setup-form": "onSubmit",
      "submit #entity-setup-form-persistence": "onSubmitPersistence",
      "click .nav-side-link": "onSidebarNav",
      "click .js-nav-placeholder": "onNavPlaceholder",
      "change .js-payment-enabled": "onCashChange",
      "input #field-reorder": "onFieldInput",
      "input #field-expiry": "onFieldInput",
      "input #entity_name": "onFieldInput",
      "input #dl_number": "onFieldInput",
      "input #line1": "onFieldInput",
    },

    initialize: function (options) {
      this.db = options.db;
      this.model = options.model || new EntitySetupModel();
      /** @type {string} previous password when editing persistence (keep if field left blank) */
      this._syncPasswordSnapshot = "";
    },

    render: function () {
      var row = this.db.getCurrentEntity();
      if (row) {
        this.model.set({
          entity_name: row.entity_name || "",
          dl_number: row.dl_number || "",
          line1: row.line1 || "",
          auto_reorder_level:
            row.auto_reorder_level != null && row.auto_reorder_level !== ""
              ? Number(row.auto_reorder_level)
              : 50,
          expiry_alert_days:
            row.expiry_alert_days != null && row.expiry_alert_days !== ""
              ? Number(row.expiry_alert_days)
              : 90,
          accepted_payments: parsePaymentsJson(row.accepted_payments),
        });
      }
      $("#entity_name").val(this.model.get("entity_name"));
      $("#dl_number").val(this.model.get("dl_number"));
      $("#line1").val(this.model.get("line1"));
      $("#field-reorder").val(String(this.model.get("auto_reorder_level")));
      $("#field-expiry").val(String(this.model.get("expiry_alert_days")));

      var selected = this.model.get("accepted_payments") || ["cash"];
      $("#pay-cash").prop("checked", selected.indexOf("cash") >= 0);

      this.refreshProgress();
      this.refreshStorageHint();
      this.loadPersistenceFields();
      this.showStep("entity");
      if (typeof M !== "undefined") {
        M.updateTextFields();
        if ($("#line1").length && typeof M.textareaAutoResize === "function") {
          M.textareaAutoResize($("#line1"));
        }
      }
      return this;
    },

    loadPersistenceFields: function () {
      if (!this.db || typeof this.db.getSyncSettings !== "function") return;
      var s = this.db.getSyncSettings();
      $("#sync_server_url").val(s.serverUrl || "");
      $("#sync_username").val(s.username || "");
      $("#sync_password").val("");
      this._syncPasswordSnapshot = s.password || "";
      $("#sync_auto").prop("checked", !!s.autoSync);
      if (typeof M !== "undefined") {
        M.updateTextFields();
      }
    },

    showStep: function (step) {
      var isEntity = step === "entity";
      $("#entity-setup-step-entity").toggle(isEntity);
      $("#entity-setup-step-persistence").toggle(!isEntity);
      var $lis = $(".nav-steps li");
      $lis.removeClass("active");
      if (isEntity) {
        $lis.eq(0).addClass("active");
      } else {
        $lis.eq(1).addClass("active");
      }
    },

    refreshProgress: function () {
      var pct = this.db.getEntitySetupProgress();
      $("#progress-pct").text(pct + "%");
    },

    refreshStorageHint: function () {
      var el = $("#storage-hint-text");
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(
          function (est) {
            var u = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
            var q = ((est.quota || 0) / (1024 * 1024)).toFixed(0);
            el.text("Local storage: " + u + " MB used / ~" + q + " MB available (browser estimate).");
          },
          function () {
            el.text("Local data stored in IndexedDB + SQLite (this browser).");
          }
        );
      } else {
        el.text("Local data stored in IndexedDB + SQLite (this browser).");
      }
    },

    onFieldInput: function () {
      this.model.set({
        entity_name: ($("#entity_name").val() || "").trim(),
        dl_number: ($("#dl_number").val() || "").trim(),
        line1: ($("#line1").val() || "").trim(),
        auto_reorder_level: parseInt($("#field-reorder").val(), 10) || 0,
        expiry_alert_days: parseInt($("#field-expiry").val(), 10) || 0,
      });
      this.refreshProgress();
    },

    onCashChange: function () {
      if (!$("#pay-cash").is(":checked")) {
        $("#pay-cash").prop("checked", true);
        if (typeof M !== "undefined") {
          M.toast({ html: "Cash is the only supported payment method in this release." });
        }
      }
      this.model.set("accepted_payments", SUPPORTED_PAYMENTS.slice());
      this.refreshProgress();
    },

    onSidebarNav: function (e) {
      e.preventDefault();
      var idx = $(e.currentTarget).closest("li").index();
      if (idx === 0) {
        this.showStep("entity");
      } else if (idx === 1) {
        this.loadPersistenceFields();
        this.showStep("persistence");
      }
    },

    onSubmitPersistence: function (e) {
      e.preventDefault();
      var url = ($("#sync_server_url").val() || "").trim();
      var user = ($("#sync_username").val() || "").trim();
      var passNew = $("#sync_password").val() != null ? String($("#sync_password").val()) : "";
      var pass =
        passNew !== ""
          ? passNew
          : this._syncPasswordSnapshot
          ? this._syncPasswordSnapshot
          : "";
      var auto = $("#sync_auto").is(":checked");
      var $btn = $("#btn-save-persistence");
      $btn.addClass("disabled");
      var self = this;
      this.db
        .setSyncSettings({
          serverUrl: url,
          username: user,
          password: pass,
          autoSync: auto,
        })
        .then(function () {
          self._syncPasswordSnapshot = pass;
          $("#sync_password").val("");
          if (typeof M !== "undefined") {
            M.toast({ html: "Persistence settings saved." });
          }
          if (typeof global.margSyncRefresh === "function") {
            global.margSyncRefresh(self.db);
          }
        })
        .catch(function (err) {
          if (typeof M !== "undefined") {
            M.toast({ html: err.message || String(err) });
          }
        })
        .then(function () {
          $btn.removeClass("disabled");
        });
    },

    onNavPlaceholder: function (e) {
      e.preventDefault();
      if (typeof M !== "undefined") {
        M.toast({ html: "Coming in a later milestone." });
      }
    },

    onSubmit: function (e) {
      e.preventDefault();
      this.onFieldInput();
      var payload = {
        entity_name: ($("#entity_name").val() || "").trim(),
        dl_number: ($("#dl_number").val() || "").trim(),
        line1: ($("#line1").val() || "").trim(),
        auto_reorder_level: parseInt($("#field-reorder").val(), 10) || 0,
        expiry_alert_days: parseInt($("#field-expiry").val(), 10) || 0,
        accepted_payments: SUPPORTED_PAYMENTS.slice(),
      };
      if (!payload.entity_name) {
        if (typeof M !== "undefined") {
          M.toast({ html: "Entity name is required." });
        }
        return;
      }
      var $btn = $("#btn-save-continue");
      $btn.addClass("disabled");
      this.db
        .updateEntitySetup(payload)
        .then(function () {
          global.location.href = "app.html";
        })
        .catch(function (err) {
          if (typeof M !== "undefined") {
            M.toast({ html: err.message || String(err) });
          }
          $btn.removeClass("disabled");
        });
    },
  });

  global.EntitySetupModel = EntitySetupModel;
  global.EntitySetupView = EntitySetupView;
})(typeof window !== "undefined" ? window : this);
