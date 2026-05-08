/**
 * Prescriptions list — docs/prescription.md
 */
(function () {
  var db;
  var searchTimer = null;
  var searchDebounceMs = 350;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(iso) {
    if (!iso || String(iso).length < 10) return "—";
    return String(iso).slice(0, 10);
  }

  function refreshCustomerFilter() {
    var rows = db.listCustomers("");
    var opts = '<option value="">All customers</option>';
    rows.forEach(function (r) {
      var lab = esc(r.name || "") + (r.phone ? " · " + esc(r.phone) : "");
      opts += '<option value="' + r.id + '">' + lab + "</option>";
    });
    $("#rx-filter-customer").html(opts);
  }

  function refreshTable() {
    var q = $("#rx-search").val() || "";
    var cid = $("#rx-filter-customer").val();
    var df = $("#rx-date-from").val() || "";
    var dt = $("#rx-date-to").val() || "";
    var rows = db.listPrescriptions({
      q: q.trim() || undefined,
      customerId: cid || undefined,
      dateFrom: df || undefined,
      dateTo: dt || undefined,
    });
    var $tb = $("#rx-table-body").empty();
    rows.forEach(function (r) {
      var doc = [r.doctor_name, r.doctor_phone].filter(Boolean).join(" · ") || "—";
      var lines = r.line_count != null ? String(r.line_count) : "—";
      $tb.append(
        "<tr>" +
          '<td><a class="inv-table-link" href="prescription-detail.html?id=' +
          r.id +
          '">' +
          esc(fmtDate(r.created_at)) +
          "</a></td>" +
          '<td><a class="inv-table-link" href="customer-detail.html?id=' +
          r.customer_id +
          '">' +
          esc(r.customer_name || "") +
          "</a></td>" +
          "<td>" +
          esc(doc) +
          "</td>" +
          '<td class="right-align">' +
          esc(lines) +
          "</td>" +
          '<td class="inv-actions-cell">' +
          '<a href="prescription-detail.html?id=' +
          r.id +
          '" class="inv-icon-btn" title="View"><i class="material-icons">visibility</i></a>' +
          '<a href="prescription-edit.html?id=' +
          r.id +
          '" class="inv-icon-btn" title="Edit"><i class="material-icons">edit</i></a>' +
          '<a href="#!" class="inv-icon-btn rx-del grey-text" data-id="' +
          r.id +
          '" title="Delete"><i class="material-icons">delete</i></a>' +
          "</td>" +
          "</tr>"
      );
    });
    if (!rows.length) {
      $tb.append(
        '<tr><td colspan="5" class="center grey-text" style="padding:2rem">No prescriptions match. Add one or adjust filters.</td></tr>'
      );
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
          activeSection: "prescriptions",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        refreshCustomerFilter();
        refreshTable();

        $("#rx-search").on("input", function () {
          if (searchTimer) clearTimeout(searchTimer);
          searchTimer = setTimeout(function () {
            refreshTable();
          }, searchDebounceMs);
        });
        $("#rx-filter-customer, #rx-date-from, #rx-date-to").on("change", function () {
          refreshTable();
        });

        $("#rx-table-body").on("click", ".rx-del", function (e) {
          e.preventDefault();
          var rid = Number($(e.currentTarget).data("id"));
          if (!confirm("Delete this prescription and all its lines?")) return;
          db.deletePrescription(rid)
            .then(function () {
              M.toast({ html: "Deleted." });
              refreshTable();
            })
            .catch(function (err) {
              M.toast({ html: err.message || String(err) });
            });
        });

        $("#btn-rx-csv-sample").on("click", function () {
          if (typeof MargPrescriptionCsv === "undefined" || !MargPrescriptionCsv.downloadSamplePrescriptionsCsv) {
            M.toast({ html: "CSV helper not loaded." });
            return;
          }
          MargPrescriptionCsv.downloadSamplePrescriptionsCsv();
          M.toast({ html: "Downloaded prescriptions-import-sample.csv" });
        });

        $("#btn-rx-csv-import").on("click", function () {
          $("#rx-csv-file").trigger("click");
        });

        $("#rx-csv-file").on("change", function (e) {
          var file = e.target.files && e.target.files[0];
          e.target.value = "";
          if (!file) return;
          if (typeof MargPrescriptionCsv === "undefined" || !MargPrescriptionCsv.importPrescriptionsCsv) {
            M.toast({ html: "CSV helper not loaded." });
            return;
          }
          var reader = new FileReader();
          reader.onload = function () {
            var text = String(reader.result || "");
            MargPrescriptionCsv.importPrescriptionsCsv(db, text)
              .then(function (res) {
                var msg =
                  "Imported " + res.imported + " prescription(s)." + (res.errors.length ? " Some rows skipped." : "");
                M.toast({ html: msg });
                if (res.errors.length) {
                  console.warn(res.errors);
                  M.toast({ html: res.errors.slice(0, 3).join(" ") });
                }
                refreshTable();
              })
              .catch(function (err) {
                M.toast({ html: err.message || String(err) });
              });
          };
          reader.onerror = function () {
            M.toast({ html: "Could not read file." });
          };
          reader.readAsText(file);
        });
      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
