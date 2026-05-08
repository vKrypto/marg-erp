/**
 * Shown only after creating a new entity — confirms session before main app.
 */
$(function () {
  if (typeof margOpenDatabase !== "function") {
    window.location.href = "index.html";
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
      $("#entity-name-display").text(ent && ent.entity_name ? ent.entity_name : "—");
    })
    .catch(function () {
      window.location.href = "index.html";
    });
});
