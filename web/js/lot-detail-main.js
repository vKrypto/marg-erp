/**
 * Purchase lot detail — full page (replaces modal on inventory.html).
 */
(function () {
  var db;

  function fmtRsPaise(paise) {
    if (paise == null || paise === "") return "—";
    var n = Number(paise);
    if (isNaN(n)) return "—";
    return "₹" + (n / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Coerce SQLite / sync values to integer paise or null. */
  function numPaise(v) {
    if (v == null || v === "") return null;
    var n = Number(v);
    if (isNaN(n)) return null;
    return Math.round(n);
  }

  function sumStripQty(lines) {
    var s = 0;
    if (!lines) return 0;
    lines.forEach(function (ln) {
      var q = Number(ln.quantity);
      if (!isNaN(q) && q > 0) s += q;
    });
    return s;
  }

  /** Σ (strips × strip selling paise) when each line has stored per-strip paise. */
  function sellingTotalPaiseFromLines(lines) {
    var sum = 0;
    if (!lines || !lines.length) return 0;
    lines.forEach(function (ln) {
      var q = Number(ln.quantity);
      var sp = numPaise(ln.selling_price_paise);
      if (!isNaN(q) && q > 0 && sp != null && sp >= 0) {
        sum += Math.round(q * sp);
      }
    });
    return sum;
  }

  /**
   * When line selling is missing but lot.total_price_paise is set, allocate total across strips
   * (same average per-strip on each line — best we can do without MRP on lines).
   */
  function impliedStripPaiseFromLotTotal(lot, ln, sumStrips) {
    var t = numPaise(lot.total_price_paise);
    var q = Number(ln.quantity);
    if (t == null || t <= 0 || !sumStrips || !(q > 0)) return null;
    var lineTotal = Math.round((t * q) / sumStrips);
    return Math.round(lineTotal / q);
  }

  /** When line rows lack selling_price_paise but lot.total_price_paise is set — sum of strip-weighted shares equals lot total. */
  function impliedTotalFromAllocatedLot(lot, lines) {
    var t = numPaise(lot.total_price_paise);
    var sumStrips = sumStripQty(lines);
    if (t == null || t <= 0 || !sumStrips || !lines.length) return 0;
    var sum = 0;
    lines.forEach(function (ln) {
      var q = Number(ln.quantity);
      if (q > 0) sum += Math.round((t * q) / sumStrips);
    });
    return sum;
  }

  /** Header selling total: DB value, else Σ(qty×strip), else allocate lot total across lines. */
  function resolveSellingTotalPaise(lot, lines) {
    var stored = numPaise(lot.total_price_paise);
    if (stored != null && stored > 0) return stored;
    var fromLines = sellingTotalPaiseFromLines(lines);
    if (fromLines > 0) return fromLines;
    var implied = impliedTotalFromAllocatedLot(lot, lines);
    if (implied > 0) return implied;
    return null;
  }

  function displayStripSellingPaise(ln, lot, sumStrips) {
    var sp = numPaise(ln.selling_price_paise);
    if (sp != null && sp >= 0) return sp;
    return impliedStripPaiseFromLotTotal(lot, ln, sumStrips);
  }

  function fmtDate(iso) {
    if (!iso || String(iso).length < 10) return "—";
    return String(iso).slice(0, 10);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function renderPage(lotId) {
    var lot = db.getLot(lotId);
    if (!lot) {
      window.location.href = "inventory.html?panel=lots";
      return;
    }
    var lines = db.getLotLines(lotId);

    $("#ld-title").text("Lot " + (lot.lot_number || "—"));
    $("#ld-sub").text(
      (lot.vendor_name ? "Supplier: " + lot.vendor_name : "No vendor") +
        (lines.length ? " · " + lines.length + " line(s)" : "")
    );

    $("#ld-btn-edit").removeClass("hide").attr("href", "lot-edit.html?id=" + lotId);

    $("#ld-vendor").text(lot.vendor_name || "—");
    $("#ld-lot-date").text(fmtDate(lot.lot_date));
    $("#ld-delivered-date").text(fmtDate(lot.delivered_date));
    $("#ld-delivered-by").text(lot.delivered_by && String(lot.delivered_by).trim() ? lot.delivered_by : "—");
    $("#ld-created").text(lot.created_at ? String(lot.created_at).slice(0, 19).replace("T", " ") : "—");

    var sumStrips = sumStripQty(lines);
    var sellingPaise = resolveSellingTotalPaise(lot, lines);
    $("#ld-total").text(fmtRsPaise(sellingPaise));
    $("#ld-margin").text(fmtRsPaise(lot.margin_paise));
    $("#ld-paid").text(fmtRsPaise(lot.total_paid_paise));

    var notes = lot.notes && String(lot.notes).trim();
    $("#ld-notes").text(notes || "—");

    var $tb = $("#ld-lines-body").empty();
    if (!lines.length) {
      $tb.append('<tr><td colspan="10" class="center grey-text">No lines.</td></tr>');
      return;
    }
    lines.forEach(function (ln) {
      var note = ln.line_notes && String(ln.line_notes).trim();
      var pack = ln.pack_label && String(ln.pack_label).trim();
      var productCell =
        "<strong>" +
        esc(ln.product_name || "—") +
        "</strong>" +
        (pack
          ? '<br><span class="inv-pack-teal" style="font-size:0.88rem;font-weight:500">' + esc(pack) + "</span>"
          : "");
      $tb.append(
        "<tr>" +
          "<td>" +
          productCell +
          "</td>" +
          "<td class=\"inv-mono\">" +
          esc(ln.product_code || "—") +
          "</td>" +
          '<td class="right-align">' +
          esc(String(ln.strips_per_pack != null ? ln.strips_per_pack : "—")) +
          "</td>" +
          '<td class="right-align">' +
          esc(String(ln.quantity)) +
          "</td>" +
          '<td class="right-align">' +
          esc(String(ln.available_count != null ? ln.available_count : ln.quantity)) +
          "</td>" +
          '<td class="right-align">' +
          esc(
            String(
              ln.available_tabs != null && ln.available_tabs !== ""
                ? ln.available_tabs
                : "—"
            )
          ) +
          "</td>" +
          "<td>" +
          esc(fmtDate(ln.delivered_on)) +
          "</td>" +
          '<td class="right-align">' +
          esc(fmtRsPaise(numPaise(ln.strip_mrp_paise))) +
          "</td>" +
          '<td class="right-align">' +
          esc(fmtRsPaise(displayStripSellingPaise(ln, lot, sumStrips))) +
          "</td>" +
          "<td>" +
          esc(note || "—") +
          "</td>" +
          "</tr>"
      );
    });
  }

  $(function () {
    margOpenDatabase()
      .then(function (api) {
        db = new MargDb(api);
        if (!db.getCurrentEntityId()) {
          window.location.href = "index.html";
          return;
        }
        var qs = new URLSearchParams(window.location.search);
        var id = Number(qs.get("id"));
        if (!id) {
          window.location.href = "inventory.html?panel=lots";
          return;
        }

        var ent = db.getEntityById(db.getCurrentEntityId());
        mountPharmaPulseShell({
          el: "#layout-root",
          activeSection: "lot-detail",
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
