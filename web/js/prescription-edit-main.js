/**
 * Prescription add/edit page — docs/prescription.md
 * Patient: searchable customer combo + quick add (same pattern as orders).
 */
(function () {
  var db;
  var customersCache = [];
  var doctorsCache = [];

  var STATUS_OPTS = ["draft", "active", "completed", "cancelled"];

  function customerLabelFromRow(c) {
    if (!c) return "";
    var lab = c.name || "";
    if (c.phone) lab += " · " + c.phone;
    return lab;
  }

  function customerMatchesSearch(c, qq) {
    if (!qq) return true;
    var q = qq.toLowerCase();
    if (customerLabelFromRow(c).toLowerCase().indexOf(q) >= 0) return true;
    if ((c.name || "").toLowerCase().indexOf(q) >= 0) return true;
    if ((c.phone || "").replace(/\s/g, "").toLowerCase().indexOf(q.replace(/\s/g, "")) >= 0) return true;
    if ((c.city || "").toLowerCase().indexOf(q) >= 0) return true;
    if ((c.email || "").toLowerCase().indexOf(q) >= 0) return true;
    return false;
  }

  function fillRxCustomerDropdown($ul, q) {
    $ul.empty();
    var qq = (q || "").toLowerCase().trim();
    var n = 0;
    for (var i = 0; i < customersCache.length; i++) {
      var c = customersCache[i];
      if (!customerMatchesSearch(c, qq)) continue;
      $ul.append(
        $("<li></li>")
          .addClass("oc-customer-li")
          .attr("data-id", c.id)
          .text(customerLabelFromRow(c))
      );
      if (++n >= 80) break;
    }
    if (!n) {
      $ul.append(
        $("<li></li>").addClass("oc-customer-li oc-customer-li--empty").text("No matches")
      );
      $ul.append(
        $("<li></li>")
          .addClass("oc-customer-li oc-customer-li--add teal-text text-darken-1")
          .text("Add new patient…")
      );
    }
  }

  function closeRxCustomerDd() {
    $("#rx-customer-dd").addClass("hide").attr("aria-hidden", "true");
  }

  function refreshCustomerCache() {
    customersCache = db.listCustomers("");
  }

  /**
   * @param {number|string|null} selectedId
   */
  function refreshRxCustomerSelect(selectedId) {
    refreshCustomerCache();
    var sid =
      selectedId != null && selectedId !== "" ? Number(selectedId) : null;
    $("#rx-customer-id").val(sid ? String(sid) : "");
    if (sid) {
      var c = db.getCustomer(Number(sid));
      $("#rx-customer-search").val(c ? customerLabelFromRow(c) : "");
    } else {
      $("#rx-customer-search").val("");
    }
    closeRxCustomerDd();
  }

  function doctorLabelFromRow(d) {
    if (!d) return "";
    var lab = d.name || "";
    if (d.phone) lab += " · " + d.phone;
    return lab;
  }

  function doctorMatchesSearch(d, qq) {
    if (!qq) return true;
    var q = qq.toLowerCase();
    if (doctorLabelFromRow(d).toLowerCase().indexOf(q) >= 0) return true;
    if ((d.name || "").toLowerCase().indexOf(q) >= 0) return true;
    if ((d.phone || "").replace(/\s/g, "").toLowerCase().indexOf(q.replace(/\s/g, "")) >= 0)
      return true;
    return false;
  }

  function fillRxDoctorDropdown($ul, q) {
    $ul.empty();
    var qq = (q || "").toLowerCase().trim();
    var n = 0;
    for (var i = 0; i < doctorsCache.length; i++) {
      var d = doctorsCache[i];
      if (!doctorMatchesSearch(d, qq)) continue;
      $ul.append(
        $("<li></li>")
          .addClass("oc-customer-li")
          .attr("data-id", d.id)
          .text(doctorLabelFromRow(d))
      );
      if (++n >= 80) break;
    }
    if (!n) {
      $ul.append(
        $("<li></li>").addClass("oc-customer-li oc-customer-li--empty").text("No matches")
      );
      $ul.append(
        $("<li></li>")
          .addClass("oc-customer-li oc-customer-li--add teal-text text-darken-1")
          .text("Add new doctor…")
      );
    }
  }

  function closeRxDoctorDd() {
    $("#rx-doctor-dd").addClass("hide").attr("aria-hidden", "true");
  }

  function refreshDoctorCache() {
    try {
      doctorsCache = db.listDoctors("");
    } catch (err) {
      doctorsCache = [];
      if (typeof console !== "undefined" && console.warn) {
        console.warn("listDoctors failed", err);
      }
    }
  }

  /**
   * @param {number|string|null} selectedId
   */
  function refreshRxDoctorSelect(selectedId) {
    refreshDoctorCache();
    var sid =
      selectedId != null && selectedId !== "" ? Number(selectedId) : null;
    $("#rx-doctor-id").val(sid ? String(sid) : "");
    if (sid) {
      var d = db.getDoctor(Number(sid));
      $("#rx-doctor-search").val(d ? doctorLabelFromRow(d) : "");
    } else {
      $("#rx-doctor-search").val("");
    }
    closeRxDoctorDd();
  }

  /**
   * Prescriptions saved before doctor_id existed may only have denormalized name/phone.
   * @param {{ doctor_id?: *, doctor_name?: *, doctor_phone?: * }} h
   */
  function applyDoctorFieldsFromHeader(h) {
    if (!h) {
      refreshRxDoctorSelect(null);
      return;
    }
    if (h.doctor_id != null && h.doctor_id !== "") {
      refreshRxDoctorSelect(Number(h.doctor_id));
      return;
    }
    var dn = (h.doctor_name || "").trim();
    if (!dn) {
      refreshRxDoctorSelect(null);
      return;
    }
    refreshDoctorCache();
    var ph = (h.doctor_phone || "").trim().replace(/\s/g, "");
    var found = null;
    for (var i = 0; i < doctorsCache.length; i++) {
      var d = doctorsCache[i];
      if (String(d.name || "").trim().toLowerCase() !== dn.toLowerCase()) continue;
      var dph = String(d.phone || "").replace(/\s/g, "");
      if (!ph || dph === ph) {
        found = d;
        break;
      }
    }
    if (found) {
      refreshRxDoctorSelect(found.id);
    } else {
      $("#rx-doctor-id").val("");
      $("#rx-doctor-search").val(
        dn +
          (h.doctor_phone && String(h.doctor_phone).trim()
            ? " · " + String(h.doctor_phone).trim()
            : "")
      );
    }
  }

  function openRxQuickDoctorModal(prefillName) {
    $("#rxfd-name").val((prefillName || "").trim());
    $("#rxfd-phone").val("");
    if (typeof M !== "undefined") {
      M.updateTextFields();
    }
    $("#modal-rx-doctor").modal("open");
  }

  function openRxQuickCustomerModal(prefillName) {
    $("#rxf-name").val((prefillName || "").trim());
    $("#rxf-phone").val("");
    if (typeof M !== "undefined") {
      M.updateTextFields();
    }
    $("#modal-rx-customer").modal("open");
  }

  function lineRowHtml(idx) {
    var opt = STATUS_OPTS.map(function (s) {
      return '<option value="' + s + '">' + s + "</option>";
    }).join("");
    return (
      '<div class="inv-rx-line-card" data-line-index="' +
      idx +
      '">' +
      '<div class="inv-rx-line-head">' +
      '<span class="inv-rx-line-title">Line ' +
      (idx + 1) +
      "</span>" +
      '<button type="button" class="btn-flat waves-effect rx-remove-line grey-text" title="Remove line">' +
      '<i class="material-icons">close</i>' +
      "</button>" +
      "</div>" +
      '<div class="row" style="margin-bottom:0">' +
      '<div class="input-field col s12 m4">' +
      '<select class="browser-default rx-line-status">' +
      opt +
      "</select>" +
      '<label class="active">Status</label>' +
      "</div>" +
      '<div class="input-field col s12 m8">' +
      '<input type="text" class="rx-line-type" placeholder="e.g. medication, lab" />' +
      '<label class="active">Type</label>' +
      "</div>" +
      '<div class="input-field col s12">' +
      '<textarea class="materialize-textarea rx-line-notes"></textarea>' +
      "<label>Notes (patient-facing)</label>" +
      "</div>" +
      '<div class="input-field col s12">' +
      '<textarea class="materialize-textarea rx-line-secret"></textarea>' +
      "<label>Secret notes (internal only)</label>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function addLineRow(ln) {
    ln = ln || {};
    var $c = $("#rx-lines-container");
    var idx = $c.find(".inv-rx-line-card").length;
    $c.append(lineRowHtml(idx));
    var $last = $c.find(".inv-rx-line-card:last");
    $last.find(".rx-line-status").val((ln.prescription_status || "draft").trim());
    $last.find(".rx-line-type").val(ln.prescription_type || "");
    $last.find(".rx-line-notes").val(ln.prescription_notes || "");
    $last.find(".rx-line-secret").val(ln.secret_notes || "");
    M.updateTextFields();
    $last.find("textarea").each(function () {
      M.textareaAutoResize($(this));
    });
  }

  function collectLines() {
    var lines = [];
    $("#rx-lines-container .inv-rx-line-card").each(function () {
      var $row = $(this);
      lines.push({
        prescription_status: $row.find(".rx-line-status").val() || "draft",
        prescription_type: $row.find(".rx-line-type").val(),
        prescription_notes: $row.find(".rx-line-notes").val(),
        secret_notes: $row.find(".rx-line-secret").val(),
      });
    });
    return lines;
  }

  function loadForm(id) {
    $("#rx-lines-container").empty();
    refreshCustomerCache();
    refreshDoctorCache();

    if (id) {
      $("#rx-edit-title").text("Edit prescription");
      $("#rx-link-view-detail")
        .removeClass("hide")
        .attr("href", "prescription-detail.html?id=" + id);
      var pack = db.getPrescription(Number(id));
      if (!pack) {
        M.toast({ html: "Prescription not found." });
        window.location.href = "prescriptions.html";
        return;
      }
      $("#rx-id").val(String(id));
      var h = pack.header;
      refreshRxCustomerSelect(h.customer_id);
      applyDoctorFieldsFromHeader(h);
      if (pack.lines.length) {
        pack.lines.forEach(function (ln) {
          addLineRow(ln);
        });
      } else {
        addLineRow();
      }
    } else {
      $("#rx-edit-title").text("Add prescription");
      $("#rx-link-view-detail").addClass("hide").attr("href", "#");
      $("#rx-id").val("");
      var qs = new URLSearchParams(window.location.search);
      var preCust = qs.get("customerId");
      refreshRxCustomerSelect(preCust || null);
      refreshRxDoctorSelect(null);
      addLineRow();
    }
    M.updateTextFields();
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

        $(".modal").modal();

        $("#btn-rx-add-line").on("click", function () {
          addLineRow();
        });
        $("#rx-lines-container").on("click", ".rx-remove-line", function () {
          var $c = $("#rx-lines-container");
          if ($c.find(".inv-rx-line-card").length <= 1) {
            M.toast({ html: "Keep at least one line (or leave fields empty)." });
            return;
          }
          $(this).closest(".inv-rx-line-card").remove();
          $c.find(".inv-rx-line-card").each(function (i) {
            $(this).find(".inv-rx-line-title").text("Line " + (i + 1));
          });
        });

        $(document).on("click", function (e) {
          if (!$(e.target).closest("#rx-customer-wrap").length) {
            closeRxCustomerDd();
          }
          if (!$(e.target).closest("#rx-doctor-wrap").length) {
            closeRxDoctorDd();
          }
        });

        $("#rx-customer-search").on("focus", function () {
          var $dd = $("#rx-customer-dd");
          fillRxCustomerDropdown($dd, $(this).val());
          $dd.removeClass("hide").attr("aria-hidden", "false");
        });

        $("#rx-customer-search").on("input", function () {
          $("#rx-customer-id").val("");
          var $dd = $("#rx-customer-dd");
          fillRxCustomerDropdown($dd, $(this).val());
          $dd.removeClass("hide").attr("aria-hidden", "false");
        });

        $("#rx-customer-dd").on("mousedown", ".oc-customer-li[data-id]", function (e) {
          e.preventDefault();
          var id = $(this).attr("data-id");
          var lab = $(this).text();
          $("#rx-customer-id").val(id || "");
          $("#rx-customer-search").val(lab);
          closeRxCustomerDd();
        });

        $("#rx-customer-dd").on("mousedown", ".oc-customer-li--add", function (e) {
          e.preventDefault();
          openRxQuickCustomerModal($("#rx-customer-search").val());
          closeRxCustomerDd();
        });

        $("#btn-rx-quick-customer").on("click", function () {
          openRxQuickCustomerModal($("#rx-customer-search").val());
        });

        $("#rx-doctor-search").on("focus", function () {
          var $dd = $("#rx-doctor-dd");
          fillRxDoctorDropdown($dd, $(this).val());
          $dd.removeClass("hide").attr("aria-hidden", "false");
        });

        $("#rx-doctor-search").on("input", function () {
          $("#rx-doctor-id").val("");
          var $dd = $("#rx-doctor-dd");
          fillRxDoctorDropdown($dd, $(this).val());
          $dd.removeClass("hide").attr("aria-hidden", "false");
        });

        $("#rx-doctor-dd").on("mousedown", ".oc-customer-li[data-id]", function (e) {
          e.preventDefault();
          var id = $(this).attr("data-id");
          var lab = $(this).text();
          $("#rx-doctor-id").val(id || "");
          $("#rx-doctor-search").val(lab);
          closeRxDoctorDd();
        });

        $("#rx-doctor-dd").on("mousedown", ".oc-customer-li--add", function (e) {
          e.preventDefault();
          openRxQuickDoctorModal($("#rx-doctor-search").val());
          closeRxDoctorDd();
        });

        $("#btn-rx-quick-doctor").on("click", function () {
          openRxQuickDoctorModal($("#rx-doctor-search").val());
        });

        $("#form-rx-doctor").on("submit", function (e) {
          e.preventDefault();
          var name = ($("#rxfd-name").val() || "").trim();
          var phone = ($("#rxfd-phone").val() || "").trim();
          if (!name) {
            M.toast({ html: "Enter the doctor’s name." });
            return;
          }
          db
            .insertDoctor({ name: name, phone: phone || null })
            .then(function (newId) {
              $("#modal-rx-doctor").modal("close");
              refreshRxDoctorSelect(newId);
              M.toast({ html: "Doctor added and selected." });
            })
            .catch(function (err) {
              M.toast({ html: err.message || String(err) });
            });
        });

        $("#form-rx-customer").on("submit", function (e) {
          e.preventDefault();
          var name = ($("#rxf-name").val() || "").trim();
          var phone = ($("#rxf-phone").val() || "").trim();
          if (!name) {
            M.toast({ html: "Enter the patient’s full name." });
            return;
          }
          if (!phone) {
            M.toast({ html: "Enter a phone number." });
            return;
          }
          db
            .insertCustomer({ name: name, phone: phone })
            .then(function (newId) {
              $("#modal-rx-customer").modal("close");
              refreshRxCustomerSelect(newId);
              M.toast({ html: "Patient added and selected." });
            })
            .catch(function (err) {
              M.toast({ html: err.message || String(err) });
            });
        });

        $("#form-rx-edit").on("submit", function (e) {
          e.preventDefault();
          var cid = $("#rx-customer-id").val();
          if (!cid) {
            M.toast({ html: "Choose or add a patient (customer)." });
            return;
          }
          var did = $("#rx-doctor-id").val();
          var header = {
            customer_id: Number(cid),
            doctor_id: did ? Number(did) : null,
          };
          var lines = collectLines();
          var rid = $("#rx-id").val();
          var fail = function (err) {
            M.toast({ html: err.message || String(err) });
          };
          if (rid) {
            db.updatePrescription(Number(rid), header, lines)
              .then(function () {
                M.toast({ html: "Saved." });
                window.location.href = "prescriptions.html";
              })
              .catch(fail);
          } else {
            db.insertPrescription(header, lines)
              .then(function () {
                M.toast({ html: "Saved." });
                window.location.href = "prescriptions.html";
              })
              .catch(fail);
          }
        });

        var qsInit = new URLSearchParams(window.location.search);
        var idParamInit = qsInit.get("id");
        try {
          loadForm(idParamInit ? Number(idParamInit) : null);
        } catch (err) {
          if (typeof M !== "undefined" && M.toast) {
            M.toast({ html: err && err.message ? err.message : String(err) });
          }
        }
      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
