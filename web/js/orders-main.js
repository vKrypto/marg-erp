/**
 * Orders UI — docs/order.md (shop_order, order_line, order_line_schedule)
 */
(function () {
  var db;
  var productsCache = [];
  var customersCache = [];
  var lineGroupSeq = 0;
  var editingOrderId = null;
  var readOnly = false;
  var currentOrderStatus = "draft";
  /** When set, order header is linked to this prescription (patient must match customer). */
  var linkedPrescriptionId = null;
  var linkedRxCustomerId = null;

  function rupeesToPaise(v) {
    var s = String(v == null ? "" : v)
      .replace(/[₹,\s]/g, "")
      .trim();
    if (s === "") return 0;
    var n = parseFloat(s);
    return isNaN(n) ? 0 : Math.round(n * 100);
  }

  function paiseToRupees(p) {
    return (Number(p) || 0) / 100;
  }

  function formatInr(paise) {
    return "₹" + paiseToRupees(paise).toFixed(2);
  }

  function headerDiscountFlatHasValue() {
    return rupeesToPaise($("#order-discount-flat-inr").val()) > 0;
  }

  function headerDiscountPctHasValue() {
    var v = $("#order-discount-pct").val();
    if (v === "" || v == null) return false;
    var n = Number(v);
    return !isNaN(n) && n > 0;
  }

  function collectHeaderDiscountForSave() {
    var pctRaw = $("#order-discount-pct").val();
    var pct = pctRaw !== "" && pctRaw != null ? Number(pctRaw) : NaN;
    if (!isNaN(pct) && pct > 0) {
      return {
        order_header_discount_flat_paise: 0,
        order_header_discount_percent: Math.min(50, Math.max(0, Math.round(pct))),
      };
    }
    return {
      order_header_discount_flat_paise: rupeesToPaise($("#order-discount-flat-inr").val()),
      order_header_discount_percent: null,
    };
  }

  function computeHeaderDiscountPaiseFromInputs(lineSumPaise) {
    var sum = Math.max(0, Number(lineSumPaise) || 0);
    var pctRaw = $("#order-discount-pct").val();
    var pct = pctRaw !== "" && pctRaw != null ? Number(pctRaw) : NaN;
    if (!isNaN(pct) && pct > 0) {
      var p = Math.min(50, Math.max(0, Math.round(pct)));
      return Math.min(sum, Math.round((sum * p) / 100));
    }
    var flat = rupeesToPaise($("#order-discount-flat-inr").val());
    return Math.min(Math.max(0, flat), sum);
  }

  /**
   * Pop-up print: do NOT pass noopener/noreferrer in windowFeatures — MDN: that makes window.open return null.
   */
  function printInvoiceInHiddenIframe(html) {
    var $iframe = $("#invoice-print-frame");
    if (!$iframe.length) {
      $iframe = $('<iframe id="invoice-print-frame" class="inv-invoice-print-frame" title="Invoice print"></iframe>');
      $("body").append($iframe);
    }
    var win = $iframe[0].contentWindow;
    if (!win) {
      return false;
    }
    var doc = win.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(function () {
      try {
        win.focus();
        win.print();
      } catch (e) {
        /* ignore */
      }
    }, 300);
    return true;
  }

  function printOrderInvoice(orderId) {
    var o = db.getOrder(orderId);
    if (!o) {
      M.toast({ html: "Order not found." });
      return;
    }
    var ent = db.getCurrentEntity();
    var cust = db.getCustomer(o.customer_id);
    var lines = db.getOrderLines(orderId);
    var lineRows = lines.map(function (ln) {
      return { line: ln, schedule: db.getOrderLineSchedule(ln.id) };
    });
    var fmt = db.getInvoiceFormatOptions();
    var html = MargInvoiceHtml.buildDocument(ent, o, cust, lineRows, fmt, { db: db });
    var w = window.open("about:blank", "_blank");
    if (!w) {
      if (printInvoiceInHiddenIframe(html)) {
        return;
      }
      M.toast({ html: "Could not open print. Try again or check browser settings." });
      return;
    }
    try {
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(function () {
        try {
          w.print();
        } catch (e1) {
          if (!printInvoiceInHiddenIframe(html)) {
            M.toast({ html: "Print failed. Try again or allow pop-ups." });
          }
        }
      }, 250);
    } catch (e) {
      if (!printInvoiceInHiddenIframe(html)) {
        M.toast({ html: "Could not prepare invoice for print." });
      }
    }
  }

  function todayIsoDate() {
    var d = new Date();
    var pad = function (n) {
      return n < 10 ? "0" + n : "" + n;
    };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function showToast(err) {
    var msg = err && err.message ? err.message : String(err);
    if (msg.indexOf("UNIQUE") >= 0 || msg.toLowerCase().indexOf("constraint") >= 0) {
      msg = "Order number already used for this entity.";
    }
    M.toast({ html: msg, classes: "rounded", displayLength: 4500 });
  }

  function mountShell() {
    var ent = db.getEntityById(db.getCurrentEntityId());
    mountPharmaPulseShell({
      el: "#layout-root",
      activeSection: "orders",
      entityName: ent ? ent.entity_name : "—",
      db: db,
    });
  }

  function customerLabelFromRow(c) {
    if (!c) return "";
    var lab = c.name || "";
    if (c.phone) lab += " · " + c.phone;
    return lab;
  }

  function customerMatchesSearch(c, qq) {
    if (!qq) return true;
    var q = qq.toLowerCase();
    if (customerLabelFromRow(c).toLowerCase().indexOf(q) >= 0) return true;
    if ((c.name || "").toLowerCase().indexOf(q) >= 0) return true;
    if ((c.phone || "").replace(/\s/g, "").toLowerCase().indexOf(q.replace(/\s/g, "")) >= 0) return true;
    if ((c.city || "").toLowerCase().indexOf(q) >= 0) return true;
    if ((c.email || "").toLowerCase().indexOf(q) >= 0) return true;
    return false;
  }

  function fillCustomerDropdown($ul, q) {
    $ul.empty();
    var qq = (q || "").toLowerCase().trim();
    var n = 0;
    for (var i = 0; i < customersCache.length; i++) {
      var c = customersCache[i];
      if (!customerMatchesSearch(c, qq)) continue;
      $ul.append(
        $("<li></li>")
          .addClass("oc-customer-li")
          .attr("data-id", c.id)
          .text(customerLabelFromRow(c))
      );
      if (++n >= 80) break;
    }
    if (!n) {
      $ul.append(
        $("<li></li>").addClass("oc-customer-li oc-customer-li--empty").text("No matches")
      );
    }
  }

  function closeAllCustomerDropdowns() {
    $("#order-customer-dd").addClass("hide").attr("aria-hidden", "true");
  }

  /** Red text when the box has text but no customer picked from the list (hidden id empty). */
  function syncOrderCustomerSearchUnknownClass() {
    var raw = ($("#order-customer-search").val() || "").trim();
    var hasId = !!String($("#order-customer-id").val() || "").trim();
    $("#order-customer-search").toggleClass("oc-customer-search--unknown", raw.length > 0 && !hasId);
  }

  /** Build HTML for prescription lines (type + notes; omits secret_notes). */
  function renderPrescriptionLinesForOrder(lines) {
    if (!lines || !lines.length) {
      return (
        '<p class="inv-order-prescription-lines-empty grey-text text-darken-1">No lines on this prescription.</p>'
      );
    }
    var parts = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var idx = i + 1;
      var type = ln.prescription_type != null ? String(ln.prescription_type).trim() : "";
      var notes = ln.prescription_notes != null ? String(ln.prescription_notes).trim() : "";
      var st = ln.prescription_status != null ? String(ln.prescription_status).trim() : "";
      var head = "";
      if (type) {
        head += '<span class="inv-order-rx-line-type">' + _.escape(type) + "</span>";
      }
      if (st && st !== "draft") {
        head +=
          (head ? " " : "") +
          '<span class="inv-order-rx-line-status chip inv-order-rx-chip">' +
          _.escape(st) +
          "</span>";
      }
      if (!head) {
        if (notes) {
          head = '<span class="inv-order-rx-line-type">' + _.escape(notes) + "</span>";
          notes = "";
        } else {
          head = '<span class="grey-text">(no description)</span>';
        }
      }
      var block =
        '<li class="inv-order-rx-line">' +
        '<span class="inv-order-rx-line-num">' +
        idx +
        ".</span> " +
        '<span class="inv-order-rx-line-main">' +
        head +
        "</span>";
      if (notes) {
        block +=
          '<div class="inv-order-rx-line-notes">' + _.escape(notes) + "</div>";
      }
      block += "</li>";
      parts.push(block);
    }
    return '<ul class="inv-order-rx-line-list">' + parts.join("") + "</ul>";
  }

  function clearPrescriptionLink() {
    linkedPrescriptionId = null;
    linkedRxCustomerId = null;
    $("#order-prescription-id").val("");
    $("#order-prescription-summary").empty();
    $("#order-prescription-lines").empty();
    $("#order-prescription-link").attr("href", "#");
    $("#order-prescription-panel").addClass("hide");
    $("#btn-order-unlink-rx").addClass("hide");
  }

  /**
   * @param {number|string} rxId
   * @param {{ skipCustomerRefresh?: boolean, silent?: boolean }} [opts]
   */
  function applyPrescriptionLink(rxId, opts) {
    opts = opts || {};
    var rxIdNum = Number(rxId);
    if (!rxIdNum || isNaN(rxIdNum)) {
      clearPrescriptionLink();
      return;
    }
    var pack = db.getPrescription(rxIdNum);
    if (!pack || !pack.header) {
      if (!opts.silent) M.toast({ html: "Prescription not found." });
      clearPrescriptionLink();
      return;
    }
    var h = pack.header;
    linkedPrescriptionId = rxIdNum;
    linkedRxCustomerId = Number(h.customer_id);
    $("#order-prescription-id").val(String(rxIdNum));
    var doc = [h.doctor_name, h.doctor_phone].filter(Boolean).join(" · ");
    var rxDate = h.created_at ? String(h.created_at).slice(0, 10) : "—";
    var nLines = pack.lines ? pack.lines.length : 0;
    var patientLine = "Patient: " + (h.customer_name || "—");
    if (h.customer_phone) patientLine += " · " + h.customer_phone;
    var metaLine = "Prescribed: " + rxDate + " · " + nLines + " line(s)";
    var html =
      "<span>" +
      _.escape(patientLine) +
      "</span><br><span>" +
      _.escape(metaLine) +
      "</span>" +
      (doc ? "<br><span>" + _.escape("Doctor: " + doc) + "</span>" : "");
    $("#order-prescription-summary").html(html);
    $("#order-prescription-lines").html(renderPrescriptionLinesForOrder(pack.lines));
    $("#order-prescription-link").attr("href", "prescription-detail.html?id=" + rxIdNum);
    $("#order-prescription-panel").removeClass("hide");
    if (!opts.skipCustomerRefresh) {
      refreshCustomerSelect(h.customer_id);
    }
    applyEditorButtonState();
  }

  function refreshCustomerSelect(selectedId) {
    customersCache = db.listCustomers("");
    var sid =
      selectedId != null && selectedId !== ""
        ? Number(selectedId)
        : null;
    if (linkedPrescriptionId) {
      if (!sid || sid !== linkedRxCustomerId) {
        clearPrescriptionLink();
        if (sid) {
          M.toast({ html: "Prescription unlinked — customer changed." });
        }
      }
    }
    var $hid = $("#order-customer-id");
    var $search = $("#order-customer-search");
    $hid.val(selectedId ? String(selectedId) : "");
    if (selectedId) {
      var c = db.getCustomer(Number(selectedId));
      $search.val(c ? customerLabelFromRow(c) : "");
    } else {
      $search.val("");
    }
    $("#order-customer-dd").empty().addClass("hide").attr("aria-hidden", "true");
    syncOrderCustomerSearchUnknownClass();
  }

  function productLabelFromProduct(p) {
    if (!p) return "";
    var lab = p.name || "";
    if (p.code) lab += " (" + p.code + ")";
    var pk = p.pack_label != null ? String(p.pack_label).trim() : "";
    if (pk) lab += " · " + pk;
    return lab;
  }

  /** Total tablets on hand (db.stock_on_hand = SUM lot_line.available_tabs). */
  function productTabsOnHand(p) {
    if (!p) return 0;
    var tabs = p.stock_on_hand != null ? Number(p.stock_on_hand) : 0;
    if (isNaN(tabs) || tabs < 0) return 0;
    return Math.round(tabs);
  }

  function isProductOutOfStock(p) {
    return productTabsOnHand(p) <= 0;
  }

  /** Confirmed orders already deducted stock — line qty is historical; do not flag vs current availability. */
  function skipStockAvailabilityUi() {
    return currentOrderStatus === "confirmed";
  }

  /** Word used in stock messages instead of hard-coded “tabs” — from product type label when present. */
  function productStockUnitLabel(p) {
    if (!p) return "tabs";
    var lab = p.product_type_label != null ? String(p.product_type_label).trim() : "";
    return lab || "tabs";
  }

  /**
   * Max tablets sellable vs stock, or null if units/strip unset (UI cannot interpret tab qty vs pricing).
   */
  function productTabsAvailable(p) {
    if (!p) return null;
    var ups = p.units_per_strip != null && p.units_per_strip !== "" ? Number(p.units_per_strip) : NaN;
    if (ups > 0 && !isNaN(ups)) return productTabsOnHand(p);
    return null;
  }

  function productInStockLineLabel(p) {
    if (!p) return "";
    var unit = productStockUnitLabel(p);
    if (isProductOutOfStock(p)) return "Out of stock (0 " + unit + " in lots)";
    var tabs = productTabsOnHand(p);
    var ups = p.units_per_strip != null && p.units_per_strip !== "" ? Number(p.units_per_strip) : NaN;
    if (ups > 0 && !isNaN(ups)) {
      return tabs + " " + unit + " available (all lots)";
    }
    return tabs + " units on hand (set units/strip on product for tab pricing)";
  }

  function setTabsStockCell($tr, $tabsStock, p, lab, oos) {
    var $qty = $tr.find(".ol-tabs");
    $qty.removeClass("ol-tabs--over");
    $tabsStock.removeClass("ol-tabs-stock--over").empty();
    var qty = parseInt($qty.val(), 10);
    var maxTabs = productTabsAvailable(p);
    var over =
      !skipStockAvailabilityUi() && maxTabs !== null && !isNaN(qty) && qty > maxTabs;
    var unitWord = productStockUnitLabel(p);
    if (over) {
      $tabsStock
        .removeClass("ol-tabs-stock--empty")
        .addClass("ol-tabs-stock--over")
        .toggleClass("ol-tabs-stock--oos", oos)
        .attr("aria-hidden", "false");
      $tabsStock.append(
        $("<span></span>").addClass("ol-tabs-stock-line").text(lab),
        $("<span></span>")
          .addClass("ol-tabs-stock-warn")
          .text(
            "Warning: quantity exceeds available stock (max " + maxTabs + " " + unitWord + ")."
          )
      );
      $qty.addClass("ol-tabs--over");
    } else {
      $tabsStock
        .removeClass("ol-tabs-stock--over")
        .text(lab)
        .toggleClass("ol-tabs-stock--oos", oos)
        .removeClass("ol-tabs-stock--empty")
        .attr("aria-hidden", "false");
    }
  }

  function updateLineStockDisplay($tr) {
    var $hint = $tr.find(".ol-product-stock-hint");
    var $tabsStock = $tr.find(".ol-tabs-stock");
    var pid = $tr.find(".ol-product-id").val();
    if (!pid) {
      $tr.find(".ol-tabs").removeClass("ol-tabs--over");
      if ($hint.length) {
        $hint.text("").removeClass("ol-product-stock-hint--oos").addClass("hide").attr("aria-hidden", "true");
      }
      if ($tabsStock.length) {
        $tabsStock
          .removeClass("ol-tabs-stock--over")
          .empty()
          .text("Select a product to see quantity available in lots")
          .removeClass("ol-tabs-stock--oos")
          .addClass("ol-tabs-stock--empty")
          .attr("aria-hidden", "false");
      }
      return;
    }
    var id = Number(pid);
    var p = db.getProduct(id) || findProductInCache(pid);
    if (!p) {
      $tr.find(".ol-tabs").removeClass("ol-tabs--over");
      var miss = "Could not load stock for this product";
      if ($hint.length) {
        $hint.text(miss).removeClass("ol-product-stock-hint--oos").removeClass("hide").attr("aria-hidden", "false");
      }
      if ($tabsStock.length) {
        $tabsStock
          .removeClass("ol-tabs-stock--over")
          .empty()
          .text(miss)
          .removeClass("ol-tabs-stock--oos")
          .addClass("ol-tabs-stock--empty")
          .attr("aria-hidden", "false");
      }
      return;
    }
    var oos = skipStockAvailabilityUi() ? false : isProductOutOfStock(p);
    var lab = productInStockLineLabel(p);
    if ($hint.length) {
      $hint
        .text(lab)
        .toggleClass("ol-product-stock-hint--oos", oos)
        .removeClass("hide")
        .attr("aria-hidden", "false");
    }
    if ($tabsStock.length) {
      setTabsStockCell($tr, $tabsStock, p, lab, oos);
    }
  }

  function findProductInCache(pid) {
    if (pid == null || pid === "") return null;
    var n = Number(pid);
    for (var i = 0; i < productsCache.length; i++) {
      if (Number(productsCache[i].id) === n) return productsCache[i];
    }
    return null;
  }

  function fillProductDropdown($ul, q) {
    $ul.empty();
    var qq = (q || "").toLowerCase().trim();
    var n = 0;
    for (var i = 0; i < productsCache.length; i++) {
      var p = productsCache[i];
      var lab = productLabelFromProduct(p);
      if (qq && lab.toLowerCase().indexOf(qq) < 0) continue;
      var hint = productInStockLineLabel(p);
      var oos = isProductOutOfStock(p);
      $ul.append(
        $("<li></li>")
          .addClass("ol-product-li")
          .toggleClass("ol-product-li--oos", oos)
          .attr("data-id", p.id)
          .attr("data-label", lab)
          .append(
            $("<span></span>").addClass("ol-product-li-main").text(lab),
            $("<span></span>").addClass("ol-product-li-meta").text(hint)
          )
      );
      if (++n >= 80) break;
    }
    if (!n) {
      $ul.append($("<li></li>").addClass("ol-product-li ol-product-li--empty muted").text("No matches"));
    }
  }

  function closeAllProductDropdowns() {
    $("#order-lines-body .ol-product-dd").addClass("hide");
  }

  function recalcLineRow($tr) {
    if (!$tr || !$tr.length) return;
    updateLineStockDisplay($tr);
    if (readOnly) return;
    var pid = $tr.find(".ol-product-id").val();
    var tabs = parseInt($tr.find(".ol-tabs").val(), 10);
    var lineDisc = rupeesToPaise($tr.find(".ol-line-disc-inr").val());
    var $total = $tr.find(".ol-line-total-inr");
    if (!pid || !tabs || tabs < 1) {
      $total.val("");
      updateTotalsDisplay();
      return;
    }
    var p = findProductInCache(pid) || db.getProduct(Number(pid));
    var ups = p && Number(p.units_per_strip) > 0 ? Number(p.units_per_strip) : 10;
    var stripPaise = db.getLatestStripSellingPricePaise(Number(pid));
    var gross = Math.round((tabs / ups) * stripPaise);
    var net = Math.max(0, gross - lineDisc);
    $total.val(paiseToRupees(net).toFixed(2));
    updateTotalsDisplay();
  }

  function appendLineRow(data) {
    data = data || {};
    var gid = ++lineGroupSeq;
    var qty = data.quantity != null ? data.quantity : 1;
    var totalInr =
      data.total_price_paise != null ? paiseToRupees(data.total_price_paise).toFixed(2) : "";
    var lineDiscInr =
      data.line_discount_paise != null && Number(data.line_discount_paise) > 0
        ? paiseToRupees(data.line_discount_paise).toFixed(2)
        : "";
    var sch = data.schedule || {};
    var remarks = sch.remarks != null ? String(sch.remarks) : "";
    var lineNotes = data.line_notes != null ? String(data.line_notes) : "";

    var $hid = $("<input>").attr({ type: "hidden" }).addClass("ol-product-id").val(data.product_id ? String(data.product_id) : "");
    var $search = $("<input>")
      .attr({ type: "text", placeholder: "Search product…", autocomplete: "off" })
      .addClass("browser-default ol-product-search");
    var pCached = data.product_id != null ? findProductInCache(data.product_id) : null;
    if (pCached) {
      $search.val(productLabelFromProduct(pCached));
    } else if (data.product_id) {
      var lab = (data.product_name || "").trim();
      if (data.product_code && String(data.product_code).trim()) {
        lab += lab ? " (" + data.product_code + ")" : String(data.product_code);
      }
      var pkRow = data.pack_label != null ? String(data.pack_label).trim() : "";
      if (pkRow) lab += (lab ? " · " : "") + pkRow;
      $search.val(lab);
    }
    var $dd = $("<ul></ul>").addClass("ol-product-dd hide browser-default");
    var $stockHint = $("<div></div>")
      .addClass("ol-product-stock-hint grey-text text-darken-1 hide")
      .attr("aria-live", "polite")
      .attr("aria-hidden", "true");
    var $wrap = $("<div></div>").addClass("ol-product-wrap").append($search, $hid, $dd, $stockHint);

    var $r1 = $("<tr></tr>")
      .addClass("order-line-row")
      .attr("data-line-group", gid)
      .append(
        $("<td></td>").append($wrap),
        $("<td></td>")
          .addClass("inv-olt-tabs-cell")
          .append(
            $("<input>")
              .attr({ type: "number", min: 1, step: 1 })
              .addClass("browser-default ol-tabs inv-olt-input-num")
              .val(qty),
            $("<div></div>")
              .addClass("ol-tabs-stock ol-tabs-stock--empty")
              .attr("aria-live", "polite")
              .attr("aria-hidden", "false")
              .text("Select a product to see quantity available in lots")
          ),
        $("<td></td>").append(
          $("<input>")
            .attr({ type: "text", placeholder: "0" })
            .addClass("browser-default ol-line-disc-inr inv-olt-input-num")
            .val(lineDiscInr)
        ),
        $("<td></td>").append(
          $("<input>")
            .attr({ type: "text", placeholder: "—", readonly: true, tabindex: -1 })
            .addClass("browser-default ol-line-total-inr")
            .val(totalInr)
        ),
        $("<td></td>")
          .addClass("inv-actions-cell")
          .append(
            $('<a href="#!" class="inv-icon-btn ol-remove" title="Remove line"></a>').append(
              '<i class="material-icons">delete</i>'
            )
          )
      );

    var $rn = $("<tr></tr>")
      .addClass("order-line-notes-row")
      .attr("data-line-group", gid)
      .append(
        $("<td></td>")
          .attr("colspan", 5)
          .addClass("inv-olt-notes-cell")
          .append(
            $("<label></label>")
              .addClass("inv-olt-line-notes-label grey-text text-darken-1")
              .attr("for", "ol-line-notes-" + gid)
              .text("Line notes"),
            $("<input>")
              .attr({
                type: "text",
                id: "ol-line-notes-" + gid,
                placeholder: "Optional notes for this line",
                autocomplete: "off",
              })
              .addClass("browser-default ol-line-notes")
              .val(lineNotes)
          )
      );

    function schChecked(key) {
      return Number(sch[key]) === 1;
    }

    var $remarks = $("<textarea></textarea>")
      .addClass("inv-table-textarea-sm browser-default ol-sch-remarks")
      .css("width", "100%")
      .val(remarks);

    var $schedInner = $('<div class="inv-sched-checks"></div>');
    [
      ["ol-sch-m", "Morning", schChecked("in_morning")],
      ["ol-sch-n", "Noon", schChecked("in_noon")],
      ["ol-sch-e", "Evening", schChecked("in_evening")],
      ["ol-sch-nt", "Night", schChecked("in_night")],
    ].forEach(function (x) {
      var $cb = $("<input>")
        .attr("type", "checkbox")
        .addClass("filled-in " + x[0])
        .prop("checked", x[2]);
      $schedInner.append(
        $("<label></label>").append($cb, $("<span></span>").text(x[1]))
      );
    });

    var $r2 = $("<tr></tr>")
      .addClass("order-line-sched grey lighten-5")
      .attr("data-line-group", gid)
      .append(
        $("<td></td>")
          .attr("colspan", 5)
          .append(
            $schedInner,
            $('<label class="grey-text text-darken-1" style="font-size:0.8rem;display:block;margin-top:0.5rem">Schedule remarks</label>'),
            $remarks
          )
      );

    $("#order-lines-body").append($r1, $rn, $r2);
    updateLineStockDisplay($r1);
  }

  function clearLines() {
    $("#order-lines-body").empty();
    lineGroupSeq = 0;
  }

  function applyEditorButtonState() {
    var mayEdit = currentOrderStatus === "draft" && !readOnly;
    $("#btn-save-draft").toggle(mayEdit);
    $("#btn-confirm-order").toggle(mayEdit);
    $("#btn-cancel-order").toggle(mayEdit && !!editingOrderId);
    $("#btn-delete-order").toggle(mayEdit && !!editingOrderId);
    $("#btn-quick-customer").toggle(mayEdit);
    $("#btn-add-line").toggle(mayEdit);
    $("#btn-print-invoice").toggle(!!editingOrderId);
    $("#order-lines-body .ol-remove").css("visibility", mayEdit ? "visible" : "hidden");
    $("#btn-order-unlink-rx").toggleClass("hide", !(mayEdit && !!linkedPrescriptionId));
  }

  function applyReadonlyUI() {
    var ro = readOnly;
    $("#panel-order-editor").toggleClass("inv-readonly", ro);
    $("#order-customer-search, #order-customer-id, #order-date, #order-discount-flat-inr, #order-discount-pct, #order-notes").prop(
      "disabled",
      ro
    );
    $("#order-lines-body")
      .find("input, select, textarea")
      .prop("disabled", ro);
    applyEditorButtonState();
  }

  function resetEditor() {
    editingOrderId = null;
    currentOrderStatus = "draft";
    readOnly = false;
    clearPrescriptionLink();
    $("#order-editor-id").val("");
    $("#order-date").val(todayIsoDate());
    setOrderNumberDisplay(null);
    $("#order-discount-flat-inr").val("");
    $("#order-discount-pct").val("");
    $("#order-notes").val("");
    clearLines();
    appendLineRow();
    refreshCustomerSelect(null);
    applyReadonlyUI();
    updateTotalsDisplay();
    M.updateTextFields();
    if ($("#order-notes").length) M.textareaAutoResize($("#order-notes"));
  }

  function computeLinesSubtotalPaise() {
    var sum = 0;
    $("#order-lines-body tr.order-line-row").each(function () {
      sum += rupeesToPaise($(this).find(".ol-line-total-inr").val());
    });
    return sum;
  }

  function updateTotalsDisplay() {
    var sub = computeLinesSubtotalPaise();
    var disc = computeHeaderDiscountPaiseFromInputs(sub);
    var grand = Math.max(0, sub - disc);
    $("#order-sum-lines").text(formatInr(sub));
    $("#order-sum-discount").text(formatInr(disc));
    $("#order-sum-grand").text(formatInr(grand));
  }

  function collectLines() {
    var lines = [];
    $("#order-lines-body tr.order-line-row").each(function () {
      var $tr = $(this);
      var gid = $tr.attr("data-line-group");
      var $sched = $("#order-lines-body tr.order-line-sched[data-line-group='" + gid + "']");
      var productId = $tr.find(".ol-product-id").val();
      var qty = parseInt($tr.find(".ol-tabs").val(), 10);
      lines.push({
        product_id: productId ? Number(productId) : 0,
        quantity: qty,
        total_price_paise: rupeesToPaise($tr.find(".ol-line-total-inr").val()),
        line_discount_paise: rupeesToPaise($tr.find(".ol-line-disc-inr").val()),
        line_notes: $("#order-lines-body tr.order-line-notes-row[data-line-group='" + gid + "'] .ol-line-notes").val(),
        schedule: {
          in_morning: $sched.find(".ol-sch-m").prop("checked"),
          in_noon: $sched.find(".ol-sch-n").prop("checked"),
          in_evening: $sched.find(".ol-sch-e").prop("checked"),
          in_night: $sched.find(".ol-sch-nt").prop("checked"),
          remarks: $sched.find(".ol-sch-remarks").val(),
        },
      });
    });
    return lines;
  }

  function validateHeader() {
    if (!$("#order-customer-id").val()) {
      M.toast({ html: "Select a customer from the list." });
      return false;
    }
    return true;
  }

  /** UI-only: order numbers are generated in DB (ORD-000001) unless set by import. */
  function setOrderNumberDisplay(order) {
    var $el = $("#order-number-display");
    if (!$el.length) return;
    if (!order || !order.id) {
      $el
        .text("Auto-assigned when you save")
        .removeClass("inv-order-number-saved")
        .addClass("grey-text");
      $el.attr("title", "Order numbers are generated automatically when you save.");
      return;
    }
    var n =
      order.order_number && String(order.order_number).trim()
        ? String(order.order_number).trim()
        : "ORD-" + String(order.id).padStart(6, "0");
    $el.text(n).removeClass("grey-text").addClass("inv-order-number-saved");
    $el.attr("title", "");
  }

  function saveDraft() {
    if (!validateHeader()) return;
    var filtered = collectLines().filter(function (l) {
      return l.product_id;
    });
    if (!filtered.length) {
      M.toast({ html: "Add at least one line with a product." });
      return;
    }
    var header = Object.assign(
      {
        customer_id: Number($("#order-customer-id").val()),
        order_date: $("#order-date").val() || todayIsoDate(),
        order_number: null,
        notes: $("#order-notes").val() || null,
        status: "draft",
        prescription_id: linkedPrescriptionId || null,
      },
      collectHeaderDiscountForSave()
    );
    var p = editingOrderId
      ? db.updateOrderWithLines(editingOrderId, header, filtered)
      : db.insertOrderWithLines(header, filtered);

    p.then(function (id) {
      if (!editingOrderId && id) {
        editingOrderId = id;
      }
      $("#order-editor-id").val(String(editingOrderId));
      var o = db.getOrder(editingOrderId);
      setOrderNumberDisplay(o);
      $("#order-editor-title").text("Edit order · " + (o && o.order_number ? o.order_number : "#" + editingOrderId));
      M.toast({ html: "Draft saved." });
      applyEditorButtonState();
      refreshOrderList();
    }).catch(showToast);
  }

  function markCancelled() {
    if (!editingOrderId) {
      M.toast({ html: "Save draft first." });
      return;
    }
    if (!confirm("Mark this order as cancelled?")) return;
    db
      .setOrderStatus(editingOrderId, "cancelled")
      .then(function () {
        M.toast({ html: "Order cancelled." });
        showListPanel();
        refreshOrderList();
      })
      .catch(showToast);
  }

  function deleteDraft() {
    if (!editingOrderId) return;
    if (!confirm("Delete this draft order permanently?")) return;
    db
      .deleteOrder(editingOrderId)
      .then(function () {
        M.toast({ html: "Order deleted." });
        showListPanel();
        refreshOrderList();
      })
      .catch(showToast);
  }

  function refreshOrderList() {
    var q = $("#order-search").val() || "";
    var opts = {};
    if (q.trim()) opts.q = q.trim();
    var df = $("#order-filter-from").val();
    var dt = $("#order-filter-to").val();
    if (df) opts.dateFrom = df;
    if (dt) opts.dateTo = dt;
    var rows = db.listOrders(opts);
    var $tb = $("#order-table-body").empty();
    rows.forEach(function (r) {
      var st = r.status || "draft";
      var stClass =
        st === "confirmed"
          ? "teal-text"
          : st === "cancelled"
            ? "grey-text"
            : "amber-text text-darken-2";
      var actions =
        '<a href="#!" class="inv-icon-btn view-order" data-id="' +
        r.id +
        '" title="View"><i class="material-icons">visibility</i></a>' +
        '<a href="#!" class="inv-icon-btn print-order" data-id="' +
        r.id +
        '" title="Print invoice"><i class="material-icons">print</i></a>';
      if (st === "draft") {
        actions +=
          '<a href="#!" class="inv-icon-btn edit-order" data-id="' +
          r.id +
          '" title="Edit"><i class="material-icons">edit</i></a>' +
          '<a href="#!" class="inv-icon-btn confirm-order" data-id="' +
          r.id +
          '" title="Confirm"><i class="material-icons">check_circle</i></a>' +
          '<a href="#!" class="inv-icon-btn delete-order" data-id="' +
          r.id +
          '" title="Delete"><i class="material-icons">delete</i></a>';
      }
      var oid = Number(r.id);
      var cid = r.customer_id != null ? Number(r.customer_id) : NaN;
      var orderNumHtml =
        oid && !isNaN(oid)
          ? '<a href="orders.html?id=' +
            oid +
            '" class="inv-table-text-link" title="Open order">' +
            _.escape(r.order_number || "—") +
            "</a>"
          : _.escape(r.order_number || "—");
      var customerHtml =
        cid && !isNaN(cid)
          ? '<a href="customer-detail.html?id=' +
            cid +
            '" class="inv-table-text-link" title="Customer profile">' +
            _.escape(r.customer_name || "") +
            "</a>"
          : _.escape(r.customer_name || "");
      $tb.append(
        "<tr>" +
          "<td>" +
          _.escape(r.order_date || "") +
          "</td>" +
          "<td>" +
          orderNumHtml +
          "</td>" +
          "<td>" +
          customerHtml +
          "</td>" +
          "<td>" +
          formatInr(r.order_total_price_paise) +
          "</td>" +
          "<td><span class='" +
          stClass +
          "'>" +
          _.escape(st) +
          "</span></td>" +
          "<td class='inv-actions-cell'>" +
          actions +
          "</td>" +
          "</tr>"
      );
    });
    if (!rows.length) {
      $tb.append(
        '<tr><td colspan="6" class="center grey-text" style="padding:2rem">No orders match filters.</td></tr>'
      );
    }
  }

  function showListPanel() {
    $("#panel-order-editor").addClass("hide");
    $("#panel-order-list").removeClass("hide");
  }

  function showEditorPanel() {
    $("#panel-order-list").addClass("hide");
    $("#panel-order-editor").removeClass("hide");
  }

  function openNewOrder() {
    productsCache = db.listProducts("", "active");
    resetEditor();
    $("#order-editor-title").text("New order");
    $("#order-editor-sub").text(
      "Draft — line totals from quantity × latest strip price; header discount applies after line subtotal."
    );
    showEditorPanel();
    M.updateTextFields();
  }

  function loadOrderIntoEditor(id, viewOnly) {
    productsCache = db.listProducts("", "active");
    clearPrescriptionLink();
    var o = db.getOrder(id);
    if (!o) {
      M.toast({ html: "Order not found." });
      return;
    }
    currentOrderStatus = o.status || "draft";
    readOnly = !!viewOnly || currentOrderStatus !== "draft";
    editingOrderId = id;
    $("#order-editor-id").val(String(id));
    $("#order-editor-title").text(
      readOnly ? "Order #" + (o.order_number || id) : "Edit order #" + (o.order_number || id)
    );
    $("#order-editor-sub").text(
      readOnly ? "Status: " + currentOrderStatus : "Draft — save changes before confirming."
    );
    $("#order-date").val(o.order_date || "");
    setOrderNumberDisplay(o);
    var pct = o.order_header_discount_percent;
    if (pct != null && Number(pct) > 0) {
      $("#order-discount-pct").val(String(Math.min(50, Math.max(0, Math.round(Number(pct))))));
      $("#order-discount-flat-inr").val("");
    } else {
      $("#order-discount-pct").val("");
      var fp = o.order_header_discount_flat_paise;
      if (fp != null && fp !== undefined && !isNaN(Number(fp))) {
        $("#order-discount-flat-inr").val(paiseToRupees(Number(fp)).toFixed(2));
      } else {
        $("#order-discount-flat-inr").val(paiseToRupees(o.order_discount_paise || 0).toFixed(2));
      }
    }
    $("#order-notes").val(o.notes || "");
    refreshCustomerSelect(o.customer_id);
    clearLines();
    var lines = db.getOrderLines(id);
    if (!lines.length) {
      appendLineRow();
    } else {
      lines.forEach(function (ln) {
        var sch = db.getOrderLineSchedule(ln.id);
        appendLineRow({
          product_id: ln.product_id,
          product_name: ln.product_name,
          product_code: ln.product_code,
          pack_label: ln.pack_label,
          quantity: ln.quantity,
          total_price_paise: ln.total_price_paise,
          line_discount_paise: ln.line_discount_paise,
          line_notes: ln.line_notes,
          schedule: sch
            ? {
                in_morning: sch.in_morning,
                in_noon: sch.in_noon,
                in_evening: sch.in_evening,
                in_night: sch.in_night,
                remarks: sch.remarks,
              }
            : {},
        });
      });
    }
    applyReadonlyUI();
    updateTotalsDisplay();
    M.updateTextFields();
    if ($("#order-notes").length) M.textareaAutoResize($("#order-notes"));
    if (o.prescription_id) {
      var prid = Number(o.prescription_id);
      var rxPack = prid ? db.getPrescription(prid) : null;
      if (rxPack && Number(rxPack.header.customer_id) === Number(o.customer_id)) {
        applyPrescriptionLink(prid, { skipCustomerRefresh: true });
      }
    }
    showEditorPanel();
  }

  $(function () {
    margOpenDatabase()
      .then(function (api) {
        db = new MargDb(api);
        if (!db.getCurrentEntityId()) {
          window.location.href = "index.html";
          return;
        }
        return db.persistInvoiceFormatIfMigrated();
      })
      .then(function () {
        if (!db || !db.getCurrentEntityId()) return;
        mountShell();
        $(".modal").modal();
        $("#order-date").val(todayIsoDate());

        $("#btn-new-order").on("click", openNewOrder);
        $("#btn-order-csv-export").on("click", function () {
          var C = window.MargInventoryCsv;
          if (!C || !C.exportOrdersCsv) {
            M.toast({ html: "Export not available." });
            return;
          }
          C.exportOrdersCsv(db);
          M.toast({ html: "CSV downloaded." });
        });
        $("#btn-back-to-list").on("click", showListPanel);
        $("#btn-print-invoice").on("click", function () {
          if (!editingOrderId) return;
          printOrderInvoice(editingOrderId);
        });

        $("#btn-save-draft").on("click", saveDraft);

        $("#btn-confirm-order").on("click", function () {
          if (!editingOrderId) {
            if (!validateHeader()) return;
            var lines = collectLines().filter(function (l) {
              return l.product_id;
            });
            if (!lines.length) {
              M.toast({ html: "Add at least one line with a product." });
              return;
            }
            var header = Object.assign(
              {
                customer_id: Number($("#order-customer-id").val()),
                order_date: $("#order-date").val() || todayIsoDate(),
                order_number: null,
                notes: $("#order-notes").val() || null,
                status: "draft",
                prescription_id: linkedPrescriptionId || null,
              },
              collectHeaderDiscountForSave()
            );
            db
              .insertOrderWithLines(header, lines)
              .then(function (nid) {
                return db.setOrderStatus(nid, "confirmed");
              })
              .then(function () {
                M.toast({ html: "Order saved and confirmed." });
                showListPanel();
                refreshOrderList();
              })
              .catch(showToast);
            return;
          }
          db
            .setOrderStatus(editingOrderId, "confirmed")
            .then(function () {
              M.toast({ html: "Order confirmed." });
              showListPanel();
              refreshOrderList();
            })
            .catch(showToast);
        });

        $("#btn-cancel-order").on("click", markCancelled);
        $("#btn-delete-order").on("click", deleteDraft);

        $("#btn-order-filter").on("click", refreshOrderList);
        $("#order-search").on("keyup", function (e) {
          if (e.which === 13) refreshOrderList();
        });

        $("#btn-add-line").on("click", function () {
          appendLineRow();
          updateTotalsDisplay();
        });

        $(document).on("click", function (e) {
          if (!$(e.target).closest(".ol-product-wrap").length) {
            closeAllProductDropdowns();
          }
          if (!$(e.target).closest(".oc-customer-wrap").length) {
            closeAllCustomerDropdowns();
          }
        });

        $("#panel-order-editor").on("focus", "#order-customer-search", function () {
          if (readOnly) return;
          var $dd = $("#order-customer-dd");
          fillCustomerDropdown($dd, $(this).val());
          $dd.removeClass("hide").attr("aria-hidden", "false");
        });

        $("#panel-order-editor").on("input", "#order-customer-search", function () {
          if (readOnly) return;
          $("#order-customer-id").val("");
          if (linkedPrescriptionId) clearPrescriptionLink();
          var $dd = $("#order-customer-dd");
          fillCustomerDropdown($dd, $(this).val());
          $dd.removeClass("hide").attr("aria-hidden", "false");
          syncOrderCustomerSearchUnknownClass();
        });

        $("#panel-order-editor").on("mousedown", ".oc-customer-li:not(.oc-customer-li--empty)", function (e) {
          e.preventDefault();
          if (readOnly) return;
          var id = $(this).attr("data-id");
          var newCid = id ? Number(id) : null;
          if (linkedPrescriptionId && newCid && newCid !== linkedRxCustomerId) {
            clearPrescriptionLink();
            M.toast({ html: "Prescription unlinked — customer changed." });
          }
          var lab = $(this).text();
          $("#order-customer-id").val(id || "");
          $("#order-customer-search").val(lab);
          $("#order-customer-dd").addClass("hide").attr("aria-hidden", "true");
          syncOrderCustomerSearchUnknownClass();
        });

        $("#btn-order-unlink-rx").on("click", function () {
          if (readOnly) return;
          clearPrescriptionLink();
          M.toast({ html: "Prescription link removed." });
        });

        $("#order-lines-body").on("click", ".ol-remove", function (e) {
          e.preventDefault();
          if (readOnly) return;
          var $tr = $(this).closest("tr.order-line-row");
          var gid = $tr.attr("data-line-group");
          if ($("#order-lines-body tr.order-line-row").length <= 1) {
            M.toast({ html: "Keep at least one line." });
            return;
          }
          $tr.remove();
          $("#order-lines-body tr.order-line-notes-row[data-line-group='" + gid + "']").remove();
          $("#order-lines-body tr.order-line-sched[data-line-group='" + gid + "']").remove();
          updateTotalsDisplay();
        });

        $("#order-lines-body").on("focus", ".ol-product-search", function () {
          if (readOnly) return;
          var $wrap = $(this).closest(".ol-product-wrap");
          var $dd = $wrap.find(".ol-product-dd");
          fillProductDropdown($dd, $(this).val());
          $dd.removeClass("hide");
        });

        $("#order-lines-body").on("input", ".ol-product-search", function () {
          if (readOnly) return;
          var $tr = $(this).closest("tr.order-line-row");
          $tr.find(".ol-product-id").val("");
          var $dd = $tr.find(".ol-product-dd");
          fillProductDropdown($dd, $(this).val());
          $dd.removeClass("hide");
          recalcLineRow($tr);
        });

        $("#order-lines-body").on("mousedown", ".ol-product-li:not(.ol-product-li--empty)", function (e) {
          e.preventDefault();
          if (readOnly) return;
          var id = $(this).attr("data-id");
          var lab = $(this).attr("data-label") || $(this).find(".ol-product-li-main").text() || "";
          var $tr = $(this).closest("tr.order-line-row");
          $tr.find(".ol-product-id").val(id || "");
          $tr.find(".ol-product-search").val(lab);
          $tr.find(".ol-product-dd").addClass("hide");
          recalcLineRow($tr);
        });

        $("#order-lines-body").on("change keyup", ".ol-tabs, .ol-line-disc-inr", function () {
          var $tr = $(this).closest("tr.order-line-row");
          recalcLineRow($tr);
        });

        $("#order-discount-flat-inr").on("input change keyup", function () {
          if (headerDiscountFlatHasValue()) $("#order-discount-pct").val("");
          updateTotalsDisplay();
        });
        $("#order-discount-pct").on("input change keyup", function () {
          if (headerDiscountPctHasValue()) $("#order-discount-flat-inr").val("");
          updateTotalsDisplay();
        });
        $("#order-discount-pct").on("blur", function () {
          var v = $(this).val();
          if (v === "" || v == null) return;
          var n = Number(v);
          if (isNaN(n)) {
            $(this).val("");
            return;
          }
          n = Math.min(50, Math.max(0, Math.round(n)));
          $(this).val(n > 0 ? String(n) : "");
        });

        $("#order-table-body").on("click", ".print-order", function (e) {
          e.preventDefault();
          printOrderInvoice(Number($(this).data("id")));
        });
        $("#order-table-body").on("click", ".view-order", function (e) {
          e.preventDefault();
          loadOrderIntoEditor(Number($(this).data("id")), true);
        });
        $("#order-table-body").on("click", ".edit-order", function (e) {
          e.preventDefault();
          loadOrderIntoEditor(Number($(this).data("id")), false);
        });
        $("#order-table-body").on("click", ".confirm-order", function (e) {
          e.preventDefault();
          var oid = Number($(this).data("id"));
          db
            .setOrderStatus(oid, "confirmed")
            .then(function () {
              M.toast({ html: "Order confirmed." });
              refreshOrderList();
            })
            .catch(showToast);
        });
        $("#order-table-body").on("click", ".delete-order", function (e) {
          e.preventDefault();
          var oid = Number($(this).data("id"));
          if (!confirm("Delete this draft order?")) return;
          db
            .deleteOrder(oid)
            .then(function () {
              M.toast({ html: "Deleted." });
              refreshOrderList();
            })
            .catch(showToast);
        });

        $("#btn-quick-customer").on("click", function () {
          var typed = ($("#order-customer-search").val() || "").trim();
          $("#form-order-customer")[0].reset();
          $("#ocf-name").val(typed);
          M.updateTextFields();
          $("#modal-order-customer").modal("open");
        });
        $("#form-order-customer").on("submit", function (e) {
          e.preventDefault();
          db
            .insertCustomer({
              name: $("#ocf-name").val(),
              phone: $("#ocf-phone").val(),
              city: $("#ocf-city").val(),
            })
            .then(function (newId) {
              $("#modal-order-customer").modal("close");
              refreshCustomerSelect(newId);
              M.toast({ html: "Customer added." });
            })
            .catch(showToast);
        });

        refreshOrderList();

        var m = /[?&]id=(\d+)/.exec(location.search);
        if (m) {
          var oid = Number(m[1]);
          var hdr = db.getOrder(oid);
          if (hdr) {
            loadOrderIntoEditor(oid, hdr.status !== "draft");
          }
        } else {
          var qsOrder = new URLSearchParams(location.search);
          var preRx = qsOrder.get("prescriptionId");
          if (preRx) {
            var rxBoot = Number(preRx);
            var rxData = rxBoot && !isNaN(rxBoot) ? db.getPrescription(rxBoot) : null;
            if (rxData) {
              openNewOrder();
              applyPrescriptionLink(rxBoot);
            } else {
              M.toast({ html: "Prescription not found." });
              var preCustFallback = qsOrder.get("customerId");
              if (preCustFallback) {
                var cidFb = Number(preCustFallback);
                if (cidFb && db.getCustomer(cidFb)) {
                  openNewOrder();
                  refreshCustomerSelect(cidFb);
                }
              }
            }
          } else {
            var preCust = qsOrder.get("customerId");
            if (preCust) {
              var cid = Number(preCust);
              if (cid && db.getCustomer(cid)) {
                openNewOrder();
                refreshCustomerSelect(cid);
              }
            }
          }
        }
      })
      .catch(function (err) {
        console.error(err);
        M.toast({ html: "Database failed to open." });
      });
  });
})();
