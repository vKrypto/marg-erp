/**
 * Customer detail — profile, KPIs, full order history (docs/order.md §5).
 */
(function () {
  var db;
  var currentCustomerId = 0;

  function rupeesToPaise(v) {
    if (v === "" || v == null) return null;
    var n = parseFloat(String(v).replace(/,/g, ""));
    if (isNaN(n) || n <= 0) return null;
    return Math.round(n * 100);
  }

  function fmtRs(paise) {
    var n = Number(paise);
    if (isNaN(n)) return "₹0.00";
    return "₹" + (n / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  function methodLabel(m) {
    return m === "upi" ? "UPI" : "Cash";
  }

  function statusClass(st) {
    st = st || "draft";
    if (st === "confirmed") return "teal-text";
    if (st === "cancelled") return "grey-text";
    return "amber-text text-darken-2";
  }

  /**
   * Resolve page nodes after mountPharmaPulseShell. Prefer document.getElementById (unique ids),
   * then a node inside #layout-content-slot if the id is not in the main document yet.
   */
  function $cd(id) {
    var sid = String(id || "").replace(/^#/, "");
    if (!sid) return $();
    var el = document.getElementById(sid);
    if (!el) {
      var slot = document.getElementById("layout-content-slot");
      if (slot && slot.querySelector) el = slot.querySelector("#" + sid);
    }
    return $(el || []);
  }

  function setCdKpiMoneySpan(dataAttr, paise) {
    var el = document.querySelector("[data-cd-kpi=\"" + dataAttr + "\"]");
    if (el) el.textContent = fmtRs(paise);
  }

  /**
   * KPIs from getCustomerOrderSummary (single SQL: net orders excl. cancelled, payments, due).
   * JS fallback only if the DB helper is missing or throws.
   */
  function resolveCustomerKpis(customerId) {
    try {
      if (typeof db.getCustomerOrderSummary === "function") {
        var sum = db.getCustomerOrderSummary(customerId);
        if (sum != null && sum.netTotalPaise != null) {
          var net = Number(sum.netTotalPaise) || 0;
          var paid = Number(sum.totalPaidPaise) || 0;
          var due = Number(sum.totalDuePaise);
          if (isNaN(due)) due = net - paid;
          return {
            orderCount: Number(sum.orderCount) || 0,
            cancelledCount: Number(sum.cancelledCount) || 0,
            netTotalPaise: net,
            totalPaidPaise: paid,
            totalDuePaise: due,
            firstOrderDate: sum.firstOrderDate || null,
            lastOrderDate: sum.lastOrderDate || null,
          };
        }
      }
    } catch (e) {
      /* use fallback below */
    }

    var orders = db.listOrders({ customerId: customerId, includeLineCount: true });
    var orderCount = orders.length;
    var cancelledCount = 0;
    var netPaise = 0;
    var firstOrderDate = null;
    var lastOrderDate = null;
    orders.forEach(function (o) {
      if (o.status === "cancelled") {
        cancelledCount++;
        return;
      }
      netPaise += (Number(o.order_total_price_paise) || 0) - (Number(o.order_discount_paise) || 0);
      var d = o.order_date;
      if (d) {
        if (!firstOrderDate || String(d) < String(firstOrderDate)) firstOrderDate = d;
        if (!lastOrderDate || String(d) > String(lastOrderDate)) lastOrderDate = d;
      }
    });
    var explicitPaidPaise = 0;
    if (typeof db.listCustomerPayments === "function") {
      try {
        db.listCustomerPayments(customerId).forEach(function (p) {
          explicitPaidPaise += Number(p.amount_paise) || 0;
        });
      } catch (e2) {
        explicitPaidPaise = 0;
      }
    }
    return {
      orderCount: orderCount || 0,
      cancelledCount: cancelledCount || 0,
      netTotalPaise: netPaise || 0,
      totalPaidPaise: explicitPaidPaise,
      totalDuePaise: netPaise - explicitPaidPaise,
      firstOrderDate: firstOrderDate,
      lastOrderDate: lastOrderDate,
    };
  }

  function renderPage(customerId) {
    var c = db.getCustomer(customerId);
    if (!c) {
      window.location.href = "customers.html";
      return;
    }
    currentCustomerId = Number(customerId) || 0;

    $cd("cd-customer-name").text(c.name || "—");
    $cd("cd-customer-sub").text([c.phone, c.email].filter(Boolean).join(" · ") || "Customer profile");

    $cd("cd-btn-edit")
      .removeClass("hide")
      .attr("href", "customers.html?edit=" + customerId);

    $cd("cd-phone").text(c.phone || "—");
    $cd("cd-email").text(c.email || "—");
    $cd("cd-city").text(c.city || "—");
    $cd("cd-pincode").text(c.pincode || "—");
    var addr = [c.address_line1, c.address_line2].filter(function (x) {
      return x && String(x).trim();
    });
    $cd("cd-address").text(addr.length ? addr.join(", ") : "—");

    if (c.notes && String(c.notes).trim()) {
      $cd("cd-notes-wrap").show();
      $cd("cd-notes").text(String(c.notes).trim());
    } else {
      $cd("cd-notes-wrap").hide();
    }

    $cd("cd-kpi-since").text(fmtDate(c.created_at));

    var sum = resolveCustomerKpis(customerId);
    $cd("cd-kpi-orders").text(String(sum.orderCount));
    if (sum.cancelledCount > 0) {
      $cd("cd-kpi-cancelled-hint").text(sum.cancelledCount + " cancelled");
    } else {
      $cd("cd-kpi-cancelled-hint").text("");
    }
    $cd("cd-kpi-spend").text(fmtRs(sum.netTotalPaise));
    var paid = sum.totalPaidPaise;
    var due = sum.totalDuePaise;
    setCdKpiMoneySpan("paid", paid);

    var dueSpan = document.querySelector("[data-cd-kpi=\"due\"]");
    var dueHintEl = document.getElementById("cd-kpi-due-hint");
    if (dueSpan) {
      dueSpan.classList.remove("amber-text", "text-darken-3", "teal-text", "red-text");
      if (due > 0) {
        dueSpan.textContent = fmtRs(due);
        dueSpan.classList.add("amber-text", "text-darken-3");
        if (dueHintEl) dueHintEl.textContent = "Outstanding";
      } else if (due < 0) {
        dueSpan.textContent = fmtRs(-due);
        dueSpan.classList.add("teal-text");
        if (dueHintEl) dueHintEl.textContent = "Credit balance";
      } else {
        dueSpan.textContent = fmtRs(0);
        dueSpan.classList.add("teal-text");
        if (dueHintEl) dueHintEl.textContent = "Settled";
      }
    }

    $cd("cd-kpi-first").text(sum.firstOrderDate ? fmtDate(sum.firstOrderDate) : "—");
    $cd("cd-kpi-last").text(sum.lastOrderDate ? fmtDate(sum.lastOrderDate) : "—");

    var $payBody = $cd("cd-payments-body").empty();
    var payments =
      typeof db.listCustomerPayments === "function" ? db.listCustomerPayments(customerId) : [];
    if (payments.length) {
      $cd("cd-payments-empty").hide();
      payments.forEach(function (pay) {
        var note = pay.notes && String(pay.notes).trim();
        $payBody.append(
          "<tr>" +
            "<td>" +
            esc(fmtDate(pay.created_at)) +
            "</td>" +
            "<td>" +
            esc(methodLabel(pay.method)) +
            "</td>" +
            '<td class="right-align">' +
            fmtRs(pay.amount_paise) +
            "</td>" +
            "<td>" +
            esc(note || "—") +
            "</td>" +
            "</tr>"
        );
      });
    } else {
      $cd("cd-payments-empty").show();
    }

    $cd("cd-new-order-link").attr("href", "orders.html?customerId=" + customerId);
    $cd("cd-new-rx-link").attr("href", "prescription-edit.html?customerId=" + customerId);

    var $tl = $cd("cd-rx-timeline").empty();
    var $tlEmpty = $cd("cd-rx-timeline-empty");
    if (typeof db.getCustomerPrescriptionTimeline === "function") {
      var groups = db.getCustomerPrescriptionTimeline(customerId);
      if (groups.length) {
        $tlEmpty.hide();
        groups.forEach(function (g) {
          var tMain =
            g.at && String(g.at).length >= 16
              ? String(g.at).slice(0, 16).replace("T", " ")
              : esc(g.at);
          var hasLines = g.lineEvents && g.lineEvents.length > 0;
          var subId = "cd-rx-sub-" + g.prescription_id;
          var foldId = "cd-rx-fold-" + g.prescription_id;
          var nestedHtml = "";
          if (hasLines) {
            g.lineEvents.forEach(function (le) {
              var tl =
                le.at && String(le.at).length >= 16
                  ? String(le.at).slice(0, 16).replace("T", " ")
                  : esc(le.at);
              nestedHtml +=
                '<li class="inv-cd-timeline-nested-item">' +
                "<time>" +
                esc(tl) +
                "</time>" +
                '<a class="inv-cd-timeline-title-link" href="' +
                esc(le.href) +
                '">' +
                esc(le.title) +
                "</a>" +
                '<p class="inv-cd-timeline-detail">' +
                esc(le.detail) +
                "</p>" +
                "</li>";
            });
          }
          var orderHref =
            "orders.html?customerId=" +
            encodeURIComponent(String(customerId)) +
            "&prescriptionId=" +
            encodeURIComponent(String(g.prescription_id));
          var foldBtn =
            hasLines ?
              '<button type="button" class="inv-cd-timeline-fold" aria-expanded="true" aria-controls="' +
              esc(subId) +
              '" aria-label="Show or hide prescription lines" id="' +
              esc(foldId) +
              '">' +
              '<i class="material-icons inv-cd-timeline-fold-icon" aria-hidden="true">expand_less</i>' +
              "</button>"
            : '<span class="inv-cd-timeline-fold-spacer" aria-hidden="true"></span>';
          var nestedBlock =
            hasLines ?
              '<ul class="inv-cd-timeline-nested inv-cd-timeline-nested--open" id="' +
              esc(subId) +
              '">' +
              nestedHtml +
              "</ul>"
            : "";
          $tl.append(
            '<li class="inv-cd-timeline-rx">' +
              '<div class="inv-cd-timeline-rx-head">' +
              foldBtn +
              '<div class="inv-cd-timeline-rx-main">' +
              "<time>" +
              esc(tMain) +
              "</time>" +
              '<a class="inv-cd-timeline-title-link inv-cd-timeline-title-link--primary" href="' +
              esc(g.href) +
              '">' +
              esc(g.title) +
              "</a>" +
              '<p class="inv-cd-timeline-detail">' +
              esc(g.detail) +
              "</p>" +
              '<a class="btn inv-btn-outline waves-effect inv-cd-btn-add-order" href="' +
              esc(orderHref) +
              '">' +
              '<i class="material-icons left">add_shopping_cart</i>Add order' +
              "</a>" +
              "</div>" +
              "</div>" +
              nestedBlock +
              "</li>"
          );
        });
        $cd("cd-rx-timeline")
          .off("click.rxFold")
          .on("click.rxFold", ".inv-cd-timeline-fold", function () {
            var $btn = $(this);
            var sid = $btn.attr("aria-controls");
            var $nested = sid ? $("#" + sid) : $();
            var open = $btn.attr("aria-expanded") === "true";
            if (open) {
              $nested.removeClass("inv-cd-timeline-nested--open").addClass("inv-cd-timeline-nested--collapsed");
              $btn.attr("aria-expanded", "false");
              $btn.find(".inv-cd-timeline-fold-icon").text("expand_more");
            } else {
              $nested.removeClass("inv-cd-timeline-nested--collapsed").addClass("inv-cd-timeline-nested--open");
              $btn.attr("aria-expanded", "true");
              $btn.find(".inv-cd-timeline-fold-icon").text("expand_less");
            }
          });
      } else {
        $tlEmpty.show();
      }
    } else {
      $tlEmpty.text("Timeline unavailable.").show();
    }

    var orders = db.listOrders({ customerId: customerId, includeLineCount: true });
    var $tb = $cd("cd-orders-body").empty();
    orders.forEach(function (o) {
      var st = o.status || "draft";
      var net =
        (Number(o.order_total_price_paise) || 0) - (Number(o.order_discount_paise) || 0);
      var lines = o.line_count != null ? String(o.line_count) : "—";
      $tb.append(
        "<tr>" +
          "<td>" +
          esc(o.order_date || "") +
          "</td>" +
          "<td class=\"inv-mono\">" +
          esc(o.order_number || "—") +
          "</td>" +
          "<td><span class=\"" +
          statusClass(st) +
          '">' +
          esc(st) +
          "</span></td>" +
          '<td class="right-align">' +
          fmtRs(net) +
          "</td>" +
          '<td class="right-align">' +
          esc(lines) +
          "</td>" +
          '<td class="inv-actions-cell">' +
          '<a class="inv-icon-btn" href="orders.html?id=' +
          o.id +
          '" title="Open order"><i class="material-icons">open_in_new</i></a>' +
          "</td>" +
          "</tr>"
      );
    });
    if (!orders.length) {
      $tb.append(
        '<tr><td colspan="6" class="center grey-text" style="padding:2rem">No orders yet for this customer.</td></tr>'
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
          window.location.href = "customers.html";
          return;
        }

        var ent = db.getEntityById(db.getCurrentEntityId());
        mountPharmaPulseShell({
          el: "#layout-root",
          activeSection: "customer-detail",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        /**
         * Materialize modals inside nested shell layout (#layout-content-slot / flex) often fail to open or stay invisible.
         * Move the payment modal to body and use M.Modal (Materialize v1) so open/close always work.
         */
        var paymentModalEl = document.getElementById("modal-customer-payment");
        if (paymentModalEl && paymentModalEl.parentElement !== document.body) {
          document.body.appendChild(paymentModalEl);
        }
        if (paymentModalEl && typeof M !== "undefined" && M.Modal) {
          var existingPayModal = M.Modal.getInstance(paymentModalEl);
          if (existingPayModal) {
            existingPayModal.destroy();
          }
          M.Modal.init(paymentModalEl, { dismissible: true });
        }

        function openCustomerPaymentModal() {
          var el = document.getElementById("modal-customer-payment");
          if (!el) {
            M.toast({ html: "Payment form not found — refresh the page." });
            return;
          }
          $("#cp-amount").val("");
          $("#cp-notes").val("");
          $("input[name=cp-method][value=cash]").prop("checked", true);
          try {
            if (typeof M !== "undefined" && M.updateTextFields) {
              M.updateTextFields();
            }
            if ($("#cp-notes").length && M.textareaAutoResize) {
              M.textareaAutoResize($("#cp-notes"));
            }
          } catch (e) {
            /* ignore */
          }
          /*
           * Open on the next turn: the same click that opened the modal can otherwise
           * hit Materialize's new overlay and dismiss immediately (modal "flashes" / page feels broken).
           */
          setTimeout(function () {
            if (typeof M !== "undefined" && M.Modal) {
              var inst = M.Modal.getInstance(el);
              if (!inst) {
                inst = M.Modal.init(el, { dismissible: true });
              }
              inst.open();
            } else if ($.fn.modal) {
              $(el).modal();
              $(el).modal("open");
            }
          }, 50);
        }

        function closePaymentModal() {
          var el = document.getElementById("modal-customer-payment");
          if (!el) return;
          if (typeof M !== "undefined" && M.Modal) {
            var mi = M.Modal.getInstance(el);
            if (mi) mi.close();
          } else if ($.fn.modal) {
            $(el).modal("close");
          }
        }

        $(document).on("click", "#cd-btn-add-payment", function (e) {
          e.preventDefault();
          e.stopPropagation();
          openCustomerPaymentModal();
        });
        $("#cp-submit").on("click", function () {
          var paise = rupeesToPaise($("#cp-amount").val());
          if (paise == null) {
            M.toast({ html: "Enter a valid amount greater than zero." });
            return;
          }
          var method = $("input[name=cp-method]:checked").val() || "cash";
          if (typeof db.insertCustomerPayment !== "function") {
            M.toast({ html: "Payments are not available — refresh after update." });
            return;
          }
          db
            .insertCustomerPayment({
              customer_id: currentCustomerId,
              amount_paise: paise,
              method: method === "upi" ? "upi" : "cash",
              notes: $("#cp-notes").val(),
            })
            .then(function () {
              closePaymentModal();
              M.toast({ html: "Payment recorded." });
              renderPage(currentCustomerId);
            })
            .catch(function (err) {
              M.toast({ html: err && err.message ? err.message : String(err) });
            });
        });

        renderPage(id);
      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
