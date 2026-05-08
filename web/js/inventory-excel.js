/**
 * Excel (.xlsx) import for Entity (optional), CommonDetails (optional JSON + tables), Products, Vendors, …
 * Sheets (case-insensitive): Entity, CommonDetails (key/value row json_snapshot + human-readable copy), Products, …
 */
(function (global) {
  function rupeesToPaise(v) {
    if (v === "" || v == null) return null;
    var n = parseFloat(String(v).replace(/,/g, ""));
    if (isNaN(n)) return null;
    return Math.round(n * 100);
  }

  function normalizeRowKeys(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      var nk = String(k)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
      out[nk] = obj[k];
    });
    return out;
  }

  function entityRowHasContent(row) {
    if (!row || typeof row !== "object") return false;
    var r = normalizeRowKeys(row);
    var keys = [
      "entity_name",
      "legal_name",
      "proprietor_name",
      "phone",
      "alternate_phone",
      "email",
      "website",
      "line1",
      "line2",
      "city",
      "state",
      "pincode",
      "country",
      "dl_number",
      "dl_valid_from",
      "dl_valid_to",
      "gstin",
      "pan",
      "tagline",
      "default_currency",
      "default_timezone",
      "invoice_prefix",
      "notes",
      "auto_reorder_level",
      "expiry_alert_days",
      "accepted_payments_json",
      "accepted_payments",
      "invoice_format_json",
      "terms_and_conditions",
    ];
    var i;
    for (i = 0; i < keys.length; i++) {
      var v = r[keys[i]];
      if (v === undefined || v === null) continue;
      if (String(v).trim() !== "") return true;
    }
    return false;
  }

  function cellToIsoDate(val) {
    if (val == null || val === "") return null;
    if (val instanceof Date && !isNaN(val.getTime())) {
      return val.toISOString().slice(0, 10);
    }
    if (typeof val === "number") {
      var utc_days = Math.floor(val - 25569);
      var d = new Date(utc_days * 86400 * 1000);
      return d.toISOString().slice(0, 10);
    }
    var s = String(val).trim();
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  function findSheet(wb, want) {
    var w = want.toLowerCase();
    var name = wb.SheetNames.find(function (n) {
      return n.trim().toLowerCase() === w;
    });
    return name ? wb.Sheets[name] : null;
  }

  /** Build CommonDetails JSON: entity profile only (staff is on separate Staff sheet). */
  function buildCommonDetailsSnapshotObject(db) {
    var ent = db.getCurrentEntity ? db.getCurrentEntity() : null;
    if (!ent) {
      return { format_version: 1, entity: {} };
    }
    var entityOut = {};
    var keys = [
      "entity_name",
      "legal_name",
      "proprietor_name",
      "phone",
      "alternate_phone",
      "email",
      "website",
      "line1",
      "line2",
      "city",
      "state",
      "pincode",
      "country",
      "dl_number",
      "dl_valid_from",
      "dl_valid_to",
      "gstin",
      "pan",
      "tagline",
      "default_currency",
      "default_timezone",
      "invoice_prefix",
      "notes",
      "auto_reorder_level",
      "expiry_alert_days",
      "accepted_payments",
      "terms_and_conditions",
      "invoice_format_json",
    ];
    keys.forEach(function (k) {
      if (ent[k] !== undefined && ent[k] !== null) {
        entityOut[k] = ent[k];
      }
    });
    return { format_version: 1, entity: entityOut };
  }

  /** Array-of-arrays for sheet CommonDetails: json_snapshot + human-readable entity key/value only. */
  function buildCommonDetailsSheetAoa(db) {
    var snap = buildCommonDetailsSnapshotObject(db);
    var jsonStr = JSON.stringify(snap);
    var aoa = [
      ["key", "value"],
      ["json_snapshot", jsonStr],
      [],
      ["--- Human-readable entity fields (same as json_snapshot) ---", ""],
      ["entity_field", "value"],
    ];
    Object.keys(snap.entity || {}).forEach(function (k) {
      var v = snap.entity[k];
      aoa.push([k, v != null ? String(v) : ""]);
    });
    aoa.push([]);
    aoa.push(["Note: Staff users are exported on the Staff sheet.", ""]);
    return aoa;
  }

  /** Column order for sheet Entity (one data row) — matches applyEntityExcelRow in db.js. */
  var ENTITY_EXPORT_COLUMNS = [
    "entity_name",
    "legal_name",
    "proprietor_name",
    "phone",
    "alternate_phone",
    "email",
    "website",
    "line1",
    "line2",
    "city",
    "state",
    "pincode",
    "country",
    "dl_number",
    "dl_valid_from",
    "dl_valid_to",
    "gstin",
    "pan",
    "tagline",
    "default_currency",
    "default_timezone",
    "invoice_prefix",
    "notes",
    "auto_reorder_level",
    "expiry_alert_days",
    "accepted_payments",
    "invoice_format_json",
    "terms_and_conditions",
  ];

  function entityRowToExportArray(ent) {
    var row = [];
    var i;
    for (i = 0; i < ENTITY_EXPORT_COLUMNS.length; i++) {
      var col = ENTITY_EXPORT_COLUMNS[i];
      var v = ent && ent[col] != null ? ent[col] : "";
      if (col === "auto_reorder_level" || col === "expiry_alert_days") {
        row.push(v !== "" && v != null ? Number(v) : "");
      } else {
        row.push(v !== undefined && v !== null ? String(v) : "");
      }
    }
    return row;
  }

  function buildStaffSheetAoa(db) {
    var header = ["id", "name", "email", "phone", "role", "created_at", "updated_at"];
    var aoa = [header];
    if (typeof db.listStaff !== "function") {
      return aoa;
    }
    db.listStaff().forEach(function (s) {
      aoa.push([
        s.id,
        s.name || "",
        s.email != null ? s.email : "",
        s.phone != null ? s.phone : "",
        s.role || "",
        s.created_at || "",
        s.updated_at || "",
      ]);
    });
    return aoa;
  }

  function rowToStaff(o) {
    var r = normalizeRowKeys(o);
    var name = (r.name || "").trim();
    if (!name) return null;
    var roleStr = String(r.role || "staff").trim().toLowerCase();
    var role = roleStr === "admin" ? "admin" : roleStr === "doctor" ? "doctor" : "staff";
    return {
      id: r.id !== undefined && r.id !== "" && r.id != null ? Number(r.id) : null,
      name: name,
      email: r.email != null && String(r.email).trim() ? String(r.email).trim() : null,
      phone: r.phone != null && String(r.phone).trim() ? String(r.phone).trim() : null,
      role: role,
    };
  }

  function parseStaffSheet(wb) {
    var ws = findSheet(wb, "Staff");
    if (!ws) return [];
    return sheetToRows(ws)
      .map(rowToStaff)
      .filter(Boolean);
  }

  /** Parse sheet CommonDetails / Common Details — primary row key=value json_snapshot. */
  function parseCommonDetailsSheet(wb) {
    var ws = findSheet(wb, "CommonDetails") || findSheet(wb, "Common Details");
    if (!ws) return null;
    var rows = sheetToRows(ws);
    if (!rows.length) return null;
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = normalizeRowKeys(rows[i]);
      var key = (r.key || r.field || r.name || "").trim().toLowerCase();
      if (key === "json_snapshot" || key === "common_details_json") {
        var val = r.value != null ? r.value : r.json != null ? r.json : r.data;
        if (val != null && String(val).trim()) {
          try {
            return JSON.parse(String(val).trim());
          } catch (e) {
            return null;
          }
        }
      }
    }
    return null;
  }

  function sheetToRows(ws) {
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
  }

  function rowToProduct(o) {
    var r = normalizeRowKeys(o);
    var name = (r.name || r.product_name || r.medicine_name || "").trim();
    if (!name) return null;
    return {
      name: name,
      code: r.code || r.sku || null,
      barcode: r.barcode || null,
      pack_label: r.pack_label || r.pack || null,
      strips_per_pack: r.strips_per_pack !== "" && r.strips_per_pack != null ? Number(r.strips_per_pack) : 1,
      units_per_strip:
        r.units_per_strip !== "" && r.units_per_strip != null ? Number(r.units_per_strip) : null,
      description: r.description || null,
      chemical_composition: r.chemical_composition || r.composition || null,
      general_recommendation: r.general_recommendation || null,
      where_to_use: r.where_to_use || r.indications || null,
    };
  }

  function rowToVendor(o) {
    var r = normalizeRowKeys(o);
    var name = (r.name || r.vendor_name || "").trim();
    if (!name) return null;
    return {
      name: name,
      phone: r.phone || null,
      email: r.email || null,
      address_line1: r.address_line1 || r.address || null,
      address_line2: r.address_line2 || null,
      city: r.city || null,
      state: r.state || null,
      pincode: r.pincode || null,
      gstin: r.gstin || null,
      notes: r.notes || null,
    };
  }

  function rowToLot(o) {
    var r = normalizeRowKeys(o);
    var lotNumber = (r.lot_number || r.invoice_number || r.invoice || "").trim();
    if (!lotNumber) return null;
    return {
      lot_number: lotNumber,
      vendor_name: (r.vendor_name || r.supplier || r.vendor || "").trim() || null,
      lot_date: cellToIsoDate(r.lot_date),
      delivered_date: cellToIsoDate(r.delivered_date),
      total_price_rupees: r.total_price_inr || r.total_price_rupees || r.total_price || r.total,
      margin_rupees: r.margin_inr || r.margin_rupees || r.margin,
      total_paid_rupees: r.total_paid_inr || r.total_paid_rupees || r.total_paid || r.paid,
      delivered_by: r.delivered_by || null,
      notes: r.notes || null,
    };
  }

  function rowToCustomer(o) {
    var r = normalizeRowKeys(o);
    var name = (r.name || r.customer_name || "").trim();
    if (!name) return null;
    return {
      name: name,
      phone: r.phone || null,
      email: r.email || null,
      address_line1: r.address_line1 || r.address || null,
      address_line2: r.address_line2 || null,
      city: r.city || null,
      state: r.state || null,
      pincode: r.pincode || null,
      notes: r.notes || null,
    };
  }

  function rowToOrderHeader(o) {
    var r = normalizeRowKeys(o);
    var name = (r.customer_name || r.name || "").trim();
    var onum = (r.order_number || r.order_no || "").trim();
    if (!name || !onum) return null;
    return {
      order_number: onum,
      customer_name: name,
      customer_phone: r.customer_phone || r.phone || null,
      order_date: r.order_date,
      order_discount_inr: r.order_discount_inr || r.discount_inr || "",
      status: r.status || "draft",
      notes: r.notes || null,
    };
  }

  function rowToOrderLine(o) {
    var r = normalizeRowKeys(o);
    var onum = (r.order_number || r.order_no || "").trim();
    if (!onum) return null;
    return {
      order_number: onum,
      product_code: r.product_code || r.code || null,
      product_name: r.product_name || r.medicine_name || null,
      quantity: r.quantity,
      line_total_inr: r.line_total_inr || r.line_total_rupees || r.total_inr || r.line_total,
      line_notes: r.line_notes || null,
      morning: r.morning,
      noon: r.noon,
      evening: r.evening,
      night: r.night,
      schedule_remarks: r.schedule_remarks || r.remarks || null,
    };
  }

  function truthyScheduleCell(v) {
    if (v === true || v === 1) return true;
    var s = String(v == null ? "" : v).trim().toLowerCase();
    return s === "1" || s === "yes" || s === "y" || s === "true";
  }

  function normalizeOrderStatus(s) {
    var t = String(s || "draft").trim().toLowerCase();
    if (t === "confirmed" || t === "confirm") return "confirmed";
    if (t === "cancelled" || t === "canceled") return "cancelled";
    return "draft";
  }

  function findCustomerIdByNameOrPhone(db, name, phone) {
    var rows = db.listCustomers("");
    var n = String(name || "").trim().toLowerCase();
    var p = phone ? String(phone).trim() : "";
    var byName = null;
    var i;
    for (i = 0; i < rows.length; i++) {
      if (String(rows[i].name || "").trim().toLowerCase() === n) {
        if (p && String(rows[i].phone || "").trim() === p) return rows[i].id;
        byName = rows[i].id;
      }
    }
    if (byName != null) return byName;
    if (p) {
      for (i = 0; i < rows.length; i++) {
        if (String(rows[i].phone || "").trim() === p) return rows[i].id;
      }
    }
    return null;
  }

  function rowToPrescriptionHeader(o) {
    var r = normalizeRowKeys(o);
    var key = (r.rx_key || r.prescription_key || r.key || "").trim();
    var name = (r.customer_name || r.name || "").trim();
    if (!key || !name) return null;
    return {
      rx_key: key,
      customer_name: name,
      customer_phone: r.customer_phone || r.phone || null,
      doctor_name: r.doctor_name || null,
      doctor_phone: r.doctor_phone || null,
    };
  }

  function rowToPrescriptionLine(o) {
    var r = normalizeRowKeys(o);
    var key = (r.rx_key || r.prescription_key || r.key || "").trim();
    if (!key) return null;
    return {
      rx_key: key,
      prescription_status: r.prescription_status || r.status || "draft",
      prescription_type: r.prescription_type || r.type || null,
      prescription_notes: r.prescription_notes || r.notes || null,
      secret_notes: r.secret_notes || null,
    };
  }

  function importPrescriptionsFromSheets(db, headers, lines) {
    var linesByKey = {};
    (lines || []).forEach(function (ln) {
      var k = String(ln.rx_key || "").trim();
      if (!k) return;
      if (!linesByKey[k]) linesByKey[k] = [];
      linesByKey[k].push(ln);
    });
    var count = 0;
    var errors = [];
    return headers.reduce(function (p, h) {
      return p.then(function () {
        var key = String(h.rx_key || "").trim();
        var dbLines = linesByKey[key] || [];
        if (!dbLines.length) {
          errors.push('Prescription "' + key + '": no PrescriptionLines rows.');
          return Promise.resolve();
        }
        var cid = findCustomerIdByNameOrPhone(db, h.customer_name, h.customer_phone);
        if (!cid) {
          errors.push('Prescription "' + key + '": customer not found: "' + h.customer_name + '".');
          return Promise.resolve();
        }
        var payload = dbLines.map(function (ln) {
          return {
            prescription_status: ln.prescription_status ? String(ln.prescription_status).trim() : "draft",
            prescription_type: ln.prescription_type ? String(ln.prescription_type).trim() : null,
            prescription_notes: ln.prescription_notes ? String(ln.prescription_notes).trim() : null,
            secret_notes: ln.secret_notes ? String(ln.secret_notes).trim() : null,
          };
        });
        return db
          .insertPrescription(
            {
              customer_id: cid,
              doctor_name: h.doctor_name ? String(h.doctor_name).trim() : null,
              doctor_phone: h.doctor_phone ? String(h.doctor_phone).trim() : null,
            },
            payload
          )
          .then(function () {
            count++;
          })
          .catch(function (err) {
            errors.push(key + ": " + (err && err.message ? err.message : String(err)));
          });
      });
    }, Promise.resolve()).then(function () {
      return { count: count, errors: errors };
    });
  }

  function importOrdersFromSheets(db, orders, orderLines) {
    var maps = buildProductMaps(db);
    var linesByOrder = {};
    orderLines.forEach(function (ln) {
      var key = String(ln.order_number || "").trim();
      if (!key) return;
      if (!linesByOrder[key]) linesByOrder[key] = [];
      linesByOrder[key].push(ln);
    });
    var count = 0;
    var errors = [];
    return orders
      .reduce(function (p, ord) {
        return p.then(function () {
          var onum = String(ord.order_number || "").trim();
          var lines = linesByOrder[onum] || [];
          if (!lines.length) {
            errors.push("Order " + onum + ": no matching OrderLines rows.");
            return Promise.resolve();
          }
          var cid = findCustomerIdByNameOrPhone(db, ord.customer_name, ord.customer_phone);
          if (!cid) {
            errors.push('Order ' + onum + ': customer not found: "' + ord.customer_name + '".');
            return Promise.resolve();
          }
          var dbLines = [];
          var i;
          var ok = true;
          for (i = 0; i < lines.length; i++) {
            var ln = lines[i];
            var pid = resolveProductId(maps, {
              product_code: ln.product_code,
              product_name: ln.product_name,
            });
            if (!pid) {
              errors.push("Order " + onum + ": unknown product on line " + (i + 1));
              ok = false;
              break;
            }
            var tp = rupeesToPaise(ln.line_total_inr);
            if (tp === null || tp < 0) {
              errors.push("Order " + onum + ": invalid line total on line " + (i + 1));
              ok = false;
              break;
            }
            var qty = Number(ln.quantity);
            if (!(qty > 0)) {
              errors.push("Order " + onum + ": quantity must be > 0 on line " + (i + 1));
              ok = false;
              break;
            }
            dbLines.push({
              product_id: pid,
              quantity: qty,
              total_price_paise: tp,
              line_discount_paise: 0,
              line_notes: ln.line_notes || null,
              schedule: {
                in_morning: truthyScheduleCell(ln.morning),
                in_noon: truthyScheduleCell(ln.noon),
                in_evening: truthyScheduleCell(ln.evening),
                in_night: truthyScheduleCell(ln.night),
                remarks: ln.schedule_remarks || null,
              },
            });
          }
          if (!ok) return Promise.resolve();
          var disc = rupeesToPaise(ord.order_discount_inr);
          var header = {
            customer_id: cid,
            order_date: cellToIsoDate(ord.order_date) || new Date().toISOString().slice(0, 10),
            order_number: onum,
            order_discount_paise: disc == null ? 0 : Math.max(0, disc),
            notes: ord.notes || null,
            status: normalizeOrderStatus(ord.status),
          };
          return db
            .insertOrderWithLines(header, dbLines)
            .then(function () {
              count++;
            })
            .catch(function (err) {
              errors.push(onum + ": " + (err && err.message ? err.message : String(err)));
            });
        });
      }, Promise.resolve())
      .then(function () {
        return { count: count, errors: errors };
      });
  }

  function rowToLotLine(o) {
    var r = normalizeRowKeys(o);
    var lotNumber = (r.lot_number || "").trim();
    if (!lotNumber) return null;
    var stripQty = r.quantity;
    if (stripQty === "" || stripQty == null) stripQty = r.strips;
    var availRaw = r.available_strips;
    if (availRaw === "" || availRaw == null) availRaw = r.available_count;
    return {
      lot_number: lotNumber,
      product_code: (r.product_code || r.code || "").trim() || null,
      product_name: (r.product_name || r.medicine_name || "").trim() || null,
      quantity: stripQty,
      available_strips: availRaw,
      delivered_on: cellToIsoDate(r.delivered_on),
      strip_mrp_inr:
        r.strip_mrp_inr || r.strip_mrp_rupees || r.mrp_inr || r.strip_mrp || null,
      selling_price_inr: r.selling_price_inr || r.selling_price_rupees || r.selling_price,
    };
  }

  function parseWorkbookArrayBuffer(ab) {
    var wb = XLSX.read(ab, { type: "array", cellDates: true });
    var products = sheetToRows(findSheet(wb, "Products"))
      .map(rowToProduct)
      .filter(Boolean);
    var vendors = sheetToRows(findSheet(wb, "Vendors"))
      .map(rowToVendor)
      .filter(Boolean);
    var lots = sheetToRows(findSheet(wb, "Lots"))
      .map(rowToLot)
      .filter(Boolean);
    var lotLines = sheetToRows(findSheet(wb, "LotLines"))
      .map(rowToLotLine)
      .filter(Boolean);
    var customers = sheetToRows(findSheet(wb, "Customers"))
      .map(rowToCustomer)
      .filter(Boolean);
    var orders = sheetToRows(findSheet(wb, "Orders"))
      .map(rowToOrderHeader)
      .filter(Boolean);
    var orderLines = sheetToRows(findSheet(wb, "OrderLines"))
      .map(rowToOrderLine)
      .filter(Boolean);
    var prescriptions = sheetToRows(findSheet(wb, "Prescriptions"))
      .map(rowToPrescriptionHeader)
      .filter(Boolean);
    var prescriptionLines = sheetToRows(findSheet(wb, "PrescriptionLines"))
      .map(rowToPrescriptionLine)
      .filter(Boolean);
    var entitySheetRows = sheetToRows(findSheet(wb, "Entity"));
    var entityRow = entitySheetRows.length ? entitySheetRows[0] : null;
    var commonDetailsSnapshot = parseCommonDetailsSheet(wb);
    var staffRows = parseStaffSheet(wb);
    return {
      entityRow: entityRow,
      commonDetailsSnapshot: commonDetailsSnapshot,
      staffRows: staffRows,
      products: products,
      vendors: vendors,
      customers: customers,
      prescriptions: prescriptions,
      prescriptionLines: prescriptionLines,
      orders: orders,
      orderLines: orderLines,
      lots: lots,
      lotLines: lotLines,
    };
  }

  function buildVendorNameMap(db) {
    var m = {};
    db.listVendors().forEach(function (v) {
      m[String(v.name).trim().toLowerCase()] = v.id;
    });
    return m;
  }

  function buildProductMaps(db) {
    var byCode = {};
    var byName = {};
    db.listProducts("", "all").forEach(function (p) {
      if (p.code && String(p.code).trim()) {
        byCode[String(p.code).trim().toLowerCase()] = p.id;
      }
      byName[String(p.name).trim().toLowerCase()] = p.id;
    });
    return { byCode: byCode, byName: byName };
  }

  function resolveProductId(maps, line) {
    var code = line.product_code;
    var name = line.product_name;
    if (code) {
      var id = maps.byCode[String(code).trim().toLowerCase()];
      if (id) return id;
    }
    if (name) {
      var id2 = maps.byName[String(name).trim().toLowerCase()];
      if (id2) return id2;
    }
    return null;
  }

  /**
   * @param {{ fullReplace?: boolean }} [options] — if fullReplace, clears existing domain data for the entity before import
   * @returns {Promise<{ vendors: number, products: number, customers: number, orders: number, lots: number, prescriptions?: number, errors: string[], replaced?: boolean }>}
   */
  function importWorkbook(db, data, options) {
    options = options || {};
    var stats = {
      vendors: 0,
      products: 0,
      customers: 0,
      orders: 0,
      lots: 0,
      prescriptions: 0,
      entity: 0,
      commonDetails: 0,
      staffSheet: 0,
      errors: [],
    };
    var chain = Promise.resolve();

    if (options.fullReplace) {
      chain = chain.then(function () {
        if (typeof db.clearEntityDomainDataForFullExcelImport !== "function") {
          return Promise.reject(new Error("Database does not support full replace import."));
        }
        return db.clearEntityDomainDataForFullExcelImport();
      });
      chain = chain.then(function () {
        stats.replaced = true;
      });
    }

    if (data.vendors.length) {
      chain = chain.then(function () {
        return db.importVendorsBatch(data.vendors);
      });
      chain = chain.then(function (n) {
        stats.vendors = n;
      });
    }

    if (data.products.length) {
      chain = chain.then(function () {
        return db.importProductsBatch(data.products);
      });
      chain = chain.then(function (n) {
        stats.products = n;
      });
    }

    if (data.customers && data.customers.length) {
      chain = chain.then(function () {
        return db.importCustomersBatch(data.customers);
      });
      chain = chain.then(function (n) {
        stats.customers = n;
      });
    }

    chain = chain.then(function () {
      var ph = data.prescriptions || [];
      var pl = data.prescriptionLines || [];
      if (!ph.length) {
        return { count: 0, errors: [] };
      }
      if (typeof db.insertPrescription !== "function") {
        return { count: 0, errors: ["Prescriptions sheet skipped: database module outdated."] };
      }
      return importPrescriptionsFromSheets(db, ph, pl);
    });
    chain = chain.then(function (res) {
      stats.prescriptions = res.count;
      stats.errors = stats.errors.concat(res.errors || []);
    });

    chain = chain.then(function () {
      var ord = data.orders || [];
      var ol = data.orderLines || [];
      if (!ord.length) {
        return { count: 0, errors: [] };
      }
      return importOrdersFromSheets(db, ord, ol);
    });
    chain = chain.then(function (res) {
      stats.orders = res.count;
      stats.errors = stats.errors.concat(res.errors || []);
    });

    chain = chain.then(function () {
      if (!data.lots.length) return Promise.resolve();
      var vendorMap = buildVendorNameMap(db);
      var productMaps = buildProductMaps(db);
      var linesByLot = {};
      data.lotLines.forEach(function (ln) {
        if (!linesByLot[ln.lot_number]) linesByLot[ln.lot_number] = [];
        linesByLot[ln.lot_number].push(ln);
      });

      return data.lots.reduce(function (p, lot) {
        return p.then(function () {
          var lines = linesByLot[lot.lot_number] || [];
          if (!lines.length) {
            stats.errors.push("Lot " + lot.lot_number + ": no rows in LotLines sheet.");
            return Promise.resolve();
          }
          var vendorId = null;
          if (lot.vendor_name) {
            vendorId = vendorMap[lot.vendor_name.toLowerCase()];
            if (vendorId == null) {
              stats.errors.push("Lot " + lot.lot_number + ': unknown vendor "' + lot.vendor_name + '".');
              return Promise.resolve();
            }
          }
          var dbLines = [];
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            var pid = resolveProductId(productMaps, ln);
            if (pid == null) {
              stats.errors.push(
                "Lot " + lot.lot_number + ": unknown product (code/name) on line " + (i + 1)
              );
              return Promise.resolve();
            }
            var sp = rupeesToPaise(ln.selling_price_inr);
            if (sp === null || sp < 0) {
              stats.errors.push(
                "Lot " + lot.lot_number + ": invalid selling price on line " + (i + 1)
              );
              return Promise.resolve();
            }
            var mrpSp = rupeesToPaise(ln.strip_mrp_inr);
            if (mrpSp === null || mrpSp < 0) {
              mrpSp = sp;
            }
            var qty = Number(ln.quantity);
            if (!(qty > 0)) {
              stats.errors.push("Lot " + lot.lot_number + ": quantity must be > 0 on line " + (i + 1));
              return Promise.resolve();
            }
            var av =
              ln.available_strips !== "" && ln.available_strips != null && !isNaN(Number(ln.available_strips))
                ? Number(ln.available_strips)
                : qty;
            if (!(av >= 0) || av > qty || isNaN(av)) {
              stats.errors.push(
                "Lot " + lot.lot_number + ": available_strips must be 0–strips on line " + (i + 1)
              );
              return Promise.resolve();
            }
            dbLines.push({
              product_id: pid,
              quantity: qty,
              available_count: Math.round(av),
              delivered_on: ln.delivered_on || null,
              selling_price_paise: sp,
              strip_mrp_paise: mrpSp,
            });
          }
          var header = {
            lot_number: lot.lot_number,
            vendor_id: vendorId,
            lot_date: lot.lot_date || null,
            delivered_date: lot.delivered_date || null,
            total_price_paise: rupeesToPaise(lot.total_price_rupees),
            margin_paise: rupeesToPaise(lot.margin_rupees),
            total_paid_paise: rupeesToPaise(lot.total_paid_rupees),
            delivered_by: lot.delivered_by || null,
            notes: lot.notes || null,
          };
          return db
            .insertLotWithLines(header, dbLines)
            .then(function () {
              stats.lots++;
            })
            .catch(function (err) {
              stats.errors.push(
                lot.lot_number + ": " + (err && err.message ? err.message : String(err))
              );
            });
        });
      }, Promise.resolve());
    });

    chain = chain.then(function () {
      if (!data.entityRow || typeof db.applyEntityExcelRow !== "function") {
        return Promise.resolve();
      }
      if (!entityRowHasContent(data.entityRow)) {
        return Promise.resolve();
      }
      return db
        .applyEntityExcelRow(data.entityRow)
        .then(function () {
          stats.entity = 1;
        })
        .catch(function (err) {
          stats.errors.push("Entity sheet: " + (err && err.message ? err.message : String(err)));
        });
    });

    chain = chain.then(function () {
      if (!data.commonDetailsSnapshot || typeof db.applyCommonDetailsSnapshot !== "function") {
        return Promise.resolve();
      }
      return db
        .applyCommonDetailsSnapshot(data.commonDetailsSnapshot)
        .then(function () {
          stats.commonDetails = 1;
        })
        .catch(function (err) {
          stats.errors.push("CommonDetails: " + (err && err.message ? err.message : String(err)));
        });
    });

    chain = chain.then(function () {
      if (!data.staffRows || !data.staffRows.length || typeof db.applyStaffImportRows !== "function") {
        return Promise.resolve();
      }
      return db
        .applyStaffImportRows(data.staffRows)
        .then(function () {
          return db.syncCurrentStaffForActiveEntity ? db.syncCurrentStaffForActiveEntity() : undefined;
        })
        .then(function () {
          stats.staffSheet = 1;
        })
        .catch(function (err) {
          stats.errors.push("Staff sheet: " + (err && err.message ? err.message : String(err)));
        });
    });

    return chain.then(function () {
      return stats;
    });
  }

  function paiseToInrExport(p) {
    var n = (Number(p) || 0) / 100;
    return Math.round(n * 100) / 100;
  }

  function safeOrderNumber(o) {
    if (o.order_number && String(o.order_number).trim()) return String(o.order_number).trim();
    return "ORD-" + String(o.id).padStart(6, "0");
  }

  function sanitizeExportFilenamePart(s) {
    var t = String(s || "entity")
      .trim()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return t || "entity";
  }

  /**
   * Export current entity to .xlsx — same sheet names and columns as import / sample workbook.
   * Prescriptions use stable keys RX-DB-{id} for round-trip.
   */
  function exportEntityInventoryExcel(db) {
    if (typeof XLSX === "undefined") {
      throw new Error("Excel library not loaded.");
    }
    var ent = db.getCurrentEntity ? db.getCurrentEntity() : db.getEntityById(db.getCurrentEntityId());
    var slug = sanitizeExportFilenamePart(ent && ent.entity_name);

    var entitySheet = [ENTITY_EXPORT_COLUMNS, entityRowToExportArray(ent)];
    var staffSheetAoa = buildStaffSheetAoa(db);

    var products = [
      [
        "name",
        "code",
        "barcode",
        "pack_label",
        "strips_per_pack",
        "units_per_strip",
        "description",
        "chemical_composition",
        "general_recommendation",
        "where_to_use",
      ],
    ];
    db.listProducts("", "all").forEach(function (p) {
      products.push([
        p.name || "",
        p.code || "",
        p.barcode || "",
        p.pack_label || "",
        p.strips_per_pack != null ? Number(p.strips_per_pack) : 1,
        p.units_per_strip != null && p.units_per_strip !== "" ? Number(p.units_per_strip) : "",
        p.description || "",
        p.chemical_composition || "",
        p.general_recommendation || "",
        p.where_to_use || "",
      ]);
    });

    var vendors = [
      ["name", "phone", "email", "address_line1", "city", "state", "pincode", "gstin", "notes"],
    ];
    db.listVendors().forEach(function (v) {
      vendors.push([
        v.name || "",
        v.phone || "",
        v.email || "",
        v.address_line1 || "",
        v.city || "",
        v.state || "",
        v.pincode || "",
        v.gstin || "",
        v.notes || "",
      ]);
    });

    var customers = [
      [
        "name",
        "phone",
        "email",
        "address_line1",
        "address_line2",
        "city",
        "state",
        "pincode",
        "notes",
      ],
    ];
    db.listCustomers("").forEach(function (c) {
      customers.push([
        c.name || "",
        c.phone || "",
        c.email || "",
        c.address_line1 || "",
        c.address_line2 || "",
        c.city || "",
        c.state || "",
        c.pincode || "",
        c.notes || "",
      ]);
    });

    var prescriptionsSheet = [["rx_key", "customer_name", "customer_phone", "doctor_name", "doctor_phone"]];
    var prescriptionLinesSheet = [
      ["rx_key", "prescription_status", "prescription_type", "prescription_notes", "secret_notes"],
    ];
    db.listPrescriptions({}).forEach(function (pr) {
      var pack = db.getPrescription(pr.id);
      if (!pack || !pack.lines || !pack.lines.length) return;
      var rxKey = "RX-DB-" + pr.id;
      prescriptionsSheet.push([
        rxKey,
        pr.customer_name || "",
        pr.customer_phone || "",
        pr.doctor_name || "",
        pr.doctor_phone || "",
      ]);
      pack.lines.forEach(function (ln) {
        prescriptionLinesSheet.push([
          rxKey,
          ln.prescription_status || "draft",
          ln.prescription_type || "",
          ln.prescription_notes || "",
          ln.secret_notes || "",
        ]);
      });
    });

    var ordersSheet = [
      [
        "order_number",
        "customer_name",
        "customer_phone",
        "order_date",
        "order_discount_inr",
        "status",
        "notes",
      ],
    ];
    var orderLinesSheet = [
      [
        "order_number",
        "product_code",
        "product_name",
        "quantity",
        "line_total_inr",
        "line_notes",
        "morning",
        "noon",
        "evening",
        "night",
        "schedule_remarks",
      ],
    ];
    db.listOrders({}).forEach(function (o) {
      var lines = db.getOrderLines(o.id);
      if (!lines.length) return;
      var onum = safeOrderNumber(o);
      ordersSheet.push([
        onum,
        o.customer_name || "",
        o.customer_phone || "",
        o.order_date || "",
        paiseToInrExport(o.order_discount_paise),
        o.status || "draft",
        o.notes || "",
      ]);
      lines.forEach(function (ln) {
        var sch = db.getOrderLineSchedule(ln.id);
        orderLinesSheet.push([
          onum,
          ln.product_code || "",
          ln.product_name || "",
          Number(ln.quantity) || 0,
          paiseToInrExport(ln.total_price_paise),
          ln.line_notes || "",
          sch && Number(sch.in_morning) === 1 ? 1 : 0,
          sch && Number(sch.in_noon) === 1 ? 1 : 0,
          sch && Number(sch.in_evening) === 1 ? 1 : 0,
          sch && Number(sch.in_night) === 1 ? 1 : 0,
          sch && sch.remarks ? sch.remarks : "",
        ]);
      });
    });

    var lotsSheet = [
      [
        "lot_number",
        "vendor_name",
        "lot_date",
        "delivered_date",
        "total_price_inr",
        "margin_inr",
        "total_paid_inr",
        "delivered_by",
        "notes",
      ],
    ];
    var lotLinesSheet = [
      [
        "lot_number",
        "product_code",
        "product_name",
        "strips",
        "available_strips",
        "delivered_on",
        "strip_mrp_inr",
        "selling_price_inr",
      ],
    ];
    db.listLots().forEach(function (lot) {
      lotsSheet.push([
        lot.lot_number || "",
        lot.vendor_name || "",
        lot.lot_date || "",
        lot.delivered_date || "",
        paiseToInrExport(lot.total_price_paise),
        paiseToInrExport(lot.margin_paise),
        paiseToInrExport(lot.total_paid_paise),
        lot.delivered_by || "",
        lot.notes || "",
      ]);
      db.getLotLines(lot.id).forEach(function (ln) {
        var q = Number(ln.quantity) || 0;
        var av =
          ln.available_count != null && ln.available_count !== ""
            ? Number(ln.available_count)
            : q;
        lotLinesSheet.push([
          lot.lot_number || "",
          ln.product_code || "",
          ln.product_name || "",
          q,
          av,
          ln.delivered_on || "",
          paiseToInrExport(ln.strip_mrp_paise),
          paiseToInrExport(ln.selling_price_paise),
        ]);
      });
    });

    var commonDetailsAoa = buildCommonDetailsSheetAoa(db);

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(entitySheet), "Entity");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(staffSheetAoa), "Staff");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(commonDetailsAoa), "CommonDetails");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(products), "Products");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vendors), "Vendors");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(customers), "Customers");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prescriptionsSheet), "Prescriptions");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prescriptionLinesSheet), "PrescriptionLines");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ordersSheet), "Orders");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orderLinesSheet), "OrderLines");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lotsSheet), "Lots");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lotLinesSheet), "LotLines");

    var dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, "pharmapulse-export-" + slug + "-" + dateStr + ".xlsx");
  }

  function downloadSampleInventoryExcel() {
    var products = [
      [
        "name",
        "code",
        "barcode",
        "pack_label",
        "strips_per_pack",
        "units_per_strip",
        "description",
        "chemical_composition",
        "general_recommendation",
        "where_to_use",
      ],
      [
        "Paracetamol 500 mg",
        "PARA-500",
        "8901000000001",
        "1*10",
        1,
        10,
        "Tablet",
        "Paracetamol 500 mg",
        "Max 4 g/day paracetamol",
        "Fever, pain",
      ],
      [
        "Amoxicillin 500 mg",
        "AMOX-500",
        "8901000000002",
        "1*15",
        1,
        15,
        "Capsule",
        "Amoxicillin trihydrate",
        "Complete course",
        "Bacterial infections (Rx)",
      ],
      [
        "Omeprazole 20 mg",
        "OME-20",
        "8901000000003",
        "1*15",
        1,
        15,
        "Capsule",
        "Omeprazole",
        "Before breakfast",
        "GERD (Rx)",
      ],
      [
        "ORS Sachet",
        "ORS-200",
        "8901000000004",
        "1*1",
        1,
        1,
        "Powder",
        "Glucose + electrolytes",
        "Dissolve in water",
        "Dehydration",
      ],
      [
        "Azithromycin 500 mg",
        "AZI-500",
        "8901000000005",
        "1*3",
        1,
        3,
        "Tablet",
        "Azithromycin",
        "As prescribed",
        "Infection (Rx)",
      ],
      [
        "Cetirizine 10 mg",
        "CET-10",
        "8901000000006",
        "1*10",
        1,
        10,
        "Tablet",
        "Cetirizine",
        "Once daily or as directed",
        "Allergic rhinitis",
      ],
      [
        "Ibuprofen 400 mg",
        "IBU-400",
        "8901000000007",
        "1*10",
        1,
        10,
        "Tablet",
        "Ibuprofen",
        "After food",
        "Pain, inflammation",
      ],
      [
        "Ranitidine 150 mg",
        "RAN-150",
        "8901000000008",
        "1*20",
        1,
        20,
        "Tablet",
        "Ranitidine",
        "Before meals",
        "Acidity",
      ],
      [
        "Metformin 500 mg",
        "MET-500",
        "8901000000009",
        "1*10",
        1,
        10,
        "Tablet",
        "Metformin HCl",
        "With meals",
        "Type 2 diabetes (Rx)",
      ],
      [
        "Glimepiride 1 mg",
        "GLI-1",
        "8901000000010",
        "1*10",
        1,
        10,
        "Tablet",
        "Glimepiride",
        "Before breakfast",
        "Diabetes (Rx)",
      ],
      [
        "Atorvastatin 10 mg",
        "ATO-10",
        "8901000000011",
        "1*10",
        1,
        10,
        "Tablet",
        "Atorvastatin",
        "Evening",
        "Cholesterol (Rx)",
      ],
      [
        "Losartan 50 mg",
        "LOS-50",
        "8901000000012",
        "1*10",
        1,
        10,
        "Tablet",
        "Losartan potassium",
        "Once daily",
        "Hypertension (Rx)",
      ],
      [
        "Pantoprazole 40 mg",
        "PAN-40",
        "8901000000013",
        "1*10",
        1,
        10,
        "Tablet",
        "Pantoprazole",
        "Before breakfast",
        "GERD (Rx)",
      ],
      [
        "Dextromethorphan syrup 100 ml",
        "DEXT-SYR",
        "8901000000014",
        "1 bottle",
        1,
        1,
        "Syrup",
        "Dextromethorphan",
        "As needed",
        "Dry cough",
      ],
      [
        "Cough expectorant 100 ml",
        "COUGH-SYR",
        "8901000000015",
        "1 bottle",
        1,
        1,
        "Syrup",
        "Ambroxol + Guaifenesin",
        "Thrice daily",
        "Productive cough",
      ],
      [
        "Vitamin D3 60k IU",
        "VITD-60K",
        "8901000000016",
        "4*1",
        4,
        1,
        "Capsule",
        "Cholecalciferol",
        "Weekly as prescribed",
        "Vitamin D deficiency",
      ],
      [
        "Calcium + Vitamin D3 tablet",
        "CAL-D3",
        "8901000000017",
        "1*15",
        1,
        15,
        "Tablet",
        "Calcium carbonate + D3",
        "After dinner",
        "Bone health",
      ],
      [
        "Povidone iodine 5% ointment",
        "BETA-OINT",
        "8901000000018",
        "1*20 g",
        1,
        1,
        "Ointment",
        "Povidone iodine",
        "Topical",
        "Antiseptic",
      ],
      [
        "Metronidazole 400 mg",
        "METRO-400",
        "8901000000019",
        "1*10",
        1,
        10,
        "Tablet",
        "Metronidazole",
        "Complete course",
        "Anaerobic infection (Rx)",
      ],
      [
        "Levocetirizine 5 mg",
        "LEVO-5",
        "8901000000020",
        "1*10",
        1,
        10,
        "Tablet",
        "Levocetirizine",
        "At night",
        "Allergy (Rx)",
      ],
    ];

    var vendors = [
      ["name", "phone", "email", "address_line1", "city", "state", "pincode", "gstin", "notes"],
      [
        "MediCare Distributors Pvt Ltd",
        "9876543210",
        "orders@medicare.example",
        "Plot 12, Phase IV",
        "Hyderabad",
        "Telangana",
        "500032",
        "36AABCU9603R1Z2",
        "Sample wholesale partner",
      ],
      [
        "Apollo Pharma Supply",
        "9123456789",
        "supply@apollo-pharma.example",
        "Sector 18",
        "Noida",
        "UP",
        "201301",
        "09AABCA1234F1Z5",
        "Regional depot",
      ],
      [
        "Sunrise Medical Agency",
        "9988776655",
        "contact@sunrise-med.example",
        "MG Road",
        "Bengaluru",
        "Karnataka",
        "560001",
        "29AABCS1234E1Z8",
        "Credit 30 days",
      ],
      [
        "HealthLink Distributors",
        "9810203040",
        "sales@healthlink.example",
        "Industrial Area",
        "Pune",
        "Maharashtra",
        "411019",
        "27AABCH1234F1Z1",
        "Cold chain capable",
      ],
      [
        "Prime Pharma Wholesale",
        "9770099001",
        "accounts@primepharma.example",
        "Ring Road",
        "Jaipur",
        "Rajasthan",
        "302001",
        "08AABCP5678H1Z3",
        "COD available",
      ],
    ];

    var lots = [
      [
        "lot_number",
        "vendor_name",
        "lot_date",
        "delivered_date",
        "total_price_inr",
        "margin_inr",
        "total_paid_inr",
        "delivered_by",
        "notes",
      ],
      [
        "INV-2025-001",
        "MediCare Distributors Pvt Ltd",
        "2025-03-01",
        "2025-03-03",
        12500.5,
        2100,
        12500.5,
        "Ramesh Kumar",
        "Sample inbound lot A",
      ],
      [
        "INV-2025-002",
        "Apollo Pharma Supply",
        "2025-03-10",
        "2025-03-12",
        8425.0,
        1200,
        8000,
        "Suresh",
        "Sample inbound lot B",
      ],
      [
        "INV-2025-003",
        "HealthLink Distributors",
        "2025-03-15",
        "2025-03-16",
        18990.75,
        3200,
        18990.75,
        "Vikram Patil",
        "Mixed SKU restock",
      ],
    ];

    var lotLines = [
      [
        "lot_number",
        "product_code",
        "product_name",
        "strips",
        "available_strips",
        "delivered_on",
        "selling_price_inr",
      ],
      ["INV-2025-001", "PARA-500", "", 120, 120, "2025-03-03", 35.0],
      ["INV-2025-001", "AMOX-500", "", 60, 60, "2025-03-03", 125.5],
      ["INV-2025-001", "OME-20", "", 90, 90, "2025-03-03", 48.0],
      ["INV-2025-002", "ORS-200", "", 200, 200, "2025-03-12", 22.0],
      ["INV-2025-002", "AZI-500", "", 30, 30, "2025-03-12", 180.0],
      ["INV-2025-002", "PARA-500", "", 50, 50, "2025-03-12", 35.0],
      ["INV-2025-003", "CET-10", "", 100, 100, "2025-03-16", 12.5],
      ["INV-2025-003", "IBU-400", "", 80, 80, "2025-03-16", 18.0],
      ["INV-2025-003", "RAN-150", "", 60, 60, "2025-03-16", 8.5],
      ["INV-2025-003", "MET-500", "", 200, 200, "2025-03-16", 4.2],
      ["INV-2025-003", "GLI-1", "", 90, 90, "2025-03-16", 6.75],
      ["INV-2025-003", "ATO-10", "", 70, 70, "2025-03-16", 45.0],
      ["INV-2025-003", "LOS-50", "", 50, 50, "2025-03-16", 28.0],
      ["INV-2025-003", "PAN-40", "", 60, 60, "2025-03-16", 52.0],
      ["INV-2025-003", "DEXT-SYR", "", 40, 40, "2025-03-16", 95.0],
      ["INV-2025-003", "COUGH-SYR", "", 35, 35, "2025-03-16", 88.0],
      ["INV-2025-003", "VITD-60K", "", 24, 24, "2025-03-16", 42.0],
      ["INV-2025-003", "CAL-D3", "", 100, 100, "2025-03-16", 5.5],
      ["INV-2025-003", "BETA-OINT", "", 48, 48, "2025-03-16", 65.0],
      ["INV-2025-003", "METRO-400", "", 72, 72, "2025-03-16", 9.25],
      ["INV-2025-003", "LEVO-5", "", 84, 84, "2025-03-16", 14.5],
    ];

    var customers = [
      [
        "name",
        "phone",
        "email",
        "address_line1",
        "address_line2",
        "city",
        "state",
        "pincode",
        "notes",
      ],
      [
        "Ravi Kumar",
        "9876501001",
        "ravi.kumar@example.com",
        "12 MG Road",
        "",
        "Hyderabad",
        "Telangana",
        "500001",
        "Regular — fever meds",
      ],
      [
        "Sneha Reddy",
        "9876501002",
        "",
        "Plot 4, Jubilee Enclave",
        "",
        "Hyderabad",
        "Telangana",
        "500033",
        "",
      ],
      [
        "Mohammed Ali",
        "9123405003",
        "m.ali@example.com",
        "Door 8, Sector 62",
        "Near metro",
        "Noida",
        "UP",
        "201301",
        "Imported customer row for restore demo",
      ],
      [
        "Priya Sharma",
        "9876501004",
        "priya.s@example.com",
        "Flat 3B, Lake View",
        "",
        "Pune",
        "Maharashtra",
        "411045",
        "",
      ],
      [
        "Anil Verma",
        "9876501005",
        "",
        "Shop 12, Main Bazaar",
        "",
        "Indore",
        "Madhya Pradesh",
        "452001",
        "Walk-in",
      ],
      [
        "Kavita Nair",
        "9876501006",
        "k.nair@example.com",
        "Rose Villa",
        "Near temple",
        "Kochi",
        "Kerala",
        "682001",
        "",
      ],
      [
        "Deepak Joshi",
        "9876501007",
        "",
        "Sector 22",
        "",
        "Chandigarh",
        "Chandigarh",
        "160022",
        "",
      ],
      [
        "Meena Iyer",
        "9876501008",
        "meena.i@example.com",
        "TNagar",
        "",
        "Chennai",
        "Tamil Nadu",
        "600017",
        "",
      ],
      [
        "Rajesh Patil",
        "9876501009",
        "",
        "Kothrud",
        "",
        "Pune",
        "Maharashtra",
        "411038",
        "",
      ],
      [
        "Vikram Singh",
        "9876501010",
        "vikram.s@example.com",
        "Civil Lines",
        "",
        "Lucknow",
        "Uttar Pradesh",
        "226001",
        "",
      ],
      [
        "Anita Das",
        "9876501011",
        "",
        "Salt Lake",
        "Block B",
        "Kolkata",
        "West Bengal",
        "700091",
        "",
      ],
    ];

    var ordersSheet = [
      [
        "order_number",
        "customer_name",
        "customer_phone",
        "order_date",
        "order_discount_inr",
        "status",
        "notes",
      ],
      [
        "ORD-1001",
        "Ravi Kumar",
        "9876501001",
        "2025-03-20",
        0,
        "confirmed",
        "Sample walk-in — fever and pain",
      ],
      [
        "ORD-1002",
        "Sneha Reddy",
        "9876501002",
        "2025-03-21",
        50,
        "confirmed",
        "Header discount ₹50; line totals are pre-discount subtotal",
      ],
      [
        "ORD-1003",
        "Mohammed Ali",
        "9123405003",
        "2025-03-22",
        0,
        "confirmed",
        "Antibiotic course",
      ],
      [
        "ORD-1004",
        "Priya Sharma",
        "9876501004",
        "2025-03-23",
        25,
        "confirmed",
        "GERD follow-up",
      ],
      [
        "ORD-1005",
        "Anil Verma",
        "9876501005",
        "2025-03-24",
        0,
        "draft",
        "Pending payment",
      ],
      [
        "ORD-1006",
        "Kavita Nair",
        "9876501006",
        "2025-03-25",
        0,
        "confirmed",
        "Allergy season pack",
      ],
      [
        "ORD-1007",
        "Deepak Joshi",
        "9876501007",
        "2025-03-26",
        10,
        "confirmed",
        "Cough and cold",
      ],
      [
        "ORD-1008",
        "Meena Iyer",
        "9876501008",
        "2025-03-27",
        0,
        "confirmed",
        "Vitamin refill",
      ],
      [
        "ORD-1009",
        "Rajesh Patil",
        "9876501009",
        "2025-03-28",
        0,
        "confirmed",
        "Diabetes maintenance",
      ],
      [
        "ORD-1010",
        "Vikram Singh",
        "9876501010",
        "2025-03-29",
        0,
        "confirmed",
        "Mixed OTC",
      ],
      [
        "ORD-1011",
        "Anita Das",
        "9876501011",
        "2025-03-30",
        15,
        "confirmed",
        "First-aid + antiseptic",
      ],
    ];

    var orderLinesSheet = [
      [
        "order_number",
        "product_code",
        "product_name",
        "quantity",
        "line_total_inr",
        "line_notes",
        "morning",
        "noon",
        "evening",
        "night",
        "schedule_remarks",
      ],
      ["ORD-1001", "PARA-500", "", 2, 500, "", 1, 0, 0, 0, "After food"],
      ["ORD-1001", "ORS-200", "", 4, 88, "ORS", 0, 1, 1, 0, "Dissolve in clean water"],
      ["ORD-1002", "AMOX-500", "", 1, 250.5, "", 1, 1, 1, 0, "Complete antibiotic course"],
      ["ORD-1002", "OME-20", "", 1, 199.5, "", 1, 0, 0, 0, "Before breakfast"],
      ["ORD-1003", "AZI-500", "", 1, 180, "", 1, 0, 0, 0, "As directed"],
      ["ORD-1003", "PARA-500", "", 1, 250, "", 0, 1, 0, 0, "After food"],
      ["ORD-1004", "PAN-40", "", 1, 520, "", 1, 0, 0, 0, "Before breakfast"],
      ["ORD-1004", "OME-20", "", 1, 199.5, "", 0, 0, 1, 0, ""],
      ["ORD-1005", "CET-10", "", 2, 250, "", 1, 0, 0, 0, "At night"],
      ["ORD-1005", "IBU-400", "", 1, 180, "", 0, 1, 0, 0, "After food"],
      ["ORD-1006", "LEVO-5", "", 1, 145, "", 0, 0, 0, 1, "Non-drowsy"],
      ["ORD-1006", "CET-10", "", 1, 125, "", 1, 0, 0, 0, ""],
      ["ORD-1007", "DEXT-SYR", "", 1, 95, "", 0, 1, 1, 1, "Measure with cap"],
      ["ORD-1007", "COUGH-SYR", "", 1, 88, "", 0, 0, 1, 0, ""],
      ["ORD-1008", "VITD-60K", "", 1, 168, "", 1, 0, 0, 0, "Weekly"],
      ["ORD-1008", "CAL-D3", "", 2, 110, "", 1, 0, 0, 0, ""],
      ["ORD-1009", "MET-500", "", 2, 84, "", 1, 1, 1, 1, "With meals"],
      ["ORD-1009", "GLI-1", "", 1, 67.5, "", 1, 0, 0, 0, "Before breakfast"],
      ["ORD-1010", "ATO-10", "", 1, 450, "", 0, 0, 1, 0, ""],
      ["ORD-1010", "LOS-50", "", 1, 280, "", 1, 0, 0, 0, ""],
      ["ORD-1010", "RAN-150", "", 1, 170, "", 1, 1, 1, 0, ""],
      ["ORD-1010", "BETA-OINT", "", 1, 65, "", 0, 0, 0, 0, "External use only"],
      ["ORD-1011", "METRO-400", "", 1, 92.5, "", 1, 1, 1, 1, "Complete course"],
      ["ORD-1011", "BETA-OINT", "", 2, 130, "", 0, 0, 0, 0, ""],
    ];

    var prescriptionsSheet = [
      ["rx_key", "customer_name", "customer_phone", "doctor_name", "doctor_phone"],
      ["RX-SAMPLE-1", "Ravi Kumar", "9876501001", "Dr. Sample", "9800000000"],
    ];
    var prescriptionLinesSheet = [
      ["rx_key", "prescription_status", "prescription_type", "prescription_notes", "secret_notes"],
      ["RX-SAMPLE-1", "active", "medication", "Tab X once daily", ""],
    ];

    var sampleEntitySheet = [
      ENTITY_EXPORT_COLUMNS,
      ENTITY_EXPORT_COLUMNS.map(function (col) {
        if (col === "entity_name") return "Sample Pharmacy";
        if (col === "line1") return "123 Demo Street, Sample City";
        if (col === "city") return "Mumbai";
        if (col === "phone") return "+91 9800000000";
        if (col === "email") return "shop@example.invalid";
        if (col === "auto_reorder_level") return 50;
        if (col === "expiry_alert_days") return 90;
        if (col === "accepted_payments") return '["cash"]';
        return "";
      }),
    ];

    var sampleCommonDetailsSnapshot = {
      format_version: 1,
      entity: {
        entity_name: "Sample Pharmacy",
        city: "Mumbai",
        phone: "+91 9800000000",
        email: "shop@example.invalid",
      },
    };
    var sampleCommonDetailsSheet = [
      ["key", "value"],
      ["json_snapshot", JSON.stringify(sampleCommonDetailsSnapshot)],
      [],
      ["--- Human-readable entity fields (same as json_snapshot) ---", ""],
      ["entity_field", "value"],
      ["entity_name", "Sample Pharmacy"],
      ["city", "Mumbai"],
      ["phone", "+91 9800000000"],
      ["email", "shop@example.invalid"],
      [],
      ["Note: Staff users are on the Staff sheet.", ""],
    ];

    var sampleStaffSheet = [
      ["id", "name", "email", "phone", "role", "created_at", "updated_at"],
      ["", "Example Admin", "admin@example.invalid", "", "admin", "", ""],
      ["", "Example Staff", "staff@example.invalid", "", "staff", "", ""],
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sampleEntitySheet), "Entity");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sampleStaffSheet), "Staff");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sampleCommonDetailsSheet), "CommonDetails");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(products), "Products");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vendors), "Vendors");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(customers), "Customers");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prescriptionsSheet), "Prescriptions");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prescriptionLinesSheet), "PrescriptionLines");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ordersSheet), "Orders");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orderLinesSheet), "OrderLines");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lots), "Lots");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lotLines), "LotLines");
    XLSX.writeFile(wb, "pharmapulse-sample-data.xlsx");
  }

  global.MargInventoryExcel = {
    parseWorkbookArrayBuffer: parseWorkbookArrayBuffer,
    importWorkbook: importWorkbook,
    downloadSampleInventoryExcel: downloadSampleInventoryExcel,
    exportEntityInventoryExcel: exportEntityInventoryExcel,
    entityRowHasContent: entityRowHasContent,
  };
})(typeof window !== "undefined" ? window : this);
