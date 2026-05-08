/**
 * Dashboard (app.html) — session banner + mount shared Pharmacy ERP shell (Backbone layout).
 */
$(function () {
  if (typeof margOpenDatabase !== "function" || typeof mountPharmaPulseShell !== "function") {
    console.error("Missing margOpenDatabase or mountPharmaPulseShell");
    return;
  }
  margOpenDatabase()
    .then(function (api) {
      var db = new MargDb(api);
      var eid = db.getCurrentEntityId();
      if (eid == null) {
        window.location.href = "index.html";
        return;
      }
      var ent = db.getEntityById(eid);
      var name = ent ? ent.entity_name : "Unknown entity";
      mountPharmaPulseShell({
        el: "#layout-root",
        activeSection: "dashboard",
        entityName: name,
        db: db,
      });
      $("#entity-label").text("Entity: " + name);
    })
    .catch(function () {
      window.location.href = "index.html";
    });
});
