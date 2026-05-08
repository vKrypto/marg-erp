/**
 * Vendor detail — profile, POCs, purchase lots & financial balance (docs/inventory.md).
 */
(function () {
  var db;

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

  function fmtDate(s) {
    if (!s || String(s).length < 8) return "—";
    return String(s).slice(0, 10);
  }

  function lotBalancePaise(row) {
    var tp = row.total_price_paise != null && row.total_price_paise !== "" ? Number(row.total_price_paise) : null;
    var pp = row.total_paid_paise != null && row.total_paid_paise !== "" ? Number(row.total_paid_paise) : null;
    if (tp == null && pp == null) return null;
    return (tp != null ? tp : 0) - (pp != null ? pp : 0);
  }

  function renderPage(vendorId) {
    var v = db.getVendor(vendorId);
    if (!v) {
      window.location.href = "inventory.html?panel=vendors";
      return;
    }

    $("#vd-name").text(v.name || "—");
    $("#vd-sub").text([v.city, v.gstin].filter(Boolean).join(" · ") || "Supplier profile");

    $("#vd-btn-edit")
      .removeClass("hide")
      .attr("href", "inventory.html?panel=vendors&editVendor=" + vendorId);

    $("#vd-phone").text(v.phone || "—");
    $("#vd-email").text(v.email || "—");
    $("#vd-gstin").text(v.gstin || "—");
    $("#vd-city").text(v.city || "—");
    var statePin = [v.state, v.pincode].filter(function (x) {
      return x && String(x).trim();
    });
    $("#vd-state-pin").text(statePin.length ? statePin.join(" · ") : "—");
    var addr = [v.address_line1, v.address_line2].filter(function (x) {
      return x && String(x).trim();
    });
    $("#vd-address").text(addr.length ? addr.join(", ") : "—");

    if (v.notes && String(v.notes).trim()) {
      $("#vd-notes-wrap").show();
      $("#vd-notes").text(String(v.notes).trim());
    } else {
      $("#vd-notes-wrap").hide();
    }

    var fin = db.getVendorFinancialSummary(vendorId);
    if (fin) {
      $("#vd-kpi-lots").text(String(fin.lotCount));
      $("#vd-kpi-total").text(fmtRsPaise(fin.sumTotalPaise));
      $("#vd-kpi-paid").text(fmtRsPaise(fin.sumPaidPaise));
      var bal = fin.balancePaise;
      var $bal = $("#vd-kpi-balance");
      $bal.text(fmtRsPaise(bal));
      $bal.removeClass("red-text text-darken-2 teal-text text-darken-2 amber-text text-darken-3");
      if (bal > 0) {
        $bal.addClass("amber-text text-darken-3");
      } else if (bal < 0) {
        $bal.addClass("red-text text-darken-2");
      } else {
        $bal.addClass("teal-text text-darken-2");
      }
    }

    var pocs = db.listVendorPocs(vendorId);
    var $poc = $("#vd-poc-body").empty();
    pocs.forEach(function (p) {
      $poc.append(
        "<tr><td>" +
          esc(p.name) +
          "</td><td>" +
          esc(p.phone || "—") +
          "</td><td>" +
          esc(p.role || "—") +
          "</td></tr>"
      );
    });
    if (!pocs.length) {
      $poc.append(
        '<tr><td colspan="3" class="center grey-text" style="padding:1.25rem">No contacts yet.</td></tr>'
      );
    }
    var lots = db.listLotsForVendor(vendorId);
    var $tb = $("#vd-lots-body").empty();
    lots.forEach(function (row) {
      var bal = lotBalancePaise(row);
      var balCell = bal != null ? fmtRsPaise(bal) : "—";
      var balTdClass = "right-align";
      if (bal != null) {
        if (bal > 0) balTdClass += " amber-text text-darken-3";
        else if (bal < 0) balTdClass += " red-text text-darken-2";
      }
      $tb.append(
        "<tr>" +
          '<td class="inv-mono">' +
          esc(row.lot_number || "—") +
          "</td>" +
          "<td>" +
          esc(fmtDate(row.delivered_date || row.lot_date)) +
          "</td>" +
          '<td class="right-align">' +
          esc(String(row.line_count != null ? row.line_count : "—")) +
          "</td>" +
          '<td class="right-align">' +
          esc(row.total_price_paise != null ? fmtRsPaise(row.total_price_paise) : "—") +
          "</td>" +
          '<td class="right-align">' +
          esc(row.total_paid_paise != null ? fmtRsPaise(row.total_paid_paise) : "—") +
          "</td>" +
          '<td class="' +
          balTdClass +
          '">' +
          balCell +
          "</td>" +
          '<td class="inv-actions-cell">' +
          '<a class="inv-icon-btn" href="lot-detail.html?id=' +
          row.id +
          '" title="View lot"><i class="material-icons">visibility</i></a>' +
          '<a class="inv-icon-btn" href="lot-edit.html?id=' +
          row.id +
          '" title="Edit lot"><i class="material-icons">edit</i></a>' +
          "</td>" +
          "</tr>"
      );
    });
    if (!lots.length) {
      $tb.append(
        '<tr><td colspan="7" class="center grey-text" style="padding:2rem">No purchase lots for this vendor yet.</td></tr>'
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
          window.location.href = "inventory.html?panel=vendors";
          return;
        }

        var ent = db.getEntityById(db.getCurrentEntityId());
        mountPharmaPulseShell({
          el: "#layout-root",
          activeSection: "vendor-detail",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        renderPage(id);
      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
