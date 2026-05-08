/**
 * Prescription detail + print — docs/prescription.md
 */
(function () {
  var db;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    var s = String(iso);
    if (s.length >= 19) return s.slice(0, 10) + " " + s.slice(11, 16);
    if (s.length >= 10) return s.slice(0, 10);
    return s;
  }

  function addrParts(ent) {
    var p = [];
    if (ent.line1 && String(ent.line1).trim()) p.push(String(ent.line1).trim());
    var cityLine = [ent.city, ent.state, ent.pincode].filter(Boolean).join(", ");
    if (cityLine) p.push(cityLine);
    return p;
  }

  function render(rxId) {
    var pack = db.getPrescription(rxId);
    if (!pack) {
      $("#rx-detail-root").html(
        '<p class="center grey-text" style="padding:2rem">Prescription not found.</p>'
      );
      return;
    }
    var h = pack.header;
    var ent = db.getCurrentEntity();
    var patient = db.getCustomer(h.customer_id);

    $("#btn-rx-edit").attr("href", "prescription-edit.html?id=" + rxId);

    var shopName = ent && ent.entity_name ? esc(ent.entity_name) : "—";
    var shopSub =
      ent && ent.legal_name && String(ent.legal_name).trim()
        ? esc(String(ent.legal_name).trim())
        : "";
    var shopAddr = ent ? addrParts(ent).map(esc).join("<br />") : "";
    var shopPhone = ent && ent.phone ? esc(ent.phone) : "";
    var shopDl = ent && ent.dl_number ? esc(ent.dl_number) : "";
    var shopMetaParts = [];
    if (shopPhone) shopMetaParts.push("Phone: " + shopPhone);
    if (shopDl) shopMetaParts.push("DL: " + shopDl);

    var patientName = patient ? esc(patient.name || "") : esc(h.customer_name || "");
    var patientPhone = patient && patient.phone ? esc(patient.phone) : "";
    var patientAddr = patient
      ? [patient.address_line1, patient.address_line2, patient.city, patient.pincode]
          .filter(function (x) {
            return x && String(x).trim();
          })
          .join(", ")
      : "";
    patientAddr = patientAddr ? esc(patientAddr) : "";

    var docLine = [h.doctor_name, h.doctor_phone].filter(Boolean);
    var docHtml = docLine.length ? docLine.map(esc).join(" · ") : "—";

    var linesHtml = "";
    pack.lines.forEach(function (ln, i) {
      var sec = ln.secret_notes && String(ln.secret_notes).trim();
      linesHtml +=
        "<tr>" +
        "<td>" +
        (i + 1) +
        "</td>" +
        "<td>" +
        esc(ln.prescription_status || "") +
        "</td>" +
        "<td>" +
        esc(ln.prescription_type || "—") +
        "</td>" +
        "<td>" +
        esc(ln.prescription_notes || "—") +
        "</td>" +
        '<td class="inv-rx-secret-col">' +
        (sec ? esc(sec) : "—") +
        "</td>" +
        "</tr>";
    });
    if (!pack.lines.length) {
      linesHtml =
        '<tr><td colspan="5" class="center grey-text">No lines on this prescription.</td></tr>';
    }

    var html =
      '<div class="inv-rx-print-header">' +
      '<div class="inv-rx-print-shop">' +
      "<h1 class=\"inv-rx-print-title\">Prescription</h1>" +
      '<p class="inv-rx-print-shop-name">' +
      shopName +
      "</p>" +
      (shopSub ? '<p class="inv-rx-print-shop-sub">' + shopSub + "</p>" : "") +
      (shopAddr ? '<p class="inv-rx-print-shop-addr">' + shopAddr + "</p>" : "") +
      (shopMetaParts.length
        ? '<p class="inv-rx-print-shop-meta">' + shopMetaParts.join(" · ") + "</p>"
        : "") +
      "</div>" +
      "</div>" +
      '<div class="inv-rx-print-meta">' +
      "<p><strong>Prescription #</strong> " +
      rxId +
      " · <strong>Recorded</strong> " +
      esc(fmtDateTime(h.created_at)) +
      "</p>" +
      "</div>" +
      '<h2 class="inv-rx-print-section-title">Patient</h2>' +
      "<p><strong>" +
      patientName +
      "</strong>" +
      (patientPhone ? " · " + patientPhone : "") +
      "</p>" +
      (patientAddr ? "<p>" + patientAddr + "</p>" : "") +
      '<h2 class="inv-rx-print-section-title">Prescribing doctor</h2>' +
      "<p>" +
      docHtml +
      "</p>" +
      '<h2 class="inv-rx-print-section-title">Lines</h2>' +
      '<div class="inv-table-scroll">' +
      '<table class="inv-data-table inv-rx-detail-lines">' +
      "<thead><tr>" +
      "<th>#</th><th>Status</th><th>Type</th><th>Notes</th>" +
      '<th class="inv-rx-secret-col">Internal only</th>' +
      "</tr></thead>" +
      "<tbody>" +
      linesHtml +
      "</tbody></table></div>" +
      '<p class="inv-rx-print-footer grey-text">Generated from Pharmacy ERP. Medicines dispensed as per applicable law.</p>';

    $("#rx-detail-root").html(html);
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
          activeSection: "prescription-detail",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        var qs = new URLSearchParams(window.location.search);
        var id = Number(qs.get("id"));
        if (!id) {
          $("#rx-detail-root").html(
            '<p class="center grey-text" style="padding:2rem">Missing prescription id.</p>'
          );
          return;
        }
        render(id);

        $("#btn-rx-print").on("click", function () {
          if ($("#rx-include-secret-print").prop("checked")) {
            $("html").addClass("print-rx-include-secret");
          } else {
            $("html").removeClass("print-rx-include-secret");
          }
          window.print();
        });
        $(window).on("afterprint", function () {
          $("html").removeClass("print-rx-include-secret");
        });
      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
