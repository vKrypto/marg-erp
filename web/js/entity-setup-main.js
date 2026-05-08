$(function () {
  if (typeof margOpenDatabase !== "function") {
    window.location.href = "index.html";
    return;
  }
  margOpenDatabase()
    .then(function (api) {
      var db = new MargDb(api);
      if (!db.getCurrentEntityId()) {
        window.location.href = "index.html";
        return;
      }
      var ent = db.getEntityById(db.getCurrentEntityId());
      if (typeof mountPharmaPulseShell === "function") {
        mountPharmaPulseShell({
          el: "#layout-root",
          activeSection: "entity-setup",
          entityName: ent ? ent.entity_name : "—",
          db: db,
        });
      }
      var model = new EntitySetupModel();
      var view = new EntitySetupView({ el: "#entity-setup-app", model: model, db: db });
      view.render();
    })
    .catch(function () {
      window.location.href = "index.html";
    });
});
