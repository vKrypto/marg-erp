/**
 * Local SQLite (sql.js) + IndexedDB persistence — schema from docs/login.md §3.4
 */
(function (global) {
  var IDB_NAME = "marg-erp";
  var IDB_STORE = "sqlite";
  var IDB_KEY = "marg-db-v1";

  function openIdb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function idbGetBuffer() {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readonly");
        var req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function idbSetBuffer(buf) {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.objectStore(IDB_STORE).put(buf, IDB_KEY);
      });
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function randomSessionKey() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "sess_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 12);
  }

  function runMigrations(db) {
    db.run("PRAGMA foreign_keys = ON;");
    db.exec(
      [
        "CREATE TABLE IF NOT EXISTS entity (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  entity_name TEXT NOT NULL UNIQUE,",
        "  session_key TEXT NOT NULL UNIQUE,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL,",
        "  legal_name TEXT,",
        "  proprietor_name TEXT,",
        "  phone TEXT,",
        "  alternate_phone TEXT,",
        "  email TEXT,",
        "  website TEXT,",
        "  line1 TEXT,",
        "  line2 TEXT,",
        "  city TEXT,",
        "  state TEXT,",
        "  pincode TEXT,",
        "  country TEXT DEFAULT 'India',",
        "  dl_number TEXT,",
        "  dl_valid_from TEXT,",
        "  dl_valid_to TEXT,",
        "  gstin TEXT,",
        "  pan TEXT,",
        "  logo_mime TEXT,",
        "  logo_blob BLOB,",
        "  tagline TEXT,",
        "  default_currency TEXT DEFAULT 'INR',",
        "  default_timezone TEXT DEFAULT 'Asia/Kolkata',",
        "  invoice_prefix TEXT,",
        "  notes TEXT,",
        "  auto_reorder_level INTEGER DEFAULT 50,",
        "  expiry_alert_days INTEGER DEFAULT 90,",
        "  accepted_payments TEXT,",
        "  terms_and_conditions TEXT,",
        "  invoice_format_json TEXT",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_entity_updated_at ON entity (updated_at);",
        "CREATE TABLE IF NOT EXISTS app_state (",
        "  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),",
        "  current_entity_id INTEGER REFERENCES entity (id) ON DELETE SET NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
      ].join("\n")
    );
    var row = db.exec("SELECT COUNT(*) AS c FROM app_state WHERE singleton = 1");
    var count = row.length && row[0].values.length ? row[0].values[0][0] : 0;
    if (count === 0) {
      db.run("INSERT INTO app_state (singleton, current_entity_id, updated_at) VALUES (1, NULL, ?);", [
        nowIso(),
      ]);
    }
    runInventoryMigrations(db);
    migrateAppStateSyncColumns(db);
    migrateStaffDoctorRole(db);
    seedDefaultDoctorForAllEntities(db);
  }

  /** docs/inventory.md §6 */
  function runInventoryMigrations(db) {
    db.run("PRAGMA foreign_keys = ON;");
    db.exec(
      [
        "CREATE TABLE IF NOT EXISTS product (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
        "  name TEXT NOT NULL,",
        "  code TEXT,",
        "  barcode TEXT,",
        "  pack_label TEXT,",
        "  strips_per_pack INTEGER DEFAULT 1,",
        "  units_per_strip INTEGER,",
        "  description TEXT,",
        "  chemical_composition TEXT,",
        "  general_recommendation TEXT,",
        "  where_to_use TEXT,",
        "  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_product_entity_name ON product (entity_id, name);",
        "CREATE INDEX IF NOT EXISTS idx_product_entity_code ON product (entity_id, code);",
        "CREATE TABLE IF NOT EXISTS vendor (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
        "  name TEXT NOT NULL,",
        "  phone TEXT,",
        "  email TEXT,",
        "  address_line1 TEXT,",
        "  address_line2 TEXT,",
        "  city TEXT,",
        "  state TEXT,",
        "  pincode TEXT,",
        "  gstin TEXT,",
        "  notes TEXT,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_vendor_entity_name ON vendor (entity_id, name);",
        "CREATE TABLE IF NOT EXISTS vendor_poc (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  vendor_id INTEGER NOT NULL REFERENCES vendor (id) ON DELETE CASCADE,",
        "  name TEXT NOT NULL,",
        "  phone TEXT,",
        "  email TEXT,",
        "  role TEXT,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_vendor_poc_vendor ON vendor_poc (vendor_id);",
        "CREATE TABLE IF NOT EXISTS lot (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
        "  vendor_id INTEGER REFERENCES vendor (id) ON DELETE SET NULL,",
        "  lot_number TEXT NOT NULL,",
        "  lot_date TEXT,",
        "  delivered_date TEXT,",
        "  total_price_paise INTEGER,",
        "  margin_paise INTEGER,",
        "  total_paid_paise INTEGER,",
        "  delivered_by TEXT,",
        "  notes TEXT,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_lot_entity_date ON lot (entity_id, delivered_date);",
        "CREATE INDEX IF NOT EXISTS idx_lot_entity_number ON lot (entity_id, lot_number);",
        "CREATE TABLE IF NOT EXISTS lot_line (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  lot_id INTEGER NOT NULL REFERENCES lot (id) ON DELETE CASCADE,",
        "  product_id INTEGER NOT NULL REFERENCES product (id) ON DELETE RESTRICT,",
        "  quantity INTEGER NOT NULL CHECK (quantity > 0),",
        "  strips_per_pack INTEGER NOT NULL DEFAULT 1 CHECK (strips_per_pack >= 1),",
        "  available_count INTEGER NOT NULL CHECK (available_count >= 0 AND available_count <= quantity),",
        "  delivered_on TEXT,",
        "  selling_price_paise INTEGER NOT NULL,",
        "  strip_mrp_paise INTEGER,",
        "  line_notes TEXT,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_lot_line_lot ON lot_line (lot_id);",
        "CREATE INDEX IF NOT EXISTS idx_lot_line_product ON lot_line (product_id);",
        "CREATE TABLE IF NOT EXISTS customer (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
        "  name TEXT NOT NULL,",
        "  phone TEXT,",
        "  address_line1 TEXT,",
        "  address_line2 TEXT,",
        "  city TEXT,",
        "  state TEXT,",
        "  pincode TEXT,",
        "  email TEXT,",
        "  notes TEXT,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_customer_entity_name ON customer (entity_id, name);",
        "CREATE INDEX IF NOT EXISTS idx_customer_entity_phone ON customer (entity_id, phone);",
        "CREATE TABLE IF NOT EXISTS customer_payment (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
        "  customer_id INTEGER NOT NULL REFERENCES customer (id) ON DELETE CASCADE,",
        "  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),",
        "  method TEXT NOT NULL CHECK (method IN ('cash', 'upi')),",
        "  notes TEXT,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_customer_payment_entity_customer ON customer_payment (entity_id, customer_id);",
        "CREATE TABLE IF NOT EXISTS shop_order (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
        "  customer_id INTEGER NOT NULL REFERENCES customer (id) ON DELETE RESTRICT,",
        "  order_number TEXT,",
        "  order_date TEXT NOT NULL,",
        "  order_total_price_paise INTEGER NOT NULL DEFAULT 0,",
        "  order_discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (order_discount_paise >= 0),",
        "  order_header_discount_flat_paise INTEGER NOT NULL DEFAULT 0 CHECK (order_header_discount_flat_paise >= 0),",
        "  order_header_discount_percent INTEGER,",
        "  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),",
        "  notes TEXT,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_shop_order_entity_date ON shop_order (entity_id, order_date);",
        "CREATE TABLE IF NOT EXISTS order_line (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  order_id INTEGER NOT NULL REFERENCES shop_order (id) ON DELETE CASCADE,",
        "  product_id INTEGER NOT NULL REFERENCES product (id) ON DELETE RESTRICT,",
        "  quantity INTEGER NOT NULL CHECK (quantity > 0),",
        "  total_price_paise INTEGER NOT NULL,",
        "  line_discount_paise INTEGER NOT NULL DEFAULT 0 CHECK (line_discount_paise >= 0),",
        "  line_notes TEXT,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_order_line_order ON order_line (order_id);",
        "CREATE INDEX IF NOT EXISTS idx_order_line_product ON order_line (product_id);",
        "CREATE TABLE IF NOT EXISTS order_line_schedule (",
        "  order_line_id INTEGER PRIMARY KEY REFERENCES order_line (id) ON DELETE CASCADE,",
        "  in_morning INTEGER NOT NULL DEFAULT 0 CHECK (in_morning IN (0, 1)),",
        "  in_noon INTEGER NOT NULL DEFAULT 0 CHECK (in_noon IN (0, 1)),",
        "  in_evening INTEGER NOT NULL DEFAULT 0 CHECK (in_evening IN (0, 1)),",
        "  in_night INTEGER NOT NULL DEFAULT 0 CHECK (in_night IN (0, 1)),",
        "  remarks TEXT",
        ");",
        "CREATE TABLE IF NOT EXISTS doctor (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
        "  name TEXT NOT NULL,",
        "  phone TEXT,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_doctor_entity_name ON doctor (entity_id, name);",
        "CREATE TABLE IF NOT EXISTS prescription (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
        "  customer_id INTEGER NOT NULL REFERENCES customer (id) ON DELETE RESTRICT,",
        "  doctor_id INTEGER REFERENCES doctor (id) ON DELETE SET NULL,",
        "  doctor_name TEXT,",
        "  doctor_phone TEXT,",
        "  import_key TEXT,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_prescription_entity_customer ON prescription (entity_id, customer_id);",
        "CREATE INDEX IF NOT EXISTS idx_prescription_entity_updated ON prescription (entity_id, updated_at);",
        "CREATE INDEX IF NOT EXISTS idx_prescription_doctor_name ON prescription (entity_id, doctor_name);",
        "CREATE TABLE IF NOT EXISTS prescription_line (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  prescription_id INTEGER NOT NULL REFERENCES prescription (id) ON DELETE CASCADE,",
        "  prescription_status TEXT NOT NULL DEFAULT 'draft',",
        "  prescription_type TEXT,",
        "  prescription_notes TEXT,",
        "  secret_notes TEXT,",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_prescription_line_rx ON prescription_line (prescription_id);",
      ].join("\n")
    );
    try {
      db.run(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_lot_entity_lot_number ON lot (entity_id, lot_number);"
      );
    } catch (e) {
      /* ignore */
    }
    try {
      db.run(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_shop_order_entity_order_number ON shop_order (entity_id, order_number) WHERE order_number IS NOT NULL AND order_number != '';"
      );
    } catch (e) {
      /* ignore */
    }
    try {
      db.run("ALTER TABLE order_line ADD COLUMN line_discount_paise INTEGER NOT NULL DEFAULT 0");
    } catch (e) {
      /* duplicate column */
    }
    try {
      db.run(
        "ALTER TABLE shop_order ADD COLUMN prescription_id INTEGER REFERENCES prescription (id) ON DELETE SET NULL"
      );
    } catch (e) {
      /* duplicate column or prescription table missing on ancient DB */
    }
    try {
      db.run(
        "ALTER TABLE shop_order ADD COLUMN order_header_discount_flat_paise INTEGER NOT NULL DEFAULT 0"
      );
    } catch (e) {
      /* duplicate column */
    }
    try {
      db.run("ALTER TABLE shop_order ADD COLUMN order_header_discount_percent INTEGER");
    } catch (e) {
      /* duplicate column */
    }
    try {
      db.run(
        "UPDATE shop_order SET order_header_discount_flat_paise = order_discount_paise WHERE COALESCE(order_header_discount_percent, 0) = 0 AND COALESCE(order_header_discount_flat_paise, 0) = 0 AND COALESCE(order_discount_paise, 0) > 0"
      );
    } catch (e) {
      /* ignore */
    }
    try {
      db.run("ALTER TABLE lot_line ADD COLUMN strip_mrp_paise INTEGER");
    } catch (e) {
      /* duplicate column */
    }
    try {
      db.run("ALTER TABLE lot_line ADD COLUMN available_count INTEGER");
      db.run("UPDATE lot_line SET available_count = quantity WHERE available_count IS NULL");
    } catch (e) {
      /* duplicate column */
    }
    try {
      db.run("ALTER TABLE lot_line ADD COLUMN available_tabs INTEGER");
    } catch (e) {
      /* duplicate column */
    }
    try {
      db.run("ALTER TABLE lot_line ADD COLUMN strips_per_pack INTEGER NOT NULL DEFAULT 1");
    } catch (e) {
      /* duplicate column */
    }
    try {
      db.run(
        [
          "UPDATE lot_line SET strips_per_pack = ",
          "MAX(1, COALESCE((SELECT p.strips_per_pack FROM product p WHERE p.id = lot_line.product_id), 1))",
        ].join("")
      );
    } catch (e) {
      /* ignore */
    }
    try {
      db.run(
        [
          "UPDATE lot_line SET available_tabs = ",
          "COALESCE((",
          "SELECT CAST(l2.available_count AS INTEGER) * ",
          "(CASE WHEN IFNULL(p.units_per_strip, 0) > 0 THEN CAST(p.units_per_strip AS INTEGER) ELSE 1 END)",
          "FROM lot_line AS l2 INNER JOIN product AS p ON p.id = l2.product_id WHERE l2.id = lot_line.id",
          "), CAST(available_count AS INTEGER))",
          ") WHERE available_tabs IS NULL",
        ].join("")
      );
    } catch (e) {
      /* ignore */
    }
    try {
      db.run(
        [
          "CREATE TABLE IF NOT EXISTS customer_payment (",
          "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
          "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
          "  customer_id INTEGER NOT NULL REFERENCES customer (id) ON DELETE CASCADE,",
          "  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),",
          "  method TEXT NOT NULL CHECK (method IN ('cash', 'upi')),",
          "  notes TEXT,",
          "  created_at TEXT NOT NULL,",
          "  updated_at TEXT NOT NULL",
          ");",
        ].join("\n")
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_customer_payment_entity_customer ON customer_payment (entity_id, customer_id)"
      );
    } catch (e) {
      /* ignore */
    }
    try {
      db.exec(
        [
          "CREATE TABLE IF NOT EXISTS product_type (",
          "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
          "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
          "  label TEXT NOT NULL,",
          "  created_at TEXT NOT NULL",
          ");",
          "CREATE INDEX IF NOT EXISTS idx_product_type_entity ON product_type (entity_id);",
        ].join("\n")
      );
      db.run(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_product_type_entity_label ON product_type (entity_id, label COLLATE NOCASE)"
      );
    } catch (e) {
      /* ignore */
    }
    try {
      db.run(
        "ALTER TABLE product ADD COLUMN product_type_id INTEGER REFERENCES product_type (id) ON DELETE SET NULL"
      );
    } catch (e) {
      /* duplicate column */
    }
    try {
      db.exec(
        [
          "CREATE TABLE IF NOT EXISTS doctor (",
          "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
          "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
          "  name TEXT NOT NULL,",
          "  phone TEXT,",
          "  created_at TEXT NOT NULL,",
          "  updated_at TEXT NOT NULL",
          ");",
          "CREATE INDEX IF NOT EXISTS idx_doctor_entity_name ON doctor (entity_id, name);",
        ].join("\n")
      );
    } catch (e) {
      /* ignore */
    }
    try {
      db.run(
        "ALTER TABLE prescription ADD COLUMN doctor_id INTEGER REFERENCES doctor (id) ON DELETE SET NULL"
      );
    } catch (e) {
      /* duplicate column */
    }
    try {
      backfillPrescriptionDoctorIds(db);
    } catch (e) {
      /* ignore */
    }
    try {
      db.run("ALTER TABLE prescription ADD COLUMN import_key TEXT");
    } catch (e) {
      /* duplicate column */
    }
    try {
      db.run("DROP INDEX IF EXISTS uq_prescription_entity_import_key");
    } catch (e) {
      /* ignore */
    }
    try {
      db.run(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_prescription_entity_import_key ON prescription (entity_id, import_key COLLATE NOCASE) WHERE import_key IS NOT NULL AND import_key != ''"
      );
    } catch (e) {
      /* ignore */
    }
    runStaffMigrations(db);
  }

  /** Migrates legacy prescription.doctor_name / doctor_phone into doctor rows + doctor_id. */
  function backfillPrescriptionDoctorIds(db) {
    var t = nowIso();
    var rows = execAll(
      db,
      [
        "SELECT id, entity_id, doctor_name, doctor_phone FROM prescription",
        "WHERE doctor_id IS NULL AND doctor_name IS NOT NULL AND trim(doctor_name) != ''",
      ].join(" ")
    );
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      var name = String(r.doctor_name || "").trim();
      if (!name) continue;
      var phone =
        r.doctor_phone != null && String(r.doctor_phone).trim() ? String(r.doctor_phone).trim() : null;
      var ex = execAll(
        db,
        [
          "SELECT id FROM doctor WHERE entity_id = ? AND lower(trim(name)) = lower(?) AND ",
          "coalesce(phone,'') = coalesce(?,'')",
        ].join(""),
        [Number(r.entity_id), name, phone]
      );
      var did;
      if (ex.length) {
        did = Number(ex[0].id);
      } else {
        db.run(
          "INSERT INTO doctor (entity_id, name, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          [Number(r.entity_id), name, phone, t, t]
        );
        did = db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
      }
      db.run("UPDATE prescription SET doctor_id = ? WHERE id = ?", [did, Number(r.id)]);
    }
  }

  /** Normalize staff role for insert/update/import. */
  function normalizeStaffRole(r) {
    var s = String(r == null ? "" : r)
      .trim()
      .toLowerCase();
    if (s === "admin") return "admin";
    if (s === "doctor") return "doctor";
    return "staff";
  }

  /**
   * Extend staff.role CHECK to include 'doctor' (SQLite: recreate table).
   */
  function migrateStaffDoctorRole(db) {
    var info = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='staff'");
    if (!info.length || !info[0].values || !info[0].values.length) return;
    var sqlCreate = String(info[0].values[0][0] || "");
    if (sqlCreate.indexOf("doctor") >= 0) return;

    db.run("PRAGMA foreign_keys = OFF;");
    try {
      db.exec(
        [
          "CREATE TABLE staff_migr_doctor (",
          "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
          "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
          "  name TEXT NOT NULL,",
          "  email TEXT,",
          "  phone TEXT,",
          "  role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'doctor')),",
          "  created_at TEXT NOT NULL,",
          "  updated_at TEXT NOT NULL",
          ");",
          "INSERT INTO staff_migr_doctor SELECT * FROM staff;",
          "DROP TABLE staff;",
          "ALTER TABLE staff_migr_doctor RENAME TO staff;",
        ].join("\n")
      );
      db.run("CREATE INDEX IF NOT EXISTS idx_staff_entity ON staff (entity_id);");
      try {
        db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_entity_email ON staff (entity_id, email)");
      } catch (e) {
        /* ignore */
      }
    } finally {
      db.run("PRAGMA foreign_keys = ON;");
    }
  }

  /** One Default Doctor per entity if none exists (after doctor role exists in schema). */
  function seedDefaultDoctorForAllEntities(db) {
    var entities = execAll(db, "SELECT id FROM entity");
    var t = nowIso();
    var i;
    for (i = 0; i < entities.length; i++) {
      var eid = entities[i].id;
      var doc = execAll(
        db,
        "SELECT COUNT(*) AS c FROM staff WHERE entity_id = ? AND role = 'doctor'",
        [eid]
      );
      if (!doc.length || Number(doc[0].c) > 0) continue;
      try {
        db.run(
          "INSERT INTO staff (entity_id, name, email, phone, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'doctor', ?, ?)",
          [eid, "Default Doctor", "doctor@local.invalid", null, t, t]
        );
      } catch (e) {
        /* role constraint missing — migration not applied */
      }
    }
  }

  /** docs/staff.md — staff table, app_state.current_staff_id, seed & repair */
  function runStaffMigrations(db) {
    db.run("PRAGMA foreign_keys = ON;");
    db.exec(
      [
        "CREATE TABLE IF NOT EXISTS staff (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  entity_id INTEGER NOT NULL REFERENCES entity (id) ON DELETE CASCADE,",
        "  name TEXT NOT NULL,",
        "  email TEXT,",
        "  phone TEXT,",
        "  role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'doctor')),",
        "  created_at TEXT NOT NULL,",
        "  updated_at TEXT NOT NULL",
        ");",
        "CREATE INDEX IF NOT EXISTS idx_staff_entity ON staff (entity_id);",
      ].join("\n")
    );
    try {
      db.run(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_entity_email ON staff (entity_id, email)"
      );
    } catch (e) {
      /* ignore */
    }
    try {
      db.run(
        "ALTER TABLE app_state ADD COLUMN current_staff_id INTEGER REFERENCES staff (id) ON DELETE SET NULL"
      );
    } catch (e) {
      /* duplicate column */
    }
    seedStaffForEmptyEntities(db);
    repairAppStateCurrentStaff(db);
  }

  function seedStaffForEmptyEntities(db) {
    var entities = execAll(db, "SELECT id FROM entity");
    var t = nowIso();
    var i;
    for (i = 0; i < entities.length; i++) {
      var eid = entities[i].id;
      var cnt = execAll(db, "SELECT COUNT(*) AS c FROM staff WHERE entity_id = ?", [eid]);
      if (!cnt.length || Number(cnt[0].c) !== 0) continue;
      db.run(
        "INSERT INTO staff (entity_id, name, email, phone, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', ?, ?)",
        [eid, "Default Admin", "admin@local.invalid", null, t, t]
      );
      db.run(
        "INSERT INTO staff (entity_id, name, email, phone, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'staff', ?, ?)",
        [eid, "Default Staff", "staff@local.invalid", null, t, t]
      );
      try {
        db.run(
          "INSERT INTO staff (entity_id, name, email, phone, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'doctor', ?, ?)",
          [eid, "Default Doctor", "doctor@local.invalid", null, t, t]
        );
      } catch (e) {
        /* older schema without doctor */
      }
    }
  }

  function repairAppStateCurrentStaff(db) {
    var t = nowIso();
    try {
      var rows = execAll(db, "SELECT current_entity_id, current_staff_id FROM app_state WHERE singleton = 1");
      if (!rows.length) return;
      var entId = rows[0].current_entity_id;
      var sid = rows[0].current_staff_id;
      if (entId == null) {
        if (sid != null) {
          db.run("UPDATE app_state SET current_staff_id = NULL, updated_at = ? WHERE singleton = 1", [t]);
        }
        return;
      }
      if (sid != null) {
        var ok = execAll(db, "SELECT id FROM staff WHERE id = ? AND entity_id = ?", [sid, entId]);
        if (ok.length) return;
      }
      var admin = execAll(
        db,
        "SELECT id FROM staff WHERE entity_id = ? AND role = 'admin' ORDER BY id LIMIT 1",
        [entId]
      );
      var newSid = admin.length ? admin[0].id : null;
      db.run("UPDATE app_state SET current_staff_id = ?, updated_at = ? WHERE singleton = 1", [newSid, t]);
    } catch (e) {
      /* app_state or staff missing */
    }
  }

  /** Older DB files: add columns introduced after v1. */
  function migrateEntityColumns(db) {
    var alters = [
      "ALTER TABLE entity ADD COLUMN auto_reorder_level INTEGER DEFAULT 50",
      "ALTER TABLE entity ADD COLUMN expiry_alert_days INTEGER DEFAULT 90",
      "ALTER TABLE entity ADD COLUMN accepted_payments TEXT",
      "ALTER TABLE entity ADD COLUMN terms_and_conditions TEXT",
      "ALTER TABLE entity ADD COLUMN invoice_format_json TEXT",
    ];
    alters.forEach(function (sql) {
      try {
        db.run(sql);
      } catch (e) {
        /* duplicate column name */
      }
    });
    runInventoryMigrations(db);
    migrateAppStateSyncColumns(db);
    migrateStaffDoctorRole(db);
    seedDefaultDoctorForAllEntities(db);
  }

  /** After restore from server blob, align local rev_seen with server `Rev` (see margReplaceLocalDatabaseBlob). */
  function applyPendingSyncRevFromSession(db) {
    if (typeof sessionStorage === "undefined") return;
    var raw;
    try {
      raw = sessionStorage.getItem("marg-sync-rev-pending");
    } catch (e) {
      return;
    }
    if (raw == null || raw === "") return;
    try {
      sessionStorage.removeItem("marg-sync-rev-pending");
    } catch (e2) {
      /* ignore */
    }
    var v = Math.max(0, Number(raw) || 0);
    try {
      db.run("UPDATE app_state SET sync_rev_seen = ?, updated_at = ? WHERE singleton = 1", [
        v,
        nowIso(),
      ]);
    } catch (e3) {
      /* ignore */
    }
  }

  /** Server sync settings (global, one SQLite file per browser). */
  function migrateAppStateSyncColumns(db) {
    db.run("PRAGMA foreign_keys = ON;");
    [
      "ALTER TABLE app_state ADD COLUMN sync_server_url TEXT",
      "ALTER TABLE app_state ADD COLUMN sync_username TEXT",
      "ALTER TABLE app_state ADD COLUMN sync_password TEXT",
      "ALTER TABLE app_state ADD COLUMN sync_auto INTEGER DEFAULT 0",
      "ALTER TABLE app_state ADD COLUMN sync_rev_seen INTEGER DEFAULT 0",
    ].forEach(function (sql) {
      try {
        db.run(sql);
      } catch (e) {
        /* duplicate column */
      }
    });
    applyPendingSyncRevFromSession(db);
  }

  function persist(db) {
    var data = db.export();
    return idbSetBuffer(data);
  }

  /**
   * @returns {Promise<{ db: import('sql.js').Database, save: () => Promise<void> }>}
   */
  function openDatabase() {
    if (typeof global.initSqlJs !== "function") {
      return Promise.reject(new Error("initSqlJs not loaded (include sql-wasm.js before db.js)"));
    }
    return global
      .initSqlJs({
        locateFile: function (file) {
          return "vendor/js/" + file;
        },
      })
      .then(function (SQL) {
        return idbGetBuffer().then(function (existing) {
          var db;
          if (existing && existing.byteLength) {
            db = new SQL.Database(new Uint8Array(existing));
            db.run("PRAGMA foreign_keys = ON;");
            migrateEntityColumns(db);
            return persist(db).then(function () {
              return {
                db: db,
                save: function () {
                  return persist(db);
                },
              };
            });
          }
          db = new SQL.Database();
          runMigrations(db);
          return persist(db).then(function () {
            return {
              db: db,
              save: function () {
                return persist(db);
              },
            };
          });
        });
      });
  }

  function execAll(db, sql, params) {
    var stmt = db.prepare(sql);
    if (params) {
      stmt.bind(params);
    }
    var rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  /**
   * Header discount: percentage (1–50, exclusive) or flat paise. Computes effective {@link discount_paise}
   * capped by line subtotal. Stores entered flat uncapped in {@link flat_paise} when not using percent.
   */
  function resolveShopOrderHeaderDiscount(header, lineSumPaise) {
    var sum = Math.max(0, Number(lineSumPaise) || 0);
    var pctRaw = header.order_header_discount_percent;
    var pct =
      pctRaw != null && pctRaw !== "" ? Number(pctRaw) : NaN;
    if (!isNaN(pct) && pct > 0) {
      var p = Math.min(50, Math.max(0, Math.round(pct)));
      var disc = Math.min(sum, Math.round((sum * p) / 100));
      return {
        discount_paise: disc,
        flat_paise: 0,
        percent: p,
      };
    }
    var flatRaw = header.order_header_discount_flat_paise;
    var flat =
      flatRaw != null && flatRaw !== "" ? Number(flatRaw) : NaN;
    if (isNaN(flat)) {
      flat = Math.max(0, Number(header.order_discount_paise) || 0);
    } else {
      flat = Math.max(0, flat);
    }
    return {
      discount_paise: Math.min(flat, sum),
      flat_paise: flat,
      percent: null,
    };
  }

  /** Next ORD-###### for entity: max numeric suffix among ORD-* digit rows + 1, then skip until unused. */
  function allocateNextShopOrderNumber(db, entityId) {
    var eid = Number(entityId);
    var rows = execAll(
      db,
      "SELECT order_number FROM shop_order WHERE entity_id = ? AND order_number IS NOT NULL AND TRIM(order_number) != ''",
      [eid]
    );
    var maxN = 0;
    var ordRe = /^ORD-(\d+)$/i;
    for (var i = 0; i < rows.length; i++) {
      var raw = rows[i].order_number != null ? String(rows[i].order_number).trim() : "";
      if (!raw) continue;
      var m = raw.match(ordRe);
      if (!m) continue;
      var n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maxN) maxN = n;
    }
    var candidate = maxN + 1;
    for (;;) {
      var label = "ORD-" + String(candidate).padStart(6, "0");
      var chk = execAll(
        db,
        "SELECT 1 AS x FROM shop_order WHERE entity_id = ? AND order_number = ? LIMIT 1",
        [eid, label]
      );
      if (!chk.length) return label;
      candidate++;
    }
  }

  /**
   * Keep available_count (full strips notionally on hand) aligned with tablet-level available_tabs.
   */
  function syncLotLineStripCountFromTabs(db, lineId) {
    var rows = execAll(
      db,
      [
        "SELECT ll.available_tabs, ll.quantity, p.units_per_strip",
        "FROM lot_line ll INNER JOIN product p ON p.id = ll.product_id",
        "WHERE ll.id = ?",
      ].join(" "),
      [Number(lineId)]
    );
    if (!rows.length) return;
    var tabsLeft = Math.max(0, Math.round(Number(rows[0].available_tabs) || 0));
    var qtyMax = Math.max(0, Math.round(Number(rows[0].quantity) || 0));
    var ups =
      rows[0].units_per_strip != null && rows[0].units_per_strip !== ""
        ? Number(rows[0].units_per_strip)
        : NaN;
    var stripEquiv =
      ups > 0 && !isNaN(ups) ? Math.ceil(tabsLeft / Math.round(ups)) : tabsLeft;
    if (qtyMax > 0) stripEquiv = Math.min(stripEquiv, qtyMax);
    var t = nowIso();
    db.run("UPDATE lot_line SET available_count = ?, updated_at = ? WHERE id = ?", [
      stripEquiv,
      t,
      Number(lineId),
    ]);
  }

  /**
   * FIFO by lot — deducts tablets from lot_line.available_tabs (order lines use tabs).
   */
  function decrementLotLinesAvailableTabsForProduct(db, entityId, productId, tabsNeeded) {
    var need = Math.round(Number(tabsNeeded));
    if (!(need > 0)) return;
    var t = nowIso();
    var remaining = need;
    var lotRows = execAll(
      db,
      [
        "SELECT ll.id, ll.available_tabs",
        "FROM lot_line ll",
        "INNER JOIN lot lo ON lo.id = ll.lot_id",
        "WHERE ll.product_id = ? AND lo.entity_id = ? AND ll.available_tabs > 0",
        "ORDER BY lo.created_at ASC, ll.id ASC",
      ].join(" "),
      [Number(productId), Number(entityId)]
    );
    var i;
    for (i = 0; i < lotRows.length && remaining > 0; i++) {
      var r = lotRows[i];
      var av = Number(r.available_tabs) || 0;
      if (av <= 0) continue;
      var take = Math.min(remaining, av);
      var newTabs = av - take;
      db.run("UPDATE lot_line SET available_tabs = ?, updated_at = ? WHERE id = ?", [
        newTabs,
        t,
        r.id,
      ]);
      syncLotLineStripCountFromTabs(db, r.id);
      remaining -= take;
    }
    if (remaining > 0) {
      throw new Error(
        "Insufficient stock (need " + need + " tablets from lots; short by " + remaining + ")"
      );
    }
  }

  /** Confirmed orders — deduct tablets (lot_line.available_tabs). */
  function applyConfirmedOrderToInventory(db, entityId, orderId) {
    var lines = execAll(
      db,
      "SELECT product_id, quantity FROM order_line WHERE order_id = ? ORDER BY id",
      [Number(orderId)]
    );
    var j;
    for (j = 0; j < lines.length; j++) {
      var ol = lines[j];
      var tabs = Number(ol.quantity);
      if (!(tabs > 0) || isNaN(tabs)) continue;
      decrementLotLinesAvailableTabsForProduct(db, entityId, ol.product_id, tabs);
    }
  }

  function MargDb(api) {
    this._db = api.db;
    this._save = api.save;
  }

  MargDb.prototype.save = function () {
    var self = this;
    return this._save().then(function () {
      if (typeof global.__margAfterLocalPersist === "function") {
        try {
          global.__margAfterLocalPersist(self);
        } catch (e) {
          /* ignore */
        }
      }
    });
  };

  /** Persist to IndexedDB only (no sync debounce hook) — used for sync metadata like rev_seen. */
  MargDb.prototype.persistSilent = function () {
    return this._save();
  };

  /**
   * Raw SQLite file bytes for upload to sync server (entire local DB).
   * @returns {Uint8Array}
   */
  MargDb.prototype.exportDatabaseBlob = function () {
    return this._db.export();
  };

  /**
   * @returns {{ serverUrl: string, username: string, password: string, autoSync: boolean }}
   */
  MargDb.prototype.getSyncSettings = function () {
    var rows = execAll(
      this._db,
      "SELECT sync_server_url, sync_username, sync_password, COALESCE(sync_auto, 0) AS sync_auto FROM app_state WHERE singleton = 1"
    );
    if (!rows.length) {
      return { serverUrl: "", username: "", password: "", autoSync: false };
    }
    var r = rows[0];
    return {
      serverUrl: r.sync_server_url ? String(r.sync_server_url) : "",
      username: r.sync_username ? String(r.sync_username) : "",
      password: r.sync_password != null ? String(r.sync_password) : "",
      autoSync: !!Number(r.sync_auto),
    };
  };

  /**
   * @param {{ serverUrl?: string, username?: string, password?: string, autoSync?: boolean }} opts
   * @returns {Promise<void>}
   */
  MargDb.prototype.setSyncSettings = function (opts) {
    var o = opts || {};
    var t = nowIso();
    var url = o.serverUrl != null ? String(o.serverUrl).trim() : "";
    var user = o.username != null ? String(o.username).trim() : "";
    var pass = o.password != null ? String(o.password) : "";
    var auto = o.autoSync ? 1 : 0;
    this._db.run(
      "UPDATE app_state SET sync_server_url = ?, sync_username = ?, sync_password = ?, sync_auto = ?, updated_at = ? WHERE singleton = 1",
      [url || null, user || null, pass || null, auto, t]
    );
    return this.save();
  };

  /** Last server revision this client believes it matched (for If-Match-Rev on blob push). */
  MargDb.prototype.getSyncRevSeen = function () {
    var rows = execAll(
      this._db,
      "SELECT COALESCE(sync_rev_seen, 0) AS r FROM app_state WHERE singleton = 1"
    );
    if (!rows.length) return 0;
    return Math.max(0, Number(rows[0].r) || 0);
  };

  /**
   * @param {number} n
   * @returns {Promise<void>}
   */
  MargDb.prototype.setSyncRevSeen = function (n) {
    var v = Math.max(0, Number(n) || 0);
    this._db.run("UPDATE app_state SET sync_rev_seen = ?, updated_at = ? WHERE singleton = 1", [
      v,
      nowIso(),
    ]);
    return this.persistSilent();
  };

  MargDb.prototype.listEntities = function () {
    return execAll(
      this._db,
      "SELECT id, entity_name, updated_at FROM entity ORDER BY updated_at DESC"
    );
  };

  MargDb.prototype.getEntityCount = function () {
    var r = this._db.exec("SELECT COUNT(*) AS c FROM entity");
    if (!r.length || !r[0].values.length) return 0;
    return r[0].values[0][0];
  };

  MargDb.prototype.createEntity = function (entityName) {
    var name = (entityName || "").trim();
    if (!name) {
      return Promise.reject(new Error("Entity name is required"));
    }
    var self = this;
    var t = nowIso();
    var key = randomSessionKey();
    this._db.run(
      "INSERT INTO entity (entity_name, session_key, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [name, key, t, t]
    );
    var idRow = this._db.exec("SELECT last_insert_rowid() AS id");
    var id = idRow[0].values[0][0];
    this._db.run("UPDATE app_state SET current_entity_id = ?, updated_at = ? WHERE singleton = 1", [
      id,
      t,
    ]);
    return this.save()
      .then(function () {
        return self.ensureDefaultStaffForEntity(id);
      })
      .then(function () {
        return self.syncCurrentStaffForActiveEntity();
      })
      .then(function () {
        return id;
      });
  };

  MargDb.prototype.selectEntity = function (entityId) {
    var self = this;
    var t = nowIso();
    this._db.run("UPDATE entity SET updated_at = ? WHERE id = ?", [t, entityId]);
    this._db.run("UPDATE app_state SET current_entity_id = ?, updated_at = ? WHERE singleton = 1", [
      entityId,
      t,
    ]);
    return this.save()
      .then(function () {
        return self.ensureDefaultStaffForEntity(entityId);
      })
      .then(function () {
        return self.syncCurrentStaffForActiveEntity();
      });
  };

  MargDb.prototype.getCurrentEntityId = function () {
    var r = execAll(this._db, "SELECT current_entity_id FROM app_state WHERE singleton = 1");
    if (!r.length || r[0].current_entity_id == null) return null;
    return r[0].current_entity_id;
  };

  MargDb.prototype.getEntityById = function (id) {
    var rows = execAll(this._db, "SELECT id, entity_name FROM entity WHERE id = ?", [id]);
    return rows.length ? rows[0] : null;
  };

  /** Full row for current entity (setup form). */
  MargDb.prototype.getCurrentEntity = function () {
    var id = this.getCurrentEntityId();
    if (id == null) return null;
    var rows = execAll(this._db, "SELECT * FROM entity WHERE id = ?", [id]);
    return rows.length ? rows[0] : null;
  };

  /**
   * Terms & conditions shown on printed invoices (per entity).
   * @param {string|null} text
   * @returns {Promise<void>}
   */
  MargDb.prototype.updateEntityTermsAndConditions = function (text) {
    var id = this.getCurrentEntityId();
    if (id == null) {
      return Promise.reject(new Error("No active entity"));
    }
    var t = nowIso();
    var v = text != null ? String(text) : null;
    this._db.run("UPDATE entity SET terms_and_conditions = ?, updated_at = ? WHERE id = ?", [v, t, id]);
    return this.save();
  };

  /** @returns {object} merged invoice print options (see MargInvoiceFormatDefaults). */
  MargDb.prototype.getInvoiceFormatOptions = function () {
    var row = this.getCurrentEntity();
    if (typeof global.MargInvoiceFormatDefaults !== "undefined" && MargInvoiceFormatDefaults.merge) {
      return MargInvoiceFormatDefaults.merge(row);
    }
    return {
      designTemplate: "gst",
      printColorMode: "color",
      paperSize: "a4",
      customPaperWidthMm: 210,
      customPaperHeightMm: 297,
      documentTitle: "Sales invoice",
      showBillTo: true,
      showSummaryBox: true,
      showLineSchedule: true,
      showLineNotes: true,
      showProductCode: true,
      showOrderNotes: true,
      showTerms: true,
      showInvoiceStatus: true,
      showShopPhone: true,
      showShopGstin: true,
      showShopDl: true,
      showGeneratedFooter: true,
      showQrCode: true,
      customFooterLine: "",
    };
  };

  /**
   * v2 state: { v, activeFormatId, customFormats } — see MargInvoiceFormatDefaults.
   * @returns {object}
   */
  MargDb.prototype.getInvoiceFormatState = function () {
    var row = this.getCurrentEntity();
    if (typeof global.MargInvoiceFormatDefaults !== "undefined" && MargInvoiceFormatDefaults.parseState) {
      var state = MargInvoiceFormatDefaults.parseState(row);
      return MargInvoiceFormatDefaults.prepareStateForSave(state);
    }
    return { v: 2, activeFormatId: "builtin-gst-pharmacy", customFormats: [] };
  };

  /**
   * Persist legacy flat invoice_format_json as v2 (call once after open).
   * @returns {Promise<void>}
   */
  MargDb.prototype.persistInvoiceFormatIfMigrated = function () {
    var id = this.getCurrentEntityId();
    if (id == null) {
      return Promise.resolve();
    }
    var row = this.getCurrentEntity();
    if (
      typeof global.MargInvoiceFormatDefaults === "undefined" ||
      !MargInvoiceFormatDefaults.isLegacyInvoiceFormatRow ||
      !MargInvoiceFormatDefaults.isLegacyInvoiceFormatRow(row)
    ) {
      return Promise.resolve();
    }
    var state = MargInvoiceFormatDefaults.parseState(row);
    var json = JSON.stringify(MargInvoiceFormatDefaults.prepareStateForSave(state));
    var t = nowIso();
    this._db.run("UPDATE entity SET invoice_format_json = ?, updated_at = ? WHERE id = ?", [json, t, id]);
    return this.save();
  };

  /**
   * @param {object} state — v2 state
   * @returns {Promise<void>}
   */
  MargDb.prototype.setInvoiceFormatState = function (state) {
    var id = this.getCurrentEntityId();
    if (id == null) {
      return Promise.reject(new Error("No active entity"));
    }
    var t = nowIso();
    var prep =
      typeof global.MargInvoiceFormatDefaults !== "undefined" && MargInvoiceFormatDefaults.prepareStateForSave
        ? MargInvoiceFormatDefaults.prepareStateForSave(state)
        : state;
    var json = JSON.stringify(prep);
    this._db.run("UPDATE entity SET invoice_format_json = ?, updated_at = ? WHERE id = ?", [json, t, id]);
    return this.save();
  };

  /**
   * @param {string} formatId — builtin-* or cf_*
   * @returns {Promise<void>}
   */
  MargDb.prototype.setActiveInvoiceFormat = function (formatId) {
    var state = this.getInvoiceFormatState();
    state.activeFormatId = formatId;
    return this.setInvoiceFormatState(state);
  };

  /**
   * @param {{ id?: string, name: string, options: object }} payload — omit id to create
   * @returns {Promise<void>}
   */
  MargDb.prototype.saveCustomInvoiceFormat = function (payload) {
    if (typeof global.MargInvoiceFormatDefaults === "undefined") {
      return Promise.reject(new Error("MargInvoiceFormatDefaults not loaded"));
    }
    var state = this.getInvoiceFormatState();
    var id = payload.id || MargInvoiceFormatDefaults.newCustomFormatId();
    var name = payload.name && String(payload.name).trim() ? String(payload.name).trim() : "Custom format";
    var options = MargInvoiceFormatDefaults.normalizeOptions(payload.options);
    var list = state.customFormats || [];
    var idx = -1;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        idx = i;
        break;
      }
    }
    var entry = { id: id, name: name, options: options };
    if (idx >= 0) {
      list[idx] = entry;
    } else {
      list.push(entry);
    }
    state.customFormats = list;
    state.activeFormatId = id;
    return this.setInvoiceFormatState(state);
  };

  /**
   * Copy options from any format into a new custom format and make it active.
   * @param {string} sourceFormatId
   * @param {string} newName
   * @returns {Promise<void>}
   */
  MargDb.prototype.duplicateInvoiceFormatAsNew = function (sourceFormatId, newName) {
    if (typeof global.MargInvoiceFormatDefaults === "undefined") {
      return Promise.reject(new Error("MargInvoiceFormatDefaults not loaded"));
    }
    var state = this.getInvoiceFormatState();
    var opts = MargInvoiceFormatDefaults.resolveOptionsForFormatId(state, sourceFormatId);
    var name = newName && String(newName).trim() ? String(newName).trim() : "New format";
    var id = MargInvoiceFormatDefaults.newCustomFormatId();
    state.customFormats = state.customFormats || [];
    state.customFormats.push({ id: id, name: name, options: MargInvoiceFormatDefaults.normalizeOptions(opts) });
    state.activeFormatId = id;
    return this.setInvoiceFormatState(state);
  };

  /**
   * @param {string} formatId — cf_* only
   * @returns {Promise<void>}
   */
  MargDb.prototype.deleteCustomInvoiceFormat = function (formatId) {
    if (typeof global.MargInvoiceFormatDefaults === "undefined") {
      return Promise.reject(new Error("MargInvoiceFormatDefaults not loaded"));
    }
    if (MargInvoiceFormatDefaults.isBuiltinId(formatId)) {
      return Promise.reject(new Error("Cannot delete a built-in preset."));
    }
    var state = this.getInvoiceFormatState();
    state.customFormats = (state.customFormats || []).filter(function (c) {
      return c.id !== formatId;
    });
    if (state.activeFormatId === formatId) {
      state.activeFormatId = "builtin-gst-pharmacy";
    }
    return this.setInvoiceFormatState(state);
  };

  /**
   * Update options for the **active** format only when it is a custom format.
   * @param {object} obj — invoice format flags / strings
   * @returns {Promise<void>}
   */
  MargDb.prototype.updateInvoiceFormatOptions = function (obj) {
    if (typeof global.MargInvoiceFormatDefaults === "undefined") {
      return Promise.reject(new Error("MargInvoiceFormatDefaults not loaded"));
    }
    var state = this.getInvoiceFormatState();
    var activeId = state.activeFormatId;
    if (MargInvoiceFormatDefaults.isBuiltinId(activeId)) {
      return Promise.reject(
        new Error("Built-in presets cannot be overwritten. Use “Save as new” to create a custom format.")
      );
    }
    var list = state.customFormats || [];
    var cf = null;
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === activeId) {
        cf = list[i];
        break;
      }
    }
    if (!cf) {
      return Promise.reject(new Error("Active custom format not found."));
    }
    cf.options = MargInvoiceFormatDefaults.normalizeOptions(obj);
    return this.setInvoiceFormatState(state);
  };

  /**
   * Apply one row from Excel sheet "Entity" onto the current entity (full profile merge).
   * Missing columns keep existing values; empty cells clear optional text fields.
   * @param {object} raw — row object (header keys from sheet)
   * @returns {Promise<void>}
   */
  MargDb.prototype.applyEntityExcelRow = function (raw) {
    var id = this.getCurrentEntityId();
    if (id == null) {
      return Promise.reject(new Error("No active entity"));
    }
    function normKey(o) {
      var out = {};
      Object.keys(o || {}).forEach(function (k) {
        var nk = String(k)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_");
        out[nk] = o[k];
      });
      return out;
    }
    var r = normKey(raw);
    var ent = this.getCurrentEntity();
    if (!ent) {
      return Promise.reject(new Error("Current entity row not found."));
    }

    function pickMerged(key) {
      if (r[key] === undefined) return ent[key] != null ? ent[key] : null;
      if (r[key] === null) return null;
      if (typeof r[key] === "string" && r[key].trim() === "") return null;
      return String(r[key]).trim();
    }

    var name =
      r.entity_name != null && String(r.entity_name).trim()
        ? String(r.entity_name).trim()
        : String(ent.entity_name || "").trim();
    if (!name) {
      return Promise.reject(new Error("Entity row: entity_name is empty and current entity has no name."));
    }
    var others = execAll(this._db, "SELECT id FROM entity WHERE entity_name = ? AND id != ?", [name, id]);
    if (others.length) {
      return Promise.reject(
        new Error('Entity row: name "' + name + '" is already used by another shop in this database.')
      );
    }

    var arl =
      r.auto_reorder_level !== undefined && r.auto_reorder_level !== null && String(r.auto_reorder_level).trim() !== ""
        ? parseInt(String(r.auto_reorder_level), 10)
        : ent.auto_reorder_level != null
          ? Number(ent.auto_reorder_level)
          : 50;
    var ead =
      r.expiry_alert_days !== undefined && r.expiry_alert_days !== null && String(r.expiry_alert_days).trim() !== ""
        ? parseInt(String(r.expiry_alert_days), 10)
        : ent.expiry_alert_days != null
          ? Number(ent.expiry_alert_days)
          : 90;
    if (isNaN(arl) || arl < 0) arl = 50;
    if (isNaN(ead) || ead < 0) ead = 90;

    var payJson = ent.accepted_payments || '["cash"]';
    var payRaw = r.accepted_payments_json != null ? r.accepted_payments_json : r.accepted_payments;
    if (payRaw !== undefined && payRaw !== null && String(payRaw).trim() !== "") {
      var ps = String(payRaw).trim();
      try {
        JSON.parse(ps);
        payJson = ps;
      } catch (e) {
        return Promise.reject(new Error("Entity row: accepted_payments / accepted_payments_json must be valid JSON."));
      }
    }

    var invJson = ent.invoice_format_json;
    if (r.invoice_format_json !== undefined && r.invoice_format_json !== null && String(r.invoice_format_json).trim() !== "") {
      var ij = String(r.invoice_format_json).trim();
      try {
        JSON.parse(ij);
        invJson = ij;
      } catch (e) {
        return Promise.reject(new Error("Entity row: invoice_format_json must be valid JSON."));
      }
    }

    var terms = ent.terms_and_conditions;
    if (r.terms_and_conditions !== undefined && r.terms_and_conditions !== null) {
      terms = String(r.terms_and_conditions);
    }

    var countryMerged = pickMerged("country");
    var countryVal =
      countryMerged != null && String(countryMerged).trim() !== ""
        ? String(countryMerged).trim()
        : ent.country || "India";

    var t = nowIso();
    this._db.run(
      [
        "UPDATE entity SET",
        "entity_name = ?, legal_name = ?, proprietor_name = ?, phone = ?, alternate_phone = ?,",
        "email = ?, website = ?, line1 = ?, line2 = ?, city = ?, state = ?, pincode = ?, country = ?,",
        "dl_number = ?, dl_valid_from = ?, dl_valid_to = ?, gstin = ?, pan = ?, tagline = ?,",
        "default_currency = ?, default_timezone = ?, invoice_prefix = ?, notes = ?,",
        "auto_reorder_level = ?, expiry_alert_days = ?, accepted_payments = ?, invoice_format_json = ?,",
        "terms_and_conditions = ?, updated_at = ? WHERE id = ?",
      ].join(" "),
      [
        name,
        pickMerged("legal_name"),
        pickMerged("proprietor_name"),
        pickMerged("phone"),
        pickMerged("alternate_phone"),
        pickMerged("email"),
        pickMerged("website"),
        pickMerged("line1"),
        pickMerged("line2"),
        pickMerged("city"),
        pickMerged("state"),
        pickMerged("pincode"),
        countryVal,
        pickMerged("dl_number"),
        pickMerged("dl_valid_from"),
        pickMerged("dl_valid_to"),
        pickMerged("gstin"),
        pickMerged("pan"),
        pickMerged("tagline"),
        pickMerged("default_currency"),
        pickMerged("default_timezone"),
        pickMerged("invoice_prefix"),
        pickMerged("notes"),
        arl,
        ead,
        payJson,
        invJson,
        terms,
        t,
        id,
      ]
    );
    return this.save();
  };

  MargDb.prototype.updateEntitySetup = function (fields) {
    var id = this.getCurrentEntityId();
    if (id == null) {
      return Promise.reject(new Error("No active entity"));
    }
    var t = nowIso();
    var pay = Array.isArray(fields.accepted_payments) ? fields.accepted_payments : ["cash"];
    pay = pay.filter(function (p) {
      return p === "cash";
    });
    if (!pay.length) pay = ["cash"];
    var paymentsJson = JSON.stringify(pay);
    this._db.run(
      [
        "UPDATE entity SET",
        "entity_name = ?,",
        "dl_number = ?,",
        "line1 = ?,",
        "updated_at = ?,",
        "auto_reorder_level = ?,",
        "expiry_alert_days = ?,",
        "accepted_payments = ?",
        "WHERE id = ?",
      ].join(" "),
      [
        fields.entity_name,
        fields.dl_number != null ? String(fields.dl_number) : null,
        fields.line1 != null ? String(fields.line1) : null,
        t,
        Number(fields.auto_reorder_level) || 0,
        Number(fields.expiry_alert_days) || 0,
        paymentsJson,
        id,
      ]
    );
    return this.save();
  };

  /** Rough 0–100 score from filled setup fields (for progress UI). */
  MargDb.prototype.getEntitySetupProgress = function () {
    var row = this.getCurrentEntity();
    if (!row) return 0;
    var score = 18;
    if (row.entity_name && String(row.entity_name).trim()) score += 14;
    if (row.dl_number && String(row.dl_number).trim()) score += 14;
    if (row.line1 && String(row.line1).trim()) score += 14;
    if (row.auto_reorder_level != null && String(row.auto_reorder_level) !== "") score += 12;
    if (row.expiry_alert_days != null && String(row.expiry_alert_days) !== "") score += 12;
    try {
      var pay = row.accepted_payments ? JSON.parse(row.accepted_payments) : [];
      if (pay && pay.length) score += 16;
    } catch (e) {
      /* ignore */
    }
    return Math.min(100, score);
  };

  MargDb.prototype.requireEntityId = function () {
    var id = this.getCurrentEntityId();
    if (id == null) throw new Error("No active entity");
    return id;
  };

  /** docs/staff.md — default admin + staff + doctor when entity has no staff rows */
  MargDb.prototype.ensureDefaultStaffForEntity = function (entityId) {
    var eid = Number(entityId);
    if (!eid) {
      return Promise.reject(new Error("Invalid entity"));
    }
    var cnt = execAll(this._db, "SELECT COUNT(*) AS c FROM staff WHERE entity_id = ?", [eid]);
    if (cnt.length && Number(cnt[0].c) > 0) {
      return Promise.resolve();
    }
    var t = nowIso();
    this._db.run(
      "INSERT INTO staff (entity_id, name, email, phone, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', ?, ?)",
      [eid, "Default Admin", "admin@local.invalid", null, t, t]
    );
    this._db.run(
      "INSERT INTO staff (entity_id, name, email, phone, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'staff', ?, ?)",
      [eid, "Default Staff", "staff@local.invalid", null, t, t]
    );
    try {
      this._db.run(
        "INSERT INTO staff (entity_id, name, email, phone, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'doctor', ?, ?)",
        [eid, "Default Doctor", "doctor@local.invalid", null, t, t]
      );
    } catch (e) {
      /* older DB without doctor role */
    }
    return this.save();
  };

  /** Align current_staff_id with current_entity_id (after login / switch entity). */
  MargDb.prototype.syncCurrentStaffForActiveEntity = function () {
    var entId = this.getCurrentEntityId();
    var t = nowIso();
    if (entId == null) {
      try {
        this._db.run("UPDATE app_state SET current_staff_id = NULL, updated_at = ? WHERE singleton = 1", [t]);
      } catch (e) {
        /* column missing */
      }
      return this.save();
    }
    var sidRows = execAll(this._db, "SELECT current_staff_id FROM app_state WHERE singleton = 1");
    var sid = sidRows.length ? sidRows[0].current_staff_id : null;
    if (sid != null) {
      var ok = execAll(this._db, "SELECT id FROM staff WHERE id = ? AND entity_id = ?", [sid, entId]);
      if (ok.length) {
        return Promise.resolve();
      }
    }
    var admin = execAll(
      this._db,
      "SELECT id FROM staff WHERE entity_id = ? AND role = 'admin' ORDER BY id LIMIT 1",
      [entId]
    );
    var newSid = admin.length ? admin[0].id : null;
    this._db.run("UPDATE app_state SET current_staff_id = ?, updated_at = ? WHERE singleton = 1", [newSid, t]);
    return this.save();
  };

  MargDb.prototype.getCurrentStaffId = function () {
    try {
      var rows = execAll(this._db, "SELECT current_staff_id FROM app_state WHERE singleton = 1");
      if (!rows.length || rows[0].current_staff_id == null) return null;
      return Number(rows[0].current_staff_id);
    } catch (e) {
      return null;
    }
  };

  /** @returns {object|null} staff row for active entity, or null */
  MargDb.prototype.getCurrentStaff = function () {
    var sid = this.getCurrentStaffId();
    if (sid == null) return null;
    var eid = this.getCurrentEntityId();
    if (eid == null) return null;
    var rows = execAll(this._db, "SELECT * FROM staff WHERE id = ? AND entity_id = ?", [sid, eid]);
    return rows.length ? rows[0] : null;
  };

  /**
   * @param {number|null} staffId — must belong to current entity, or null to clear
   * @returns {Promise<void>}
   */
  MargDb.prototype.setCurrentStaffId = function (staffId) {
    var eid = this.requireEntityId();
    var t = nowIso();
    if (staffId == null) {
      this._db.run("UPDATE app_state SET current_staff_id = NULL, updated_at = ? WHERE singleton = 1", [t]);
      return this.save();
    }
    var id = Number(staffId);
    var rows = execAll(this._db, "SELECT id FROM staff WHERE id = ? AND entity_id = ?", [id, eid]);
    if (!rows.length) {
      return Promise.reject(new Error("Staff member not found for this entity"));
    }
    this._db.run("UPDATE app_state SET current_staff_id = ?, updated_at = ? WHERE singleton = 1", [id, t]);
    return this.save();
  };

  /**
   * @param {number} [entityId] — defaults to active entity
   * @returns {Array<object>}
   */
  MargDb.prototype.listStaff = function (entityId) {
    var eid = entityId != null ? Number(entityId) : this.requireEntityId();
    return execAll(
      this._db,
      "SELECT * FROM staff WHERE entity_id = ? ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'doctor' THEN 1 ELSE 2 END, name COLLATE NOCASE",
      [eid]
    );
  };

  MargDb.prototype.getStaff = function (id) {
    var eid = this.requireEntityId();
    var rows = execAll(this._db, "SELECT * FROM staff WHERE id = ? AND entity_id = ?", [Number(id), eid]);
    return rows.length ? rows[0] : null;
  };

  MargDb.prototype._countAdminsForEntity = function (entityId) {
    var r = execAll(
      this._db,
      "SELECT COUNT(*) AS c FROM staff WHERE entity_id = ? AND role = 'admin'",
      [entityId]
    );
    return r.length ? Number(r[0].c) : 0;
  };

  /**
   * @param {{ name: string, email?: string, phone?: string, role: 'admin'|'staff'|'doctor' }} row
   * @returns {Promise<number>} new id
   */
  MargDb.prototype.insertStaff = function (row) {
    var eid = this.requireEntityId();
    if (!row || !String(row.name || "").trim()) {
      return Promise.reject(new Error("Name is required"));
    }
    var role = normalizeStaffRole(row.role);
    var email = row.email != null && String(row.email).trim() ? String(row.email).trim() : null;
    if (email) {
      var dup = execAll(
        this._db,
        "SELECT id FROM staff WHERE entity_id = ? AND email = ?",
        [eid, email]
      );
      if (dup.length) {
        return Promise.reject(new Error("Email already used by another staff member"));
      }
    }
    var t = nowIso();
    this._db.run(
      "INSERT INTO staff (entity_id, name, email, phone, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [eid, String(row.name).trim(), email, row.phone != null && String(row.phone).trim() ? String(row.phone).trim() : null, role, t, t]
    );
    var newId = this._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
    return this.save().then(function () {
      return newId;
    });
  };

  /**
   * @param {number} id
   * @param {{ name?: string, email?: string, phone?: string, role?: 'admin'|'staff'|'doctor' }} partial
   * @returns {Promise<void>}
   */
  MargDb.prototype.updateStaff = function (id, partial) {
    var eid = this.requireEntityId();
    var existing = this.getStaff(id);
    if (!existing) {
      return Promise.reject(new Error("Staff not found"));
    }
    var t = nowIso();
    var name = partial.name != null ? String(partial.name).trim() : existing.name;
    if (!name) {
      return Promise.reject(new Error("Name is required"));
    }
    var email =
      partial.email !== undefined
        ? partial.email != null && String(partial.email).trim()
          ? String(partial.email).trim()
          : null
        : existing.email;
    var phone =
      partial.phone !== undefined
        ? partial.phone != null && String(partial.phone).trim()
          ? String(partial.phone).trim()
          : null
        : existing.phone;
    var role = partial.role != null ? normalizeStaffRole(partial.role) : existing.role;

    if (email && email !== existing.email) {
      var dup = execAll(
        this._db,
        "SELECT id FROM staff WHERE entity_id = ? AND email = ? AND id != ?",
        [eid, email, id]
      );
      if (dup.length) {
        return Promise.reject(new Error("Email already used by another staff member"));
      }
    }

    if (existing.role === "admin" && role !== "admin" && this._countAdminsForEntity(eid) <= 1) {
      return Promise.reject(new Error("Cannot remove the only admin"));
    }

    this._db.run(
      "UPDATE staff SET name = ?, email = ?, phone = ?, role = ?, updated_at = ? WHERE id = ? AND entity_id = ?",
      [name, email, phone, role, t, id, eid]
    );
    return this.save();
  };

  /** @returns {Promise<void>} */
  MargDb.prototype.deleteStaff = function (id) {
    var eid = this.requireEntityId();
    var existing = this.getStaff(id);
    if (!existing) {
      return Promise.reject(new Error("Staff not found"));
    }
    if (existing.role === "admin" && this._countAdminsForEntity(eid) <= 1) {
      return Promise.reject(new Error("Cannot delete the only admin"));
    }
    this._db.run("DELETE FROM staff WHERE id = ? AND entity_id = ?", [id, eid]);
    return this.save();
  };

  /**
   * Upsert staff rows from Excel "Staff" sheet or CommonDetails JSON (same rules).
   * @param {Array<object>} staffArray
   * @returns {Promise<void>}
   */
  MargDb.prototype.applyStaffImportRows = function (staffArray) {
    var self = this;
    if (!Array.isArray(staffArray) || !staffArray.length) {
      return Promise.resolve();
    }
    return staffArray.reduce(function (p, s) {
      return p.then(function () {
        var role = normalizeStaffRole(s.role);
        var nm = (s.name || "").trim();
        if (!nm) return Promise.resolve();
        var email = s.email != null && String(s.email).trim() ? String(s.email).trim() : null;
        var phone = s.phone != null && String(s.phone).trim() ? String(s.phone).trim() : null;
        var existingById = s.id != null ? self.getStaff(Number(s.id)) : null;
        if (existingById) {
          return self.updateStaff(Number(s.id), {
            name: nm,
            email: email,
            phone: phone,
            role: role,
          });
        }
        var list = self.listStaff();
        var match = null;
        var i;
        if (email) {
          var el = email.toLowerCase();
          for (i = 0; i < list.length; i++) {
            if (list[i].email && String(list[i].email).trim().toLowerCase() === el) {
              match = list[i];
              break;
            }
          }
        }
        if (match) {
          return self.updateStaff(match.id, {
            name: nm,
            email: email,
            phone: phone,
            role: role,
          });
        }
        return self.insertStaff({ name: nm, email: email, phone: phone, role: role }).then(function () {});
      });
    }, Promise.resolve());
  };

  /**
   * Merge Excel "CommonDetails" sheet JSON: entity profile + staff (delegates to applyEntityExcelRow + applyStaffImportRows).
   * @param {{ entity?: object, staff?: Array<object> }} snap
   * @returns {Promise<void>}
   */
  MargDb.prototype.applyCommonDetailsSnapshot = function (snap) {
    if (!snap || typeof snap !== "object") {
      return Promise.reject(new Error("Invalid snapshot"));
    }
    if (!this.getCurrentEntity()) {
      return Promise.reject(new Error("No current entity"));
    }
    var self = this;
    var chain = Promise.resolve();
    if (snap.entity && typeof snap.entity === "object") {
      chain = chain.then(function () {
        return self.applyEntityExcelRow(snap.entity);
      });
    }
    if (snap.staff && Array.isArray(snap.staff) && snap.staff.length) {
      chain = chain.then(function () {
        return self.applyStaffImportRows(snap.staff);
      });
    }
    return chain.then(function () {
      return self.syncCurrentStaffForActiveEntity();
    });
  };

  /**
   * @param {string} [q] — search name/code/barcode
   * @param {'active'|'inactive'|'all'} [statusFilter] — default 'active' (only active rows)
   */
  MargDb.prototype.listProducts = function (q, statusFilter) {
    var eid = this.requireEntityId();
    var sf = statusFilter || "active";
    var sql =
      "SELECT p.*, pt.label AS product_type_label, " +
      "(SELECT COALESCE(SUM(ll.available_tabs), 0) FROM lot_line ll " +
      "INNER JOIN lot lo ON lo.id = ll.lot_id WHERE ll.product_id = p.id AND lo.entity_id = p.entity_id) AS stock_on_hand " +
      "FROM product p LEFT JOIN product_type pt ON pt.id = p.product_type_id WHERE p.entity_id = ?";
    var params = [eid];
    if (sf === "active") {
      sql += " AND p.is_active = 1";
    } else if (sf === "inactive") {
      sql += " AND p.is_active = 0";
    }
    if (q && String(q).trim()) {
      sql +=
        " AND (p.name LIKE ? OR IFNULL(p.code,'') LIKE ? OR IFNULL(p.barcode,'') LIKE ? OR IFNULL(pt.label,'') LIKE ?)";
      var like = "%" + q.trim() + "%";
      params.push(like, like, like, like);
    }
    sql += " ORDER BY p.name COLLATE NOCASE";
    return execAll(this._db, sql, params);
  };

  MargDb.prototype.getProduct = function (id) {
    var eid = this.requireEntityId();
    var rows = execAll(
      this._db,
      "SELECT p.*, pt.label AS product_type_label, " +
        "(SELECT COALESCE(SUM(ll.available_tabs), 0) FROM lot_line ll " +
        "INNER JOIN lot lo ON lo.id = ll.lot_id WHERE ll.product_id = p.id AND lo.entity_id = p.entity_id) AS stock_on_hand " +
        "FROM product p LEFT JOIN product_type pt ON pt.id = p.product_type_id WHERE p.id = ? AND p.entity_id = ?",
      [id, eid]
    );
    return rows.length ? rows[0] : null;
  };

  /**
   * Latest lot_line selling price for this product in the current entity (by lot_line.id desc).
   * @param {number} productId
   * @returns {number} paise, or 0 if none
   */
  MargDb.prototype.getLatestStripSellingPricePaise = function (productId) {
    var eid = this.requireEntityId();
    var rows = execAll(
      this._db,
      [
        "SELECT ll.selling_price_paise FROM lot_line ll",
        "INNER JOIN lot lo ON lo.id = ll.lot_id",
        "WHERE ll.product_id = ? AND lo.entity_id = ?",
        "ORDER BY ll.id DESC LIMIT 1",
      ].join(" "),
      [Number(productId), eid]
    );
    if (!rows.length) return 0;
    return Number(rows[0].selling_price_paise) || 0;
  };

  /**
   * Total tablets on hand (sum of lot_line.available_tabs for current entity).
   * @param {number} productId
   * @returns {number}
   */
  MargDb.prototype.getProductStockOnHand = function (productId) {
    var eid = this.requireEntityId();
    var rows = execAll(
      this._db,
      [
        "SELECT COALESCE(SUM(ll.available_tabs), 0) AS q",
        "FROM lot_line ll",
        "INNER JOIN lot lo ON lo.id = ll.lot_id",
        "WHERE ll.product_id = ? AND lo.entity_id = ?",
      ].join(" "),
      [Number(productId), eid]
    );
    if (!rows.length) return 0;
    return Number(rows[0].q) || 0;
  };

  /**
   * Purchase lot lines for this product (newest lots first).
   * @param {number} productId
   * @returns {Array<object>}
   */
  MargDb.prototype.listLotLinesForProduct = function (productId) {
    var eid = this.requireEntityId();
    if (!this.getProduct(productId)) return [];
    return execAll(
      this._db,
      [
        "SELECT ll.id, ll.quantity, ll.strips_per_pack, ll.available_count, ll.available_tabs, ll.selling_price_paise, ll.delivered_on, ll.line_notes,",
        "lo.id AS lot_id, lo.lot_number, lo.delivered_date, lo.lot_date, v.name AS vendor_name",
        "FROM lot_line ll",
        "INNER JOIN lot lo ON lo.id = ll.lot_id",
        "LEFT JOIN vendor v ON v.id = lo.vendor_id",
        "WHERE ll.product_id = ? AND lo.entity_id = ?",
        "ORDER BY lo.created_at DESC, ll.id DESC",
      ].join(" "),
      [Number(productId), eid]
    );
  };

  MargDb.prototype.insertProduct = function (p) {
    var eid = this.requireEntityId();
    var t = nowIso();
    this._db.run(
      [
        "INSERT INTO product (entity_id, name, code, barcode, pack_label, units_per_strip,",
        "description, chemical_composition, general_recommendation, where_to_use, product_type_id, is_active, created_at, updated_at)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
      ].join(" "),
      [
        eid,
        p.name,
        p.code || null,
        p.barcode || null,
        p.pack_label || null,
        p.units_per_strip != null ? Number(p.units_per_strip) : null,
        p.description || null,
        p.chemical_composition || null,
        p.general_recommendation || null,
        p.where_to_use || null,
        p.product_type_id != null && p.product_type_id !== "" ? Number(p.product_type_id) : null,
        t,
        t,
      ]
    );
    var newId = this._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
    return this.save().then(function () {
      return newId;
    });
  };

  MargDb.prototype.updateProduct = function (id, p) {
    var eid = this.requireEntityId();
    var t = nowIso();
    this._db.run(
      [
        "UPDATE product SET name = ?, code = ?, barcode = ?, pack_label = ?, units_per_strip = ?,",
        "description = ?, chemical_composition = ?, general_recommendation = ?, where_to_use = ?, product_type_id = ?, updated_at = ?",
        "WHERE id = ? AND entity_id = ?",
      ].join(" "),
      [
        p.name,
        p.code || null,
        p.barcode || null,
        p.pack_label || null,
        p.units_per_strip != null ? Number(p.units_per_strip) : null,
        p.description || null,
        p.chemical_composition || null,
        p.general_recommendation || null,
        p.where_to_use || null,
        p.product_type_id != null && p.product_type_id !== "" ? Number(p.product_type_id) : null,
        t,
        id,
        eid,
      ]
    );
    return this.save();
  };

  MargDb.prototype.deactivateProduct = function (id) {
    var eid = this.requireEntityId();
    var t = nowIso();
    this._db.run("UPDATE product SET is_active = 0, updated_at = ? WHERE id = ? AND entity_id = ?", [
      t,
      id,
      eid,
    ]);
    return this.save();
  };

  MargDb.prototype.activateProduct = function (id) {
    var eid = this.requireEntityId();
    var t = nowIso();
    this._db.run("UPDATE product SET is_active = 1, updated_at = ? WHERE id = ? AND entity_id = ?", [
      t,
      id,
      eid,
    ]);
    return this.save();
  };

  var DEFAULT_PRODUCT_TYPES = ["syrup", "tab", "injection", "eyedrop"];

  function normalizeProductTypeLabel(labelText) {
    var raw = labelText != null ? String(labelText).trim() : "";
    if (!raw) return "";
    return raw
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\b([a-z])/g, function (m, ch) {
        return ch.toUpperCase();
      });
  }

  /**
   * Ensures built-in product types exist for the current entity (idempotent).
   */
  MargDb.prototype.ensureDefaultProductTypes = function () {
    var eid = this.requireEntityId();
    var t = nowIso();
    var i;
    for (i = 0; i < DEFAULT_PRODUCT_TYPES.length; i++) {
      var lab = normalizeProductTypeLabel(DEFAULT_PRODUCT_TYPES[i]);
      var ex = execAll(
        this._db,
        "SELECT id, label FROM product_type WHERE entity_id = ? AND label = ? COLLATE NOCASE",
        [eid, lab]
      );
      if (!ex.length) {
        this._db.run("INSERT INTO product_type (entity_id, label, created_at) VALUES (?, ?, ?)", [
          eid,
          lab,
          t,
        ]);
      } else if ((ex[0].label || "") !== lab) {
        this._db.run("UPDATE product_type SET label = ? WHERE id = ? AND entity_id = ?", [
          lab,
          Number(ex[0].id),
          eid,
        ]);
      }
    }
  };

  /**
   * @returns {Array<{ id: number, label: string }>}
   */
  MargDb.prototype.listProductTypes = function () {
    var eid = this.requireEntityId();
    return execAll(
      this._db,
      "SELECT id, label FROM product_type WHERE entity_id = ? ORDER BY label COLLATE NOCASE",
      [eid]
    );
  };

  /**
   * Find existing type by label (case-insensitive) or insert a new row.
   * @param {string} labelText
   * @returns {number|null} product_type.id
   */
  MargDb.prototype.resolveOrCreateProductTypeId = function (labelText) {
    var raw = normalizeProductTypeLabel(labelText);
    if (!raw) return null;
    var eid = this.requireEntityId();
    var rows = execAll(
      this._db,
      "SELECT id, label FROM product_type WHERE entity_id = ? AND label = ? COLLATE NOCASE",
      [eid, raw]
    );
    if (rows.length) {
      if ((rows[0].label || "") !== raw) {
        this._db.run("UPDATE product_type SET label = ? WHERE id = ? AND entity_id = ?", [
          raw,
          Number(rows[0].id),
          eid,
        ]);
      }
      return Number(rows[0].id);
    }
    var t = nowIso();
    this._db.run("INSERT INTO product_type (entity_id, label, created_at) VALUES (?, ?, ?)", [
      eid,
      raw,
      t,
    ]);
    var nid = this._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
    return Number(nid);
  };

  /**
   * Bulk upsert products (CSV / Excel import). Match by product code (trimmed, case-insensitive);
   * updates the first existing row if duplicates already exist. Rows without a code still insert as new.
   * @param {Array<object>} items — same shape as insertProduct
   * @returns {Promise<{ inserted: number, updated: number }>}
   */
  MargDb.prototype.importProductsBatch = function (items) {
    var eid = this.requireEntityId();
    if (!items || !items.length) {
      return Promise.reject(new Error("No product rows to import"));
    }
    var t = nowIso();
    var self = this;
    var inserted = 0;
    var updated = 0;
    var codeMap = {};
    var existing = execAll(
      this._db,
      "SELECT id, code FROM product WHERE entity_id = ?",
      [eid]
    );
    var ei;
    for (ei = 0; ei < existing.length; ei++) {
      var er = existing[ei];
      var rawC = er.code != null ? String(er.code).trim() : "";
      if (!rawC) continue;
      var ck = rawC.toLowerCase();
      if (codeMap[ck] == null) {
        codeMap[ck] = Number(er.id);
      }
    }
    try {
      this._db.run("BEGIN TRANSACTION");
      items.forEach(function (p) {
        if (!p || !String(p.name || "").trim()) return;
        var nameTrim = String(p.name).trim();
        var codeTrim = p.code != null && String(p.code).trim() ? String(p.code).trim() : "";
        var ups = p.units_per_strip != null && p.units_per_strip !== "" ? Number(p.units_per_strip) : null;
        var ptid =
          p.product_type_id != null && p.product_type_id !== "" ? Number(p.product_type_id) : null;
        var vals = [
          nameTrim,
          codeTrim || null,
          p.barcode != null && String(p.barcode).trim() ? String(p.barcode).trim() : null,
          p.pack_label != null && String(p.pack_label).trim() ? String(p.pack_label).trim() : null,
          ups,
          p.description || null,
          p.chemical_composition || null,
          p.general_recommendation || null,
          p.where_to_use || null,
          ptid,
          t,
        ];
        var existingId = null;
        if (codeTrim) {
          existingId = codeMap[codeTrim.toLowerCase()];
        }
        if (existingId != null) {
          vals.push(existingId, eid);
          self._db.run(
            [
              "UPDATE product SET name = ?, code = ?, barcode = ?, pack_label = ?, units_per_strip = ?,",
              "description = ?, chemical_composition = ?, general_recommendation = ?, where_to_use = ?, product_type_id = ?, updated_at = ?",
              "WHERE id = ? AND entity_id = ?",
            ].join(" "),
            vals
          );
          updated++;
        } else {
          self._db.run(
            [
              "INSERT INTO product (entity_id, name, code, barcode, pack_label, units_per_strip,",
              "description, chemical_composition, general_recommendation, where_to_use, product_type_id, is_active, created_at, updated_at)",
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
            ].join(" "),
            [
              eid,
              nameTrim,
              codeTrim || null,
              p.barcode != null && String(p.barcode).trim() ? String(p.barcode).trim() : null,
              p.pack_label != null && String(p.pack_label).trim() ? String(p.pack_label).trim() : null,
              ups,
              p.description || null,
              p.chemical_composition || null,
              p.general_recommendation || null,
              p.where_to_use || null,
              ptid,
              t,
              t,
            ]
          );
          inserted++;
          if (codeTrim) {
            var newId = self._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
            codeMap[codeTrim.toLowerCase()] = Number(newId);
          }
        }
      });
      this._db.run("COMMIT");
    } catch (err) {
      try {
        this._db.run("ROLLBACK");
      } catch (e2) {
        /* ignore */
      }
      return Promise.reject(err);
    }
    if (inserted === 0 && updated === 0) {
      return Promise.reject(new Error("No valid rows (each row needs a name)"));
    }
    return this.save().then(function () {
      return { inserted: inserted, updated: updated };
    });
  };

  /**
   * Bulk upsert vendors (CSV / Excel). Match by vendor name (trimmed, case-insensitive); first existing wins if duplicates.
   * @returns {Promise<{ inserted: number, updated: number }>}
   */
  MargDb.prototype.importVendorsBatch = function (items) {
    var eid = this.requireEntityId();
    if (!items || !items.length) {
      return Promise.resolve({ inserted: 0, updated: 0 });
    }
    var t = nowIso();
    var self = this;
    var inserted = 0;
    var updated = 0;
    var nameMap = {};
    var existingV = execAll(this._db, "SELECT id, name FROM vendor WHERE entity_id = ?", [eid]);
    var vi;
    for (vi = 0; vi < existingV.length; vi++) {
      var vn = String(existingV[vi].name || "").trim().toLowerCase();
      if (!vn || nameMap[vn] != null) continue;
      nameMap[vn] = Number(existingV[vi].id);
    }
    try {
      this._db.run("BEGIN TRANSACTION");
      items.forEach(function (v) {
        if (!v || !String(v.name || "").trim()) return;
        var nm = String(v.name).trim();
        var nk = nm.toLowerCase();
        var vals = [
          nm,
          v.phone || null,
          v.email || null,
          v.address_line1 || null,
          v.address_line2 || null,
          v.city || null,
          v.state || null,
          v.pincode || null,
          v.gstin || null,
          v.notes || null,
          t,
        ];
        var vid = nameMap[nk];
        if (vid != null) {
          vals.push(vid, eid);
          self._db.run(
            [
              "UPDATE vendor SET name = ?, phone = ?, email = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?, pincode = ?, gstin = ?, notes = ?, updated_at = ?",
              "WHERE id = ? AND entity_id = ?",
            ].join(" "),
            vals
          );
          updated++;
        } else {
          self._db.run(
            [
              "INSERT INTO vendor (entity_id, name, phone, email, address_line1, address_line2, city, state, pincode, gstin, notes, created_at, updated_at)",
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ].join(" "),
            [
              eid,
              nm,
              v.phone || null,
              v.email || null,
              v.address_line1 || null,
              v.address_line2 || null,
              v.city || null,
              v.state || null,
              v.pincode || null,
              v.gstin || null,
              v.notes || null,
              t,
              t,
            ]
          );
          inserted++;
          var nid = self._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
          nameMap[nk] = Number(nid);
        }
      });
      this._db.run("COMMIT");
    } catch (err) {
      try {
        this._db.run("ROLLBACK");
      } catch (e2) {
        /* ignore */
      }
      return Promise.reject(err);
    }
    if (inserted === 0 && updated === 0) {
      return Promise.resolve({ inserted: 0, updated: 0 });
    }
    return this.save().then(function () {
      return { inserted: inserted, updated: updated };
    });
  };

  function normalizeCustomerPhoneDigits(phone) {
    return String(phone || "").replace(/\D/g, "");
  }

  /**
   * Bulk upsert customers (CSV / Excel).
   * Match: normalized phone (digits only, length ≥ 7) else name only (trimmed, case-insensitive).
   * @returns {Promise<{ inserted: number, updated: number }>}
   */
  MargDb.prototype.importCustomersBatch = function (items) {
    var eid = this.requireEntityId();
    if (!items || !items.length) {
      return Promise.resolve({ inserted: 0, updated: 0 });
    }
    var t = nowIso();
    var self = this;
    var inserted = 0;
    var updated = 0;
    var phoneMap = {};
    var nameMap = {};
    var existingC = execAll(
      this._db,
      "SELECT id, name, phone FROM customer WHERE entity_id = ?",
      [eid]
    );
    var ci;
    for (ci = 0; ci < existingC.length; ci++) {
      var er = existingC[ci];
      var pid = normalizeCustomerPhoneDigits(er.phone);
      var nk = String(er.name || "").trim().toLowerCase();
      if (pid.length >= 7) {
        if (phoneMap[pid] == null) phoneMap[pid] = Number(er.id);
      } else if (nk && nameMap[nk] == null) {
        nameMap[nk] = Number(er.id);
      }
    }
    try {
      this._db.run("BEGIN TRANSACTION");
      items.forEach(function (c) {
        if (!c || !String(c.name || "").trim()) return;
        var nm = String(c.name).trim();
        var nk = nm.toLowerCase();
        var phDig = normalizeCustomerPhoneDigits(c.phone);
        var vals = [
          nm,
          c.phone || null,
          c.address_line1 || null,
          c.address_line2 || null,
          c.city || null,
          c.state || null,
          c.pincode || null,
          c.email || null,
          c.notes || null,
          t,
        ];
        var cid = phDig.length >= 7 ? phoneMap[phDig] : nameMap[nk];
        if (cid != null) {
          vals.push(cid, eid);
          self._db.run(
            [
              "UPDATE customer SET name = ?, phone = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?, pincode = ?, email = ?, notes = ?, updated_at = ?",
              "WHERE id = ? AND entity_id = ?",
            ].join(" "),
            vals
          );
          updated++;
        } else {
          self._db.run(
            [
              "INSERT INTO customer (entity_id, name, phone, address_line1, address_line2, city, state, pincode, email, notes, created_at, updated_at)",
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ].join(" "),
            [
              eid,
              nm,
              c.phone || null,
              c.address_line1 || null,
              c.address_line2 || null,
              c.city || null,
              c.state || null,
              c.pincode || null,
              c.email || null,
              c.notes || null,
              t,
              t,
            ]
          );
          inserted++;
          var newId = self._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
          var nid = Number(newId);
          if (phDig.length >= 7) phoneMap[phDig] = nid;
          else if (nk) nameMap[nk] = nid;
        }
      });
      this._db.run("COMMIT");
    } catch (err) {
      try {
        this._db.run("ROLLBACK");
      } catch (e2) {
        /* ignore */
      }
      return Promise.reject(err);
    }
    if (inserted === 0 && updated === 0) {
      return Promise.resolve({ inserted: 0, updated: 0 });
    }
    return this.save().then(function () {
      return { inserted: inserted, updated: updated };
    });
  };

  MargDb.prototype.listVendors = function () {
    var eid = this.requireEntityId();
    return execAll(
      this._db,
      "SELECT * FROM vendor WHERE entity_id = ? ORDER BY name COLLATE NOCASE",
      [eid]
    );
  };

  MargDb.prototype.getVendor = function (id) {
    var eid = this.requireEntityId();
    var rows = execAll(this._db, "SELECT * FROM vendor WHERE id = ? AND entity_id = ?", [id, eid]);
    return rows.length ? rows[0] : null;
  };

  MargDb.prototype.insertVendor = function (v) {
    var eid = this.requireEntityId();
    var t = nowIso();
    this._db.run(
      [
        "INSERT INTO vendor (entity_id, name, phone, email, address_line1, address_line2, city, state, pincode, gstin, notes, created_at, updated_at)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
      [
        eid,
        v.name,
        v.phone || null,
        v.email || null,
        v.address_line1 || null,
        v.address_line2 || null,
        v.city || null,
        v.state || null,
        v.pincode || null,
        v.gstin || null,
        v.notes || null,
        t,
        t,
      ]
    );
    var newId = this._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
    return this.save().then(function () {
      return newId;
    });
  };

  MargDb.prototype.updateVendor = function (id, v) {
    var eid = this.requireEntityId();
    var t = nowIso();
    this._db.run(
      [
        "UPDATE vendor SET name = ?, phone = ?, email = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?, pincode = ?, gstin = ?, notes = ?, updated_at = ?",
        "WHERE id = ? AND entity_id = ?",
      ].join(" "),
      [
        v.name,
        v.phone || null,
        v.email || null,
        v.address_line1 || null,
        v.address_line2 || null,
        v.city || null,
        v.state || null,
        v.pincode || null,
        v.gstin || null,
        v.notes || null,
        t,
        id,
        eid,
      ]
    );
    return this.save();
  };

  MargDb.prototype.listVendorPocs = function (vendorId) {
    if (!this.getVendor(vendorId)) return [];
    return execAll(
      this._db,
      "SELECT * FROM vendor_poc WHERE vendor_id = ? ORDER BY name COLLATE NOCASE",
      [vendorId]
    );
  };

  MargDb.prototype.insertVendorPoc = function (vendorId, poc) {
    if (!this.getVendor(vendorId)) {
      return Promise.reject(new Error("Vendor not found"));
    }
    var t = nowIso();
    this._db.run(
      "INSERT INTO vendor_poc (vendor_id, name, phone, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        vendorId,
        poc.name,
        poc.phone || null,
        poc.email || null,
        poc.role || null,
        t,
        t,
      ]
    );
    return this.save();
  };

  MargDb.prototype.deleteVendorPoc = function (pocId) {
    var eid = this.requireEntityId();
    this._db.run(
      "DELETE FROM vendor_poc WHERE id = ? AND vendor_id IN (SELECT id FROM vendor WHERE entity_id = ?)",
      [pocId, eid]
    );
    return this.save();
  };

  MargDb.prototype.listLots = function () {
    var eid = this.requireEntityId();
    return execAll(
      this._db,
      [
        "SELECT l.*, v.name AS vendor_name,",
        "(SELECT COUNT(*) FROM lot_line ll WHERE ll.lot_id = l.id) AS line_count",
        "FROM lot l LEFT JOIN vendor v ON v.id = l.vendor_id",
        "WHERE l.entity_id = ?",
        "ORDER BY l.created_at DESC",
      ].join(" "),
      [eid]
    );
  };

  /**
   * Purchase lots for a single vendor (newest first).
   * @param {number} vendorId
   * @returns {Array<object>}
   */
  MargDb.prototype.listLotsForVendor = function (vendorId) {
    if (!this.getVendor(vendorId)) return [];
    var eid = this.requireEntityId();
    return execAll(
      this._db,
      [
        "SELECT l.*, v.name AS vendor_name,",
        "(SELECT COUNT(*) FROM lot_line ll WHERE ll.lot_id = l.id) AS line_count",
        "FROM lot l LEFT JOIN vendor v ON v.id = l.vendor_id",
        "WHERE l.entity_id = ? AND l.vendor_id = ?",
        "ORDER BY l.created_at DESC",
      ].join(" "),
      [eid, Number(vendorId)]
    );
  };

  /**
   * Aggregates purchase totals / paid amounts across all lots for this vendor.
   * Balance = sum(lot total) − sum(lot paid); null amounts treated as 0 per lot in the sum.
   * @param {number} vendorId
   * @returns {{ lotCount: number, sumTotalPaise: number, sumPaidPaise: number, balancePaise: number }|null}
   */
  MargDb.prototype.getVendorFinancialSummary = function (vendorId) {
    if (!this.getVendor(vendorId)) return null;
    var eid = this.requireEntityId();
    var rows = execAll(
      this._db,
      [
        "SELECT",
        "  COUNT(*) AS lot_count,",
        "  COALESCE(SUM(CASE WHEN total_price_paise IS NOT NULL THEN total_price_paise ELSE 0 END), 0) AS sum_total_paise,",
        "  COALESCE(SUM(CASE WHEN total_paid_paise IS NOT NULL THEN total_paid_paise ELSE 0 END), 0) AS sum_paid_paise",
        "FROM lot",
        "WHERE entity_id = ? AND vendor_id = ?",
      ].join(" "),
      [eid, Number(vendorId)]
    );
    if (!rows.length) {
      return { lotCount: 0, sumTotalPaise: 0, sumPaidPaise: 0, balancePaise: 0 };
    }
    var r = rows[0];
    var sumT = Number(r.sum_total_paise) || 0;
    var sumP = Number(r.sum_paid_paise) || 0;
    return {
      lotCount: Number(r.lot_count) || 0,
      sumTotalPaise: sumT,
      sumPaidPaise: sumP,
      balancePaise: sumT - sumP,
    };
  };

  MargDb.prototype.getLot = function (id) {
    var eid = this.requireEntityId();
    var rows = execAll(
      this._db,
      "SELECT l.*, v.name AS vendor_name FROM lot l LEFT JOIN vendor v ON v.id = l.vendor_id WHERE l.id = ? AND l.entity_id = ?",
      [id, eid]
    );
    return rows.length ? rows[0] : null;
  };

  /** @returns {number|null} lot id for this entity, or null */
  MargDb.prototype.getLotIdByLotNumber = function (lotNumber) {
    var eid = this.requireEntityId();
    var n = lotNumber != null && String(lotNumber).trim() ? String(lotNumber).trim() : "";
    if (!n) return null;
    var rows = execAll(this._db, "SELECT id FROM lot WHERE entity_id = ? AND lot_number = ?", [eid, n]);
    return rows.length ? Number(rows[0].id) : null;
  };

  /** @returns {{ id: number, status: string }|null} */
  MargDb.prototype.getShopOrderIdAndStatusByOrderNumber = function (orderNumber) {
    var eid = this.requireEntityId();
    var on = orderNumber != null && String(orderNumber).trim() ? String(orderNumber).trim() : "";
    if (!on) return null;
    var rows = execAll(
      this._db,
      "SELECT id, status FROM shop_order WHERE entity_id = ? AND order_number = ?",
      [eid, on]
    );
    if (!rows.length) return null;
    return {
      id: Number(rows[0].id),
      status: String(rows[0].status || "draft").trim(),
    };
  };

  MargDb.prototype.getLotLines = function (lotId) {
    if (!this.getLot(lotId)) return [];
    /* Explicit columns — avoids sql.js getAsObject() quirks with ll.* + join */
    return execAll(
      this._db,
      [
        "SELECT ll.id, ll.lot_id, ll.product_id, ll.quantity, ll.strips_per_pack, ll.available_count, ll.available_tabs, ll.delivered_on,",
        "ll.selling_price_paise, ll.strip_mrp_paise, ll.line_notes, ll.created_at, ll.updated_at,",
        "p.name AS product_name, p.code AS product_code, p.pack_label AS pack_label",
        "FROM lot_line ll INNER JOIN product p ON p.id = ll.product_id",
        "WHERE ll.lot_id = ? ORDER BY ll.id",
      ].join(" "),
      [lotId]
    );
  };

  MargDb.prototype.insertLotWithLines = function (header, lines) {
    var eid = this.requireEntityId();
    if (!header.lot_number || !String(header.lot_number).trim()) {
      return Promise.reject(new Error("Lot number is required"));
    }
    if (!lines || !lines.length) {
      return Promise.reject(new Error("Add at least one line item"));
    }
    var t = nowIso();
    var self = this;
    try {
      this._db.run("BEGIN TRANSACTION");
      this._db.run(
        [
          "INSERT INTO lot (entity_id, vendor_id, lot_number, lot_date, delivered_date, total_price_paise, margin_paise, total_paid_paise, delivered_by, notes, created_at, updated_at)",
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ].join(" "),
        [
          eid,
          header.vendor_id != null && header.vendor_id !== "" ? Number(header.vendor_id) : null,
          String(header.lot_number).trim(),
          header.lot_date || null,
          header.delivered_date || null,
          header.total_price_paise != null ? Number(header.total_price_paise) : null,
          header.margin_paise != null ? Number(header.margin_paise) : null,
          header.total_paid_paise != null ? Number(header.total_paid_paise) : null,
          header.delivered_by || null,
          header.notes || null,
          t,
          t,
        ]
      );
      var lotId = this._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
      lines.forEach(function (line) {
        var qty = Number(line.quantity);
        if (!(qty > 0)) {
          throw new Error("Each line needs quantity > 0");
        }
        var av =
          line.available_count != null && line.available_count !== ""
            ? Number(line.available_count)
            : qty;
        if (!(av >= 0) || av > qty || isNaN(av)) {
          throw new Error("Each line needs available strips between 0 and strips received");
        }
        var pid = Number(line.product_id);
        if (!self.getProduct(pid)) {
          throw new Error("Invalid product on line");
        }
        var sp = Number(line.selling_price_paise);
        if (isNaN(sp) || sp < 0) {
          throw new Error("Selling price must be zero or positive");
        }
        if (line.strip_mrp_paise === undefined || line.strip_mrp_paise === null) {
          throw new Error("Strip MRP is missing on a line — refresh the page and save again.");
        }
        var mrp = Number(line.strip_mrp_paise);
        if (isNaN(mrp) || mrp < 0) {
          throw new Error("Strip MRP must be zero or positive");
        }
        var spp =
          line.strips_per_pack != null && line.strips_per_pack !== ""
            ? Math.round(Number(line.strips_per_pack))
            : 1;
        if (!(spp >= 1) || isNaN(spp)) {
          throw new Error("Strips per pack must be at least 1 on each line");
        }
        var upsRows = execAll(
          self._db,
          "SELECT units_per_strip FROM product WHERE id = ? AND entity_id = ?",
          [pid, eid]
        );
        var upsVal =
          upsRows.length &&
          upsRows[0].units_per_strip != null &&
          upsRows[0].units_per_strip !== ""
            ? Number(upsRows[0].units_per_strip)
            : NaN;
        var tabsPerStrip = upsVal > 0 && !isNaN(upsVal) ? Math.round(upsVal) : 1;
        var avTabs = Math.round(av) * tabsPerStrip;
        self._db.run(
          [
            "INSERT INTO lot_line (lot_id, product_id, quantity, strips_per_pack, available_count, available_tabs, delivered_on, selling_price_paise, strip_mrp_paise, line_notes, created_at, updated_at)",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ].join(" "),
          [
            lotId,
            pid,
            qty,
            spp,
            Math.round(av),
            avTabs,
            line.delivered_on || null,
            sp,
            mrp,
            line.line_notes || null,
            t,
            t,
          ]
        );
      });
      this._db.run("COMMIT");
    } catch (err) {
      try {
        this._db.run("ROLLBACK");
      } catch (e2) {
        /* ignore */
      }
      return Promise.reject(err);
    }
    var savedLotId = lotId;
    return this.save().then(function () {
      return savedLotId;
    });
  };

  /**
   * Replace lot header and all line items (same validation as insert).
   * @param {number} lotId
   * @param {object} header — same shape as insertLotWithLines header
   * @param {Array<object>} lines — same shape as insertLotWithLines lines
   * @returns {Promise<void>}
   */
  MargDb.prototype.updateLotWithLines = function (lotId, header, lines) {
    var eid = this.requireEntityId();
    var existing = this.getLot(lotId);
    if (!existing) {
      return Promise.reject(new Error("Lot not found"));
    }
    if (!header.lot_number || !String(header.lot_number).trim()) {
      return Promise.reject(new Error("Lot number is required"));
    }
    if (!lines || !lines.length) {
      return Promise.reject(new Error("Add at least one line item"));
    }
    var newNum = String(header.lot_number).trim();
    if (newNum !== String(existing.lot_number || "").trim()) {
      var clash = execAll(
        this._db,
        "SELECT id FROM lot WHERE entity_id = ? AND lot_number = ? AND id != ?",
        [eid, newNum, Number(lotId)]
      );
      if (clash.length) {
        return Promise.reject(new Error("Another lot already uses this invoice number."));
      }
    }
    var t = nowIso();
    var self = this;
    try {
      this._db.run("BEGIN TRANSACTION");
      this._db.run(
        [
          "UPDATE lot SET vendor_id = ?, lot_number = ?, lot_date = ?, delivered_date = ?, total_price_paise = ?, margin_paise = ?, total_paid_paise = ?, delivered_by = ?, notes = ?, updated_at = ?",
          "WHERE id = ? AND entity_id = ?",
        ].join(" "),
        [
          header.vendor_id != null && header.vendor_id !== "" ? Number(header.vendor_id) : null,
          newNum,
          header.lot_date || null,
          header.delivered_date || null,
          header.total_price_paise != null ? Number(header.total_price_paise) : null,
          header.margin_paise != null ? Number(header.margin_paise) : null,
          header.total_paid_paise != null ? Number(header.total_paid_paise) : null,
          header.delivered_by || null,
          header.notes || null,
          t,
          Number(lotId),
          eid,
        ]
      );
      this._db.run("DELETE FROM lot_line WHERE lot_id = ?", [Number(lotId)]);
      lines.forEach(function (line) {
        var qty = Number(line.quantity);
        if (!(qty > 0)) {
          throw new Error("Each line needs quantity > 0");
        }
        var av =
          line.available_count != null && line.available_count !== ""
            ? Number(line.available_count)
            : qty;
        if (!(av >= 0) || av > qty || isNaN(av)) {
          throw new Error("Each line needs available strips between 0 and strips received");
        }
        var pid = Number(line.product_id);
        if (!self.getProduct(pid)) {
          throw new Error("Invalid product on line");
        }
        var sp = Number(line.selling_price_paise);
        if (isNaN(sp) || sp < 0) {
          throw new Error("Selling price must be zero or positive");
        }
        if (line.strip_mrp_paise === undefined || line.strip_mrp_paise === null) {
          throw new Error("Strip MRP is missing on a line — refresh the page and save again.");
        }
        var mrp = Number(line.strip_mrp_paise);
        if (isNaN(mrp) || mrp < 0) {
          throw new Error("Strip MRP must be zero or positive");
        }
        var sppUp =
          line.strips_per_pack != null && line.strips_per_pack !== ""
            ? Math.round(Number(line.strips_per_pack))
            : 1;
        if (!(sppUp >= 1) || isNaN(sppUp)) {
          throw new Error("Strips per pack must be at least 1 on each line");
        }
        var upsRowsUp = execAll(
          self._db,
          "SELECT units_per_strip FROM product WHERE id = ? AND entity_id = ?",
          [pid, eid]
        );
        var upsValUp =
          upsRowsUp.length &&
          upsRowsUp[0].units_per_strip != null &&
          upsRowsUp[0].units_per_strip !== ""
            ? Number(upsRowsUp[0].units_per_strip)
            : NaN;
        var tabsPerStripUp = upsValUp > 0 && !isNaN(upsValUp) ? Math.round(upsValUp) : 1;
        var avTabsUp = Math.round(av) * tabsPerStripUp;
        self._db.run(
          [
            "INSERT INTO lot_line (lot_id, product_id, quantity, strips_per_pack, available_count, available_tabs, delivered_on, selling_price_paise, strip_mrp_paise, line_notes, created_at, updated_at)",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ].join(" "),
          [
            Number(lotId),
            pid,
            qty,
            sppUp,
            Math.round(av),
            avTabsUp,
            line.delivered_on || null,
            sp,
            mrp,
            line.line_notes || null,
            t,
            t,
          ]
        );
      });
      this._db.run("COMMIT");
    } catch (err) {
      try {
        this._db.run("ROLLBACK");
      } catch (e2) {
        /* ignore */
      }
      return Promise.reject(err);
    }
    return this.save();
  };

  /** docs/order.md §5.1 — customer master (structure.log §4). */
  MargDb.prototype.listCustomers = function (q) {
    var eid = this.requireEntityId();
    var sql =
      "SELECT * FROM customer WHERE entity_id = ?";
    var params = [eid];
    if (q && String(q).trim()) {
      var like = "%" + q.trim() + "%";
      sql +=
        " AND (name LIKE ? OR IFNULL(phone,'') LIKE ? OR IFNULL(email,'') LIKE ? OR IFNULL(city,'') LIKE ? OR IFNULL(address_line1,'') LIKE ?)";
      params.push(like, like, like, like, like);
    }
    sql += " ORDER BY name COLLATE NOCASE";
    return execAll(this._db, sql, params);
  };

  MargDb.prototype.getCustomer = function (id) {
    var eid = this.requireEntityId();
    var rows = execAll(this._db, "SELECT * FROM customer WHERE id = ? AND entity_id = ?", [id, eid]);
    return rows.length ? rows[0] : null;
  };

  MargDb.prototype.insertCustomer = function (c) {
    var eid = this.requireEntityId();
    var t = nowIso();
    if (!c || !String(c.name || "").trim()) {
      return Promise.reject(new Error("Customer name is required"));
    }
    this._db.run(
      [
        "INSERT INTO customer (entity_id, name, phone, address_line1, address_line2, city, state, pincode, email, notes, created_at, updated_at)",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ].join(" "),
      [
        eid,
        String(c.name).trim(),
        c.phone || null,
        c.address_line1 || null,
        c.address_line2 || null,
        c.city || null,
        c.state || null,
        c.pincode || null,
        c.email || null,
        c.notes || null,
        t,
        t,
      ]
    );
    var newId = this._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
    return this.save().then(function () {
      return newId;
    });
  };

  /** Doctor master — prescriptions reference doctor.id plus denormalized name/phone on prescription row. */
  MargDb.prototype.listDoctors = function (q) {
    var eid = this.requireEntityId();
    var sql = "SELECT * FROM doctor WHERE entity_id = ?";
    var params = [eid];
    if (q && String(q).trim()) {
      var like = "%" + q.trim() + "%";
      sql += " AND (name LIKE ? OR IFNULL(phone,'') LIKE ?)";
      params.push(like, like);
    }
    sql += " ORDER BY name COLLATE NOCASE";
    return execAll(this._db, sql, params);
  };

  MargDb.prototype.getDoctor = function (id) {
    var eid = this.requireEntityId();
    var rows = execAll(this._db, "SELECT * FROM doctor WHERE id = ? AND entity_id = ?", [Number(id), eid]);
    return rows.length ? rows[0] : null;
  };

  MargDb.prototype.insertDoctor = function (d) {
    var eid = this.requireEntityId();
    var t = nowIso();
    if (!d || !String(d.name || "").trim()) {
      return Promise.reject(new Error("Doctor name is required"));
    }
    var phone =
      d.phone != null && String(d.phone).trim() ? String(d.phone).trim() : null;
    this._db.run(
      [
        "INSERT INTO doctor (entity_id, name, phone, created_at, updated_at)",
        "VALUES (?, ?, ?, ?, ?)",
      ].join(" "),
      [eid, String(d.name).trim(), phone, t, t]
    );
    var newId = this._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
    return this.save().then(function () {
      return newId;
    });
  };

  /**
   * Resolves doctor for a prescription header: prefer doctor_id (UI), else find-or-create by
   * doctor_name / doctor_phone (CSV/import).
   * @returns {{ doctor_id: number|null, doctor_name: string|null, doctor_phone: string|null }}
   */
  MargDb.prototype._normalizePrescriptionDoctorFromHeader = function (header) {
    var eid = this.requireEntityId();
    var raw = header && header.doctor_id;
    var did =
      raw != null && raw !== ""
        ? Number(raw)
        : null;
    if (did != null && isNaN(did)) did = null;
    if (did != null) {
      var rows = execAll(
        this._db,
        "SELECT id, name, phone FROM doctor WHERE id = ? AND entity_id = ?",
        [did, eid]
      );
      if (!rows.length) {
        throw new Error("Unknown doctor");
      }
      var d = rows[0];
      var nm = d.name != null ? String(d.name).trim() : null;
      var ph =
        d.phone != null && String(d.phone).trim() ? String(d.phone).trim() : null;
      return {
        doctor_id: did,
        doctor_name: nm || null,
        doctor_phone: ph,
      };
    }
    var dn =
      header &&
      header.doctor_name != null &&
      String(header.doctor_name).trim()
        ? String(header.doctor_name).trim()
        : null;
    if (!dn) {
      return { doctor_id: null, doctor_name: null, doctor_phone: null };
    }
    var ph =
      header &&
      header.doctor_phone != null &&
      String(header.doctor_phone).trim()
        ? String(header.doctor_phone).trim()
        : null;
    var ex = execAll(
      this._db,
      [
        "SELECT id, name, phone FROM doctor WHERE entity_id = ? AND lower(trim(name)) = lower(?) AND ",
        "coalesce(phone,'') = coalesce(?,'')",
      ].join(""),
      [eid, dn, ph]
    );
    if (ex.length) {
      var dr = ex[0];
      return {
        doctor_id: Number(dr.id),
        doctor_name: dr.name != null ? String(dr.name).trim() : dn,
        doctor_phone:
          dr.phone != null && String(dr.phone).trim()
            ? String(dr.phone).trim()
            : ph,
      };
    }
    var t = nowIso();
    this._db.run(
      [
        "INSERT INTO doctor (entity_id, name, phone, created_at, updated_at)",
        "VALUES (?, ?, ?, ?, ?)",
      ].join(" "),
      [eid, dn, ph, t, t]
    );
    var newId = this._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
    return {
      doctor_id: newId,
      doctor_name: dn,
      doctor_phone: ph,
    };
  };

  /** docs/order.md §5 — list orders for active entity. */
  MargDb.prototype.listOrders = function (opts) {
    var eid = this.requireEntityId();
    opts = opts || {};
    var lineSelect = opts.includeLineCount
      ? ", (SELECT COUNT(*) FROM order_line ol WHERE ol.order_id = o.id) AS line_count"
      : "";
    var sql =
      "SELECT o.id, o.order_number, o.order_date, o.order_total_price_paise, o.order_discount_paise, o.order_header_discount_flat_paise, o.order_header_discount_percent, o.status, o.notes, o.created_at," +
      " c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone" +
      lineSelect +
      " FROM shop_order o INNER JOIN customer c ON c.id = o.customer_id WHERE o.entity_id = ?";
    var params = [eid];
    if (opts.dateFrom && String(opts.dateFrom).trim()) {
      sql += " AND o.order_date >= ?";
      params.push(String(opts.dateFrom).trim());
    }
    if (opts.dateTo && String(opts.dateTo).trim()) {
      sql += " AND o.order_date <= ?";
      params.push(String(opts.dateTo).trim());
    }
    if (opts.q && String(opts.q).trim()) {
      var like = "%" + String(opts.q).trim().toLowerCase() + "%";
      sql +=
        " AND (LOWER(c.name) LIKE ? OR LOWER(IFNULL(o.order_number,'')) LIKE ? OR LOWER(IFNULL(c.phone,'')) LIKE ?)";
      params.push(like, like, like);
    }
    if (opts.customerId != null && opts.customerId !== "") {
      sql += " AND o.customer_id = ?";
      params.push(Number(opts.customerId));
    }
    sql += " ORDER BY o.order_date DESC, o.id DESC";
    return execAll(this._db, sql, params);
  };

  /**
   * Aggregates for a customer in one round-trip: net from orders (excl. cancelled),
   * total paid from customer_payment, due = net − paid.
   * @param {number} customerId
   */
  MargDb.prototype.getCustomerOrderSummary = function (customerId) {
    var eid = this.requireEntityId();
    var cid = Number(customerId);
    var rows;
    try {
      rows = execAll(
        this._db,
        [
          "SELECT",
          "o.order_count,",
          "o.cancelled_count,",
          "o.net_paise,",
          "o.confirmed_net_paise,",
          "o.last_order_date,",
          "o.first_order_date,",
          "COALESCE(p.paid_paise, 0) AS paid_paise,",
          "o.net_paise - COALESCE(p.paid_paise, 0) AS due_paise",
          "FROM (",
          "SELECT",
          "COUNT(*) AS order_count,",
          "SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,",
          "COALESCE(SUM(CASE WHEN status != 'cancelled' THEN order_total_price_paise - order_discount_paise ELSE 0 END), 0) AS net_paise,",
          "COALESCE(SUM(CASE WHEN status = 'confirmed' THEN order_total_price_paise - order_discount_paise ELSE 0 END), 0) AS confirmed_net_paise,",
          "MAX(CASE WHEN status != 'cancelled' THEN order_date END) AS last_order_date,",
          "MIN(CASE WHEN status != 'cancelled' THEN order_date END) AS first_order_date",
          "FROM shop_order WHERE entity_id = ? AND customer_id = ?",
          ") o",
          "CROSS JOIN (",
          "SELECT COALESCE(SUM(amount_paise), 0) AS paid_paise",
          "FROM customer_payment WHERE entity_id = ? AND customer_id = ?",
          ") p",
        ].join(" "),
        [eid, cid, eid, cid]
      );
    } catch (e) {
      rows = execAll(
        this._db,
        [
          "SELECT",
          "COUNT(*) AS order_count,",
          "SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,",
          "COALESCE(SUM(CASE WHEN status != 'cancelled' THEN order_total_price_paise - order_discount_paise ELSE 0 END), 0) AS net_paise,",
          "COALESCE(SUM(CASE WHEN status = 'confirmed' THEN order_total_price_paise - order_discount_paise ELSE 0 END), 0) AS confirmed_net_paise,",
          "MAX(CASE WHEN status != 'cancelled' THEN order_date END) AS last_order_date,",
          "MIN(CASE WHEN status != 'cancelled' THEN order_date END) AS first_order_date,",
          "0 AS paid_paise,",
          "COALESCE(SUM(CASE WHEN status != 'cancelled' THEN order_total_price_paise - order_discount_paise ELSE 0 END), 0) AS due_paise",
          "FROM shop_order WHERE entity_id = ? AND customer_id = ?",
        ].join(" "),
        [eid, cid]
      );
    }
    var r = rows[0] || {};
    var netTotal = Number(r.net_paise) || 0;
    var confirmedNet = Number(r.confirmed_net_paise) || 0;
    var explicitPaid = Number(r.paid_paise) || 0;
    var due = Number(r.due_paise);
    if (isNaN(due)) due = netTotal - explicitPaid;
    return {
      orderCount: Number(r.order_count) || 0,
      cancelledCount: Number(r.cancelled_count) || 0,
      netTotalPaise: netTotal,
      confirmedNetPaise: confirmedNet,
      explicitPaidPaise: explicitPaid,
      totalPaidPaise: explicitPaid,
      totalDuePaise: due,
      lastOrderDate: r.last_order_date || null,
      firstOrderDate: r.first_order_date || null,
    };
  };

  /**
   * Payments recorded against a customer (newest first).
   * @param {number} customerId
   */
  MargDb.prototype.listCustomerPayments = function (customerId) {
    var eid = this.requireEntityId();
    var cid = Number(customerId);
    try {
      return execAll(
        this._db,
        [
          "SELECT id, amount_paise, method, notes, created_at",
          "FROM customer_payment WHERE entity_id = ? AND customer_id = ?",
          "ORDER BY datetime(created_at) DESC, id DESC",
        ].join(" "),
        [eid, cid]
      );
    } catch (e) {
      return [];
    }
  };

  /**
   * @param {{ customer_id: number, amount_paise: number, method: 'cash'|'upi', notes?: string }} p
   * @returns {Promise<number>} new payment id
   */
  MargDb.prototype.insertCustomerPayment = function (p) {
    try {
      var eid = this.requireEntityId();
      if (!p || !p.customer_id) {
        return Promise.reject(new Error("Customer is required"));
      }
      var cid = Number(p.customer_id);
      if (!this.getCustomer(cid)) {
        return Promise.reject(new Error("Customer not found"));
      }
      var amt = Math.round(Number(p.amount_paise));
      if (!(amt > 0)) {
        return Promise.reject(new Error("Amount must be greater than zero"));
      }
      var method = p.method === "upi" ? "upi" : "cash";
      var t = nowIso();
      this._db.run(
        [
          "INSERT INTO customer_payment (entity_id, customer_id, amount_paise, method, notes, created_at, updated_at)",
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ].join(" "),
        [eid, cid, amt, method, p.notes && String(p.notes).trim() ? String(p.notes).trim() : null, t, t]
      );
      var idRow = this._db.exec("SELECT last_insert_rowid() AS id");
      var newId = idRow.length && idRow[0].values && idRow[0].values[0] ? idRow[0].values[0][0] : null;
      return this.save().then(function () {
        return newId;
      });
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  };

  /** Single order header + customer display fields. */
  MargDb.prototype.getOrder = function (id) {
    var eid = this.requireEntityId();
    var rows = execAll(
      this._db,
      [
        "SELECT o.*, c.name AS customer_name, c.phone AS customer_phone",
        "FROM shop_order o INNER JOIN customer c ON c.id = o.customer_id",
        "WHERE o.id = ? AND o.entity_id = ?",
      ].join(" "),
      [id, eid]
    );
    return rows.length ? rows[0] : null;
  };

  /** Lines with product labels for UI. */
  MargDb.prototype.getOrderLines = function (orderId) {
    return execAll(
      this._db,
      [
        "SELECT ol.*, p.name AS product_name, p.code AS product_code, p.pack_label AS pack_label",
        "FROM order_line ol INNER JOIN product p ON p.id = ol.product_id",
        "WHERE ol.order_id = ? ORDER BY ol.id",
      ].join(" "),
      [orderId]
    );
  };

  MargDb.prototype.getOrderLineSchedule = function (orderLineId) {
    var rows = execAll(this._db, "SELECT * FROM order_line_schedule WHERE order_line_id = ?", [orderLineId]);
    return rows.length ? rows[0] : null;
  };

  /**
   * Dashboard KPIs (net sales = order total − discount; cancelled orders excluded).
   * @returns {{
   *   salesTodayPaise: number,
   *   salesMonthPaise: number,
   *   revenueAllTimePaise: number,
   *   ordersTodayCount: number,
   *   customersTotal: number,
   *   customersThisMonth: number,
   *   productsActive: number,
   *   inventoryValuePaise: number
   * }}
   */
  MargDb.prototype.getDashboardSummary = function () {
    var eid = this.requireEntityId();
    var today = new Date();
    var pad = function (n) {
      return n < 10 ? "0" + n : String(n);
    };
    var todayStr = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
    var monthStart = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-01";
    var net = "(order_total_price_paise - order_discount_paise)";

    var salesToday = execAll(
      this._db,
      "SELECT COALESCE(SUM(" + net + "), 0) AS s FROM shop_order WHERE entity_id = ? AND status != 'cancelled' AND order_date = ?",
      [eid, todayStr]
    );
    var salesMonth = execAll(
      this._db,
      "SELECT COALESCE(SUM(" + net + "), 0) AS s FROM shop_order WHERE entity_id = ? AND status != 'cancelled' AND order_date >= ? AND order_date <= ?",
      [eid, monthStart, todayStr]
    );
    var revenueAll = execAll(
      this._db,
      "SELECT COALESCE(SUM(" + net + "), 0) AS s FROM shop_order WHERE entity_id = ? AND status != 'cancelled'",
      [eid]
    );
    var ordersToday = execAll(
      this._db,
      "SELECT COUNT(*) AS c FROM shop_order WHERE entity_id = ? AND status != 'cancelled' AND order_date = ?",
      [eid, todayStr]
    );
    var custTotal = execAll(this._db, "SELECT COUNT(*) AS c FROM customer WHERE entity_id = ?", [eid]);
    var custMonth = execAll(
      this._db,
      "SELECT COUNT(*) AS c FROM customer WHERE entity_id = ? AND substr(created_at, 1, 10) >= ?",
      [eid, monthStart]
    );
    var prodCount = execAll(
      this._db,
      "SELECT COUNT(*) AS c FROM product WHERE entity_id = ? AND is_active = 1",
      [eid]
    );
    var invVal = execAll(
      this._db,
      [
        "SELECT COALESCE(SUM(",
        "ll.available_tabs * (",
        "(1.0 * COALESCE(ll.selling_price_paise, 0)) / ",
        "MAX(1, COALESCE((SELECT CAST(pr.units_per_strip AS INTEGER) FROM product pr WHERE pr.id = ll.product_id AND pr.entity_id = lo.entity_id), 1))",
        ")), 0) AS v ",
        "FROM lot_line ll INNER JOIN lot lo ON lo.id = ll.lot_id ",
        "WHERE lo.entity_id = ? AND ll.available_tabs > 0",
      ].join(""),
      [eid]
    );

    return {
      salesTodayPaise: Number(salesToday[0].s) || 0,
      salesMonthPaise: Number(salesMonth[0].s) || 0,
      revenueAllTimePaise: Number(revenueAll[0].s) || 0,
      ordersTodayCount: Number(ordersToday[0].c) || 0,
      customersTotal: Number(custTotal[0].c) || 0,
      customersThisMonth: Number(custMonth[0].c) || 0,
      productsActive: Number(prodCount[0].c) || 0,
      inventoryValuePaise: Number(invVal[0].v) || 0,
    };
  };

  /**
   * Net sales per calendar day for the last 30 days (including zeros for days with no orders).
   * @returns {Array<{ date: string, net_paise: number }>}
   */
  MargDb.prototype.getSalesByDayLast30Days = function () {
    var eid = this.requireEntityId();
    var pad = function (n) {
      return n < 10 ? "0" + n : String(n);
    };
    var today = new Date();
    today.setHours(12, 0, 0, 0);
    var start = new Date(today);
    start.setDate(start.getDate() - 29);
    var fromStr = start.getFullYear() + "-" + pad(start.getMonth() + 1) + "-" + pad(start.getDate());
    var toStr = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());

    var rows = execAll(
      this._db,
      "SELECT order_date AS d, COALESCE(SUM(order_total_price_paise - order_discount_paise), 0) AS net FROM shop_order WHERE entity_id = ? AND status != 'cancelled' AND order_date >= ? AND order_date <= ? GROUP BY order_date ORDER BY order_date",
      [eid, fromStr, toStr]
    );
    var map = {};
    var i;
    for (i = 0; i < rows.length; i++) {
      map[rows[i].d] = Number(rows[i].net) || 0;
    }
    var out = [];
    var cursor = new Date(start);
    for (i = 0; i < 30; i++) {
      var ds = cursor.getFullYear() + "-" + pad(cursor.getMonth() + 1) + "-" + pad(cursor.getDate());
      out.push({ date: ds, net_paise: map[ds] != null ? map[ds] : 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  };

  /**
   * Active products with stock at or below threshold (default 20). Out-of-stock first, then lowest qty.
   * @param {number} [limit=10]
   * @param {number} [maxStock=20]
   */
  MargDb.prototype.getLowStockProducts = function (limit, maxStock) {
    var eid = this.requireEntityId();
    var lim = limit != null && limit > 0 ? limit : 10;
    var th = maxStock != null && maxStock >= 0 ? maxStock : 20;
    var stockSub =
      "(SELECT COALESCE(SUM(ll.available_tabs), 0) FROM lot_line ll INNER JOIN lot lo ON lo.id = ll.lot_id WHERE ll.product_id = p.id AND lo.entity_id = p.entity_id)";
    var stripEquiv =
      "(" + stockSub + " * 1.0 / MAX(1, COALESCE(NULLIF(CAST(p.units_per_strip AS INTEGER), 0), 1)))";
    var sql =
      "SELECT p.id, p.name, p.code, p.pack_label, " +
      stockSub +
      " AS stock_on_hand FROM product p WHERE p.entity_id = ? AND p.is_active = 1 AND " +
      stripEquiv +
      " <= ? ORDER BY " +
      stripEquiv +
      " ASC, p.name COLLATE NOCASE LIMIT ?";
    return execAll(this._db, sql, [eid, th, lim]);
  };

  /**
   * Recent inbound lots (purchases), newest first.
   * @param {number} [limit=10]
   */
  MargDb.prototype.listRecentLots = function (limit) {
    var eid = this.requireEntityId();
    var lim = limit != null && limit > 0 ? limit : 10;
    return execAll(
      this._db,
      [
        "SELECT l.id, l.lot_number, l.lot_date, l.delivered_date, l.total_price_paise, l.created_at, v.name AS vendor_name",
        "FROM lot l LEFT JOIN vendor v ON v.id = l.vendor_id",
        "WHERE l.entity_id = ? ORDER BY l.created_at DESC LIMIT ?",
      ].join(" "),
      [eid, lim]
    );
  };

  /**
   * @param {object} header — customer_id, order_date, order_number? (omit for UI; DB assigns next ORD-###### after max existing), order_discount_paise, notes?, status? (confirmed/cancelled stored as-is; lot deduction runs only via setOrderStatus draft→confirmed)
   * @param {Array<{product_id:number,quantity:number,total_price_paise:number,line_discount_paise?:number,line_notes?:string,schedule?:object}>} lines
   * @returns {Promise<number>} new order id
   */
  MargDb.prototype.insertOrderWithLines = function (header, lines) {
    var eid = this.requireEntityId();
    var t = nowIso();
    if (!header || !header.customer_id) {
      return Promise.reject(new Error("Customer is required"));
    }
    if (!lines || !lines.length) {
      return Promise.reject(new Error("Add at least one line item"));
    }
    var lineSum = 0;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln.product_id || !ln.quantity || Number(ln.quantity) < 1) {
        return Promise.reject(new Error("Each line needs a product and quantity ≥ 1"));
      }
      lineSum += Number(ln.total_price_paise) || 0;
    }
    var hdrDisc = resolveShopOrderHeaderDiscount(header, lineSum);
    var discount = hdrDisc.discount_paise;
    var flatStored = hdrDisc.flat_paise;
    var percentStored = hdrDisc.percent;
    var orderTotal = Math.max(0, lineSum - discount);
    /** Explicit number (e.g. Excel import); otherwise assigned inside txn as next ORD-###### (max suffix + 1, gap-safe). */
    var orderNum =
      header.order_number && String(header.order_number).trim() ? String(header.order_number).trim() : null;
    var status = header.status && ["draft", "confirmed", "cancelled"].indexOf(header.status) >= 0
      ? header.status
      : "draft";
    var orderDate = header.order_date && String(header.order_date).trim() ? String(header.order_date).trim() : t.slice(0, 10);

    var rxId =
      header.prescription_id != null && header.prescription_id !== ""
        ? Number(header.prescription_id)
        : null;
    if (rxId != null && isNaN(rxId)) rxId = null;
    if (rxId != null) {
      var rxChk = execAll(
        this._db,
        "SELECT id, customer_id FROM prescription WHERE id = ? AND entity_id = ?",
        [rxId, eid]
      );
      if (!rxChk.length || Number(rxChk[0].customer_id) !== Number(header.customer_id)) {
        return Promise.reject(new Error("Prescription does not match this customer."));
      }
    }

    var orderId;
    try {
      this._db.run("BEGIN TRANSACTION");
      if (orderNum == null) {
        orderNum = allocateNextShopOrderNumber(this._db, eid);
      }
      this._db.run(
        [
          "INSERT INTO shop_order (entity_id, customer_id, order_number, order_date, order_total_price_paise, order_discount_paise, order_header_discount_flat_paise, order_header_discount_percent, status, notes, prescription_id, created_at, updated_at)",
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ].join(" "),
        [
          eid,
          header.customer_id,
          orderNum,
          orderDate,
          orderTotal,
          discount,
          flatStored,
          percentStored,
          status,
          header.notes || null,
          rxId,
          t,
          t,
        ]
      );
      var oidRow = this._db.exec("SELECT last_insert_rowid() AS id");
      orderId = oidRow[0].values[0][0];
      for (var j = 0; j < lines.length; j++) {
        var L = lines[j];
        this._db.run(
          [
            "INSERT INTO order_line (order_id, product_id, quantity, total_price_paise, line_discount_paise, line_notes, created_at, updated_at)",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          ].join(" "),
          [
            orderId,
            L.product_id,
            Number(L.quantity),
            Number(L.total_price_paise) || 0,
            Math.max(0, Number(L.line_discount_paise) || 0),
            L.line_notes || null,
            t,
            t,
          ]
        );
        var lidRow = this._db.exec("SELECT last_insert_rowid() AS id");
        var lineId = lidRow[0].values[0][0];
        var sch = L.schedule || {};
        this._db.run(
          [
            "INSERT INTO order_line_schedule (order_line_id, in_morning, in_noon, in_evening, in_night, remarks)",
            "VALUES (?, ?, ?, ?, ?, ?)",
          ].join(" "),
          [
            lineId,
            sch.in_morning ? 1 : 0,
            sch.in_noon ? 1 : 0,
            sch.in_evening ? 1 : 0,
            sch.in_night ? 1 : 0,
            sch.remarks || null,
          ]
        );
      }
      /** Stock is adjusted only in {@link MargDb#setOrderStatus} (draft → confirmed), not here — avoids double-deduct on Excel import of already-confirmed orders. */
      this._db.run("COMMIT");
    } catch (err) {
      try {
        this._db.run("ROLLBACK");
      } catch (e2) {
        /* ignore */
      }
      return Promise.reject(err);
    }
    return this.save().then(function () {
      return orderId;
    });
  };

  /**
   * Replace lines for a draft order (schedules cascade-delete with lines).
   * @returns {Promise<void>}
   */
  MargDb.prototype.updateOrderWithLines = function (orderId, header, lines) {
    var eid = this.requireEntityId();
    var t = nowIso();
    var existing = this.getOrder(orderId);
    if (!existing) {
      return Promise.reject(new Error("Order not found"));
    }
    if (existing.status !== "draft") {
      return Promise.reject(new Error("Only draft orders can be edited"));
    }
    if (!header || !header.customer_id) {
      return Promise.reject(new Error("Customer is required"));
    }
    if (!lines || !lines.length) {
      return Promise.reject(new Error("Add at least one line item"));
    }
    var lineSum = 0;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln.product_id || !ln.quantity || Number(ln.quantity) < 1) {
        return Promise.reject(new Error("Each line needs a product and quantity ≥ 1"));
      }
      lineSum += Number(ln.total_price_paise) || 0;
    }
    var hdrDiscUp = resolveShopOrderHeaderDiscount(header, lineSum);
    var discount = hdrDiscUp.discount_paise;
    var flatStoredUp = hdrDiscUp.flat_paise;
    var percentStoredUp = hdrDiscUp.percent;
    var orderTotal = Math.max(0, lineSum - discount);
    var orderNum =
      header.order_number && String(header.order_number).trim()
        ? String(header.order_number).trim()
        : existing.order_number && String(existing.order_number).trim()
          ? String(existing.order_number).trim()
          : null;
    if (!orderNum) {
      orderNum = "ORD-" + String(existing.id).padStart(6, "0");
    }
    var orderDate = header.order_date && String(header.order_date).trim() ? String(header.order_date).trim() : t.slice(0, 10);
    var rxUp =
      header.prescription_id !== undefined
        ? header.prescription_id != null && header.prescription_id !== ""
          ? Number(header.prescription_id)
          : null
        : undefined;
    if (rxUp != null && isNaN(rxUp)) rxUp = null;
    if (rxUp !== undefined && rxUp != null) {
      var rxChkUp = execAll(
        this._db,
        "SELECT id, customer_id FROM prescription WHERE id = ? AND entity_id = ?",
        [rxUp, eid]
      );
      if (!rxChkUp.length || Number(rxChkUp[0].customer_id) !== Number(header.customer_id)) {
        return Promise.reject(new Error("Prescription does not match this customer."));
      }
    }

    try {
      this._db.run("BEGIN TRANSACTION");
      this._db.run("DELETE FROM order_line WHERE order_id = ?", [orderId]);
      var updateSql =
        "UPDATE shop_order SET customer_id = ?, order_number = ?, order_date = ?, order_total_price_paise = ?, order_discount_paise = ?, order_header_discount_flat_paise = ?, order_header_discount_percent = ?, notes = ?, updated_at = ?";
      var updateParams = [
        header.customer_id,
        orderNum,
        orderDate,
        orderTotal,
        discount,
        flatStoredUp,
        percentStoredUp,
        header.notes || null,
        t,
      ];
      if (rxUp !== undefined) {
        updateSql += ", prescription_id = ?";
        updateParams.push(rxUp);
      }
      updateSql += " WHERE id = ? AND entity_id = ?";
      updateParams.push(orderId, eid);
      this._db.run(updateSql, updateParams);
      for (var j = 0; j < lines.length; j++) {
        var L = lines[j];
        this._db.run(
          [
            "INSERT INTO order_line (order_id, product_id, quantity, total_price_paise, line_discount_paise, line_notes, created_at, updated_at)",
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          ].join(" "),
          [
            orderId,
            L.product_id,
            Number(L.quantity),
            Number(L.total_price_paise) || 0,
            Math.max(0, Number(L.line_discount_paise) || 0),
            L.line_notes || null,
            t,
            t,
          ]
        );
        var lidRow = this._db.exec("SELECT last_insert_rowid() AS id");
        var lineId = lidRow[0].values[0][0];
        var sch = L.schedule || {};
        this._db.run(
          [
            "INSERT INTO order_line_schedule (order_line_id, in_morning, in_noon, in_evening, in_night, remarks)",
            "VALUES (?, ?, ?, ?, ?, ?)",
          ].join(" "),
          [
            lineId,
            sch.in_morning ? 1 : 0,
            sch.in_noon ? 1 : 0,
            sch.in_evening ? 1 : 0,
            sch.in_night ? 1 : 0,
            sch.remarks || null,
          ]
        );
      }
      this._db.run("COMMIT");
    } catch (err) {
      try {
        this._db.run("ROLLBACK");
      } catch (e2) {
        /* ignore */
      }
      return Promise.reject(err);
    }
    return this.save();
  };

  /** @returns {Promise<void>} */
  MargDb.prototype.setOrderStatus = function (id, status) {
    var eid = this.requireEntityId();
    if (["draft", "confirmed", "cancelled"].indexOf(status) < 0) {
      return Promise.reject(new Error("Invalid status"));
    }
    var existing = this.getOrder(id);
    if (!existing) {
      return Promise.reject(new Error("Order not found"));
    }
    var prev = existing.status && String(existing.status).trim() ? String(existing.status).trim() : "draft";
    var t = nowIso();
    if (status === "confirmed" && prev === "draft") {
      try {
        this._db.run("BEGIN TRANSACTION");
        applyConfirmedOrderToInventory(this._db, eid, id);
        this._db.run("UPDATE shop_order SET status = ?, updated_at = ? WHERE id = ? AND entity_id = ?", [
          status,
          t,
          id,
          eid,
        ]);
        this._db.run("COMMIT");
      } catch (err) {
        try {
          this._db.run("ROLLBACK");
        } catch (e2) {
          /* ignore */
        }
        return Promise.reject(err);
      }
      return this.save();
    }
    this._db.run("UPDATE shop_order SET status = ?, updated_at = ? WHERE id = ? AND entity_id = ?", [
      status,
      t,
      id,
      eid,
    ]);
    return this.save();
  };

  /** Draft-only delete (CASCADE lines + schedules). */
  MargDb.prototype.deleteOrder = function (id) {
    var o = this.getOrder(id);
    if (!o) {
      return Promise.reject(new Error("Order not found"));
    }
    if (o.status !== "draft") {
      return Promise.reject(new Error("Only draft orders can be deleted"));
    }
    var eid = this.requireEntityId();
    this._db.run("DELETE FROM shop_order WHERE id = ? AND entity_id = ?", [id, eid]);
    return this.save();
  };

  MargDb.prototype.updateCustomer = function (id, c) {
    var eid = this.requireEntityId();
    var t = nowIso();
    if (!c || !String(c.name || "").trim()) {
      return Promise.reject(new Error("Customer name is required"));
    }
    this._db.run(
      [
        "UPDATE customer SET name = ?, phone = ?, address_line1 = ?, address_line2 = ?, city = ?, state = ?, pincode = ?, email = ?, notes = ?, updated_at = ?",
        "WHERE id = ? AND entity_id = ?",
      ].join(" "),
      [
        String(c.name).trim(),
        c.phone || null,
        c.address_line1 || null,
        c.address_line2 || null,
        c.city || null,
        c.state || null,
        c.pincode || null,
        c.email || null,
        c.notes || null,
        t,
        id,
        eid,
      ]
    );
    return this.save();
  };

  /**
   * Deletes customer if no orders reference them (when shop_order exists).
   * @returns {Promise<void>}
   */
  MargDb.prototype.deleteCustomer = function (id) {
    var eid = this.requireEntityId();
    var tbls = execAll(
      this._db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='shop_order'"
    );
    if (tbls.length) {
      var oc = execAll(
        this._db,
        "SELECT COUNT(*) AS c FROM shop_order WHERE customer_id = ? AND entity_id = ?",
        [id, eid]
      );
      if (oc.length && Number(oc[0].c) > 0) {
        return Promise.reject(new Error("Cannot delete: customer has orders"));
      }
    }
    var pTbl = execAll(
      this._db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='prescription'"
    );
    if (pTbl.length) {
      var pc = execAll(
        this._db,
        "SELECT COUNT(*) AS c FROM prescription WHERE customer_id = ? AND entity_id = ?",
        [id, eid]
      );
      if (pc.length && Number(pc[0].c) > 0) {
        return Promise.reject(new Error("Cannot delete: customer has prescriptions"));
      }
    }
    this._db.run("DELETE FROM customer WHERE id = ? AND entity_id = ?", [id, eid]);
    return this.save();
  };

  /**
   * @param {object} [opts]
   * @param {string} [opts.q] — search doctor, customer, line notes (not secret_notes)
   * @param {number} [opts.customerId]
   * @param {string} [opts.dateFrom] — YYYY-MM-DD on prescription.created_at
   * @param {string} [opts.dateTo]
   */
  MargDb.prototype.listPrescriptions = function (opts) {
    var eid = this.requireEntityId();
    opts = opts || {};
    var sql =
      "SELECT p.*, c.name AS customer_name, c.phone AS customer_phone," +
      " (SELECT COUNT(*) FROM prescription_line pl WHERE pl.prescription_id = p.id) AS line_count" +
      " FROM prescription p INNER JOIN customer c ON c.id = p.customer_id WHERE p.entity_id = ?";
    var params = [eid];
    if (opts.customerId != null && opts.customerId !== "") {
      sql += " AND p.customer_id = ?";
      params.push(Number(opts.customerId));
    }
    if (opts.dateFrom && String(opts.dateFrom).trim()) {
      sql += " AND substr(p.created_at, 1, 10) >= ?";
      params.push(String(opts.dateFrom).trim());
    }
    if (opts.dateTo && String(opts.dateTo).trim()) {
      sql += " AND substr(p.created_at, 1, 10) <= ?";
      params.push(String(opts.dateTo).trim());
    }
    if (opts.q && String(opts.q).trim()) {
      var like = "%" + String(opts.q).trim().toLowerCase() + "%";
      sql +=
        " AND (" +
        "LOWER(IFNULL(p.doctor_name,'')) LIKE ? OR LOWER(IFNULL(p.doctor_phone,'')) LIKE ? OR " +
        "LOWER(c.name) LIKE ? OR LOWER(IFNULL(c.phone,'')) LIKE ? OR " +
        "EXISTS (SELECT 1 FROM prescription_line pl WHERE pl.prescription_id = p.id AND (" +
        "LOWER(IFNULL(pl.prescription_notes,'')) LIKE ? OR LOWER(IFNULL(pl.prescription_type,'')) LIKE ? OR " +
        "LOWER(IFNULL(pl.prescription_status,'')) LIKE ?" +
        "))";
      params.push(like, like, like, like, like, like, like);
    }
    sql += " ORDER BY p.created_at DESC, p.id DESC";
    return execAll(this._db, sql, params);
  };

  /**
   * Newest prescriptions first (dashboard widget).
   * @param {number} [limit] — default 10, max 50
   */
  MargDb.prototype.listRecentPrescriptions = function (limit) {
    var eid = this.requireEntityId();
    var lim = Math.max(1, Math.min(Number(limit) || 10, 50));
    return execAll(
      this._db,
      [
        "SELECT p.*, c.name AS customer_name, c.phone AS customer_phone,",
        " (SELECT COUNT(*) FROM prescription_line pl WHERE pl.prescription_id = p.id) AS line_count",
        "FROM prescription p INNER JOIN customer c ON c.id = p.customer_id",
        "WHERE p.entity_id = ?",
        "ORDER BY p.created_at DESC, p.id DESC",
        "LIMIT ?",
      ].join(" "),
      [eid, lim]
    );
  };

  /**
   * @param {number} id
   * @returns {{ header: object, lines: object[] }|null}
   */
  MargDb.prototype.getPrescription = function (id) {
    var eid = this.requireEntityId();
    var rows = execAll(
      this._db,
      [
        "SELECT p.*, c.name AS customer_name, c.phone AS customer_phone",
        "FROM prescription p INNER JOIN customer c ON c.id = p.customer_id",
        "WHERE p.id = ? AND p.entity_id = ?",
      ].join(" "),
      [id, eid]
    );
    if (!rows.length) return null;
    var header = rows[0];
    var lines = execAll(
      this._db,
      "SELECT * FROM prescription_line WHERE prescription_id = ? ORDER BY id",
      [id]
    );
    return { header: header, lines: lines };
  };

  /** @returns {number|null} */
  MargDb.prototype.getPrescriptionIdByImportKey = function (importKey) {
    var k = importKey != null && String(importKey).trim() ? String(importKey).trim() : "";
    if (!k) return null;
    var eid = this.requireEntityId();
    var rows = execAll(
      this._db,
      "SELECT id FROM prescription WHERE entity_id = ? AND import_key = ? COLLATE NOCASE",
      [eid, k]
    );
    return rows.length ? Number(rows[0].id) : null;
  };

  /**
   * CSV/Excel import: insert or replace lines when import_key (rx_key) matches.
   * @param {{ customer_id: number, doctor_id?: *, doctor_name?: *, doctor_phone?: *, import_key?: string }} header
   * @returns {Promise<{ id: number, updated: boolean }>}
   */
  MargDb.prototype.upsertPrescriptionFromImport = function (header, lines) {
    var key =
      header && header.import_key != null && String(header.import_key).trim()
        ? String(header.import_key).trim()
        : "";
    var self = this;
    if (key) {
      var rxDbMatch = /^RX-DB-(\d+)$/i.exec(key);
      if (rxDbMatch) {
        var legacyId = Number(rxDbMatch[1]);
        var legacyPack = this.getPrescription(legacyId);
        if (legacyPack && legacyPack.header) {
          var ik0 =
            legacyPack.header.import_key != null && String(legacyPack.header.import_key).trim()
              ? String(legacyPack.header.import_key).trim()
              : "";
          if (!ik0 || ik0.toLowerCase() === key.toLowerCase()) {
            var hl = Object.assign({}, header);
            hl.import_key = key;
            return this.updatePrescription(legacyId, hl, lines).then(function () {
              return { id: legacyId, updated: true };
            });
          }
        }
      }
      var rid = this.getPrescriptionIdByImportKey(key);
      if (rid != null) {
        var hu = Object.assign({}, header);
        hu.import_key = key;
        return this.updatePrescription(rid, hu, lines).then(function () {
          return { id: rid, updated: true };
        });
      }
    }
    var hi = Object.assign({}, header);
    if (key) hi.import_key = key;
    return this.insertPrescription(hi, lines).then(function (newId) {
      return { id: newId, updated: false };
    });
  };

  /**
   * @param {{ customer_id: number, doctor_id?: number|string|null, import_key?: string }} header
   * @param {Array<{ prescription_status?: string, prescription_type?: string, prescription_notes?: string, secret_notes?: string }>} lines
   * @returns {Promise<number>} new prescription id
   */
  MargDb.prototype.insertPrescription = function (header, lines) {
    var eid = this.requireEntityId();
    var t = nowIso();
    if (!header || !header.customer_id) {
      return Promise.reject(new Error("Customer is required"));
    }
    var cid = Number(header.customer_id);
    if (!this.getCustomer(cid)) {
      return Promise.reject(new Error("Unknown customer"));
    }
    var doc;
    try {
      doc = this._normalizePrescriptionDoctorFromHeader(header);
    } catch (err) {
      return Promise.reject(err);
    }
    var impKey =
      header.import_key != null && String(header.import_key).trim()
        ? String(header.import_key).trim()
        : null;
    lines = lines || [];
    var self = this;
    var rxId;
    try {
      this._db.run("BEGIN TRANSACTION");
      this._db.run(
        [
          "INSERT INTO prescription (entity_id, customer_id, doctor_id, doctor_name, doctor_phone, import_key, created_at, updated_at)",
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ].join(" "),
        [
          eid,
          cid,
          doc.doctor_id,
          doc.doctor_name,
          doc.doctor_phone,
          impKey,
          t,
          t,
        ]
      );
      rxId = this._db.exec("SELECT last_insert_rowid() AS id")[0].values[0][0];
      lines.forEach(function (ln) {
        var st = ln.prescription_status && String(ln.prescription_status).trim()
          ? String(ln.prescription_status).trim()
          : "draft";
        self._db.run(
          [
            "INSERT INTO prescription_line (prescription_id, prescription_status, prescription_type, prescription_notes, secret_notes, created_at, updated_at)",
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
          ].join(" "),
          [
            rxId,
            st,
            ln.prescription_type != null && String(ln.prescription_type).trim()
              ? String(ln.prescription_type).trim()
              : null,
            ln.prescription_notes != null && String(ln.prescription_notes).trim()
              ? String(ln.prescription_notes).trim()
              : null,
            ln.secret_notes != null && String(ln.secret_notes).trim() ? String(ln.secret_notes).trim() : null,
            t,
            t,
          ]
        );
      });
      this._db.run("COMMIT");
    } catch (err) {
      try {
        this._db.run("ROLLBACK");
      } catch (e2) {
        /* ignore */
      }
      return Promise.reject(err);
    }
    return this.save().then(function () {
      return rxId;
    });
  };

  /**
   * @param {number} id
   * @param {{ customer_id: number, doctor_id?: number|string|null, import_key?: string }} header
   * @param {Array<{ id?: number, prescription_status?: string, prescription_type?: string, prescription_notes?: string, secret_notes?: string }>} lines
   */
  MargDb.prototype.updatePrescription = function (id, header, lines) {
    var eid = this.requireEntityId();
    var t = nowIso();
    var rid = Number(id);
    var existing = this.getPrescription(rid);
    if (!existing) {
      return Promise.reject(new Error("Prescription not found"));
    }
    if (!header || !header.customer_id) {
      return Promise.reject(new Error("Customer is required"));
    }
    var cid = Number(header.customer_id);
    if (!this.getCustomer(cid)) {
      return Promise.reject(new Error("Unknown customer"));
    }
    var doc;
    try {
      doc = this._normalizePrescriptionDoctorFromHeader(header);
    } catch (err) {
      return Promise.reject(err);
    }
    lines = lines || [];
    var self = this;
    try {
      this._db.run("BEGIN TRANSACTION");
      var updSql =
        "UPDATE prescription SET customer_id = ?, doctor_id = ?, doctor_name = ?, doctor_phone = ?, updated_at = ?";
      var updParams = [cid, doc.doctor_id, doc.doctor_name, doc.doctor_phone, t];
      if (Object.prototype.hasOwnProperty.call(header, "import_key")) {
        var ik =
          header.import_key != null && String(header.import_key).trim()
            ? String(header.import_key).trim()
            : null;
        updSql += ", import_key = ?";
        updParams.push(ik);
      }
      updSql += " WHERE id = ? AND entity_id = ?";
      updParams.push(rid, eid);
      this._db.run(updSql, updParams);
      this._db.run("DELETE FROM prescription_line WHERE prescription_id = ?", [rid]);
      lines.forEach(function (ln) {
        var st = ln.prescription_status && String(ln.prescription_status).trim()
          ? String(ln.prescription_status).trim()
          : "draft";
        self._db.run(
          [
            "INSERT INTO prescription_line (prescription_id, prescription_status, prescription_type, prescription_notes, secret_notes, created_at, updated_at)",
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
          ].join(" "),
          [
            rid,
            st,
            ln.prescription_type != null && String(ln.prescription_type).trim()
              ? String(ln.prescription_type).trim()
              : null,
            ln.prescription_notes != null && String(ln.prescription_notes).trim()
              ? String(ln.prescription_notes).trim()
              : null,
            ln.secret_notes != null && String(ln.secret_notes).trim() ? String(ln.secret_notes).trim() : null,
            t,
            t,
          ]
        );
      });
      this._db.run("COMMIT");
    } catch (err) {
      try {
        this._db.run("ROLLBACK");
      } catch (e2) {
        /* ignore */
      }
      return Promise.reject(err);
    }
    return this.save();
  };

  /** @returns {Promise<void>} */
  MargDb.prototype.deletePrescription = function (id) {
    var eid = this.requireEntityId();
    var n = execAll(
      this._db,
      "SELECT id FROM prescription WHERE id = ? AND entity_id = ?",
      [Number(id), eid]
    );
    if (!n.length) {
      return Promise.reject(new Error("Prescription not found"));
    }
    this._db.run("DELETE FROM prescription WHERE id = ? AND entity_id = ?", [Number(id), eid]);
    return this.save();
  };

  MargDb.prototype.listPrescriptionsForCustomer = function (customerId) {
    return this.listPrescriptions({ customerId: customerId });
  };

  /**
   * Dashboard search — excludes secret_notes.
   * @param {string} q
   * @param {number} [limit=8]
   */
  MargDb.prototype.searchPrescriptionsForDashboard = function (q, limit) {
    var eid = this.requireEntityId();
    if (!q || !String(q).trim()) return [];
    var lim = limit != null && limit > 0 ? limit : 8;
    var like = "%" + String(q).trim().toLowerCase() + "%";
    var sql =
      "SELECT p.id, p.doctor_name, p.doctor_phone, p.created_at, c.name AS customer_name" +
      " FROM prescription p INNER JOIN customer c ON c.id = p.customer_id WHERE p.entity_id = ? AND (" +
      "LOWER(IFNULL(p.doctor_name,'')) LIKE ? OR LOWER(IFNULL(p.doctor_phone,'')) LIKE ? OR " +
      "LOWER(c.name) LIKE ? OR LOWER(IFNULL(c.phone,'')) LIKE ? OR " +
      "EXISTS (SELECT 1 FROM prescription_line pl WHERE pl.prescription_id = p.id AND (" +
      "LOWER(IFNULL(pl.prescription_notes,'')) LIKE ? OR LOWER(IFNULL(pl.prescription_type,'')) LIKE ? OR " +
      "LOWER(IFNULL(pl.prescription_status,'')) LIKE ?" +
      "))) ORDER BY p.updated_at DESC LIMIT ?";
    return execAll(this._db, sql, [eid, like, like, like, like, like, like, like, lim]);
  };

  /**
   * Prescription groups for customer detail timeline (no secret_notes in line text).
   * Newest prescription first; each group has nested line events (newest line activity first within group).
   * @param {number} customerId
   * @returns {Array<{
   *   prescription_id: number,
   *   at: string,
   *   title: string,
   *   detail: string,
   *   href: string,
   *   lineEvents: Array<{ at: string, kind: string, title: string, detail: string, line_id?: number, href: string }>
   * }>}
   */
  MargDb.prototype.getCustomerPrescriptionTimeline = function (customerId) {
    var eid = this.requireEntityId();
    var cid = Number(customerId);
    var rxList = execAll(
      this._db,
      "SELECT * FROM prescription WHERE entity_id = ? AND customer_id = ? ORDER BY created_at DESC",
      [eid, cid]
    );
    var self = this;
    var groups = [];
    rxList.forEach(function (rx) {
      var doc = [rx.doctor_name, rx.doctor_phone].filter(function (x) {
        return x && String(x).trim();
      });
      var lineEvents = [];
      var lines = execAll(
        self._db,
        "SELECT * FROM prescription_line WHERE prescription_id = ? ORDER BY id",
        [rx.id]
      );
      lines.forEach(function (ln) {
        var st = (ln.prescription_status || "").trim();
        var ty = (ln.prescription_type || "").trim();
        var pub = (ln.prescription_notes || "").trim();
        var detail =
          (st || "line") + (ty ? " — " + ty : "") + (pub ? ": " + pub.slice(0, 120) : "");
        lineEvents.push({
          at: ln.created_at,
          kind: "line",
          title: "Prescription line",
          detail: detail,
          prescription_id: rx.id,
          line_id: ln.id,
          href: "prescription-detail.html?id=" + rx.id,
        });
        if (ln.updated_at && ln.created_at && String(ln.updated_at) !== String(ln.created_at)) {
          lineEvents.push({
            at: ln.updated_at,
            kind: "line_update",
            title: "Line updated",
            detail: detail,
            prescription_id: rx.id,
            line_id: ln.id,
            href: "prescription-detail.html?id=" + rx.id,
          });
        }
      });
      lineEvents.sort(function (a, b) {
        return String(b.at).localeCompare(String(a.at));
      });
      groups.push({
        prescription_id: rx.id,
        at: rx.created_at,
        title: "Prescription recorded",
        detail: doc.length ? doc.join(" · ") : "—",
        href: "prescription-detail.html?id=" + rx.id,
        lineEvents: lineEvents,
      });
    });
    return groups;
  };

  /**
   * Row counts for the active entity (Import & export dashboard).
   * @returns {{ products: number, vendors: number, customers: number, lots: number, orders: number, prescriptions?: number }}
   */
  MargDb.prototype.getMasterDataCounts = function () {
    var eid = this.requireEntityId();
    var n = function (sql) {
      var rows = execAll(this._db, sql, [eid]);
      return rows.length ? Number(rows[0].c) : 0;
    }.bind(this);
    var out = {
      products: n("SELECT COUNT(*) AS c FROM product WHERE entity_id = ?"),
      vendors: n("SELECT COUNT(*) AS c FROM vendor WHERE entity_id = ?"),
      customers: n("SELECT COUNT(*) AS c FROM customer WHERE entity_id = ?"),
      lots: n("SELECT COUNT(*) AS c FROM lot WHERE entity_id = ?"),
      orders: n("SELECT COUNT(*) AS c FROM shop_order WHERE entity_id = ?"),
    };
    try {
      out.prescriptions = n("SELECT COUNT(*) AS c FROM prescription WHERE entity_id = ?");
    } catch (e) {
      out.prescriptions = 0;
    }
    return out;
  };

  /**
   * Remove all Excel-importable domain data for the active entity (orders, lots, vendors, products, customers).
   * Uses FK cascades: shop_order → order_line → order_line_schedule; lot → lot_line; vendor → vendor_poc.
   * Does not change entity row (name, invoice_format_json, terms, etc.).
   * @returns {Promise<void>}
   */
  MargDb.prototype.clearEntityDomainDataForFullExcelImport = function () {
    var eid = this.requireEntityId();
    var db = this._db;
    try {
      db.run("BEGIN TRANSACTION");
      db.run("DELETE FROM shop_order WHERE entity_id = ?", [eid]);
      try {
        db.run("DELETE FROM customer_payment WHERE entity_id = ?", [eid]);
      } catch (pe) {
        /* table missing on old DB */
      }
      try {
        db.run("DELETE FROM prescription WHERE entity_id = ?", [eid]);
      } catch (pe) {
        /* prescription table missing on very old DB */
      }
      db.run("DELETE FROM lot WHERE entity_id = ?", [eid]);
      db.run("DELETE FROM vendor WHERE entity_id = ?", [eid]);
      db.run("DELETE FROM product WHERE entity_id = ?", [eid]);
      try {
        db.run("DELETE FROM product_type WHERE entity_id = ?", [eid]);
      } catch (pte) {
        /* table missing */
      }
      db.run("DELETE FROM customer WHERE entity_id = ?", [eid]);
      db.run("COMMIT");
    } catch (err) {
      try {
        db.run("ROLLBACK");
      } catch (e2) {
        /* ignore */
      }
      return Promise.reject(err);
    }
    return this.save();
  };

  /**
   * Minimal backup import (v1 stub): { "entity": { entity_name, session_key, created_at?, ... } }
   * Full envelope TBD docs/admin.md
   */
  MargDb.prototype.importBackupJson = function (obj) {
    if (!obj || typeof obj !== "object") {
      return Promise.reject(new Error("Invalid backup file"));
    }
    var ent = obj.entity;
    if (!ent || !ent.entity_name || !ent.session_key) {
      return Promise.reject(new Error("Backup missing entity.entity_name or entity.session_key"));
    }
    var t = nowIso();
    var stmt = this._db.prepare("SELECT id FROM entity WHERE entity_name = ?");
    stmt.bind([ent.entity_name]);
    var existingId = null;
    if (stmt.step()) {
      existingId = stmt.getAsObject().id;
    }
    stmt.free();

    if (existingId != null) {
      this._db.run(
        "UPDATE entity SET session_key = ?, updated_at = ? WHERE id = ?",
        [ent.session_key, ent.updated_at || t, existingId]
      );
    } else {
      this._db.run(
        "INSERT INTO entity (entity_name, session_key, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [ent.entity_name, ent.session_key, ent.created_at || t, ent.updated_at || t]
      );
      var idRow = this._db.exec("SELECT last_insert_rowid() AS id");
      existingId = idRow[0].values[0][0];
    }
    this._db.run("UPDATE app_state SET current_entity_id = ?, updated_at = ? WHERE singleton = 1", [
      existingId,
      t,
    ]);
    return this.save().then(function () {
      return existingId;
    });
  };

  /**
   * Replace entire IndexedDB SQLite blob (e.g. download from sync server GET /api/sync). Reloads the page.
   * @param {Uint8Array} buf
   * @param {{ serverRev?: number }} [opts] — if set, applied to app_state.sync_rev_seen after reload (via sessionStorage).
   * @returns {Promise<void>}
   */
  global.margReplaceLocalDatabaseBlob = function (buf, opts) {
    if (!buf || !buf.byteLength) {
      return Promise.reject(new Error("Empty backup"));
    }
    var o = opts || {};
    if (o.serverRev != null && typeof sessionStorage !== "undefined") {
      try {
        var sr = Math.max(0, Number(o.serverRev) || 0);
        sessionStorage.setItem("marg-sync-rev-pending", String(sr));
      } catch (e) {
        /* ignore */
      }
    }
    return idbSetBuffer(buf).then(function () {
      if (typeof global.location !== "undefined") {
        global.location.reload();
      }
    });
  };

  global.MargDb = MargDb;
  global.margOpenDatabase = openDatabase;
})(typeof window !== "undefined" ? window : this);
