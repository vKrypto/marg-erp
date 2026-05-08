/**
 * New purchase lot — dedicated page (lot-new.html).
 * Effective strip selling: strip selling ₹ (priority) or MRP × (1 − margin%).
 * Lot header: MRP total, margin on MRP, selling total (from lines); total paid separate.
 */
(function () {
  var db;
  var productsCache = [];

  function loadProductsCache() {
    productsCache = db.listProducts("", "active");
  }

  function rupeesToPaise(v) {
    if (v === "" || v == null) return null;
    var n = parseFloat(String(v).replace(/,/g, ""));
    if (isNaN(n)) return null;
    return Math.round(n * 100);
  }

  function parseNumLoose(v) {
    if (v === "" || v == null) return NaN;
    return parseFloat(String(v).replace(/,/g, ""));
  }

  function lotFormEl() {
    return document.getElementById("form-lot");
  }

  function $lotForm() {
    return $(lotFormEl() || []);
  }

  /**
   * Native DOM — avoids jQuery .find(#id) edge cases; direct children of #lot-lines-container only.
   */
  function lotLineRows() {
    var form = lotFormEl();
    if (!form) return $();
    var cont = form.querySelector("#lot-lines-container");
    if (!cont) return $();
    return $(cont).children(".lot-line-row");
  }

  /** Raw strip MRP field as typed (rupees). */
  function readStripMrpRupeesString($r) {
    var rowEl = $r.get(0);
    if (!rowEl) return "";
    var inp =
      rowEl.querySelector(".lot-line-row-pricing input.lot-mrp") ||
      rowEl.querySelector("input.lot-mrp");
    return inp ? String(inp.value == null ? "" : inp.value).trim() : "";
  }

  /** Strip MRP in paise, or null if empty / invalid. */
  function stripMrpPaiseFromRow($r) {
    var p = rupeesToPaise(readStripMrpRupeesString($r));
    if (p == null || p < 0) return null;
    return p;
  }

  /** Must be set and greater than 0 for saving (stored in DB). */
  function validStripMrpPaiseRequired($r) {
    var p = stripMrpPaiseFromRow($r);
    return p != null && p > 0;
  }

  /**
   * Effective selling paise per strip: strip selling ₹ if set (priority), else MRP × (1 − margin%).
   */
  function effectiveSellingPaiseFromRow($r) {
    var priceRaw = $r.find(".lot-price").val();
    if (priceRaw != null && String(priceRaw).trim() !== "") {
      var direct = rupeesToPaise(priceRaw);
      if (direct != null && !isNaN(direct) && direct >= 0) return direct;
      return null;
    }
    var mrp = parseNumLoose(readStripMrpRupeesString($r));
    var marginPct = parseNumLoose($r.find(".lot-margin-pct").val());
    if (!isNaN(mrp) && mrp >= 0 && !isNaN(marginPct) && marginPct >= 0 && marginPct <= 100) {
      return Math.round(mrp * (1 - marginPct / 100) * 100);
    }
    return null;
  }

  /** Sum of (strips × effective selling ₹) per line — persisted as lot total_price_paise. */
  function totalEffectiveSellingPaiseFromLines() {
    var sum = 0;
    lotLineRows().each(function () {
      var $r = $(this);
      var qty = parseInt($r.find(".lot-qty").val(), 10);
      if (!(qty > 0)) return;
      var eff = effectiveSellingPaiseFromRow($r);
      if (eff != null) sum += qty * eff;
    });
    return sum;
  }

  function recalcLotTotals() {
    var totalMrpPaise = 0;
    var totalMarginPaise = 0;
    lotLineRows().each(function () {
      var $r = $(this);
      var qty = parseInt($r.find(".lot-qty").val(), 10);
      if (!(qty > 0)) return;
      var eff = effectiveSellingPaiseFromRow($r);
      var mrpP = stripMrpPaiseFromRow($r);
      if (mrpP != null && mrpP >= 0) {
        totalMrpPaise += qty * mrpP;
        if (eff != null) {
          totalMarginPaise += qty * (mrpP - eff);
        }
      }
    });
    var sellingTotalPaise = totalEffectiveSellingPaiseFromLines();
    var form = lotFormEl();
    if (!form) return;
    function setStat(id, text) {
      var el = form.querySelector("#" + id);
      if (el) el.textContent = text;
    }
    function setHidden(id, val) {
      var el = form.querySelector("#" + id);
      if (el) el.value = val;
    }
    setStat("lf-total-mrp", (totalMrpPaise / 100).toFixed(2));
    setStat("lf-margin", (totalMarginPaise / 100).toFixed(2));
    setStat("lf-selling-total", (sellingTotalPaise / 100).toFixed(2));
    setHidden("lf-total-mrp-paise", String(Math.round(totalMrpPaise)));
    setHidden("lf-margin-paise", String(Math.round(totalMarginPaise)));
    setHidden("lf-selling-total-paise", String(Math.round(sellingTotalPaise)));
  }

  function productLabelFromProduct(p) {
    if (!p) return "";
    var lab = p.name || "";
    if (p.code) lab += " (" + p.code + ")";
    if (p.pack_label && String(p.pack_label).trim()) {
      lab += " · " + String(p.pack_label).trim();
    }
    return lab;
  }

  function productMatchesSearch(p, qq) {
    if (!qq) return true;
    var q = qq.toLowerCase();
    if (productLabelFromProduct(p).toLowerCase().indexOf(q) >= 0) return true;
    if ((p.name || "").toLowerCase().indexOf(q) >= 0) return true;
    if ((p.code || "").toLowerCase().indexOf(q) >= 0) return true;
    if ((p.pack_label || "").toLowerCase().indexOf(q) >= 0) return true;
    return false;
  }

  function stockTabsHintFromProduct(p) {
    if (!p) return "";
    var tabs = p.stock_on_hand != null ? Number(p.stock_on_hand) : 0;
    if (isNaN(tabs) || tabs < 0) tabs = 0;
    var ups = p.units_per_strip != null && p.units_per_strip !== "" ? Number(p.units_per_strip) : NaN;
    if (ups > 0 && !isNaN(ups)) {
      return Math.round(tabs) + " tabs (all lots)";
    }
    if (tabs > 0) return Math.round(tabs) + " units (all lots)";
    return "0 tabs (all lots)";
  }

  function fillProductDropdown($ul, q) {
    $ul.empty();
    var qq = (q || "").toLowerCase().trim();
    var n = 0;
    for (var i = 0; i < productsCache.length; i++) {
      var p = productsCache[i];
      if (!productMatchesSearch(p, qq)) continue;
      var lab = productLabelFromProduct(p);
      var hint = stockTabsHintFromProduct(p);
      $ul.append(
        $("<li></li>")
          .addClass("ol-product-li")
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
      $ul.append($("<li></li>").addClass("ol-product-li ol-product-li--empty").text("No matches"));
    }
  }

  function closeAllProductDropdowns() {
    $lotForm().find("#lot-lines-container .ol-product-dd").addClass("hide");
  }

  function updateLinePricingHints($row) {
    var $eff = $row.find(".lot-effective-hint");
    var effP = effectiveSellingPaiseFromRow($row);
    if (effP != null) {
      $eff.text("Effective selling ₹" + (effP / 100).toFixed(2) + " / strip");
    } else {
      $eff.text("Effective selling — (enter strip selling, or MRP + margin %)");
    }
    var $hint = $row.find(".lot-selling-hint");
    var sellingRaw = $row.find(".lot-price").val();
    if (sellingRaw != null && String(sellingRaw).trim() !== "") {
      var direct = rupeesToPaise(sellingRaw);
      if (direct != null && direct >= 0) {
        $hint.text(
          "Strip selling ₹" + (direct / 100).toFixed(2) + " / strip — takes priority over MRP + margin."
        );
        return;
      }
      $hint.text("Fix strip selling ₹ or clear it to use MRP + margin %.");
      return;
    }
    var mrp = parseNumLoose(readStripMrpRupeesString($row));
    var marginPct = parseNumLoose($row.find(".lot-margin-pct").val());
    if (!isNaN(mrp) && mrp >= 0 && !isNaN(marginPct) && marginPct >= 0 && marginPct <= 100) {
      var s = mrp * (1 - marginPct / 100);
      $hint.text(
        "MRP ₹" + mrp.toFixed(2) + " − " + marginPct + "% → ₹" + s.toFixed(2) + " / strip (effective if selling blank)."
      );
      return;
    }
    $hint.text("Enter strip selling ₹, or strip MRP + margin % (0–100).");
  }

  function refreshVendorSelect() {
    var rows = db.listVendors();
    var $s = $("#lf-vendor").empty();
    $s.append($("<option></option>").attr("value", "").text("— No vendor —"));
    rows.forEach(function (r) {
      $s.append($("<option></option>").attr("value", r.id).text(r.name));
    });
  }

  function addLotLineRow() {
    loadProductsCache();
    if (!productsCache.length) {
      M.toast({
        html: "Add at least one active product before recording a purchase lot.",
        displayLength: 6000,
      });
      return;
    }

    var $hid = $("<input>").attr({ type: "hidden" }).addClass("ol-product-id").val("");
    var $search = $("<input>")
      .attr({ type: "text", placeholder: "Search product…", autocomplete: "off" })
      .addClass("browser-default ol-product-search");
    var $dd = $("<ul></ul>").addClass("ol-product-dd hide browser-default");
    var $wrap = $("<div></div>").addClass("ol-product-wrap").append($search, $hid, $dd);

    var $r1 = $("<div></div>").addClass("row lot-line-row-main").append(
      $("<div></div>")
        .addClass("col s12 m5 lot-field-group lot-field-group--product")
        .append(
          $("<span></span>").addClass("lot-stacked-label").text("Product"),
          $wrap
        ),
      $("<div></div>")
        .addClass("col s6 m2 lot-field-group")
        .append(
          $("<span></span>").addClass("lot-stacked-label").text("Strips (in)"),
          $("<input>")
            .attr({ type: "number", min: 1, step: 1, value: 1 })
            .addClass("browser-default lot-qty lot-stacked-input")
        ),
      $("<div></div>")
        .addClass("col s6 m2 lot-field-group")
        .append(
          $("<span></span>").addClass("lot-stacked-label").text("Available"),
          $("<input>")
            .attr({ type: "number", min: 0, step: 1, value: 1 })
            .addClass("browser-default lot-available lot-stacked-input")
        ),
      $("<div></div>")
        .addClass("col s12 m3 lot-field-group")
        .append(
          $("<span></span>").addClass("lot-stacked-label").text("Delivered on"),
          $("<input>").attr({ type: "date" }).addClass("browser-default lot-delivered lot-stacked-input lot-stacked-input--date")
        )
    );

    var $r2 = $("<div></div>").addClass("row lot-line-row-pricing").append(
      $("<div></div>")
        .addClass("col s12 m4 lot-field-group")
        .append(
          $("<span></span>").addClass("lot-stacked-label").text("Strip selling ₹"),
          $("<input>")
            .attr({ type: "number", min: 0, step: "0.01" })
            .addClass("browser-default lot-price lot-stacked-input")
            .attr("placeholder", "Per strip")
        ),
      $("<div></div>")
        .addClass("col s12 m4 lot-field-group")
        .append(
          $("<span></span>").addClass("lot-stacked-label").text("Strip MRP ₹ *"),
          $("<input>")
            .attr({ type: "text", inputmode: "decimal", required: "required", autocomplete: "off" })
            .addClass("browser-default lot-mrp lot-stacked-input")
            .attr("placeholder", "Required · per strip")
        ),
      $("<div></div>")
        .addClass("col s12 m4 lot-field-group")
        .append(
          $("<span></span>").addClass("lot-stacked-label").text("Margin % off MRP"),
          $("<input>")
            .attr({ type: "number", min: 0, max: 100, step: "0.1" })
            .addClass("browser-default lot-margin-pct lot-stacked-input")
            .attr("placeholder", "0–100")
        )
    );

    var $hint = $("<p></p>")
      .addClass("lot-selling-hint grey-text text-darken-1")
      .text("Strip MRP ₹ is required and saved. Use strip selling ₹ and/or margin % off MRP for effective selling.");
    var $effLine = $("<p></p>")
      .addClass("lot-effective-hint teal-text text-darken-2")
      .text("Effective selling —");
    var $hintBlock = $("<div></div>").addClass("lot-pricing-hints-wrap").append($hint, $effLine);

    var $row = $("<div></div>")
      .addClass("lot-line-row")
      .append(
        $r1,
        $r2,
        $hintBlock,
        $("<button></button>").attr("type", "button").addClass("btn-flat red-text text-lighten-1 btn-remove-line lot-line-remove").text("Remove line")
      );

    $lotForm().find("#lot-lines-container").append($row);
    updateLinePricingHints($row);
    recalcLotTotals();
    M.updateTextFields();
  }

  function initLotForm() {
    var f = lotFormEl();
    if (f) f.reset();
    $lotForm().find("#lot-lines-container").empty();
    loadProductsCache();
    if (!productsCache.length) {
      M.toast({
        html: "Add at least one active product before recording a purchase lot.",
        displayLength: 6000,
      });
      return;
    }
    addLotLineRow();
    refreshVendorSelect();
    M.updateTextFields();
    if ($("#lf-notes").length) M.textareaAutoResize($("#lf-notes"));
    recalcLotTotals();
  }

  $(function () {
    margOpenDatabase()
      .then(function (api) {
        db = new MargDb(api);
        if (!db.getCurrentEntityId()) {
          window.location.href = "index.html";
          return;
        }
        var ent = db.getEntityById(db.getCurrentEntityId());
        mountPharmaPulseShell({
          el: "#layout-root",
          activeSection: "lot-new",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        /* Document delegation: $form.on fails silently if $("#form-lot") was empty at bind time. */
        $(document).off(".margLotPage");
        $(document).on(
          "input change blur paste.margLotPage",
          "#form-lot #lot-lines-container .lot-price, #form-lot #lot-lines-container .lot-mrp, #form-lot #lot-lines-container .lot-margin-pct",
          function () {
            var $row = $(this).closest(".lot-line-row");
            updateLinePricingHints($row);
            recalcLotTotals();
          }
        );
        $(document).on("input change blur paste.margLotPage", "#form-lot #lot-lines-container .lot-qty", function () {
          var $row = $(this).closest(".lot-line-row");
          var q = parseInt($row.find(".lot-qty").val(), 10);
          var $av = $row.find(".lot-available");
          var a = parseInt($av.val(), 10);
          if (q > 0 && (!isNaN(a) && a > q)) {
            $av.val(String(q));
          }
          recalcLotTotals();
        });
        $(document).on("input change blur paste.margLotPage", "#form-lot #lot-lines-container .lot-available", function () {
          var $row = $(this).closest(".lot-line-row");
          var q = parseInt($row.find(".lot-qty").val(), 10);
          var a = parseInt($row.find(".lot-available").val(), 10);
          if (q > 0 && (!isNaN(a) && a > q)) {
            $row.find(".lot-available").val(String(q));
          }
          recalcLotTotals();
        });

        initLotForm();

        $(document).on("click", function (e) {
          if (!$(e.target).closest(".ol-product-wrap").length) {
            closeAllProductDropdowns();
          }
        });

        $("#btn-lot-line-add").on("click", addLotLineRow);
        $(document).on("click.margLotPage", "#form-lot #lot-lines-container .btn-remove-line", function () {
          var $rows = lotLineRows();
          if ($rows.length <= 1) {
            M.toast({ html: "At least one line is required" });
            return;
          }
          $(this).closest(".lot-line-row").remove();
          recalcLotTotals();
        });

        $(document).on("focus.margLotPage", "#form-lot #lot-lines-container .ol-product-search", function () {
          var $wrap = $(this).closest(".ol-product-wrap");
          var $dd = $wrap.find(".ol-product-dd");
          fillProductDropdown($dd, $(this).val());
          $dd.removeClass("hide");
        });

        $(document).on("input.margLotPage", "#form-lot #lot-lines-container .ol-product-search", function () {
          var $row = $(this).closest(".lot-line-row");
          $row.find(".ol-product-id").val("");
          var $dd = $row.find(".ol-product-dd");
          fillProductDropdown($dd, $(this).val());
          $dd.removeClass("hide");
        });

        $(document).on("mousedown.margLotPage", "#form-lot #lot-lines-container .ol-product-li:not(.ol-product-li--empty)", function (e) {
          e.preventDefault();
          var id = $(this).attr("data-id");
          var lab = $(this).attr("data-label") || $(this).find(".ol-product-li-main").text() || "";
          var $row = $(this).closest(".lot-line-row");
          $row.find(".ol-product-id").val(id || "");
          $row.find(".ol-product-search").val(lab);
          $row.find(".ol-product-dd").addClass("hide");
        });

        $(document).on("submit.margLotPage", "#form-lot", function (e) {
          e.preventDefault();
          recalcLotTotals();
          var form = lotFormEl();
          var elSell = form && form.querySelector("#lf-selling-total-paise");
          var elMarg = form && form.querySelector("#lf-margin-paise");
          var sellingP = elSell ? parseInt(elSell.value, 10) : NaN;
          var marginP = elMarg ? parseInt(elMarg.value, 10) : NaN;
          if (isNaN(sellingP) || sellingP < 0) sellingP = totalEffectiveSellingPaiseFromLines();
          if (isNaN(marginP) || marginP < 0) marginP = 0;
          var header = {
            lot_number: $("#lf-lot-number").val().trim(),
            vendor_id: $("#lf-vendor").val() || null,
            lot_date: $("#lf-lot-date").val() || null,
            delivered_date: $("#lf-delivered-date").val() || null,
            total_price_paise: sellingP,
            margin_paise: marginP,
            total_paid_paise: rupeesToPaise($("#lf-paid").val()),
            delivered_by: $("#lf-delivered-by").val(),
            notes: $("#lf-notes").val(),
          };
          var $lineRows = lotLineRows();
          var lines = [];
          var i;
          for (i = 0; i < $lineRows.length; i++) {
            var $r = $($lineRows[i]);
            var pid = $r.find(".ol-product-id").val();
            if (!pid) {
              M.toast({ html: "Select a product on every line." });
              return;
            }
            if (!validStripMrpPaiseRequired($r)) {
              M.toast({
                html: "Enter strip MRP ₹ greater than 0 on every line (saved on the lot).",
                displayLength: 5000,
              });
              return;
            }
            var mrpP = stripMrpPaiseFromRow($r);
            var sp = effectiveSellingPaiseFromRow($r);
            if (sp == null) {
              M.toast({
                html: "Each line needs strip selling ₹, or strip MRP and margin % (0–100).",
                displayLength: 5000,
              });
              return;
            }
            var qty = parseInt($r.find(".lot-qty").val(), 10);
            if (!(qty > 0)) {
              M.toast({ html: "Strips must be at least 1 on every line." });
              return;
            }
            var avail = parseInt($r.find(".lot-available").val(), 10);
            if (isNaN(avail) || avail < 0 || avail > qty) {
              M.toast({ html: "Available strips must be between 0 and strips received on every line." });
              return;
            }
            if (mrpP == null || mrpP <= 0 || isNaN(Number(mrpP))) {
              M.toast({
                html: "Enter strip MRP ₹ greater than 0 on every line (saved on the lot).",
                displayLength: 5000,
              });
              return;
            }
            lines.push({
              product_id: Number(pid),
              quantity: qty,
              available_count: avail,
              delivered_on: $r.find(".lot-delivered").val() || null,
              selling_price_paise: sp,
              strip_mrp_paise: Math.round(Number(mrpP)),
            });
          }
          db
            .insertLotWithLines(header, lines)
            .then(function (lotId) {
              M.toast({ html: "Lot saved" });
              if (lotId) {
                window.location.href = "lot-detail.html?id=" + lotId;
              } else {
                window.location.href = "inventory.html?panel=lots";
              }
            })
            .catch(function (err) {
              M.toast({ html: err.message || String(err) });
            });
        });
      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
