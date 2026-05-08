/**
 * Global search (shell) — products, customers, prescriptions; opens from header in a full-screen overlay.
 */
(function () {
  var searchTimer = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function isOverlayOpen() {
    return $("#global-search-overlay").hasClass("inv-global-search-overlay--open");
  }

  function setOverlayOpen(open) {
    var $ov = $("#global-search-overlay");
    if (!$ov.length) return;
    open = !!open;
    $ov.toggleClass("inv-global-search-overlay--open", open);
    $ov.attr("aria-hidden", open ? "false" : "true");
    if (open) {
      $ov.removeAttr("hidden");
      $("body").addClass("inv-global-search-open");
    } else {
      $ov.attr("hidden", "hidden");
      $("body").removeClass("inv-global-search-open");
      $("#global-search-dd").empty().hide();
    }
    if (open) {
      setTimeout(function () {
        var $in = $("#global-search");
        if ($in.length) {
          $in.trigger("focus");
        }
        if (typeof M !== "undefined" && M.updateTextFields) {
          M.updateTextFields();
        }
      }, 50);
    }
  }

  function runSearch(db, q) {
    q = String(q || "").trim();
    var $dd = $("#global-search-dd");
    if (!q) {
      $dd.empty().hide();
      return;
    }
    var products = [];
    var customers = [];
    var rx = [];
    try {
      products = db.listProducts(q, "active").slice(0, 8);
      customers = db.listCustomers(q).slice(0, 8);
      if (typeof db.searchPrescriptionsForDashboard === "function") {
        rx = db.searchPrescriptionsForDashboard(q, 8);
      }
    } catch (e) {
      console.error(e);
    }
    if (!products.length && !customers.length && !rx.length) {
      $dd.html('<div class="inv-dash-search-empty">No matches</div>').show();
      return;
    }
    var html = "";
    products.forEach(function (p) {
      html +=
        '<a class="inv-dash-search-item" href="inventory.html?panel=products&q=' +
        encodeURIComponent(q) +
        '">' +
        '<i class="material-icons tiny">medication</i>' +
        "<span>" +
        esc(p.name) +
        (p.code ? ' <span class="inv-mono">' + esc(p.code) + "</span>" : "") +
        "</span></a>";
    });
    customers.forEach(function (c) {
      html +=
        '<a class="inv-dash-search-item" href="customers.html?q=' + encodeURIComponent(q) + '">' +
        '<i class="material-icons tiny">person</i>' +
        "<span>" +
        esc(c.name) +
        (c.phone ? " · " + esc(c.phone) : "") +
        "</span></a>";
    });
    rx.forEach(function (r) {
      var doc = [r.doctor_name, r.customer_name].filter(Boolean).join(" · ") || "Prescription";
      html +=
        '<a class="inv-dash-search-item" href="prescription-detail.html?id=' +
        encodeURIComponent(r.id) +
        '">' +
        '<i class="material-icons tiny">medical_services</i>' +
        "<span>" +
        esc(doc) +
        "</span></a>";
    });
    $dd.html(html).show();
  }

  function initGlobalSearch(db) {
    if (!db || !$("#global-search").length) return;

    $(document)
      .off("click.globalSearchOpen")
      .on("click.globalSearchOpen", ".js-global-search-open", function (e) {
        e.preventDefault();
        setOverlayOpen(true);
      });

    $(".inv-global-search-overlay-close")
      .off("click.globalSearch")
      .on("click.globalSearch", function (e) {
        e.preventDefault();
        setOverlayOpen(false);
      });

    $("#global-search")
      .off(".globalSearch")
      .on("input.globalSearch", function () {
        var v = $(this).val();
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          runSearch(db, v);
        }, 250);
      })
      .on("focus.globalSearch", function () {
        if ($(this).val()) runSearch(db, $(this).val());
      });

    $(document)
      .off("click.globalSearch")
      .on("click.globalSearch", function (e) {
        if (!isOverlayOpen()) return;
        if ($(e.target).closest(".inv-global-search-field").length) return;
        $("#global-search-dd").hide();
      });

    $(document)
      .off("keydown.globalSearchOverlay")
      .on("keydown.globalSearchOverlay", function (e) {
        if (e.key !== "Escape") return;
        if (!isOverlayOpen()) return;
        e.preventDefault();
        e.stopPropagation();
        setOverlayOpen(false);
      });

    if (typeof M !== "undefined" && M.updateTextFields) {
      M.updateTextFields();
    }
  }

  window.margGlobalSearchInit = initGlobalSearch;
})();
