/**
 * Shared Pharmacy ERP shell — Backbone.View + Underscore template.
 * Used on app.html, inventory.html, entity-setup.html, import-export.html, terms.html, invoice-format.html, invoice-samples.html, etc.
 */
(function () {
  /** Admin: import/export, entity setup, terms & conditions */
  function adminSectionOpen(activeSection) {
    return (
      activeSection === "import-export" ||
      activeSection === "entity-setup" ||
      activeSection === "staff-management" ||
      activeSection === "terms" ||
      activeSection === "invoice-format" ||
      activeSection === "invoice-samples"
    );
  }

  var AppLayoutView = Backbone.View.extend({
    events: {
      "click .inv-nav-group-toggle": "onToggleInventoryGroup",
      "click .inv-mobile-menu-btn": "onMobileMenuToggle",
      "click .inv-nav-backdrop": "onMobileNavBackdrop",
      "click .inv-sidebar a": "onMobileNavLink",
    },

    onToggleInventoryGroup: function (e) {
      e.preventDefault();
      var $btn = $(e.currentTarget);
      var $g = $btn.closest(".inv-nav-group");
      $g.toggleClass("inv-nav-group--open");
      var open = $g.hasClass("inv-nav-group--open");
      $btn.attr("aria-expanded", open ? "true" : "false");
    },

    setMobileNavOpen: function (open) {
      var $shell = this.$("#pharmacy-erp-shell");
      var $btn = this.$(".inv-mobile-menu-btn");
      var $bd = this.$("#inv-nav-backdrop");
      if (!$shell.length) return;
      $shell.toggleClass("inv-shell--nav-open", !!open);
      $("body").toggleClass("inv-nav-open", !!open);
      $btn.attr("aria-expanded", open ? "true" : "false");
      if ($bd.length) {
        $bd.attr("aria-hidden", open ? "false" : "true");
      }
    },

    onMobileMenuToggle: function (e) {
      e.preventDefault();
      var $shell = this.$("#pharmacy-erp-shell");
      this.setMobileNavOpen(!$shell.hasClass("inv-shell--nav-open"));
    },

    onMobileNavBackdrop: function (e) {
      e.preventDefault();
      this.setMobileNavOpen(false);
    },

    /** Close drawer after choosing a nav link (mobile). */
    onMobileNavLink: function () {
      if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 992px)").matches) {
        this.setMobileNavOpen(false);
      }
    },

    template: _.template(
      [
        '<div class="inv-shell" id="pharmacy-erp-shell">',
        '  <header class="inv-mobile-header" role="banner">',
        '    <button type="button" class="inv-mobile-menu-btn btn-flat waves-effect" aria-label="Open menu" aria-expanded="false" aria-controls="inv-sidebar-main">',
        '      <i class="material-icons" aria-hidden="true">menu</i>',
        '    </button>',
        '    <a href="app.html" class="inv-mobile-header-brand">',
        '      <span class="inv-mobile-header-logo erp-brand-icon-box erp-brand-icon-box--xs" aria-hidden="true"><i class="material-icons">local_pharmacy</i></span>',
        '      <span class="inv-mobile-header-text">',
        '        <span class="inv-mobile-header-title"><%- entityName %></span>',
        '        <span class="inv-mobile-header-tagline">Pharmacy ERP</span>',
        '      </span>',
        '    </a>',
        '    <button type="button" class="inv-header-search-btn js-global-search-open" aria-label="Open search" title="Search">',
        '      <i class="material-icons" aria-hidden="true">search</i>',
        '    </button>',
        '  </header>',
        '  <div class="inv-nav-backdrop" id="inv-nav-backdrop" aria-hidden="true"></div>',
        '  <aside class="inv-sidebar" id="inv-sidebar-main" aria-label="Main navigation">',
        '    <div class="inv-sidebar-top">',
        '      <a href="app.html" class="inv-brand">',
        '        <span class="inv-brand-icon erp-brand-icon-box erp-brand-icon-box--sm" aria-hidden="true"><i class="material-icons">local_pharmacy</i></span>',
        '        <span class="inv-brand-text">',
        '          <span class="inv-brand-title"><span class="erp-brand-word">Pharmacy</span> <span class="erp-brand-word-erp">ERP</span></span>',
        '          <span class="inv-brand-sub">Inventory &amp; sales</span>',
        '        </span>',
        '      </a>',
        '      <p class="inv-side-section-label">Main sections</p>',
        '      <div class="inv-side-nav" role="navigation" aria-label="Main sections">',
        '        <a href="app.html" class="inv-nav-item <%= activeSection === "dashboard" ? "active" : "" %>">',
        '          <i class="material-icons" aria-hidden="true">dashboard</i>',
        '          <span>Dashboard</span>',
        '        </a>',
        '        <a href="inventory.html?panel=products" data-panel="products" class="inv-nav-item <%= activeSection === "products" || activeSection === "product-detail" || activeSection === "product-new" ? "active" : "" %>">',
        '          <i class="material-icons" aria-hidden="true">view_list</i>',
        '          <span>Products</span>',
        '        </a>',
        '        <a href="inventory.html?panel=vendors" data-panel="vendors" class="inv-nav-item <%= activeSection === "vendors" || activeSection === "vendor-detail" ? "active" : "" %>">',
        '          <i class="material-icons" aria-hidden="true">local_shipping</i>',
        '          <span>Vendors</span>',
        '        </a>',
        '        <a href="inventory.html?panel=lots" data-panel="lots" class="inv-nav-item <%= activeSection === "lots" || activeSection === "lot-detail" || activeSection === "lot-new" || activeSection === "lot-edit" ? "active" : "" %>">',
        '          <i class="material-icons" aria-hidden="true">receipt_long</i>',
        '          <span>Purchases / Lots</span>',
        '        </a>',
        '        <a href="customers.html" class="inv-nav-item <%= activeSection === "customers" || activeSection === "customer-detail" ? "active" : "" %>">',
        '          <i class="material-icons" aria-hidden="true">people</i>',
        '          <span>Customers</span>',
        '        </a>',
        '        <a href="prescriptions.html" class="inv-nav-item <%= activeSection === "prescriptions" || activeSection === "prescription-detail" || activeSection === "prescription-edit" ? "active" : "" %>">',
        '          <i class="material-icons" aria-hidden="true">medical_services</i>',
        '          <span>Prescriptions</span>',
        '        </a>',
        '        <a href="orders.html" class="inv-nav-item <%= activeSection === "orders" ? "active" : "" %>">',
        '          <i class="material-icons" aria-hidden="true">shopping_cart</i>',
        '          <span>Orders</span>',
        '        </a>',
        '      </div>',
        '      <div id="inv-admin-section" class="inv-admin-section">',
        '      <p class="inv-side-section-label">Admin</p>',
        '      <div class="inv-nav-group <%= adminOpen ? "inv-nav-group--open" : "" %>">',
        '        <button type="button" class="inv-nav-group-toggle" aria-expanded="<%= adminOpen ? "true" : "false" %>" aria-controls="inv-admin-subnav">',
        '          <i class="material-icons" aria-hidden="true">admin_panel_settings</i>',
        '          <span>Admin</span>',
        '          <i class="material-icons inv-nav-chevron" aria-hidden="true">expand_more</i>',
        '        </button>',
        '        <div id="inv-admin-subnav" class="inv-nav-subnav">',
        '          <a href="entity-setup.html" class="inv-nav-item inv-nav-sub <%= activeSection === "entity-setup" ? "active" : "" %>">',
        '            <i class="material-icons" aria-hidden="true">tune</i>',
        '            <span>Entity setup</span>',
        '          </a>',
        '          <a href="staff.html" class="inv-nav-item inv-nav-sub <%= activeSection === "staff-management" ? "active" : "" %>">',
        '            <i class="material-icons" aria-hidden="true">groups</i>',
        '            <span>Staff management</span>',
        '          </a>',
        '          <a href="invoice-samples.html" class="inv-nav-item inv-nav-sub <%= activeSection === "invoice-samples" ? "active" : "" %>">',
        '            <i class="material-icons" aria-hidden="true">palette</i>',
        '            <span>Invoice samples</span>',
        '          </a>',
        '          <a href="invoice-format.html" class="inv-nav-item inv-nav-sub <%= activeSection === "invoice-format" ? "active" : "" %>">',
        '            <i class="material-icons" aria-hidden="true">receipt_long</i>',
        '            <span>Invoice format</span>',
        '          </a>',
        '          <a href="import-export.html" class="inv-nav-item inv-nav-sub <%= activeSection === "import-export" ? "active" : "" %>">',
        '            <i class="material-icons" aria-hidden="true">import_export</i>',
        '            <span>Import & export</span>',
        '          </a>',
        '          <a href="terms.html" class="inv-nav-item inv-nav-sub <%= activeSection === "terms" ? "active" : "" %>">',
        '            <i class="material-icons" aria-hidden="true">gavel</i>',
        '            <span>Terms & conditions</span>',
        '          </a>',
        '        </div>',
        '      </div>',
        '      </div>',
        '      <div class="inv-entity-card">',
        '        <span class="inv-entity-label">Active entity</span>',
        '        <span class="inv-entity-name" id="inv-active-entity-name"><%- entityName %></span>',
        '      </div>',
        '      <div class="inv-staff-card">',
        '        <span class="inv-entity-label">Working as</span>',
        '        <select id="inv-staff-select" class="browser-default inv-staff-select" aria-label="Active staff member"></select>',
        '      </div>',
        '      <div class="inv-side-links">',
        '        <a href="index.html">Switch entity</a>',
        '      </div>',
        '    </div>',
        '    <div class="inv-sidebar-bottom">',
        '      <button type="button" id="inv-sync-btn" class="btn waves-effect waves-light teal inv-sync-btn" title="Upload local database to your server">',
        '        <i class="material-icons left" aria-hidden="true">cloud_upload</i>',
        '        Sync to Server',
        '      </button>',
        '      <div id="inv-sync-status" class="inv-sync-status inv-sync-status--muted" role="status">',
        '        <i class="material-icons" aria-hidden="true">cloud_queue</i>',
        '        <span class="inv-sync-status-text">Sync off</span>',
        '      </div>',
        '      <div class="inv-offline-pill">',
        '        <i class="material-icons" aria-hidden="true">verified_user</i>',
        '        <span>Local-first</span>',
        '      </div>',
        '    </div>',
        '  </aside>',
        '  <div class="inv-main-column">',
        '    <div id="inv-offline-banner" class="inv-offline-banner" role="status" aria-live="polite" hidden>',
        '      <i class="material-icons" aria-hidden="true">wifi_off</i>',
        '      <span>You’re offline — data is saved in this browser. Sync when you’re back online.</span>',
        '    </div>',
        '    <div class="inv-desktop-topbar">',
        '      <button type="button" class="inv-header-search-btn inv-desktop-search-btn js-global-search-open" aria-label="Open search" title="Search">',
        '        <i class="material-icons" aria-hidden="true">search</i>',
        '        <span class="inv-desktop-search-btn-label">Search</span>',
        '      </button>',
        '    </div>',
        '    <div id="layout-content-slot"></div>',
        '  </div>',
        '  <div id="global-search-overlay" class="inv-global-search-overlay" aria-hidden="true" hidden>',
        '    <div class="inv-global-search-overlay-inner">',
        '      <header class="inv-global-search-overlay-head">',
        '        <h2 id="global-search-overlay-heading" class="inv-global-search-overlay-title">Search</h2>',
        '        <button type="button" class="inv-global-search-overlay-close inv-header-search-btn" aria-label="Close search">',
        '          <i class="material-icons" aria-hidden="true">close</i>',
        '        </button>',
        '      </header>',
        '      <div class="inv-global-search-overlay-body">',
        '        <div class="inv-content-card inv-global-search-card">',
        '          <div class="input-field inv-dash-search-field inv-global-search-field">',
        '            <i class="material-icons prefix">search</i>',
        '            <input type="search" id="global-search" placeholder="Search products, customers, prescriptions…" autocomplete="off" class="validate" />',
        '            <div id="global-search-dd" class="inv-dash-search-dropdown" style="display: none"></div>',
        '          </div>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>',
      ].join("\n")
    ),

    initialize: function (opts) {
      this.activeSection = (opts && opts.activeSection) || "dashboard";
      this.entityName = (opts && opts.entityName) || "—";
    },

    render: function () {
      var adminOpen = adminSectionOpen(this.activeSection);
      this.$el.html(
        this.template({
          activeSection: this.activeSection,
          entityName: this.entityName,
          adminOpen: adminOpen,
        })
      );
      return this;
    },
  });

  /**
   * Show Admin sidebar block for admins only; hide entirely when working as staff (docs/staff.md).
   * @param {object} db — MargDb instance
   */
  function applyAdminNavVisibility(db) {
    var $sec = $("#inv-admin-section");
    if (!$sec.length) return;
    var me = db.getCurrentStaff && db.getCurrentStaff();
    var staffMode = me && (me.role === "staff" || me.role === "doctor");
    $sec.toggle(!staffMode);
  }

  /**
   * Populate sidebar staff dropdown and persist switches (docs/staff.md).
   * @param {object} db — MargDb instance
   */
  function initStaffSwitcher(db) {
    if (!db || typeof db.listStaff !== "function") return;
    var $sel = $("#inv-staff-select");
    if (!$sel.length) return;
    var list = db.listStaff();
    var currentId = db.getCurrentStaffId();
    $sel.empty();
    list.forEach(function (s) {
      var suffix =
        s.role === "admin" ? " (Admin)" : s.role === "doctor" ? " (Doctor)" : " (Staff)";
      var label = s.name + suffix;
      $sel.append($("<option></option>").attr("value", String(s.id)).text(label));
    });
    if (currentId != null && $sel.find('option[value="' + String(currentId) + '"]').length) {
      $sel.val(String(currentId));
    } else if (list.length) {
      $sel.val(String(list[0].id));
    }
    $sel.off("change.margStaff").on("change.margStaff", function () {
      var v = $(this).val();
      if (!v) return;
      var num = Number(v);
      db.setCurrentStaffId(num).then(function () {
        applyAdminNavVisibility(db);
      }).catch(function (err) {
        if (typeof window.M !== "undefined" && M.toast) {
          M.toast({ html: err && err.message ? err.message : String(err) });
        }
      });
    });

    applyAdminNavVisibility(db);
  }

  /**
   * Renders the shell into opts.el, moves #page-fragment children into #layout-content-slot, removes empty fragment.
   * @param {object} opts — { el, activeSection, entityName, pageFragment?: selector, db?: MargDb }
   * @returns {AppLayoutView}
   */
  function mountPharmaPulseShell(opts) {
    var o = opts || {};
    var view = new AppLayoutView({
      el: o.el || "#layout-root",
      activeSection: o.activeSection,
      entityName: o.entityName,
    });
    view.render();
    var sel = o.pageFragment || "#page-fragment";
    var $frag = $(sel);
    if ($frag.length) {
      $frag.children().appendTo(view.$("#layout-content-slot"));
      $frag.remove();
    }
    if (o.db) {
      initStaffSwitcher(o.db);
      if (typeof window.margGlobalSearchInit === "function") {
        window.margGlobalSearchInit(o.db);
      }
      if (typeof window.margSyncInit === "function") {
        window.margSyncInit(o.db);
      }
    }
    $(document)
      .off("keydown.invMobileNav")
      .on("keydown.invMobileNav", function (e) {
        if (e.key !== "Escape") return;
        if ($("body").hasClass("inv-global-search-open")) return;
        var $shell = $("#pharmacy-erp-shell");
        if (!$shell.hasClass("inv-shell--nav-open")) return;
        $shell.removeClass("inv-shell--nav-open");
        $("body").removeClass("inv-nav-open");
        $(".inv-mobile-menu-btn").attr("aria-expanded", "false");
      });
    if (typeof window.margOfflineRefreshBanner === "function") {
      window.margOfflineRefreshBanner();
    }
    return view;
  }

  window.AppLayoutView = AppLayoutView;
  window.mountPharmaPulseShell = mountPharmaPulseShell;
  window.initStaffSwitcher = initStaffSwitcher;
  window.applyAdminNavVisibility = applyAdminNavVisibility;
})();
