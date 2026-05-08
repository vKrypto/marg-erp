/**
 * Staff management — docs/staff.md (admin only)
 */
(function () {
  var db;

  function fmtUpdated(iso) {
    if (!iso || String(iso).length < 10) return "—";
    return String(iso).slice(0, 10);
  }

  function refreshStaffSwitcher() {
    if (typeof window.initStaffSwitcher === "function") {
      window.initStaffSwitcher(db);
    }
  }

  function refreshStaffTable() {
    var rows = db.listStaff();
    var $tb = $("#staff-table-body").empty();
    rows.forEach(function (r) {
      var $tr = $("<tr></tr>");
      $tr.append(
        $("<td></td>").addClass("inv-name-cell").text(r.name || ""),
        $("<td></td>").text(r.email || "—"),
        $("<td></td>").text(r.phone || "—"),
        $("<td></td>").text(
          r.role === "admin" ? "Admin" : r.role === "doctor" ? "Doctor" : "Staff"
        ),
        $("<td></td>").addClass("grey-text").text(fmtUpdated(r.updated_at)),
        $("<td></td>")
          .addClass("inv-actions-cell")
          .html(
            '<a href="#!" class="inv-icon-btn edit-staff" data-id="' +
              r.id +
              '"><i class="material-icons">edit</i></a>' +
              '<a href="#!" class="inv-icon-btn delete-staff" data-id="' +
              r.id +
              '"><i class="material-icons">delete</i></a>'
          )
      );
      $tb.append($tr);
    });
    if (!rows.length) {
      $tb.append(
        '<tr><td colspan="6" class="center grey-text" style="padding: 2rem">No staff rows. This should not happen — reload the app.</td></tr>'
      );
    }
  }

  function openStaffModal(id) {
    $("#modal-staff-title").text(id ? "Edit staff" : "Add staff");
    $("#staff-id").val(id || "");
    if (id) {
      var s = db.getStaff(id);
      if (!s) return;
      $("#sf-name").val(s.name || "");
      $("#sf-email").val(s.email || "");
      $("#sf-phone").val(s.phone || "");
      $("#sf-role").val(
        s.role === "admin" ? "admin" : s.role === "doctor" ? "doctor" : "staff"
      );
    } else {
      $("#form-staff")[0].reset();
      $("#sf-role").val("staff");
    }
    M.FormSelect.init($("#sf-role"));
    M.updateTextFields();
    $("#modal-staff").modal("open");
  }

  $(function () {
    if (typeof margOpenDatabase !== "function") {
      window.location.href = "index.html";
      return;
    }
    margOpenDatabase()
      .then(function (api) {
        db = new MargDb(api);
        if (!db.getCurrentEntityId()) {
          window.location.href = "index.html";
          return;
        }
        var me = db.getCurrentStaff();
        if (!me || me.role !== "admin") {
          window.location.href = "app.html";
          return;
        }
        var ent = db.getEntityById(db.getCurrentEntityId());
        mountPharmaPulseShell({
          el: "#layout-root",
          activeSection: "staff-management",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        $(".modal").modal();
        M.FormSelect.init($("#sf-role"));

        refreshStaffTable();

        $("#btn-staff-add").on("click", function () {
          openStaffModal(null);
        });

        $("#staff-table-body").on("click", ".edit-staff", function (e) {
          e.preventDefault();
          openStaffModal(Number($(e.currentTarget).data("id")));
        });

        $("#staff-table-body").on("click", ".delete-staff", function (e) {
          e.preventDefault();
          var id = Number($(e.currentTarget).data("id"));
          if (!window.confirm("Remove this staff member?")) return;
          db.deleteStaff(id)
            .then(function () {
              M.toast({ html: "Staff removed" });
              refreshStaffTable();
              refreshStaffSwitcher();
            })
            .catch(function (err) {
              M.toast({ html: err && err.message ? err.message : String(err) });
            });
        });

        $("#form-staff").on("submit", function (e) {
          e.preventDefault();
          var id = $("#staff-id").val();
          var payload = {
            name: $("#sf-name").val(),
            email: $("#sf-email").val(),
            phone: $("#sf-phone").val(),
            role:
              $("#sf-role").val() === "admin"
                ? "admin"
                : $("#sf-role").val() === "doctor"
                  ? "doctor"
                  : "staff",
          };
          var p = id ? db.updateStaff(Number(id), payload) : db.insertStaff(payload);
          p.then(function () {
            M.toast({ html: id ? "Staff updated" : "Staff added" });
            $("#modal-staff").modal("close");
            refreshStaffTable();
            refreshStaffSwitcher();
          }).catch(function (err) {
            M.toast({ html: err && err.message ? err.message : String(err) });
          });
        });
      })
      .catch(function () {
        window.location.href = "index.html";
      });
  });
})();
