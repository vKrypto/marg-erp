/**
 * Prescription CSV: parse, import (combined header/line rows), sample download.
 * Columns: row_type, rx_key, customer_name, customer_phone, doctor_name, doctor_phone,
 *          line_status, line_type, line_notes, line_secret
 */
(function (global) {
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

  /** Split one CSV line respecting double-quoted fields. */
  function parseCsvLine(line) {
    var result = [];
    var cur = "";
    var inQuote = false;
    var i;
    for (i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') {
        inQuote = !inQuote;
      } else if (inQuote) {
        cur += c;
      } else if (c === ",") {
        result.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result;
  }

  function parseCsv(text) {
    var raw = String(text || "").split(/\r?\n/);
    var lines = [];
    var i;
    for (i = 0; i < raw.length; i++) {
      if (String(raw[i]).trim() === "") continue;
      lines.push(parseCsvLine(raw[i]));
    }
    if (lines.length < 2) return [];
    var headers = lines[0].map(function (h) {
      return String(h).trim();
    });
    var out = [];
    for (i = 1; i < lines.length; i++) {
      var cells = lines[i];
      var row = {};
      var j;
      for (j = 0; j < headers.length; j++) {
        row[headers[j]] = cells[j] != null ? String(cells[j]).trim() : "";
      }
      out.push(row);
    }
    return out;
  }

  /**
   * @returns {Promise<{ imported: number, errors: string[] }>}
   */
  function importPrescriptionsCsv(db, csvText) {
    if (typeof db.insertPrescription !== "function") {
      return Promise.reject(new Error("Database does not support prescriptions."));
    }
    var rows = parseCsv(csvText);
    if (!rows.length) {
      return Promise.reject(new Error("No data rows in CSV (need header row + data)."));
    }
    var headersByKey = {};
    var linesByKey = {};
    rows.forEach(function (r) {
      var rt = String(r.row_type || r.kind || "").trim().toLowerCase();
      var key = String(r.rx_key || r.prescription_key || "").trim();
      if (!key) return;
      if (rt === "h" || rt === "header") {
        headersByKey[key] = {
          rx_key: key,
          customer_name: r.customer_name || r.name || "",
          customer_phone: r.customer_phone || r.phone || "",
          doctor_name: r.doctor_name || "",
          doctor_phone: r.doctor_phone || "",
        };
      } else if (rt === "l" || rt === "line") {
        if (!linesByKey[key]) linesByKey[key] = [];
        linesByKey[key].push({
          prescription_status: r.line_status || r.prescription_status || r.status || "draft",
          prescription_type: r.line_type || r.prescription_type || r.type || "",
          prescription_notes: r.line_notes || r.prescription_notes || r.notes || "",
          secret_notes: r.line_secret || r.secret_notes || "",
        });
      }
    });
    var keys = Object.keys(headersByKey);
    if (!keys.length) {
      return Promise.reject(
        new Error('No header rows found. Add rows with row_type = header (see sample CSV).')
      );
    }
    var errors = [];
    var imported = 0;
    return keys.reduce(function (p, key) {
      return p.then(function () {
        var h = headersByKey[key];
        var dbLines = linesByKey[key] || [];
        if (!dbLines.length) {
          errors.push('rx_key "' + key + '": no line rows (row_type = line).');
          return Promise.resolve();
        }
        var cid = findCustomerIdByNameOrPhone(db, h.customer_name, h.customer_phone);
        if (!cid) {
          errors.push('rx_key "' + key + '": customer not found: "' + h.customer_name + '".');
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
            imported++;
          })
          .catch(function (err) {
            errors.push(key + ": " + (err && err.message ? err.message : String(err)));
          });
      });
    }, Promise.resolve()).then(function () {
      return { imported: imported, errors: errors };
    });
  }

  var SAMPLE_CSV =
    "row_type,rx_key,customer_name,customer_phone,doctor_name,doctor_phone,line_status,line_type,line_notes,line_secret\n" +
    "header,RX-CSV-1,Ravi Kumar,9876501001,Dr Sample,9800000000,,,,,\n" +
    "line,RX-CSV-1,,,,,active,medication,Once daily after food,\n" +
    "line,RX-CSV-1,,,,,draft,lab,CBC test (fasting),Internal: call lab first\n";

  function downloadSamplePrescriptionsCsv() {
    var blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "prescriptions-import-sample.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  global.MargPrescriptionCsv = {
    parseCsv: parseCsv,
    importPrescriptionsCsv: importPrescriptionsCsv,
    downloadSamplePrescriptionsCsv: downloadSamplePrescriptionsCsv,
  };
})(typeof window !== "undefined" ? window : this);
