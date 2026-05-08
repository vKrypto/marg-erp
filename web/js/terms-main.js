/**
 * Admin — Terms & conditions (stored on entity; printed on invoices).
 */
(function () {
  var db;

  function showToast(err) {
    var msg = err && err.message ? err.message : String(err);
    M.toast({ html: msg, classes: "rounded", displayLength: 4000 });
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
          activeSection: "terms",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });

        var eid = db.getCurrentEntityId();
        var row = db.getCurrentEntity();
        var initial =
          typeof MargTermsDefaults !== "undefined" && MargTermsDefaults.resolveTermsText
            ? MargTermsDefaults.resolveTermsText(row, eid, { seedLs: true })
            : row && row.terms_and_conditions
              ? row.terms_and_conditions
              : "";
        $("#terms-body").val(initial);
        M.updateTextFields();
        M.textareaAutoResize($("#terms-body"));

        $("#btn-save-terms").on("click", function () {
          var text = $("#terms-body").val();
          db
            .updateEntityTermsAndConditions(text)
            .then(function () {
              if (typeof MargTermsDefaults !== "undefined" && MargTermsDefaults.setTermsLocalStorage) {
                MargTermsDefaults.setTermsLocalStorage(eid, text);
              }
              M.toast({ html: "Terms & conditions saved to this entity and this browser." });
            })
            .catch(showToast);
        });
      })
      .catch(function (err) {
        console.error(err);
        M.toast({ html: "Database failed to open." });
      });
  });
})();
