/**
 * Entity Import & export — Excel workbook (Products, Vendors, Customers, Lots, LotLines).
 */
(function () {
  var db;

  function refreshImportCounts() {
    if (!db || typeof db.getMasterDataCounts !== "function") return;
    var c = db.getMasterDataCounts();
    $("#count-products").text(c.products);
    $("#count-vendors").text(c.vendors);
    $("#count-customers").text(c.customers);
    $("#count-orders").text(c.orders != null ? c.orders : "—");
    $("#count-lots").text(c.lots);
    if ($("#count-prescriptions").length) {
      $("#count-prescriptions").text(c.prescriptions != null ? c.prescriptions : "—");
    }
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
          activeSection: "import-export",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        refreshImportCounts();

        $("#btn-export-excel").on("click", function () {
          if (typeof MargInventoryExcel === "undefined" || typeof XLSX === "undefined") {
            M.toast({ html: "Excel library failed to load. Check network/CDN." });
            return;
          }
          try {
            MargInventoryExcel.exportEntityInventoryExcel(db);
            M.toast({ html: "Excel export downloaded." });
          } catch (err) {
            M.toast({ html: err && err.message ? err.message : String(err) });
          }
        });

        $("#btn-import-excel").on("click", function () {
          $("#entity-excel-file").trigger("click");
        });

        $("#btn-download-sample-excel").on("click", function () {
          if (typeof MargInventoryExcel === "undefined" || typeof XLSX === "undefined") {
            M.toast({ html: "Excel library failed to load. Check network/CDN." });
            return;
          }
          MargInventoryExcel.downloadSampleInventoryExcel();
          M.toast({
            html:
              "Downloaded pharmapulse-sample-data.xlsx — includes Entity, CommonDetails, Prescriptions, Orders, Customers, Products, Lots.",
          });
        });

        $("#entity-excel-file").on("change", function (e) {
          var file = e.target.files && e.target.files[0];
          e.target.value = "";
          if (!file) return;
          if (typeof MargInventoryExcel === "undefined") {
            M.toast({ html: "Excel module not loaded." });
            return;
          }
          var fullReplace = $("#inv-import-full-replace").prop("checked");
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
                M.toast({
                  html:
                    "No rows found. Add sheets Entity (optional), Staff (optional), CommonDetails (optional), Products, Vendors, Customers, Prescriptions, PrescriptionLines, Orders, OrderLines, Lots, LotLines (with header row).",
                });
                return;
              }
              if (fullReplace) {
                var ok = window.confirm(
                  "Full backup import: delete ALL existing products, vendors, customers, prescriptions, orders, and lots for this entity, then import this file?\n\n" +
                    "If the file includes an Entity sheet with data, shop profile + invoice format + terms are applied after import.\n\nThis cannot be undone."
                );
                if (!ok) {
                  $("#inv-import-full-replace").prop("checked", false);
                  return;
                }
              }
              MargInventoryExcel.importWorkbook(db, data, { fullReplace: fullReplace })
                .then(function (stats) {
                  var prefix = stats.replaced ? "Existing data cleared. " : "";
                  var msg =
                    prefix +
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
                  if (stats.errors.length) {
                    msg += " " + stats.errors.join(" ");
                  }
                  M.toast({ html: msg });
                  if (fullReplace) {
                    $("#inv-import-full-replace").prop("checked", false);
                  }
                  refreshImportCounts();
                })
                .catch(function (err) {
                  M.toast({ html: err.message || String(err) });
                });
            } catch (err) {
              M.toast({ html: "Excel error: " + (err.message || String(err)) });
            }
          };
          reader.onerror = function () {
            M.toast({ html: "Could not read file." });
          };
          reader.readAsArrayBuffer(file);
        });
      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
