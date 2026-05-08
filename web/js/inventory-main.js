/**
 * Inventory UI — Products, Vendors, Lots (docs/inventory.md)
 */
(function () {
  var db;

  function getInitialPanelFromQuery() {
    var p = new URLSearchParams(window.location.search).get("panel");
    if (p === "vendors" || p === "lots" || p === "products") return p;
    return "products";
  }

  function getActiveSectionFromQuery() {
    return getInitialPanelFromQuery();
  }

  function rupeesToPaise(v) {
    if (v === "" || v == null) return null;
    var n = parseFloat(String(v).replace(/,/g, ""));
    if (isNaN(n)) return null;
    return Math.round(n * 100);
  }

  function fmtDate(s) {
    if (!s) return "—";
    try {
      return s.length >= 10 ? s.slice(0, 10) : s;
    } catch (e) {
      return s;
    }
  }

  var productPage = 0;
  var productPageSize = 10;

  /** Tablets (units) per strip — same field as “Units per strip” on the product form. */
  function formatTabsPerStrip(r) {
    var u = r.units_per_strip;
    if (u != null && u !== "" && !isNaN(Number(u)) && Number(u) > 0) return String(Number(u));
    return "—";
  }

  /** Total tablets in one pack: strips per pack × tabs per strip. */
  function formatTabsPerPack(r) {
    var s = Number(r.strips_per_pack);
    var u = Number(r.units_per_strip);
    if (s > 0 && u > 0 && !isNaN(s) && !isNaN(u)) return String(Math.round(s * u));
    return "—";
  }

  /**
   * Sellable tablets in inventory: SUM(lot_line.available_tabs).
   * stock_on_hand is attached by listProducts / getProduct.
   */
  function formatTotalTabsInStock(r) {
    var tabs = r.stock_on_hand != null ? Number(r.stock_on_hand) : 0;
    if (isNaN(tabs) || tabs < 0) tabs = 0;
    return String(Math.round(tabs));
  }

  function formatProductTypeLabel(v) {
    var s = v != null ? String(v).trim() : "";
    if (!s) return "";
    return s.replace(/\b([a-z])/g, function (m, ch) {
      return ch.toUpperCase();
    });
  }

  function populateProductTypeFilter() {
    var $sel = $("#product-type-filter");
    if (!$sel.length || !db) return;
    var prev = $sel.val();
    if (typeof db.ensureDefaultProductTypes === "function") {
      db.ensureDefaultProductTypes();
    }
    var types = typeof db.listProductTypes === "function" ? db.listProductTypes() : [];
    $sel.empty();
    $sel.append($("<option></option>").attr("value", "").text("All types"));
    $sel.append($("<option></option>").attr("value", "__none__").text("No type"));
    types.forEach(function (t) {
      var lbl = formatProductTypeLabel(t.label || "");
      $sel.append($("<option></option>").attr("value", String(t.id)).text(lbl || "—"));
    });
    var hasPrev = false;
    if (prev !== undefined && prev !== null && prev !== "") {
      $sel.find("option").each(function () {
        if ($(this).attr("value") === String(prev)) hasPrev = true;
      });
    } else if (prev === "") {
      hasPrev = true;
    }
    if (hasPrev) $sel.val(prev);
  }

  function getProductFilteredRows() {
    var q = $("#product-search").val() || "";
    var status = $("#product-status-filter").val() || "all";
    var rows = db.listProducts(q, status);
    var typeF = $("#product-type-filter").val();
    if (!typeF || typeF === "") return rows;
    if (typeF === "__none__") {
      return rows.filter(function (r) {
        return r.product_type_id == null || r.product_type_id === "";
      });
    }
    var tid = Number(typeF);
    return rows.filter(function (r) {
      return Number(r.product_type_id) === tid;
    });
  }

  /* Row cells: name, code, type, in stock, pack label, tabs/strip, strip/pack, status, actions — 9 + actions. */
  function refreshProductsTable() {
    var rows = getProductFilteredRows();
    var total = rows.length;
    var maxPage = Math.max(0, Math.ceil(total / productPageSize) - 1);
    if (productPage > maxPage) productPage = maxPage;
    var start = productPage * productPageSize;
    var pageRows = rows.slice(start, start + productPageSize);

    var $tb = $("#product-table-body").empty();
    pageRows.forEach(function (r) {
      var isActive = Number(r.is_active) === 1;
      var badge = isActive
        ? '<span class="inv-badge inv-badge-active">Active</span>'
        : '<span class="inv-badge inv-badge-inactive">Inactive</span>';
      var actions =
        '<a href="product-new.html?id=' +
        r.id +
        '" class="inv-icon-btn" title="Edit product"><i class="material-icons">edit</i></a>';
      if (isActive) {
        actions +=
          '<a href="#!" class="inv-icon-btn deactivate-product" data-id="' +
          r.id +
          '" title="Deactivate"><i class="material-icons">delete</i></a>';
      } else {
        actions +=
          '<a href="#!" class="inv-icon-btn activate-product" data-id="' +
          r.id +
          '" title="Activate"><i class="material-icons">restore</i></a>';
      }
      var $tr = $("<tr></tr>");
      var nameCell = $("<td></td>").addClass("inv-name-cell");
      nameCell.append(
        $("<a></a>")
          .attr("href", "product-detail.html?id=" + r.id)
          .addClass("teal-text text-darken-2")
          .css("font-weight", "600")
          .text(r.name || "")
      );
      var totalTabs = formatTotalTabsInStock(r);
      var $stockTd = $("<td></td>")
        .addClass("inv-num-cell inv-stock-total-cell")
        .text(totalTabs);
      if (totalTabs === "0") {
        $stockTd.addClass("inv-stock-zero");
      } else {
        $stockTd.attr("title", "Sellable tablets in stock (all lots)");
      }
      var typeTxt =
        r.product_type_label != null && String(r.product_type_label).trim()
          ? formatProductTypeLabel(String(r.product_type_label).trim())
          : "—";
      $tr.append(
        nameCell,
        $("<td></td>").addClass("inv-mono").text(r.code || "—"),
        $("<td></td>").addClass("inv-product-type-cell").text(typeTxt),
        $stockTd,
        $("<td></td>").addClass("inv-pack-teal").text(r.pack_label || "—"),
        $("<td></td>").addClass("inv-num-cell").text(formatTabsPerStrip(r)),
        $("<td></td>").addClass("inv-num-cell").text(formatTabsPerPack(r)),
        $("<td></td>").html(badge),
        $("<td></td>").addClass("inv-actions-cell").html(actions)
      );
      $tb.append($tr);
    });
    if (!total) {
      $tb.append(
        '<tr><td colspan="9" class="center grey-text" style="padding: 2rem">No products match. Add a product or adjust search.</td></tr>'
      );
    }

    var lo = total === 0 ? 0 : start + 1;
    var hi = total === 0 ? 0 : Math.min(start + pageRows.length, total);
    $("#product-page-info").text(
      total ? "Showing " + lo + "–" + hi + " of " + total + " products" : "Showing 0 of 0 products"
    );
    $("#btn-product-prev").prop("disabled", productPage <= 0 || total === 0);
    $("#btn-product-next").prop("disabled", productPage >= maxPage || total === 0);
  }

  function refreshVendorsTable() {
    var rows = db.listVendors();
    var $tb = $("#vendor-table-body").empty();
    rows.forEach(function (r) {
      var $tr = $("<tr></tr>");
      var nameTd = $("<td></td>");
      nameTd.append(
        $("<a></a>")
          .attr("href", "vendor-detail.html?id=" + r.id)
          .addClass("teal-text text-darken-2")
          .css("font-weight", "600")
          .text(r.name || "")
      );
      $tr.append(
        nameTd,
        $("<td></td>").text(r.phone || "—"),
        $("<td></td>").text(r.city || "—"),
        $("<td></td>").text(r.gstin || "—"),
        $("<td></td>").addClass("inv-actions-cell").html(
          '<a href="inventory.html?panel=vendors&editVendor=' +
            r.id +
            '" class="inv-icon-btn" title="Edit vendor"><i class="material-icons">edit</i></a>'
        )
      );
      $tb.append($tr);
    });
    if (!rows.length) {
      $tb.append('<tr><td colspan="5" class="center grey-text">No vendors yet.</td></tr>');
    }
    refreshVendorSelect();
  }

  function refreshVendorSelect() {
    var rows = db.listVendors();
    var $s = $("#lf-vendor").empty();
    $s.append($("<option></option>").attr("value", "").text("— No vendor —"));
    rows.forEach(function (r) {
      $s.append($("<option></option>").attr("value", r.id).text(r.name));
    });
  }

  function loadPocTable(vendorId) {
    var pocs = db.listVendorPocs(vendorId);
    var $b = $("#vendor-poc-body").empty();
    pocs.forEach(function (p) {
      $b.append(
        "<tr><td>" +
          _.escape(p.name) +
          "</td><td>" +
          _.escape(p.phone || "—") +
          "</td><td>" +
          _.escape(p.role || "—") +
          '</td><td><a href="#!" class="red-text delete-poc" data-id="' +
          p.id +
          '">Remove</a></td></tr>'
      );
    });
  }

  function openVendorModal(id) {
    $("#modal-vendor-title").text(id ? "Edit vendor" : "Add vendor");
    $("#vendor-id").val(id || "");
    $("#vendor-poc-section").toggleClass("hide", !id);
    if (id) {
      var v = db.getVendor(id);
      if (!v) return;
      $("#vf-name").val(v.name);
      $("#vf-phone").val(v.phone || "");
      $("#vf-email").val(v.email || "");
      $("#vf-addr1").val(v.address_line1 || "");
      $("#vf-city").val(v.city || "");
      $("#vf-state").val(v.state || "");
      $("#vf-pin").val(v.pincode || "");
      $("#vf-gstin").val(v.gstin || "");
      $("#vf-notes").val(v.notes || "");
      loadPocTable(id);
    } else {
      $("#form-vendor")[0].reset();
      $("#vendor-poc-body").empty();
    }
    M.updateTextFields();
    if ($("#vf-notes").length) M.textareaAutoResize($("#vf-notes"));
    $("#modal-vendor").modal("open");
  }

  function refreshLotsTable() {
    var rows = db.listLots();
    var $tb = $("#lot-table-body").empty();
    rows.forEach(function (r) {
      var $tr = $("<tr></tr>");
      var lotTd = $("<td></td>");
      lotTd.append(
        $("<a></a>")
          .attr("href", "lot-detail.html?id=" + r.id)
          .addClass("teal-text text-darken-2")
          .css("font-weight", "600")
          .text(r.lot_number || "—")
      );
      $tr.append(
        lotTd,
        $("<td></td>").text(r.vendor_name || "—"),
        $("<td></td>").text(fmtDate(r.delivered_date || r.lot_date)),
        $("<td></td>").addClass("right-align").text(String(r.line_count || 0)),
        $("<td></td>").addClass("inv-actions-cell").html(
          '<a href="lot-edit.html?id=' +
            r.id +
            '" class="btn-small waves-effect inv-btn-outline inv-lot-row-edit">Edit</a>'
        )
      );
      $tb.append($tr);
    });
    if (!rows.length) {
      $tb.append('<tr><td colspan="5" class="center grey-text">No purchase lots yet.</td></tr>');
    }
  }

  var productOptionsHtml = "";

  function buildProductOptions() {
    populateProductTypeFilter();
    var rows = db.listProducts("", "active");
    productOptionsHtml = rows
      .map(function (r) {
        return '<option value="' + r.id + '">' + _.escape(r.name) + "</option>";
      })
      .join("");
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
          activeSection: getActiveSectionFromQuery(),
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        $(".modal").modal();

        (function wireInventoryCsvImports() {
          var C = window.MargInventoryCsv;
          if (!C) return;

          function bind(section, sampleKey, importer, refresh) {
            var s = C.samples[sampleKey];
            $("#btn-csv-sample-" + section).on("click", function () {
              C.downloadSample(s.filename, s.body);
            });
            $("#btn-csv-import-" + section).on("click", function () {
              $("#csv-" + section + "-file").trigger("click");
            });
            $("#csv-" + section + "-file").on("change", function (e) {
              var input = e.target;
              var f = input.files && input.files[0];
              $(input).val("");
              if (!f) return;
              var reader = new FileReader();
              reader.onload = function () {
                var text = reader.result || "";
                importer(db, text)
                  .then(function (result) {
                    var n = result.ok;
                    var errs = result.errors || [];
                    var label =
                      section === "products"
                        ? "product"
                        : section === "vendors"
                          ? "vendor"
                          : "lot";
                    var msg = "Imported " + n + " " + label + (n === 1 ? "" : "s");
                    if (errs.length) {
                      msg += ". " + errs.length + " issue(s).";
                      console.warn("CSV import issues:", errs);
                    }
                    M.toast({ html: msg, displayLength: errs.length ? 6000 : 4000 });
                    refresh();
                  })
                  .catch(function (err) {
                    M.toast({ html: err.message || String(err) });
                  });
              };
              reader.onerror = function () {
                M.toast({ html: "Could not read file." });
              };
              reader.readAsText(f);
            });
          }

          bind("products", "products", C.importProducts, function () {
            refreshProductsTable();
            buildProductOptions();
          });
          bind("vendors", "vendors", C.importVendors, refreshVendorsTable);
          bind("lots", "lots", C.importLots, refreshLotsTable);
        })();

        function showInventoryPanel(panel) {
          $(".inventory-panel").addClass("hide");
          $("#panel-" + panel).removeClass("hide");
          $(".inv-nav-item").removeClass("active");
          $('.inv-nav-item[data-panel="' + panel + '"]').addClass("active");
          if (panel === "vendors") refreshVendorsTable();
          if (panel === "lots") refreshLotsTable();
          if (panel === "products") {
            populateProductTypeFilter();
            refreshProductsTable();
          }
        }

        $(document).on("click", "a.inv-nav-item[data-panel]", function (e) {
          if (!$("body").hasClass("page-inventory")) return;
          e.preventDefault();
          var panel = $(this).data("panel");
          if (panel) {
            showInventoryPanel(panel);
            history.replaceState(null, "", "?panel=" + panel);
          }
        });

        showInventoryPanel(getInitialPanelFromQuery());

        var qsInv = new URLSearchParams(window.location.search);
        var qProd = qsInv.get("q");
        if (qProd && $("#product-search").length) {
          $("#product-search").val(qProd);
          productPage = 0;
          refreshProductsTable();
        }

        var editVendorId = qsInv.get("editVendor");
        if (editVendorId) {
          var evId = Number(editVendorId);
          if (evId > 0) {
            showInventoryPanel("vendors");
            history.replaceState(null, "", "?panel=vendors");
            setTimeout(function () {
              openVendorModal(evId);
            }, 0);
          }
        }

        var productSearchDebounceMs = 500;
        var productSearchTimer = null;
        $("#product-search").on("input", function () {
          clearTimeout(productSearchTimer);
          productSearchTimer = setTimeout(function () {
            productPage = 0;
            productSearchTimer = null;
            refreshProductsTable();
          }, productSearchDebounceMs);
        });

        $("#product-status-filter").on("change", function () {
          productPage = 0;
          refreshProductsTable();
        });

        $("#product-type-filter").on("change", function () {
          productPage = 0;
          refreshProductsTable();
        });

        $("#product-search").on("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            clearTimeout(productSearchTimer);
            productSearchTimer = null;
            productPage = 0;
            refreshProductsTable();
          }
        });

        $("#btn-product-prev").on("click", function () {
          if (productPage > 0) {
            productPage--;
            refreshProductsTable();
          }
        });
        $("#btn-product-next").on("click", function () {
          var rows = getProductFilteredRows();
          var maxPage = Math.max(0, Math.ceil(rows.length / productPageSize) - 1);
          if (productPage < maxPage) {
            productPage++;
            refreshProductsTable();
          }
        });
        $("#product-table-body").on("click", ".deactivate-product", function (e) {
          e.preventDefault();
          var id = Number($(e.currentTarget).data("id"));
          if (confirm("Deactivate this product? It will be hidden from new stock lines.")) {
            db.deactivateProduct(id).then(function () {
              M.toast({ html: "Product deactivated" });
              refreshProductsTable();
              buildProductOptions();
            });
          }
        });

        $("#product-table-body").on("click", ".activate-product", function (e) {
          e.preventDefault();
          var id = Number($(e.currentTarget).data("id"));
          if (confirm("Activate this product? It will appear in stock lines and search again.")) {
            db.activateProduct(id).then(function () {
              M.toast({ html: "Product activated" });
              refreshProductsTable();
              buildProductOptions();
            });
          }
        });

        $("#btn-vendor-add").on("click", function () {
          openVendorModal(null);
        });

        $("#form-vendor").on("submit", function (e) {
          e.preventDefault();
          var payload = {
            name: $("#vf-name").val().trim(),
            phone: $("#vf-phone").val(),
            email: $("#vf-email").val(),
            address_line1: $("#vf-addr1").val(),
            address_line2: "",
            city: $("#vf-city").val(),
            state: $("#vf-state").val(),
            pincode: $("#vf-pin").val(),
            gstin: $("#vf-gstin").val(),
            notes: $("#vf-notes").val(),
          };
          if (!payload.name) {
            M.toast({ html: "Vendor name is required" });
            return;
          }
          var vid = $("#vendor-id").val();
          var prom = vid
            ? db.updateVendor(Number(vid), payload)
            : db.insertVendor(payload).then(function (newId) {
                $("#vendor-id").val(newId);
                $("#vendor-poc-section").removeClass("hide");
                $("#modal-vendor-title").text("Edit vendor");
                return newId;
              });
          Promise.resolve(prom)
            .then(function () {
              M.toast({ html: "Vendor saved" });
              refreshVendorsTable();
            })
            .catch(function (err) {
              M.toast({ html: err.message || String(err) });
            });
        });

        $("#btn-poc-add").on("click", function () {
          var vid = $("#vendor-id").val();
          if (!vid) {
            M.toast({ html: "Save vendor first" });
            return;
          }
          var name = $("#poc-name").val().trim();
          if (!name) {
            M.toast({ html: "POC name is required" });
            return;
          }
          db.insertVendorPoc(Number(vid), {
            name: name,
            phone: $("#poc-phone").val(),
            role: $("#poc-role").val(),
          }).then(function () {
            $("#poc-name").val("");
            $("#poc-phone").val("");
            $("#poc-role").val("");
            M.updateTextFields();
            loadPocTable(Number(vid));
            M.toast({ html: "Contact added" });
          });
        });

        $("#vendor-poc-body").on("click", ".delete-poc", function (e) {
          e.preventDefault();
          var id = Number($(e.currentTarget).data("id"));
          db.deleteVendorPoc(id).then(function () {
            loadPocTable(Number($("#vendor-id").val()));
          });
        });

      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
