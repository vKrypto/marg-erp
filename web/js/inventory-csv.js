/**
 * CSV samples + import for Inventory panels (products, vendors, lots) and Customers list.
 * Depends: MargDb (db.js)
 */
(function (global) {
  function stripBom(s) {
    if (s && s.charCodeAt(0) === 0xfeff) return s.slice(1);
    return s;
  }

  /** Parse CSV with quoted fields; returns array of string arrays. */
  function parseCsv(text) {
    var s = stripBom(String(text || ""));
    var rows = [];
    var row = [];
    var cur = "";
    var inQuotes = false;
    var i = 0;
    function pushRow() {
      row.push(cur);
      if (row.some(function (cell) { return String(cell).trim() !== ""; })) {
        rows.push(row);
      }
      row = [];
      cur = "";
    }
    while (i < s.length) {
      var c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') {
            cur += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        cur += c;
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ",") {
        row.push(cur);
        cur = "";
        i++;
        continue;
      }
      if (c === "\n") {
        pushRow();
        i++;
        continue;
      }
      if (c === "\r") {
        if (s[i + 1] === "\n") i++;
        pushRow();
        i++;
        continue;
      }
      cur += c;
      i++;
    }
    row.push(cur);
    if (row.some(function (cell) { return String(cell).trim() !== ""; })) {
      rows.push(row);
    }
    return rows;
  }

  function normalizeHeaderKey(k) {
    return String(k || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    var headers = rows[0].map(normalizeHeaderKey);
    var out = [];
    var r, c;
    for (r = 1; r < rows.length; r++) {
      var obj = {};
      var line = rows[r];
      for (c = 0; c < headers.length; c++) {
        obj[headers[c]] = line[c] != null ? String(line[c]).trim() : "";
      }
      out.push(obj);
    }
    return out;
  }

  function parseIsoOrDmy(s) {
    if (!s || !String(s).trim()) return null;
    var t = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    var m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
    if (m) {
      var d = Number(m[1]);
      var mo = Number(m[2]);
      var y = Number(m[3]);
      if (y < 100) y += 2000;
      if (d > 12) {
        var tmp = d;
        d = mo;
        mo = tmp;
      }
      return y + "-" + (mo < 10 ? "0" : "") + mo + "-" + (d < 10 ? "0" : "") + d;
    }
    return t.length >= 10 ? t.slice(0, 10) : null;
  }

  function rupeesToPaise(v) {
    if (v === "" || v == null) return null;
    var n = parseFloat(String(v).replace(/,/g, ""));
    if (isNaN(n)) return null;
    return Math.round(n * 100);
  }

  function downloadText(filename, content, mime) {
    mime = mime || "text/csv;charset=utf-8";
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
  }

  function escapeCsvCell(val) {
    var s = val == null ? "" : String(val);
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function csvLineFromCells(cells) {
    var parts = [];
    var i;
    for (i = 0; i < cells.length; i++) {
      parts.push(escapeCsvCell(cells[i]));
    }
    return parts.join(",");
  }

  function exportEntitySlug(db) {
    var ent = db.getCurrentEntity && db.getCurrentEntity();
    var raw = ent && ent.entity_name ? String(ent.entity_name) : "entity";
    return raw
      .trim()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "entity";
  }

  function isoDateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function paiseToInrExportStr(p) {
    var n = (Number(p) || 0) / 100;
    return String(Math.round(n * 100) / 100);
  }

  /** Type label for CSV/Excel export when JOIN omits or sql.js drops alias. */
  function productTypeLabelForExport(p, db) {
    var lab = p.product_type_label;
    if (lab != null && String(lab).trim() !== "") return String(lab).trim();
    var pid = p.product_type_id;
    if (pid != null && pid !== "" && db && typeof db.listProductTypes === "function") {
      var want = Number(pid);
      if (!isNaN(want)) {
        var types = db.listProductTypes();
        var i;
        for (i = 0; i < types.length; i++) {
          if (Number(types[i].id) === want) {
            return types[i].label != null ? String(types[i].label).trim() : "";
          }
        }
      }
    }
    return "";
  }

  function exportProductsCsv(db) {
    var rows = [];
    var header = [
      "name",
      "code",
      "type",
      "barcode",
      "pack_label",
      "units_per_strip",
      "description",
      "chemical_composition",
      "general_recommendation",
      "where_to_use",
    ];
    rows.push(csvLineFromCells(header));
    db.listProducts("", "all").forEach(function (p) {
      rows.push(
        csvLineFromCells([
          p.name || "",
          p.code || "",
          productTypeLabelForExport(p, db),
          p.barcode || "",
          p.pack_label || "",
          p.units_per_strip != null && p.units_per_strip !== "" ? String(p.units_per_strip) : "",
          p.description || "",
          p.chemical_composition || "",
          p.general_recommendation || "",
          p.where_to_use || "",
        ])
      );
    });
    downloadText(
      "pharmapulse-products-" + exportEntitySlug(db) + "-" + isoDateStamp() + ".csv",
      rows.join("\r\n")
    );
  }

  function exportVendorsCsv(db) {
    var rows = [];
    var header = [
      "name",
      "phone",
      "email",
      "city",
      "state",
      "pincode",
      "gstin",
      "address_line1",
      "address_line2",
      "notes",
    ];
    rows.push(csvLineFromCells(header));
    db.listVendors().forEach(function (v) {
      rows.push(
        csvLineFromCells([
          v.name || "",
          v.phone || "",
          v.email || "",
          v.city || "",
          v.state || "",
          v.pincode || "",
          v.gstin || "",
          v.address_line1 || "",
          v.address_line2 || "",
          v.notes || "",
        ])
      );
    });
    downloadText(
      "pharmapulse-vendors-" + exportEntitySlug(db) + "-" + isoDateStamp() + ".csv",
      rows.join("\r\n")
    );
  }

  function exportCustomersCsv(db) {
    var rows = [];
    var header = [
      "name",
      "phone",
      "email",
      "city",
      "state",
      "pincode",
      "address_line1",
      "address_line2",
      "notes",
    ];
    rows.push(csvLineFromCells(header));
    db.listCustomers("").forEach(function (c) {
      rows.push(
        csvLineFromCells([
          c.name || "",
          c.phone || "",
          c.email || "",
          c.city || "",
          c.state || "",
          c.pincode || "",
          c.address_line1 || "",
          c.address_line2 || "",
          c.notes || "",
        ])
      );
    });
    downloadText(
      "pharmapulse-customers-" + exportEntitySlug(db) + "-" + isoDateStamp() + ".csv",
      rows.join("\r\n")
    );
  }

  function exportLotsCsv(db) {
    var rows = [];
    var header = [
      "lot_number",
      "vendor",
      "delivered",
      "lines",
      "product_code",
      "strips",
      "selling_price_inr",
      "strip_mrp_inr",
      "notes",
    ];
    rows.push(csvLineFromCells(header));
    db.listLots().forEach(function (lot) {
      var lotLines = db.getLotLines(lot.id);
      var n = lotLines.length;
      var delivered = lot.delivered_date || lot.lot_date || "";
      var vendorLab = lot.vendor_name || "";
      var lotNum = lot.lot_number || "";
      var i;
      for (i = 0; i < lotLines.length; i++) {
        var ln = lotLines[i];
        var isFirst = i === 0;
        rows.push(
          csvLineFromCells([
            isFirst ? lotNum : "",
            isFirst ? vendorLab : "",
            isFirst ? delivered : "",
            isFirst ? String(n) : "",
            ln.product_code || "",
            String(Number(ln.quantity) || 0),
            paiseToInrExportStr(ln.selling_price_paise),
            paiseToInrExportStr(ln.strip_mrp_paise),
            ln.line_notes || "",
          ])
        );
      }
    });
    downloadText(
      "pharmapulse-lots-" + exportEntitySlug(db) + "-" + isoDateStamp() + ".csv",
      rows.join("\r\n")
    );
  }

  function safeOrderNumberForExport(o) {
    if (o.order_number && String(o.order_number).trim()) return String(o.order_number).trim();
    return "ORD-" + String(o.id).padStart(6, "0");
  }

  function exportOrdersCsv(db) {
    var rows = [];
    var header = [
      "row_type",
      "order_number",
      "customer_name",
      "customer_phone",
      "order_date",
      "order_discount_inr",
      "status",
      "notes",
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
      "header_discount_flat_inr",
      "header_discount_percent",
    ];
    rows.push(csvLineFromCells(header));
    db.listOrders({}).forEach(function (o) {
      var onum = safeOrderNumberForExport(o);
      rows.push(
        csvLineFromCells([
          "header",
          onum,
          o.customer_name || "",
          o.customer_phone || "",
          o.order_date || "",
          paiseToInrExportStr(o.order_discount_paise),
          o.status || "",
          o.notes || "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          paiseToInrExportStr(o.order_header_discount_flat_paise),
          o.order_header_discount_percent != null && Number(o.order_header_discount_percent) > 0
            ? String(Math.min(50, Math.round(Number(o.order_header_discount_percent))))
            : "",
        ])
      );
      var lines = db.getOrderLines(o.id);
      lines.forEach(function (ln) {
        var sch = db.getOrderLineSchedule(ln.id);
        rows.push(
          csvLineFromCells([
            "line",
            onum,
            "",
            "",
            "",
            "",
            "",
            "",
            ln.product_code || "",
            ln.product_name || "",
            String(Number(ln.quantity) || 0),
            paiseToInrExportStr(ln.total_price_paise),
            ln.line_notes || "",
            sch && Number(sch.in_morning) === 1 ? "1" : "0",
            sch && Number(sch.in_noon) === 1 ? "1" : "0",
            sch && Number(sch.in_evening) === 1 ? "1" : "0",
            sch && Number(sch.in_night) === 1 ? "1" : "0",
            sch && sch.remarks ? String(sch.remarks) : "",
            "",
            "",
          ])
        );
      });
    });
    downloadText(
      "pharmapulse-orders-" + exportEntitySlug(db) + "-" + isoDateStamp() + ".csv",
      rows.join("\r\n")
    );
  }

  function exportPrescriptionsCsv(db) {
    if (typeof db.listPrescriptions !== "function" || typeof db.getPrescription !== "function") {
      return;
    }
    var rows = [];
    var header = [
      "row_type",
      "rx_key",
      "customer_name",
      "customer_phone",
      "doctor_name",
      "doctor_phone",
      "line_status",
      "line_type",
      "line_notes",
      "line_secret",
    ];
    rows.push(csvLineFromCells(header));
    db.listPrescriptions({}).forEach(function (pr) {
      var pack = db.getPrescription(pr.id);
      if (!pack || !pack.header) return;
      var h = pack.header;
      var rxKey =
        h.import_key != null && String(h.import_key).trim()
          ? String(h.import_key).trim()
          : "RX-DB-" + pr.id;
      rows.push(
        csvLineFromCells([
          "header",
          rxKey,
          h.customer_name || "",
          h.customer_phone || "",
          h.doctor_name || "",
          h.doctor_phone || "",
          "",
          "",
          "",
          "",
        ])
      );
      var lines = pack.lines || [];
      lines.forEach(function (ln) {
        rows.push(
          csvLineFromCells([
            "line",
            rxKey,
            "",
            "",
            "",
            "",
            ln.prescription_status || "draft",
            ln.prescription_type || "",
            ln.prescription_notes || "",
            ln.secret_notes || "",
          ])
        );
      });
    });
    downloadText(
      "pharmapulse-prescriptions-" + exportEntitySlug(db) + "-" + isoDateStamp() + ".csv",
      rows.join("\r\n")
    );
  }

  function productRowFromObj(o) {
    var name = o.name || o.product_name || o.medicine_name || "";
    if (!String(name).trim()) return null;
    var ptId = null;
    var idRaw = o.product_type_id;
    if (idRaw !== "" && idRaw != null && String(idRaw).trim() !== "") {
      var pn = Number(idRaw);
      if (!isNaN(pn)) ptId = pn;
    }
    var ptLab = (o.type || o.product_type || o.product_type_label || o.category || "").trim();
    return {
      name: String(name).trim(),
      code: o.code || o.sku || null,
      barcode: o.barcode || null,
      pack_label: o.pack_label || o.pack || null,
      units_per_strip:
        o.units_per_strip !== "" && o.units_per_strip != null ? Number(o.units_per_strip) : null,
      description: o.description || null,
      chemical_composition: o.chemical_composition || o.composition || null,
      general_recommendation: o.general_recommendation || null,
      where_to_use: o.where_to_use || null,
      product_type_id: ptId,
      product_type_label: ptId ? null : ptLab || null,
    };
  }

  function resolveImportedProductType(p, db) {
    if (!p || !db || typeof db.resolveOrCreateProductTypeId !== "function") {
      delete p.product_type_label;
      return;
    }
    var idRaw = p.product_type_id;
    if (idRaw !== "" && idRaw != null && String(idRaw).trim() !== "") {
      var n = Number(idRaw);
      p.product_type_id = !isNaN(n) ? n : null;
    } else {
      p.product_type_id = null;
    }
    if (!p.product_type_id && p.product_type_label) {
      p.product_type_id = db.resolveOrCreateProductTypeId(String(p.product_type_label).trim());
    }
    delete p.product_type_label;
  }

  function vendorRowFromObj(o) {
    var name = o.name || o.vendor_name || "";
    if (!String(name).trim()) return null;
    return {
      name: String(name).trim(),
      phone: o.phone || null,
      email: o.email || null,
      address_line1: o.address_line1 || o.address || null,
      address_line2: o.address_line2 || null,
      city: o.city || null,
      state: o.state || null,
      pincode: o.pincode || null,
      gstin: o.gstin || null,
      notes: o.notes || null,
    };
  }

  function customerRowFromObj(o) {
    var name = o.name || o.customer_name || "";
    if (!String(name).trim()) return null;
    return {
      name: String(name).trim(),
      phone: o.phone || null,
      email: o.email || null,
      address_line1: o.address_line1 || o.address || null,
      address_line2: o.address_line2 || null,
      city: o.city || null,
      state: o.state || null,
      pincode: o.pincode || null,
      notes: o.notes || null,
    };
  }

  function findVendorIdByName(db, name) {
    if (!name || !String(name).trim()) return null;
    var n = String(name).trim().toLowerCase();
    var rows = db.listVendors();
    var i;
    for (i = 0; i < rows.length; i++) {
      if (String(rows[i].name || "")
        .trim()
        .toLowerCase() === n) {
        return rows[i].id;
      }
    }
    return null;
  }

  function findProductIdByCode(db, code) {
    if (!code || !String(code).trim()) return null;
    var c = String(code).trim().toLowerCase();
    var rows = db.listProducts("", "all");
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].code && String(rows[i].code).trim().toLowerCase() === c) {
        return rows[i].id;
      }
    }
    return null;
  }

  /**
   * Resolve vendor for lot CSV: vendor_id (if present) else name match else auto-create by name.
   * @returns {Promise<{ ok: boolean, vendorId: number|null }>}
   */
  function resolveVendorIdForLotImport(db, first, lotNum, errors) {
    var vidRaw = first.vendor_id || first.supplier_id || "";
    if (vidRaw !== "" && vidRaw != null) {
      var vid = parseInt(String(vidRaw).trim(), 10);
      if (!(vid > 0) || isNaN(vid)) {
        errors.push('Lot "' + lotNum + '": vendor_id must be a positive integer.');
        return Promise.resolve({ ok: false, vendorId: null });
      }
      if (!db.getVendor(vid)) {
        errors.push(
          'Lot "' + lotNum + '": vendor_id ' + vid + " not found for this shop (use Vendors list id)."
        );
        return Promise.resolve({ ok: false, vendorId: null });
      }
      return Promise.resolve({ ok: true, vendorId: vid });
    }

    var vendorName =
      first.vendor_name || first.supplier || first.vendor || first.distributor || "";
    vendorName = String(vendorName).trim();
    if (!vendorName) {
      return Promise.resolve({ ok: true, vendorId: null });
    }

    var existing = findVendorIdByName(db, vendorName);
    if (existing != null) {
      return Promise.resolve({ ok: true, vendorId: existing });
    }

    return db
      .insertVendor({
        name: vendorName,
        phone: (first.vendor_phone || "").trim() || null,
        email: (first.vendor_email || "").trim() || null,
        address_line1:
          (first.vendor_address || first.vendor_address_line1 || "").trim() || null,
        address_line2: (first.vendor_address_line2 || "").trim() || null,
        city: (first.vendor_city || "").trim() || null,
        state: (first.vendor_state || "").trim() || null,
        pincode: (first.vendor_pincode || "").trim() || null,
        gstin: (first.vendor_gstin || "").trim() || null,
        notes: (first.vendor_notes || "").trim() || null,
      })
      .then(function (newId) {
        return { ok: true, vendorId: newId };
      })
      .catch(function (err) {
        errors.push(
          'Lot "' +
            lotNum +
            '": could not create vendor "' +
            vendorName +
            '" — ' +
            (err && err.message ? err.message : String(err))
        );
        return { ok: false, vendorId: null };
      });
  }

  /**
   * @returns {Promise<{ ok: number, errors: string[] }>}
   */
  function importProducts(db, csvText) {
    var rows = parseCsv(csvText);
    var objs = rowsToObjects(rows);
    var items = [];
    var errors = [];
    objs.forEach(function (o, idx) {
      var p = productRowFromObj(o);
      if (!p) {
        errors.push("Row " + (idx + 2) + ": missing product name.");
        return;
      }
      items.push(p);
    });
    if (!items.length) {
      return Promise.reject(new Error("No valid product rows."));
    }
    items.forEach(function (p) {
      resolveImportedProductType(p, db);
    });
    return db.importProductsBatch(items).then(function (res) {
      var ins = res && typeof res.inserted === "number" ? res.inserted : 0;
      var upd = res && typeof res.updated === "number" ? res.updated : 0;
      return {
        ok: ins + upd,
        inserted: ins,
        updated: upd,
        errors: errors,
      };
    });
  }

  /**
   * @returns {Promise<{ ok: number, errors: string[] }>}
   */
  function importCustomers(db, csvText) {
    var rows = parseCsv(csvText);
    var objs = rowsToObjects(rows);
    var items = [];
    var errors = [];
    objs.forEach(function (o, idx) {
      var c = customerRowFromObj(o);
      if (!c) {
        errors.push("Row " + (idx + 2) + ": missing customer name.");
        return;
      }
      items.push(c);
    });
    if (!items.length) {
      return Promise.reject(new Error("No valid customer rows."));
    }
    return db.importCustomersBatch(items).then(function (res) {
      var ins = res && typeof res.inserted === "number" ? res.inserted : 0;
      var upd = res && typeof res.updated === "number" ? res.updated : 0;
      return { ok: ins + upd, inserted: ins, updated: upd, errors: errors };
    });
  }

  /**
   * @returns {Promise<{ ok: number, errors: string[] }>}
   */
  function importVendors(db, csvText) {
    var rows = parseCsv(csvText);
    var objs = rowsToObjects(rows);
    var items = [];
    var errors = [];
    objs.forEach(function (o, idx) {
      var v = vendorRowFromObj(o);
      if (!v) {
        errors.push("Row " + (idx + 2) + ": missing vendor name.");
        return;
      }
      items.push(v);
    });
    if (!items.length) {
      return Promise.reject(new Error("No valid vendor rows."));
    }
    return db.importVendorsBatch(items).then(function (res) {
      var ins = res && typeof res.inserted === "number" ? res.inserted : 0;
      var upd = res && typeof res.updated === "number" ? res.updated : 0;
      return { ok: ins + upd, inserted: ins, updated: upd, errors: errors };
    });
  }

  /** Lot # column may normalize to lot_#; continuation rows often leave lot # blank (same as previous). */
  function pickLotNumberCell(o) {
    var raw =
      o.lot_number ||
      o.lot_no ||
      o["lot_#"] ||
      o.lot ||
      o.invoice_number ||
      o.invoice ||
      "";
    return String(raw).trim();
  }

  /**
   * Same grouping rules as lot CSV import (continuation rows inherit previous lot #).
   * @param {Array<object>} objs objects from rowsToObjects(parseCsv(text))
   * @returns {{ byLot: object, order: string[] }}
   */
  function groupLotsRowsFromObjects(objs) {
    var byLot = {};
    var order = [];
    var currentLot = "";
    objs.forEach(function (o, idx) {
      var ln = pickLotNumberCell(o);
      if (!ln) {
        ln = currentLot;
      } else {
        currentLot = ln;
      }
      if (!ln) {
        return;
      }
      if (!byLot[ln]) {
        byLot[ln] = [];
        order.push(ln);
      }
      byLot[ln].push({ o: o, rowNum: idx + 2 });
    });
    return { byLot: byLot, order: order };
  }

  /**
   * Validates bundled sample CSV strings: parse shape, cross-refs (lots → vendors & product codes), money/dates.
   * @returns {{ ok: boolean, errors: string[] }}
   */
  function validateSamples() {
    var errors = [];

    function requireHeader(headers, label, requiredKeys) {
      var i;
      for (i = 0; i < requiredKeys.length; i++) {
        if (headers.indexOf(requiredKeys[i]) < 0) {
          errors.push(label + ": missing column \"" + requiredKeys[i] + "\"");
        }
      }
    }

    var prodMatrix = parseCsv(SAMPLE_PRODUCTS);
    if (!prodMatrix.length) {
      errors.push("products: empty CSV");
    } else {
      requireHeader(prodMatrix[0].map(normalizeHeaderKey), "products", [
        "name",
        "code",
        "pack_label",
        "units_per_strip",
      ]);
    }
    var productCodesLower = {};
    rowsToObjects(prodMatrix).forEach(function (o, idx) {
      var p = productRowFromObj(o);
      if (!p) {
        errors.push("products row " + (idx + 2) + ": need a product name");
        return;
      }
      if (!p.code || !String(p.code).trim()) {
        errors.push("products row " + (idx + 2) + ": need code (lot sample references codes)");
      } else {
        productCodesLower[String(p.code).trim().toLowerCase()] = true;
      }
    });

    var venMatrix = parseCsv(SAMPLE_VENDORS);
    if (!venMatrix.length) {
      errors.push("vendors: empty CSV");
    } else {
      requireHeader(venMatrix[0].map(normalizeHeaderKey), "vendors", ["name"]);
    }
    var vendorNamesLower = {};
    rowsToObjects(venMatrix).forEach(function (o, idx) {
      var v = vendorRowFromObj(o);
      if (!v) {
        errors.push("vendors row " + (idx + 2) + ": need vendor name");
      } else {
        vendorNamesLower[String(v.name).trim().toLowerCase()] = true;
      }
    });

    var custMatrix = parseCsv(SAMPLE_CUSTOMERS);
    if (!custMatrix.length) {
      errors.push("customers: empty CSV");
    } else {
      requireHeader(custMatrix[0].map(normalizeHeaderKey), "customers", ["name"]);
    }
    rowsToObjects(custMatrix).forEach(function (o, idx) {
      if (!customerRowFromObj(o)) {
        errors.push("customers row " + (idx + 2) + ": need customer name");
      }
    });

    var lotMatrix = parseCsv(SAMPLE_LOTS);
    if (!lotMatrix.length) {
      errors.push("lots: empty CSV");
    } else {
      var lotHeaders = lotMatrix[0].map(normalizeHeaderKey);
      requireHeader(lotHeaders, "lots", [
        "lot_number",
        "vendor",
        "delivered",
        "lines",
        "product_code",
        "strips",
        "selling_price_inr",
        "strip_mrp_inr",
        "notes",
      ]);
    }

    var lotObjs = rowsToObjects(lotMatrix);
    var grouped = groupLotsRowsFromObjects(lotObjs);
    if (!grouped.order.length) {
      errors.push("lots: no lot groups (every row needs a lot # or a preceding row with one)");
    }

    grouped.order.forEach(function (lotNum) {
      var group = grouped.byLot[lotNum];
      var first = group[0].o;
      var vidForVal = String(first.vendor_id || first.supplier_id || "").trim();
      var vendorName =
        first.vendor_name || first.supplier || first.vendor || first.distributor || "";
      var vnLower = String(vendorName).trim().toLowerCase();
      if (!vidForVal && vnLower && !vendorNamesLower[vnLower]) {
        errors.push(
          'lots "' +
            lotNum +
            '": vendor "' +
            String(vendorName).trim() +
            '" is not in sample vendors CSV'
        );
      }
      var delivered =
        parseIsoOrDmy(first.delivered_date || first.delivered || first.delivery_date) || null;
      if (String(first.delivered || "").trim() && !delivered) {
        errors.push('lots "' + lotNum + '": could not parse delivered date');
      }
      var g;
      for (g = 0; g < group.length; g++) {
        var row = group[g].o;
        var rnum = group[g].rowNum;
        var pcode = String(row.product_code || row.code || row.sku || "").trim();
        if (!pcode) {
          errors.push("lots " + lotNum + " row " + rnum + ": missing product_code");
          continue;
        }
        if (!productCodesLower[pcode.toLowerCase()]) {
          errors.push(
            'lots "' + lotNum + '" row ' + rnum + ': product_code "' + pcode + '" not in sample products'
          );
        }
        var strips =
          row.strips !== "" && row.strips != null
            ? Number(row.strips)
            : row.quantity !== "" && row.quantity != null
              ? Number(row.quantity)
              : row.qty !== "" && row.qty != null
                ? Number(row.qty)
                : NaN;
        if (!(strips > 0)) {
          errors.push("lots " + lotNum + " row " + rnum + ": strips must be > 0");
        }
        var sp = rupeesToPaise(
          row.selling_price_inr ||
            row.selling_price_rupees ||
            row.selling_price ||
            row.strip_selling_inr ||
            row.price
        );
        if (sp == null || sp < 0) {
          errors.push("lots " + lotNum + " row " + rnum + ": invalid selling_price_inr");
        }
        var mrpSp = rupeesToPaise(
          row.strip_mrp_inr ||
            row.strip_mrp_rupees ||
            row.mrp_inr ||
            row.strip_mrp ||
            row.mrp
        );
        if (mrpSp == null || mrpSp < 0) {
          mrpSp = sp;
        }
        if (mrpSp == null || mrpSp < 0) {
          errors.push("lots " + lotNum + " row " + rnum + ": invalid strip_mrp_inr (and no selling price fallback)");
        }
      }
    });

    return { ok: errors.length === 0, errors: errors };
  }

  /**
   * Rows grouped by lot_number; each row is one line item.
   * Repeating lot_number on each row, OR leaving lot # blank on follow-up rows (same purchase as previous row).
   * @returns {Promise<{ ok: number, errors: string[] }>}
   */
  function importLots(db, csvText) {
    var rows = parseCsv(csvText);
    var objs = rowsToObjects(rows);
    if (!objs.length) {
      return Promise.reject(new Error("No data rows."));
    }
    var grouped = groupLotsRowsFromObjects(objs);
    var byLot = grouped.byLot;
    var order = grouped.order;
    if (!order.length) {
      return Promise.reject(
        new Error("Each data row needs a lot # (or follow a row that has one). See sample CSV.")
      );
    }

    var errors = [];
    var ok = 0;
    var lotsInserted = 0;
    var lotsUpdated = 0;

    function processLotIndex(i) {
      if (i >= order.length) {
        return Promise.resolve({
          ok: ok,
          inserted: lotsInserted,
          updated: lotsUpdated,
          errors: errors,
        });
      }
      var lotNum = order[i];
      var group = byLot[lotNum];
      var first = group[0].o;

      return resolveVendorIdForLotImport(db, first, lotNum, errors).then(function (resolved) {
        if (!resolved.ok) {
          return processLotIndex(i + 1);
        }
        var vendorId = resolved.vendorId;

        var header = {
          lot_number: lotNum,
          vendor_id: vendorId,
          lot_date: parseIsoOrDmy(first.lot_date || first.invoice_date) || null,
          delivered_date:
            parseIsoOrDmy(first.delivered_date || first.delivered || first.delivery_date) || null,
          total_price_paise: rupeesToPaise(first.total_price_inr || first.total_price_rupees || first.total_price),
          margin_paise: rupeesToPaise(first.margin_inr || first.margin_rupees || first.margin),
          total_paid_paise: rupeesToPaise(first.total_paid_inr || first.total_paid_rupees || first.total_paid),
          delivered_by: first.delivered_by || null,
          notes: first.notes || first.lot_notes || null,
        };

        var lines = [];
        var g;
        for (g = 0; g < group.length; g++) {
          var row = group[g].o;
          var rnum = group[g].rowNum;
          var pcode = row.product_code || row.code || row.sku || "";
          var strips =
            row.strips !== "" && row.strips != null
              ? Number(row.strips)
              : row.quantity !== "" && row.quantity != null
                ? Number(row.quantity)
                : row.qty !== "" && row.qty != null
                  ? Number(row.qty)
                  : NaN;
          var sp = rupeesToPaise(
            row.selling_price_inr ||
              row.selling_price_rupees ||
              row.selling_price ||
              row.strip_selling_inr ||
              row.price
          );
          var pid = findProductIdByCode(db, pcode);
          if (!pid) {
            errors.push("Lot " + lotNum + " row " + rnum + ': unknown product code "' + pcode + '".');
            continue;
          }
          if (!(strips > 0)) {
            errors.push("Lot " + lotNum + " row " + rnum + ": strips/quantity must be > 0.");
            continue;
          }
          var availRaw =
            row.available_strips !== "" && row.available_strips != null
              ? Number(row.available_strips)
              : row.available_count !== "" && row.available_count != null
                ? Number(row.available_count)
                : strips;
          if (isNaN(availRaw) || availRaw < 0 || availRaw > strips) {
            errors.push(
              "Lot " + lotNum + " row " + rnum + ": available_strips must be between 0 and strips received."
            );
            continue;
          }
          if (sp == null || sp < 0) {
            errors.push("Lot " + lotNum + " row " + rnum + ": invalid selling price.");
            continue;
          }
          var mrpSp = rupeesToPaise(
            row.strip_mrp_inr ||
              row.strip_mrp_rupees ||
              row.mrp_inr ||
              row.strip_mrp ||
              row.mrp
          );
          if (mrpSp == null || mrpSp < 0) {
            mrpSp = sp;
          }
          lines.push({
            product_id: pid,
            quantity: strips,
            available_count: Math.round(availRaw),
            delivered_on: parseIsoOrDmy(row.delivered_on || row.line_delivered_on) || null,
            selling_price_paise: sp,
            strip_mrp_paise: mrpSp,
            line_notes: row.line_notes || null,
          });
        }

        if (!lines.length) {
          errors.push('Lot "' + lotNum + '": no valid line items.');
          return processLotIndex(i + 1);
        }

        var existingLotId =
          typeof db.getLotIdByLotNumber === "function" ? db.getLotIdByLotNumber(lotNum) : null;
        var lotPromise =
          existingLotId != null
            ? db.updateLotWithLines(existingLotId, header, lines)
            : db.insertLotWithLines(header, lines);

        return lotPromise
          .then(function () {
            ok++;
            if (existingLotId != null) lotsUpdated++;
            else lotsInserted++;
            return processLotIndex(i + 1);
          })
          .catch(function (err) {
            errors.push('Lot "' + lotNum + '": ' + (err && err.message ? err.message : String(err)));
            return processLotIndex(i + 1);
          });
      });
    }

    return processLotIndex(0);
  }

  var SAMPLE_PRODUCTS =
    "name,code,type,barcode,pack_label,units_per_strip,description\n" +
    "Sample Paracetamol 500mg,PARA-500,Tab,,1*15,10,Pain / fever\n" +
    "Sample Amoxicillin 500mg,AMOX-500,Tab,,1*10,8,Antibiotic\n";

  var SAMPLE_VENDORS =
    "name,phone,email,city,state,pincode,gstin,address_line1,notes\n" +
    "Sample Pharma Distributors,9876501000,billing@example.com,Hyderabad,Telangana,500001,29AAAAA0000A1Z5,Plot 12 Phase IV,Sample vendor row\n" +
    "MediCare Distributors Pvt Ltd,9876501001,,Mumbai,Maharashtra,400001,,Warehouse A,Wholesale\n" +
    "Apollo Pharma Supply,9876501002,,New Delhi,Delhi,110001,,Okhla depot,\n" +
    "HealthLink Distributors,9876501003,,Bengaluru,Karnataka,560001,,Peenya DC,\n";

  /*
   * Headers match Purchases & lots (lot #, vendor, delivered, lines).
   * `lines` is informational only (table column); continuation rows leave lot # vendor delivered lines blank.
   */
  var SAMPLE_LOTS =
    "lot_number,vendor,delivered,lines,product_code,strips,selling_price_inr,strip_mrp_inr,notes\n" +
    "INV-2025-001,MediCare Distributors Pvt Ltd,2025-03-03,2,PARA-500,120,35.00,42.00,Lot line 1\n" +
    ",,,,AMOX-500,60,125.50,145.00,Lot line 2 same batch\n" +
    "INV-2025-002,Apollo Pharma Supply,2025-03-12,1,PARA-500,80,36.00,44.00,Single-line purchase\n" +
    "INV-2025-003,HealthLink Distributors,2025-03-16,3,AMOX-500,40,120.00,140.00,Multi-line A\n" +
    ",,,,PARA-500,50,35.00,42.00,Multi-line B\n" +
    ",,,,AMOX-500,20,125.00,145.00,Multi-line C\n" +
    "INV-2025-004,Sample Pharma Distributors,2025-03-20,2,PARA-500,100,34.50,41.00,Return vendor from products sample\n" +
    ",,,,AMOX-500,30,126.00,148.00,Second line\n";

  var SAMPLE_CUSTOMERS =
    "name,phone,email,city,state,pincode,address_line1,address_line2,notes\n" +
    "Sample Patient,9876502000,patient@example.com,Indore,Madhya Pradesh,452001,12 MG Road,,Walk-in patient\n";

  global.MargInventoryCsv = {
    parseCsv: parseCsv,
    importProducts: importProducts,
    importVendors: importVendors,
    importLots: importLots,
    importCustomers: importCustomers,
    exportProductsCsv: exportProductsCsv,
    exportVendorsCsv: exportVendorsCsv,
    exportCustomersCsv: exportCustomersCsv,
    exportLotsCsv: exportLotsCsv,
    exportOrdersCsv: exportOrdersCsv,
    exportPrescriptionsCsv: exportPrescriptionsCsv,
    downloadSample: downloadText,
    validateSamples: validateSamples,
    samples: {
      products: { filename: "pharmapulse-products-sample.csv", body: SAMPLE_PRODUCTS },
      vendors: { filename: "pharmapulse-vendors-sample.csv", body: SAMPLE_VENDORS },
      lots: { filename: "pharmapulse-lots-sample.csv", body: SAMPLE_LOTS },
      customers: { filename: "pharmacy-erp-customers-sample.csv", body: SAMPLE_CUSTOMERS },
    },
  };
})(typeof window !== "undefined" ? window : this);
