/**
 * Product detail — master data, stock KPIs, purchase lot lines (docs/inventory.md).
 */
(function () {
  var db;
  /** Set in renderPage — used by delegated Activate handler (works even if header/banner HTML missing from SW cache). */
  var detailProductId = 0;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function fmtRsPaise(paise) {
    var n = Number(paise);
    if (isNaN(n)) return "—";
    return "₹" + (n / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function showLong($wrap, $el, text) {
    var t = text && String(text).trim();
    if (t) {
      $wrap.show();
      $el.text(t);
    } else {
      $wrap.hide();
    }
  }

  function renderPage(productId) {
    var p = db.getProduct(productId);
    if (!p) {
      window.location.href = "inventory.html?panel=products";
      return;
    }

    detailProductId = Number(productId) || 0;

    var isActive =
      p.is_active === 1 ||
      p.is_active === true ||
      p.is_active === "1" ||
      Number(p.is_active) === 1;
    $("#pd-name").text(p.name || "—");
    $("#pd-sub").text(
      [p.product_type_label, p.code && "Code " + p.code, p.pack_label].filter(Boolean).join(" · ") ||
        "Product profile"
    );

    $("#pd-product-type").text(
      p.product_type_label && String(p.product_type_label).trim() ? p.product_type_label : "—"
    );

    $("#pd-btn-edit").removeClass("hide").attr("href", "product-new.html?id=" + productId);
    $("#pd-btn-deactivate").toggleClass("hide", !isActive);
    var $pa = $("#pd-btn-activate");
    if ($pa.length) {
      if (isActive) {
        $pa.addClass("hide").css({ display: "", visibility: "" });
      } else {
        $pa.removeClass("hide").css({ display: "inline-flex", visibility: "visible" });
      }
    }
    var $ban = $("#pd-inactive-banner");
    if ($ban.length) {
      if (isActive) {
        $ban.addClass("hide").css({ display: "", visibility: "" });
      } else {
        $ban.removeClass("hide").css({ display: "block", visibility: "visible" });
      }
    }

    /* Status badge only — Activate is a real <button> in product-detail.html (#pd-btn-activate-inline). */
    $("#pd-kpi-status").html(
      isActive
        ? '<span class="inv-badge inv-badge-active">Active</span>'
        : '<span class="inv-badge inv-badge-inactive">Inactive</span>'
    );
    var $ain = $("#pd-btn-activate-inline");
    if ($ain.length) {
      if (isActive) {
        $ain.addClass("hide").css({ display: "", visibility: "" });
      } else {
        $ain.removeClass("hide").css({ display: "inline-flex", visibility: "visible" });
      }
    }

    var stock = db.getProductStockOnHand(productId);
    $("#pd-kpi-stock").text(String(stock));

    var latestPaise = db.getLatestStripSellingPricePaise(productId);
    $("#pd-kpi-price").text(latestPaise > 0 ? fmtRsPaise(latestPaise) : "—");

    $("#pd-code").text(p.code && String(p.code).trim() ? p.code : "—");
    $("#pd-barcode").text(p.barcode && String(p.barcode).trim() ? p.barcode : "—");
    $("#pd-pack").text(p.pack_label && String(p.pack_label).trim() ? p.pack_label : "—");
    var strips = p.strips_per_pack != null ? p.strips_per_pack : 1;
    var units = p.units_per_strip != null ? String(p.units_per_strip) : "—";
    $("#pd-units").text(String(strips) + " · " + units);

    showLong($("#pd-desc-wrap"), $("#pd-desc"), p.description);
    showLong($("#pd-comp-wrap"), $("#pd-composition"), p.chemical_composition);
    showLong($("#pd-rec-wrap"), $("#pd-recommend"), p.general_recommendation);
    showLong($("#pd-where-wrap"), $("#pd-where"), p.where_to_use);

    var anyLong =
      (p.description && String(p.description).trim()) ||
      (p.chemical_composition && String(p.chemical_composition).trim()) ||
      (p.general_recommendation && String(p.general_recommendation).trim()) ||
      (p.where_to_use && String(p.where_to_use).trim());
    $("#pd-longtext-empty").toggle(!anyLong);

    var lines = db.listLotLinesForProduct(productId);
    var $tb = $("#pd-lines-body").empty();
    lines.forEach(function (row) {
        $tb.append(
        "<tr>" +
          "<td class=\"inv-mono\">" +
          esc(row.lot_number || "—") +
          "</td>" +
          "<td>" +
          esc(row.vendor_name || "—") +
          "</td>" +
          '<td class="right-align">' +
          esc(String(row.quantity != null ? row.quantity : "—")) +
          "</td>" +
          '<td class="right-align">' +
          esc(
            String(
              row.available_count != null
                ? row.available_count
                : row.quantity != null
                  ? row.quantity
                  : "—"
            )
          ) +
          "</td>" +
          '<td class="right-align">' +
          esc(
            String(
              row.available_tabs != null && row.available_tabs !== ""
                ? row.available_tabs
                : "—"
            )
          ) +
          "</td>" +
          '<td class="right-align">' +
          esc(fmtRsPaise(row.selling_price_paise)) +
          "</td>" +
          '<td class="inv-actions-cell">' +
          '<a class="inv-icon-btn" href="lot-detail.html?id=' +
          row.lot_id +
          '" title="Open lot"><i class="material-icons">open_in_new</i></a>' +
          "</td>" +
          "</tr>"
      );
    });
    if (!lines.length) {
      $tb.append(
        '<tr><td colspan="7" class="center grey-text" style="padding:2rem">No purchase lines yet for this product.</td></tr>'
      );
    }
  }

  $(function () {
    margOpenDatabase()
      .then(function (api) {
        db = new MargDb(api);
        if (!db.getCurrentEntityId()) {
          window.location.href = "index.html";
          return null;
        }
        return db.persistInvoiceFormatIfMigrated ? db.persistInvoiceFormatIfMigrated() : Promise.resolve();
      })
      .then(function () {
        if (!db || !db.getCurrentEntityId()) return;
        var qs = new URLSearchParams(window.location.search);
        var id = Number(qs.get("id"));
        if (!id) {
          window.location.href = "inventory.html?panel=products";
          return;
        }

        var ent = db.getEntityById(db.getCurrentEntityId());
        mountPharmaPulseShell({
          el: "#layout-root",
          activeSection: "product-detail",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        renderPage(id);

        $("#pd-btn-deactivate").on("click", function () {
          if (!confirm("Deactivate this product? It will be hidden from new stock lines.")) return;
          db.deactivateProduct(id).then(function () {
            M.toast({ html: "Product deactivated" });
            window.location.href = "inventory.html?panel=products";
          });
        });
      })
      .catch(function () {
        window.location.href = "index.html";
      });

    /* Delegated: status-chip Activate + optional header/banner (if present in DOM). */
    $(document).on(
      "click",
      ".pd-js-activate, #pd-btn-activate, #pd-btn-activate-banner, #pd-btn-activate-inline",
      function (e) {
      e.preventDefault();
      var pid = detailProductId || Number(new URLSearchParams(window.location.search).get("id")) || 0;
      if (!pid) return;
      if (!confirm("Activate this product? It will appear in stock lines and search again.")) return;
      if (typeof db === "undefined" || !db || typeof db.activateProduct !== "function") {
        M.toast({ html: "Please refresh the page (Ctrl+Shift+R) to load the latest app." });
        return;
      }
      db.activateProduct(pid).then(function () {
        M.toast({ html: "Product activated" });
        renderPage(pid);
      });
    });
  });
})();
