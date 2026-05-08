/**
 * Dashboard (app.html) — search, KPI chips, sales chart, low stock, recent prescriptions & purchases.
 */
(function () {
  var db;

  function fmtRs(paise) {
    var n = Number(paise);
    if (isNaN(n)) return "₹0.00";
    return "₹" + (n / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDateShort(iso) {
    if (!iso || String(iso).length < 10) return "—";
    return String(iso).slice(0, 10);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  /** Short rupees for Y-axis (whole rupees). */
  function fmtRsAxis(paise) {
    var r = (Number(paise) || 0) / 100;
    if (r >= 10000000) return "₹" + (r / 10000000).toFixed(1) + "Cr";
    if (r >= 100000) return "₹" + (r / 100000).toFixed(1) + "L";
    if (r >= 1000) return "₹" + (r / 1000).toFixed(1) + "k";
    return "₹" + Math.round(r);
  }

  function renderMetrics(sum) {
    $("#metric-receipts-today").text(sum.ordersTodayCount + " orders · " + fmtRs(sum.salesTodayPaise));
    $("#metric-sales-month").text(fmtRs(sum.salesMonthPaise));
    $("#metric-revenue-all").text(fmtRs(sum.revenueAllTimePaise));
    $("#metric-customers-new").text(String(sum.customersThisMonth));
    $("#metric-customers-total").text(String(sum.customersTotal));
    $("#metric-products").text(String(sum.productsActive));
    $("#metric-inventory").text(fmtRs(sum.inventoryValuePaise));
  }

  function renderSalesChart(series) {
    var $wrap = $("#dashboard-sales-chart-bars").empty();
    if (!series || !series.length) {
      $wrap.append('<p class="grey-text">No sales data yet.</p>');
      return;
    }
    var max = 0;
    var i;
    for (i = 0; i < series.length; i++) {
      if (series[i].net_paise > max) max = series[i].net_paise;
    }
    if (max <= 0) max = 1;

    var W = 1000;
    var H = 168;
    var padL = 52;
    var padR = 12;
    var padT = 10;
    var padB = 34;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;
    var n = series.length;

    function xAt(idx) {
      if (n <= 1) return padL + plotW / 2;
      return padL + (idx / (n - 1)) * plotW;
    }
    function yAt(valPaise) {
      return padT + plotH - (valPaise / max) * plotH;
    }

    var ptStr = [];
    var gridSvg = "";
    var fracs = [0, 0.25, 0.5, 0.75, 1];
    for (var g = 0; g < fracs.length; g++) {
      var frac = fracs[g];
      var yy = padT + plotH - frac * plotH;
      var valPaise = Math.round(max * frac);
      gridSvg +=
        '<line class="inv-dash-chart-grid-line" x1="' +
        padL +
        '" y1="' +
        yy +
        '" x2="' +
        (padL + plotW) +
        '" y2="' +
        yy +
        '" />';
      gridSvg +=
        '<text class="inv-dash-chart-y-label" x="' +
        (padL - 8) +
        '" y="' +
        (yy + 4) +
        '" text-anchor="end">' +
        esc(fmtRsAxis(valPaise)) +
        "</text>";
    }

    var xLabelsSvg = "";
    for (i = 0; i < n; i++) {
      if (i % 5 === 0 || i === n - 1) {
        var xi = xAt(i);
        xLabelsSvg +=
          '<text class="inv-dash-chart-x-label" x="' +
          xi +
          '" y="' +
          (H - 8) +
          '" text-anchor="middle">' +
          esc(series[i].date.slice(8, 10)) +
          "</text>";
      }
    }

    var dotsSvg = "";
    for (i = 0; i < n; i++) {
      var pt = series[i];
      var cx = xAt(i);
      var cy = yAt(pt.net_paise);
      var tip = pt.date + ": " + fmtRs(pt.net_paise);
      ptStr.push(cx.toFixed(2) + "," + cy.toFixed(2));
      dotsSvg +=
        '<circle class="inv-dash-chart-dot" cx="' +
        cx +
        '" cy="' +
        cy +
        '" r="3.5" tabindex="0">' +
        "<title>" +
        esc(tip) +
        "</title></circle>";
    }
    var polyPoints = ptStr.join(" ");

    var svg =
      '<div class="inv-dash-chart-line-wrap">' +
      '<svg class="inv-dash-chart-svg" viewBox="0 0 ' +
      W +
      " " +
      H +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Sales line chart">' +
      '<rect class="inv-dash-chart-plot-bg" x="' +
      padL +
      '" y="' +
      padT +
      '" width="' +
      plotW +
      '" height="' +
      plotH +
      '" rx="4" />' +
      gridSvg +
      '<polyline class="inv-dash-chart-line" fill="none" stroke="#00897b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="' +
      polyPoints +
      '" />' +
      '<g class="inv-dash-chart-dots">' +
      dotsSvg +
      "</g>" +
      xLabelsSvg +
      "</svg></div>";

    $wrap.append(svg);
    $("#dashboard-sales-chart-caption").text(
      "Last 30 days — " + series[0].date + " to " + series[series.length - 1].date
    );
  }

  function renderLowStock(rows) {
    var $tb = $("#dashboard-low-stock-body").empty();
    if (!rows || !rows.length) {
      $tb.append(
        '<tr><td colspan="4" class="grey-text center-align" style="padding:1rem">No low or out-of-stock items (threshold ≤ 20 units).</td></tr>'
      );
      return;
    }
    rows.forEach(function (r) {
      var st = Number(r.stock_on_hand) || 0;
      var badge =
        st === 0
          ? '<span class="inv-badge inv-badge-inactive">Out</span>'
          : '<span class="inv-badge inv-badge-low">Low</span>';
      $tb.append(
        "<tr>" +
          "<td>" +
          esc(r.name) +
          "</td>" +
          "<td class=\"inv-mono\">" +
          esc(r.code || "—") +
          "</td>" +
          "<td>" +
          esc(r.pack_label || "—") +
          "</td>" +
          "<td>" +
          badge +
          " " +
          st +
          "</td>" +
          "</tr>"
      );
    });
  }

  function renderRecentPrescriptions(rows) {
    var $tb = $("#dashboard-rx-body").empty();
    if (!rows || !rows.length) {
      $tb.append(
        '<tr><td colspan="5" class="grey-text center-align" style="padding:1rem">No prescriptions yet.</td></tr>'
      );
      return;
    }
    rows.forEach(function (r) {
      var doc = r.doctor_name && String(r.doctor_name).trim() ? esc(r.doctor_name) : "—";
      $tb.append(
        "<tr>" +
          "<td>" +
          esc(r.customer_name || "—") +
          "</td>" +
          "<td>" +
          doc +
          "</td>" +
          "<td>" +
          esc(fmtDateShort(r.created_at)) +
          "</td>" +
          '<td class="right-align">' +
          esc(String(r.line_count != null ? r.line_count : "—")) +
          "</td>" +
          '<td class="inv-actions-cell">' +
          '<a class="inv-icon-btn" href="prescription-detail.html?id=' +
          r.id +
          '" title="Open prescription"><i class="material-icons">open_in_new</i></a>' +
          "</td>" +
          "</tr>"
      );
    });
  }

  function renderRecentLots(rows) {
    var $tb = $("#dashboard-lots-body").empty();
    if (!rows || !rows.length) {
      $tb.append(
        '<tr><td colspan="5" class="grey-text center-align" style="padding:1rem">No purchase lots yet. Add inventory lots.</td></tr>'
      );
      return;
    }
    rows.forEach(function (r) {
      var tp = r.total_price_paise != null ? fmtRs(r.total_price_paise) : "—";
      $tb.append(
        "<tr>" +
          "<td>" +
          esc(r.lot_number || "—") +
          "</td>" +
          "<td>" +
          esc(r.vendor_name || "—") +
          "</td>" +
          "<td>" +
          esc(fmtDateShort(r.delivered_date || r.lot_date)) +
          "</td>" +
          "<td class=\"right-align\">" +
          tp +
          "</td>" +
          "<td>" +
          esc(fmtDateShort(r.created_at)) +
          "</td>" +
          "</tr>"
      );
    });
  }

  function refreshDashboard() {
    if (!db) return;
    try {
      renderMetrics(db.getDashboardSummary());
      renderSalesChart(db.getSalesByDayLast30Days());
      renderLowStock(db.getLowStockProducts(10, 20));
      renderRecentPrescriptions(db.listRecentPrescriptions(10));
      renderRecentLots(db.listRecentLots(10));
    } catch (e) {
      console.error(e);
    }
  }

  $(function () {
    if (typeof margOpenDatabase !== "function" || typeof mountPharmaPulseShell !== "function") {
      console.error("Missing margOpenDatabase or mountPharmaPulseShell");
      return;
    }
    margOpenDatabase()
      .then(function (api) {
        db = new MargDb(api);
        var eid = db.getCurrentEntityId();
        if (eid == null) {
          window.location.href = "index.html";
          return null;
        }
        return db.persistInvoiceFormatIfMigrated ? db.persistInvoiceFormatIfMigrated() : Promise.resolve();
      })
      .then(function () {
        if (!db || !db.getCurrentEntityId()) return;
        var ent = db.getEntityById(db.getCurrentEntityId());
        var name = ent ? ent.entity_name : "Unknown entity";
        mountPharmaPulseShell({
          el: "#layout-root",
          activeSection: "dashboard",
          entityName: name,
          db: db,
        });
        $("#dashboard-entity-name").text(name);
        refreshDashboard();

        $("#dashboard-refresh").on("click", function () {
          refreshDashboard();
          M.toast({ html: "Dashboard refreshed." });
        });
      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
