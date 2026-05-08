/**
 * Add / edit product — full page (product-new.html).
 */
(function () {
  var db;
  var productTypesCache = [];

  function closeProductTypeDd() {
    $("#pn-product-type-dd").addClass("hide").attr("aria-hidden", "true").empty();
  }

  function refreshProductTypesCache() {
    if (!db || typeof db.listProductTypes !== "function") return;
    productTypesCache = db.listProductTypes() || [];
  }

  function fillProductTypeDropdown(q) {
    var $ul = $("#pn-product-type-dd");
    $ul.empty().removeClass("hide").attr("aria-hidden", "false");
    var qq = (q || "").toLowerCase().trim();
    var n = 0;
    var i;
    for (i = 0; i < productTypesCache.length; i++) {
      var row = productTypesCache[i];
      var lab = row.label || "";
      if (qq && lab.toLowerCase().indexOf(qq) < 0) continue;
      $ul.append(
        $("<li></li>")
          .addClass("pn-product-type-li")
          .attr("data-id", row.id)
          .attr("data-label", lab)
          .text(lab)
      );
      if (++n >= 80) break;
    }
    if (!n) {
      $ul.append(
        $("<li></li>")
          .addClass("pn-product-type-li pn-product-type-li--empty muted")
          .text("No matches — type a new value and save to add it")
      );
    }
  }

  function setProductTypeUi(id, label) {
    $("#pn-product-type-id").val(id != null && id !== "" ? String(id) : "");
    $("#pn-product-type-search").val(label || "");
    closeProductTypeDd();
    if (typeof M !== "undefined" && M.updateTextFields) M.updateTextFields();
  }

  function readPayload() {
    var typeSearch = $("#pn-product-type-search").val().trim();
    var ptId = null;
    if (typeSearch && db && typeof db.resolveOrCreateProductTypeId === "function") {
      ptId = db.resolveOrCreateProductTypeId(typeSearch);
      refreshProductTypesCache();
    }
    return {
      product_type_id: ptId,
      name: $("#pn-name").val().trim(),
      code: $("#pn-code").val(),
      barcode: $("#pn-barcode").val(),
      pack_label: $("#pn-pack-label").val(),
      units_per_strip: $("#pn-units").val(),
      description: $("#pn-desc").val(),
      chemical_composition: $("#pn-composition").val(),
      general_recommendation: $("#pn-recommend").val(),
      where_to_use: $("#pn-where").val(),
    };
  }

  function fillForm(p) {
    setProductTypeUi(p.product_type_id, p.product_type_label ? String(p.product_type_label) : "");
    $("#pn-name").val(p.name || "");
    $("#pn-code").val(p.code || "");
    $("#pn-barcode").val(p.barcode || "");
    $("#pn-pack-label").val(p.pack_label || "");
    $("#pn-units").val(p.units_per_strip != null ? p.units_per_strip : "");
    $("#pn-desc").val(p.description || "");
    $("#pn-composition").val(p.chemical_composition || "");
    $("#pn-recommend").val(p.general_recommendation || "");
    $("#pn-where").val(p.where_to_use || "");
    M.updateTextFields();
    if ($("#pn-desc").length) M.textareaAutoResize($("#pn-desc"));
    if ($("#pn-composition").length) M.textareaAutoResize($("#pn-composition"));
    if ($("#pn-recommend").length) M.textareaAutoResize($("#pn-recommend"));
    if ($("#pn-where").length) M.textareaAutoResize($("#pn-where"));
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

        if (typeof db.ensureDefaultProductTypes === "function") {
          db.ensureDefaultProductTypes();
        }
        refreshProductTypesCache();

        var qs = new URLSearchParams(window.location.search);
        var editId = Number(qs.get("id"));
        var isEdit = editId > 0;

        var ent = db.getEntityById(db.getCurrentEntityId());
        mountPharmaPulseShell({
          el: "#layout-root",
          activeSection: "product-new",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        $("#pn-product-type-search").on("focus", function () {
          refreshProductTypesCache();
          fillProductTypeDropdown($(this).val());
        });

        $("#pn-product-type-search").on("input", function () {
          $("#pn-product-type-id").val("");
          fillProductTypeDropdown($(this).val());
        });

        $("#pn-product-type-dd").on("mousedown", ".pn-product-type-li:not(.pn-product-type-li--empty)", function (e) {
          e.preventDefault();
          var id = $(this).attr("data-id");
          var lab = $(this).attr("data-label") || $(this).text() || "";
          setProductTypeUi(id, lab);
        });

        $(document).on("click", function (e) {
          if (!$(e.target).closest(".pn-product-type-wrap").length) {
            closeProductTypeDd();
          }
        });

        if (isEdit) {
          var p = db.getProduct(editId);
          if (!p) {
            window.location.href = "inventory.html?panel=products";
            return;
          }
          document.title = "Pharmacy ERP — Edit product";
          $("#pn-page-title").text("Edit product");
          $("#pn-page-sub").text("Update master data for " + (p.name || "this product") + ".");
          $("#pn-product-id").val(String(editId));
          $("#pn-submit-label").text("Save changes");
          $("#pn-back").attr("href", "product-detail.html?id=" + editId);
          $("#pn-cancel").attr("href", "product-detail.html?id=" + editId);
          fillForm(p);
        } else {
          $("#pn-strips").val(1);
          setProductTypeUi("", "");
          M.updateTextFields();
        }

        $("#form-product-new").on("submit", function (e) {
          e.preventDefault();
          var payload = readPayload();
          if (!payload.name) {
            M.toast({ html: "Name is required" });
            return;
          }
          var fail = function (err) {
            M.toast({ html: err.message || String(err) });
          };
          if (isEdit) {
            db.updateProduct(editId, payload)
              .then(function () {
                M.toast({ html: "Saved" });
                window.location.href = "product-detail.html?id=" + editId;
              })
              .catch(fail);
          } else {
            db.insertProduct(payload)
              .then(function (newId) {
                M.toast({ html: "Product created" });
                window.location.href = "product-detail.html?id=" + newId;
              })
              .catch(fail);
          }
        });
      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
