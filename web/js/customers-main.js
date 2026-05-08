/**
 * Customers UI — docs/order.md §5.1 customer, structure.log §4
 */
(function () {
  var db;
  var searchDebounceMs = 400;
  var searchTimer = null;

  function formatAddressShort(r) {
    var parts = [];
    if (r.address_line1 && String(r.address_line1).trim()) parts.push(String(r.address_line1).trim());
    if (r.address_line2 && String(r.address_line2).trim()) parts.push(String(r.address_line2).trim());
    if (!parts.length) return "—";
    var s = parts.join(", ");
    return s.length > 48 ? s.slice(0, 45) + "…" : s;
  }

  function refreshCustomerTable() {
    var q = $("#customer-search").val() || "";
    var rows = db.listCustomers(q);
    var $tb = $("#customer-table-body").empty();
    rows.forEach(function (r) {
      var $tr = $("<tr></tr>");
      $tr.append(
        $("<td></td>")
          .addClass("inv-name-cell")
          .append(
            $("<a></a>")
              .attr("href", "customer-detail.html?id=" + r.id)
              .addClass("inv-table-link")
              .text(r.name || "")
          ),
        $("<td></td>").text(r.phone || "—"),
        $("<td></td>").text(r.email || "—"),
        $("<td></td>").text(r.city || "—"),
        $("<td></td>").addClass("grey-text").text(formatAddressShort(r)),
        $("<td></td>")
          .addClass("inv-actions-cell")
          .html(
            '<a href="#!" class="inv-icon-btn edit-customer" data-id="' +
              r.id +
              '"><i class="material-icons">edit</i></a>' +
              '<a href="#!" class="inv-icon-btn delete-customer" data-id="' +
              r.id +
              '"><i class="material-icons">delete</i></a>'
          )
      );
      $tb.append($tr);
    });
    if (!rows.length) {
      $tb.append(
        '<tr><td colspan="6" class="center grey-text" style="padding: 2rem">No customers found. Add one or clear search.</td></tr>'
      );
    }
  }

  function openCustomerModal(id) {
    $("#modal-customer-title").text(id ? "Edit customer" : "Add customer");
    $("#customer-id").val(id || "");
    if (id) {
      var c = db.getCustomer(id);
      if (!c) return;
      $("#cf-name").val(c.name || "");
      $("#cf-phone").val(c.phone || "");
      $("#cf-email").val(c.email || "");
      $("#cf-address1").val(c.address_line1 || "");
      $("#cf-address2").val(c.address_line2 || "");
      $("#cf-city").val(c.city || "");
      $("#cf-state").val(c.state || "");
      $("#cf-pincode").val(c.pincode || "");
      $("#cf-notes").val(c.notes || "");
    } else {
      $("#form-customer")[0].reset();
    }
    M.updateTextFields();
    if ($("#cf-notes").length) M.textareaAutoResize($("#cf-notes"));
    $("#modal-customer").modal("open");
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
          activeSection: "customers",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        $(".modal").modal();

        (function wireCustomerCsv() {
          var C = window.MargInventoryCsv;
          if (!C || typeof C.importCustomers !== "function") return;

          $("#btn-customer-csv-sample").on("click", function () {
            var s = C.samples && C.samples.customers;
            if (!s || !C.downloadSample) {
              M.toast({ html: "CSV helper not loaded." });
              return;
            }
            C.downloadSample(s.filename, s.body);
            M.toast({ html: "Downloaded " + s.filename });
          });

          $("#btn-customer-csv-import").on("click", function () {
            $("#customer-csv-file").trigger("click");
          });

          $("#btn-customer-csv-export").on("click", function () {
            if (!C.exportCustomersCsv) {
              M.toast({ html: "Export not available." });
              return;
            }
            C.exportCustomersCsv(db);
            M.toast({ html: "CSV downloaded." });
          });

          $("#customer-csv-file").on("change", function (e) {
            var input = e.target;
            var f = input.files && input.files[0];
            $(input).val("");
            if (!f) return;
            var reader = new FileReader();
            reader.onload = function () {
              var text = String(reader.result || "");
              C.importCustomers(db, text)
                .then(function (result) {
                  var n = result.ok;
                  var errs = result.errors || [];
                  var msg = "Imported " + n + " customer" + (n === 1 ? "" : "s");
                  if (errs.length) {
                    msg += ". " + errs.length + " issue(s).";
                    console.warn("CSV import issues:", errs);
                  }
                  M.toast({ html: msg, displayLength: errs.length ? 6000 : 4000 });
                  refreshCustomerTable();
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
        })();

        var qs = new URLSearchParams(window.location.search);
        var qUrl = qs.get("q");
        if (qUrl) {
          $("#customer-search").val(qUrl);
        }

        refreshCustomerTable();

        var qsEdit = new URLSearchParams(window.location.search).get("edit");
        if (qsEdit) {
          var eid = Number(qsEdit);
          if (eid && db.getCustomer(eid)) {
            openCustomerModal(eid);
          }
          if (window.history.replaceState) {
            var u = new URL(window.location.href);
            u.searchParams.delete("edit");
            window.history.replaceState({}, "", u.pathname + u.search + u.hash);
          }
        }

        $("#customer-search").on("input", function () {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(function () {
            searchTimer = null;
            refreshCustomerTable();
          }, searchDebounceMs);
        });

        $("#customer-search").on("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            clearTimeout(searchTimer);
            refreshCustomerTable();
          }
        });

        $("#btn-customer-add").on("click", function () {
          openCustomerModal(null);
        });

        $("#customer-table-body").on("click", ".edit-customer", function (e) {
          e.preventDefault();
          openCustomerModal(Number($(e.currentTarget).data("id")));
        });

        $("#customer-table-body").on("click", ".delete-customer", function (e) {
          e.preventDefault();
          var id = Number($(e.currentTarget).data("id"));
          if (!confirm("Delete this customer? (Blocked if they already have orders.)")) return;
          db.deleteCustomer(id)
            .then(function () {
              M.toast({ html: "Customer removed" });
              refreshCustomerTable();
            })
            .catch(function (err) {
              M.toast({ html: err.message || String(err) });
            });
        });

        $("#form-customer").on("submit", function (e) {
          e.preventDefault();
          var payload = {
            name: $("#cf-name").val().trim(),
            phone: $("#cf-phone").val(),
            email: $("#cf-email").val(),
            address_line1: $("#cf-address1").val(),
            address_line2: $("#cf-address2").val(),
            city: $("#cf-city").val(),
            state: $("#cf-state").val(),
            pincode: $("#cf-pincode").val(),
            notes: $("#cf-notes").val(),
          };
          if (!payload.name) {
            M.toast({ html: "Name is required" });
            return;
          }
          var cid = $("#customer-id").val();
          var done = function () {
            M.toast({ html: "Saved" });
            $("#modal-customer").modal("close");
            refreshCustomerTable();
          };
          var fail = function (err) {
            M.toast({ html: err.message || String(err) });
          };
          if (cid) {
            db.updateCustomer(Number(cid), payload).then(done).catch(fail);
          } else {
            db.insertCustomer(payload).then(done).catch(fail);
          }
        });
      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
