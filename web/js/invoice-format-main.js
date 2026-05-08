/**
 * Admin — Invoice print formats & visual designs (v2: built-in samples + custom in entity.invoice_format_json).
 */
(function () {
  var db;
  var previewTimer = null;
  /** JSON of MargInvoiceFormatDefaults.normalizeOptions(...) after load or successful save. */
  var baselineSnapshot = "";

  /** Fixed sample data so the preview matches printed invoice layout. */
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
    M.toast({ html: msg, classes: "rounded", displayLength: 5000 });
  }

  function togglePaperCustomRow() {
    var custom = $("#inv-fmt-paper-size").val() === "custom";
    $("#inv-fmt-paper-custom-wrap").css("display", custom ? "block" : "none");
  }

  function applyOptionsToForm(opt) {
    $("#inv-fmt-document-title").val(opt.documentTitle || "");
    $("#inv-fmt-design-template").val(MargInvoiceFormatDefaults.normalizeDesignTemplate(opt.designTemplate));
    $("#inv-fmt-print-color-mode").val(MargInvoiceFormatDefaults.normalizePrintColorMode(opt.printColorMode));
    $("#inv-fmt-paper-size").val(MargInvoiceFormatDefaults.normalizePaperSize(opt.paperSize));
    var d = MargInvoiceFormatDefaults.DEFAULTS;
    $("#inv-fmt-paper-width-mm").val(
      opt.customPaperWidthMm != null ? opt.customPaperWidthMm : d.customPaperWidthMm
    );
    $("#inv-fmt-paper-height-mm").val(
      opt.customPaperHeightMm != null ? opt.customPaperHeightMm : d.customPaperHeightMm
    );
    togglePaperCustomRow();
    $("#inv-fmt-show-bill-to").prop("checked", !!opt.showBillTo);
    $("#inv-fmt-show-summary").prop("checked", !!opt.showSummaryBox);
    $("#inv-fmt-show-schedule").prop("checked", !!opt.showLineSchedule);
    $("#inv-fmt-show-product-code").prop("checked", opt.showProductCode !== false);
    $("#inv-fmt-show-line-notes").prop("checked", opt.showLineNotes !== false);
    $("#inv-fmt-show-status").prop("checked", opt.showInvoiceStatus !== false);
    $("#inv-fmt-show-notes").prop("checked", !!opt.showOrderNotes);
    $("#inv-fmt-show-terms").prop("checked", !!opt.showTerms);
    $("#inv-fmt-show-phone").prop("checked", !!opt.showShopPhone);
    $("#inv-fmt-show-gstin").prop("checked", !!opt.showShopGstin);
    $("#inv-fmt-show-dl").prop("checked", !!opt.showShopDl);
    $("#inv-fmt-show-gen-footer").prop("checked", !!opt.showGeneratedFooter);
    $("#inv-fmt-show-qr").prop("checked", opt.showQrCode !== false);
    $("#inv-fmt-custom-footer").val(opt.customFooterLine != null ? String(opt.customFooterLine) : "");
    M.updateTextFields();
    M.textareaAutoResize($("#inv-fmt-custom-footer"));
    setBaselineFromCurrent();
    if (db) updateToolbar();
    schedulePreviewRefresh();
  }

  function collectOptionsFromForm() {
    var title = $("#inv-fmt-document-title").val();
    var custom = $("#inv-fmt-custom-footer").val();
    return {
      designTemplate: MargInvoiceFormatDefaults.normalizeDesignTemplate($("#inv-fmt-design-template").val()),
      printColorMode: MargInvoiceFormatDefaults.normalizePrintColorMode($("#inv-fmt-print-color-mode").val()),
      paperSize: MargInvoiceFormatDefaults.normalizePaperSize($("#inv-fmt-paper-size").val()),
      customPaperWidthMm: Number($("#inv-fmt-paper-width-mm").val()),
      customPaperHeightMm: Number($("#inv-fmt-paper-height-mm").val()),
      documentTitle:
        title && String(title).trim()
          ? String(title).trim()
          : MargInvoiceFormatDefaults.DEFAULTS.documentTitle,
      showBillTo: $("#inv-fmt-show-bill-to").prop("checked"),
      showSummaryBox: $("#inv-fmt-show-summary").prop("checked"),
      showLineSchedule: $("#inv-fmt-show-schedule").prop("checked"),
      showProductCode: $("#inv-fmt-show-product-code").prop("checked"),
      showLineNotes: $("#inv-fmt-show-line-notes").prop("checked"),
      showInvoiceStatus: $("#inv-fmt-show-status").prop("checked"),
      showOrderNotes: $("#inv-fmt-show-notes").prop("checked"),
      showTerms: $("#inv-fmt-show-terms").prop("checked"),
      showShopPhone: $("#inv-fmt-show-phone").prop("checked"),
      showShopGstin: $("#inv-fmt-show-gstin").prop("checked"),
      showShopDl: $("#inv-fmt-show-dl").prop("checked"),
      showGeneratedFooter: $("#inv-fmt-show-gen-footer").prop("checked"),
      showQrCode: $("#inv-fmt-show-qr").prop("checked"),
      customFooterLine: custom && String(custom).trim() ? String(custom).trim() : "",
    };
  }

  function setBaselineFromCurrent() {
    if (typeof MargInvoiceFormatDefaults === "undefined") return;
    baselineSnapshot = JSON.stringify(MargInvoiceFormatDefaults.normalizeOptions(collectOptionsFromForm()));
  }

  function isDirty() {
    if (typeof MargInvoiceFormatDefaults === "undefined") return false;
    return JSON.stringify(MargInvoiceFormatDefaults.normalizeOptions(collectOptionsFromForm())) !== baselineSnapshot;
  }

  function schedulePreviewRefresh() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshInvoicePreview, 180);
  }

  /**
   * Prefer latest real order for preview so shop/customer/lines match the database.
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

  function refreshInvoicePreview() {
    if (typeof MargInvoiceHtml === "undefined" || !db) return;
    var ent = db.getCurrentEntity();
    if (!ent) return;
    var frame = document.getElementById("invoice-preview-frame");
    if (!frame) return;
    try {
      var fmt = collectOptionsFromForm();
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

  function populateFormatSelect() {
    var state = db.getInvoiceFormatState();
    var lists = MargInvoiceFormatDefaults.listFormatsForUi(state);
    var $sel = $("#inv-fmt-format-select");
    $sel.empty();
    var og1 = $('<optgroup label="Built-in samples"></optgroup>');
    lists.builtIn.forEach(function (f) {
      var opt = $("<option></option>").attr("value", f.id).text(f.name);
      if (f.description) opt.attr("title", f.description);
      og1.append(opt);
    });
    var og2 = $('<optgroup label="My formats"></optgroup>');
    if (lists.custom.length === 0) {
      og2.append($('<option value="" disabled>— No custom formats yet —</option>'));
    } else {
      lists.custom.forEach(function (f) {
        og2.append($("<option></option>").attr("value", f.id).text(f.name));
      });
    }
    $sel.append(og1).append(og2);
    var want = state.activeFormatId;
    $sel.val(want);
    if ($sel.val() !== want) {
      $sel.val("builtin-gst-pharmacy");
    }
  }

  function updateToolbar() {
    if (!db) return;
    var state = db.getInvoiceFormatState();
    var id = state.activeFormatId;
    var isBi = MargInvoiceFormatDefaults.isBuiltinId(id);
    var dirty = isDirty();
    $("#inv-fmt-builtin-hint").toggle(!!isBi);
    $("#btn-inv-fmt-delete").toggle(!isBi);
    $("#btn-inv-fmt-save-as-new").toggle(!isBi);
    $("#btn-save-invoice-format").prop("disabled", !dirty);
    $("#btn-save-invoice-format-label").text(isBi && dirty ? "Save as new" : "Save");
    var title;
    if (!dirty) {
      title = isBi ? "Change options to save as a new custom format" : "No unsaved changes";
    } else {
      title = isBi ? "Save as a new custom format" : "Save changes to this format";
    }
    $("#btn-save-invoice-format").attr("title", title);
  }

  function promptSaveAsNewFormat() {
    var name = window.prompt("Name for the new custom format (saved from the current form):", "My invoice format");
    if (name == null) return;
    name = String(name).trim();
    if (!name) {
      showToast(new Error("Name is required."));
      return;
    }
    db
      .saveCustomInvoiceFormat({ id: null, name: name, options: collectOptionsFromForm() })
      .then(function () {
        populateFormatSelect();
        applyOptionsToForm(db.getInvoiceFormatOptions());
        M.toast({ html: "New format saved and set as active." });
      })
      .catch(showToast);
  }

  function onFormatFormInput() {
    schedulePreviewRefresh();
    updateToolbar();
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
          activeSection: "invoice-format",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        populateFormatSelect();
        applyOptionsToForm(db.getInvoiceFormatOptions());

        $("#inv-fmt-format-select").on("change", function () {
          var id = $(this).val();
          if (!id) return;
          db
            .setActiveInvoiceFormat(id)
            .then(function () {
              populateFormatSelect();
              applyOptionsToForm(db.getInvoiceFormatOptions());
            })
            .catch(showToast);
        });

        $("#inv-fmt-document-title, #inv-fmt-custom-footer, #inv-fmt-design-template, #inv-fmt-print-color-mode").on(
          "input change",
          onFormatFormInput
        );
        $("#inv-fmt-paper-size").on("change", function () {
          togglePaperCustomRow();
          onFormatFormInput();
        });
        $("#inv-fmt-paper-width-mm, #inv-fmt-paper-height-mm").on("input change", onFormatFormInput);
        $(".inv-fmt-classic-fieldset input[type=checkbox]").on("change", onFormatFormInput);

        $("#btn-reset-invoice-format").on("click", function () {
          var state = db.getInvoiceFormatState();
          var id = state.activeFormatId;
          if (MargInvoiceFormatDefaults.isBuiltinId(id)) {
            if (!confirm("Reset the form to this built-in preset’s default options? (Nothing is saved until you use Save as new.)")) {
              return;
            }
            applyOptionsToForm(MargInvoiceFormatDefaults.builtinOptionsById(id));
            return;
          }
          if (!confirm("Reset this custom format to global defaults and save?")) {
            return;
          }
          db
            .updateInvoiceFormatOptions(MargInvoiceFormatDefaults.normalizeOptions({}))
            .then(function () {
              applyOptionsToForm(db.getInvoiceFormatOptions());
              M.toast({ html: "Custom format reset to defaults." });
            })
            .catch(showToast);
        });

        $("#btn-save-invoice-format").on("click", function () {
          if ($(this).prop("disabled")) return;
          var state = db.getInvoiceFormatState();
          if (MargInvoiceFormatDefaults.isBuiltinId(state.activeFormatId)) {
            promptSaveAsNewFormat();
            return;
          }
          db
            .updateInvoiceFormatOptions(collectOptionsFromForm())
            .then(function () {
              setBaselineFromCurrent();
              updateToolbar();
              M.toast({ html: "Invoice format saved." });
            })
            .catch(showToast);
        });

        $("#btn-inv-fmt-save-as-new").on("click", function () {
          promptSaveAsNewFormat();
        });

        $("#btn-inv-fmt-delete").on("click", function () {
          var state = db.getInvoiceFormatState();
          var id = state.activeFormatId;
          if (MargInvoiceFormatDefaults.isBuiltinId(id)) return;
          if (!confirm("Delete this custom format? The active format will switch to GST pharmacy grid (default).")) {
            return;
          }
          db
            .deleteCustomInvoiceFormat(id)
            .then(function () {
              populateFormatSelect();
              applyOptionsToForm(db.getInvoiceFormatOptions());
              M.toast({ html: "Format deleted." });
            })
            .catch(showToast);
        });
      })
      .catch(function (err) {
        console.error(err);
        M.toast({ html: "Database failed to open." });
      });
  });
})();
