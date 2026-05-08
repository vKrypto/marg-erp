/**
 * Login page bootstrap — jQuery + sql.js + Backbone LoginView
 */
$(function () {
  if (typeof margOpenDatabase !== "function") {
    // eslint-disable-next-line no-console
    console.error("margOpenDatabase missing");
    return;
  }
  margOpenDatabase()
    .then(function (api) {
      var db = new MargDb(api);
      var view = new LoginView({ db: db });
      view.render();
    })
    .catch(function (err) {
      if (typeof M !== "undefined") {
        M.toast({ html: "Could not open local database: " + (err.message || String(err)) });
      } else {
        // eslint-disable-next-line no-alert
        alert("Could not open local database: " + (err.message || String(err)));
      }
    });
});
