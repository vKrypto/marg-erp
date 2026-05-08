/**
 * Admin — Browse built-in invoice samples with previews; set active sample for prints.
 */
(function () {
  var db;

  /** Same sample data as invoice-format-main.js for consistent previews. */
  var SAMPLE_ORDER = {
    id: 1001,
    order_number: "INV-PREVIEW-1",
    order_date: "2025-03-27",
    order_total_price_paise: 10800,
    order_discount_paise: 5000,
    status: "confirmed",
    notes: "Sample order note (preview only).",
  };
  var SAMPLE_CUST = {
    name: "Rajesh Kumar",
    phone: "+91 98765 43210",
    address_line1: "12 Sample Street",
    address_line2: null,
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    email: "preview@example.com",
  };
  var SAMPLE_LINE_ROWS = [
    {
      line: {
        product_name: "Paracetamol 500 mg",
        product_code: "PARA-500",
        quantity: 2,
        total_price_paise: 7000,
        line_notes: "After food",
      },
      schedule: {
        in_morning: 1,
        in_noon: 0,
        in_evening: 1,
        in_night: 0,
        remarks: "As directed",
      },
    },
    {
      line: {
        product_name: "ORS Sachet",
        product_code: "ORS-200",
        quantity: 4,
        total_price_paise: 8800,
        line_notes: "",
      },
      schedule: null,
    },
  ];

  function showToast(err) {
    var msg = err && err.message ? err.message : String(err);
    M.toast({ html: msg, classes: "rounded", displayLength: 4000 });
  }

  /**
   * Prefer latest real order for the active-format preview (same idea as invoice-format page).
   * @returns {{ order: object, customer: object, lineRows: Array }|null}
   */
  function getPreviewInvoicePayload() {
    try {
      var list = db.listOrders({});
      if (!list || !list.length) return null;
      var oid = list[0].id;
      var o = db.getOrder(oid);
      if (!o) return null;
      var cust = db.getCustomer(o.customer_id);
      var lines = db.getOrderLines(oid);
      if (!lines.length) return null;
      var lineRows = lines.map(function (ln) {
        return { line: ln, schedule: db.getOrderLineSchedule(ln.id) };
      });
      return { order: o, customer: cust || SAMPLE_CUST, lineRows: lineRows };
    } catch (e) {
      console.warn(e);
      return null;
    }
  }

  function refreshActiveFormatPreview(ent) {
    if (!ent || typeof MargInvoiceHtml === "undefined" || !db) return;
    var frame = document.getElementById("invoice-active-format-preview-frame");
    if (!frame) return;
    try {
      var fmt = db.getInvoiceFormatOptions();
      var payload = getPreviewInvoicePayload();
      var o = payload ? payload.order : SAMPLE_ORDER;
      var cust = payload ? payload.customer : SAMPLE_CUST;
      var lineRows = payload ? payload.lineRows : SAMPLE_LINE_ROWS;
      var html = MargInvoiceHtml.buildDocument(ent, o, cust, lineRows, fmt, { db: db });
      frame.srcdoc = html;
    } catch (e) {
      console.error(e);
    }
  }

  function fillPreviewIframe(frame, ent, presetId) {
    if (!frame || typeof MargInvoiceHtml === "undefined" || !MargInvoiceFormatDefaults) return;
    try {
      var state = MargInvoiceFormatDefaults.defaultState();
      var fmt = MargInvoiceFormatDefaults.resolveOptionsForFormatId(state, presetId);
      var html = MargInvoiceHtml.buildDocument(ent, SAMPLE_ORDER, SAMPLE_CUST, SAMPLE_LINE_ROWS, fmt, {
        db: db,
      });
      frame.srcdoc = html;
    } catch (e) {
      console.error(e);
    }
  }

  function renderCards(ent) {
    var $grid = $("#inv-invoice-samples-grid");
    $grid.empty();
    var activeId = db.getInvoiceFormatState().activeFormatId;
    var presets = MargInvoiceFormatDefaults.BUILT_IN_PRESETS || [];

    presets.forEach(function (preset) {
      var isDefault = preset.id === "builtin-gst-pharmacy";
      var isActive = preset.id === activeId;

      var $card = $(
        [
          '<div class="col s12 m6 l6">',
          '  <div class="inv-invoice-sample-card z-depth-1">',
          '    <div class="inv-invoice-sample-card-head">',
          '      <h2 class="inv-invoice-sample-title"></h2>',
          '      <div class="inv-invoice-sample-badges"></div>',
          "    </div>",
          '    <p class="inv-invoice-sample-desc grey-text text-darken-2"></p>',
          '    <iframe class="inv-invoice-sample-preview-frame" title="Invoice preview"></iframe>',
          '    <div class="inv-invoice-sample-actions">',
          '      <button type="button" class="btn waves-effect inv-btn-primary inv-invoice-sample-use">',
          '        <i class="material-icons left">check_circle</i>Use this sample',
          "      </button>",
          "    </div>",
          "  </div>",
          "</div>",
        ].join("\n")
      );

      $card.find(".inv-invoice-sample-title").text(preset.name);
      $card.find(".inv-invoice-sample-desc").text(preset.description || "");

      var $badges = $card.find(".inv-invoice-sample-badges");
      if (isDefault) {
        $badges.append(
          '<span class="inv-invoice-sample-chip inv-invoice-sample-chip--default">Default</span>'
        );
      }
      if (isActive) {
        $badges.append('<span class="inv-invoice-sample-chip inv-invoice-sample-chip--active">Active</span>');
      }

      var frame = $card.find(".inv-invoice-sample-preview-frame")[0];
      fillPreviewIframe(frame, ent, preset.id);

      $card.find(".inv-invoice-sample-use").on("click", function () {
        db
          .setActiveInvoiceFormat(preset.id)
          .then(function () {
            M.toast({ html: "Active invoice sample updated." });
            renderCards(ent);
          })
          .catch(showToast);
      });

      $grid.append($card);
    });

    refreshActiveFormatPreview(ent);
  }

  $(function () {
    margOpenDatabase()
      .then(function (api) {
        db = new MargDb(api);
        if (!db.getCurrentEntityId()) {
          window.location.href = "index.html";
          return null;
        }
        return db.persistInvoiceFormatIfMigrated();
      })
      .then(function () {
        if (!db || !db.getCurrentEntityId()) return;
        var ent = db.getEntityById(db.getCurrentEntityId());
        mountPharmaPulseShell({
          el: "#layout-root",
          activeSection: "invoice-samples",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        if (!ent) return;
        renderCards(ent);
      })
      .catch(function (err) {
        console.error(err);
        M.toast({ html: "Database failed to open." });
      });
  });
})();
