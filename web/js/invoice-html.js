/**
 * Shared HTML builder for printed order invoices (MargInvoiceHtml.buildDocument).
 * Depends: MargInvoiceFormatDefaults, MargTermsDefaults (optional).
 */
(function (global) {
  function paiseToRupees(p) {
    return (Number(p) || 0) / 100;
  }

  function formatInrPlain(paise) {
    return "₹" + paiseToRupees(paise).toFixed(2);
  }

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDisplayDate(iso) {
    if (!iso) return "—";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return escHtml(iso);
    return escHtml(p[2] + "/" + p[1] + "/" + p[0]);
  }

  function formatEntityInvoiceBlock(ent, fmt) {
    if (!ent) return "<strong>—</strong>";
    var f =
      fmt || { showShopPhone: true, showShopGstin: true, showShopDl: true };
    var name =
      (ent.legal_name && String(ent.legal_name).trim()) || ent.entity_name || "Pharmacy";
    var lines = ["<strong>" + escHtml(name) + "</strong>"];
    var addr = [];
    if (ent.line1) addr.push(ent.line1);
    if (ent.line2) addr.push(ent.line2);
    var cityLine = [ent.city, ent.state, ent.pincode].filter(Boolean).join(", ");
    if (cityLine) addr.push(cityLine);
    if (addr.length) lines.push(addr.map(escHtml).join("<br>"));
    if (f.showShopPhone && ent.phone) lines.push("Phone: " + escHtml(ent.phone));
    if (f.showShopGstin && ent.gstin) lines.push("GSTIN: " + escHtml(ent.gstin));
    if (f.showShopDl && ent.dl_number) lines.push("DL no.: " + escHtml(ent.dl_number));
    return lines.join("<br>");
  }

  function formatCustomerInvoiceBlock(cust) {
    if (!cust) return "<em>—</em>";
    var lines = ["<strong>" + escHtml(cust.name) + "</strong>"];
    if (cust.phone) lines.push("Phone: " + escHtml(cust.phone));
    var addr = [];
    if (cust.address_line1) addr.push(cust.address_line1);
    if (cust.address_line2) addr.push(cust.address_line2);
    var cityLine = [cust.city, cust.state, cust.pincode].filter(Boolean).join(", ");
    if (cityLine) addr.push(cityLine);
    if (addr.length) lines.push(addr.map(escHtml).join("<br>"));
    if (cust.email) lines.push(escHtml(cust.email));
    return lines.join("<br>");
  }

  /** @returns {'gst'} — app uses a single printed layout (GST pharmacy grid). */
  function normalizeDesignTemplate(v) {
    if (typeof global.MargInvoiceFormatDefaults !== "undefined" && MargInvoiceFormatDefaults.normalizeDesignTemplate) {
      return MargInvoiceFormatDefaults.normalizeDesignTemplate(v);
    }
    return "gst";
  }

  /** Indian English words for integer rupees (0–99 crores range). */
  function rupeesToWordsIndian(n) {
    var num = Math.floor(Math.abs(Number(n)));
    if (num === 0) return "Zero";
    var w = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];
    var t = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    function twoDigits(x) {
      if (x < 20) return w[x];
      return t[Math.floor(x / 10)] + (x % 10 ? " " + w[x % 10] : "");
    }
    function threeDigits(x) {
      var h = Math.floor(x / 100);
      var r = x % 100;
      var s = "";
      if (h) s += w[h] + " Hundred";
      if (r) s += (s ? " and " : "") + twoDigits(r);
      return s || "";
    }
    var crore = Math.floor(num / 10000000);
    num %= 10000000;
    var lakh = Math.floor(num / 100000);
    num %= 100000;
    var thousand = Math.floor(num / 1000);
    num %= 1000;
    var parts = [];
    if (crore) parts.push(threeDigits(crore) + " Crore");
    if (lakh) parts.push(threeDigits(lakh) + " Lakh");
    if (thousand) parts.push(threeDigits(thousand) + " Thousand");
    if (num) parts.push(threeDigits(num));
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  /** @returns {'color'|'grayscale'} */
  function normalizePrintColorMode(v) {
    if (typeof global.MargInvoiceFormatDefaults !== "undefined" && MargInvoiceFormatDefaults.normalizePrintColorMode) {
      return MargInvoiceFormatDefaults.normalizePrintColorMode(v);
    }
    return v === "grayscale" ? "grayscale" : "color";
  }

  /** @returns {'a4'|'letter'|'a5'|'custom'} */
  function normalizePaperSize(v) {
    if (typeof global.MargInvoiceFormatDefaults !== "undefined" && MargInvoiceFormatDefaults.normalizePaperSize) {
      return MargInvoiceFormatDefaults.normalizePaperSize(v);
    }
    return v === "letter" || v === "a5" || v === "custom" ? v : "a4";
  }

  function clampPaperMm(v, fallback) {
    if (typeof global.MargInvoiceFormatDefaults !== "undefined" && MargInvoiceFormatDefaults.normalizePaperMmDim) {
      return MargInvoiceFormatDefaults.normalizePaperMmDim(v, fallback);
    }
    var n = Number(v);
    if (!isFinite(n) || n <= 0) n = fallback;
    return Math.round(Math.min(500, Math.max(80, n)));
  }

  /**
   * @page size for browser print dialog; margins on the page box.
   * @param {object} fmt — merged format (paperSize, customPaperWidthMm, customPaperHeightMm)
   */
  function getPaperAndPrintCss(fmt) {
    var v = normalizePaperSize(fmt.paperSize);
    var sizeVal = "A4";
    var margin = "12mm";
    if (v === "custom") {
      var w = clampPaperMm(fmt.customPaperWidthMm, 210);
      var h = clampPaperMm(fmt.customPaperHeightMm, 297);
      sizeVal = w + "mm " + h + "mm";
      margin = "10mm";
    } else if (v === "letter") {
      sizeVal = "letter";
      margin = "0.5in";
    } else if (v === "a5") {
      sizeVal = "A5";
      margin = "10mm";
    }
    return (
      "@page{size:" +
      sizeVal +
      ";margin:" +
      margin +
      ";}@media print{body{margin:0;} .inv-wrap{max-width:none;}}"
    );
  }

  function getInvoiceCssForDesign(designTemplate) {
    var dt = normalizeDesignTemplate(designTemplate);
    if (dt === "minimal") {
      return (
        "body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#37474f;margin:20px;line-height:1.5;}" +
        ".inv-wrap{max-width:640px;margin:0 auto;}" +
        ".hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #cfd8dc;padding-bottom:12px;margin-bottom:16px;gap:14px;}" +
        ".shop{flex:1;min-width:0;font-size:12px;}" +
        ".inv-head{text-align:right;font-size:12px;}" +
        ".inv-title{font-size:17px;font-weight:600;color:#263238;margin:0 0 4px;}" +
        ".grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;}" +
        ".box{border:1px solid #eceff1;padding:10px 12px;border-radius:4px;background:#fafafa;}" +
        ".box h3{margin:0 0 6px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#78909c;}" +
        "table.inv-items{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;}" +
        "table.inv-items th,table.inv-items td{border:1px solid #eceff1;padding:7px 8px;vertical-align:top;}" +
        "table.inv-items th{background:#f5f5f5;text-align:left;font-weight:600;color:#455a64;}" +
        "td.r{text-align:right;white-space:nowrap;}" +
        "td.c{text-align:center;width:40px;}" +
        ".inv-muted{color:#607d8b;font-weight:400;}" +
        ".inv-sub{font-size:10px;color:#546e7a;margin-top:4px;line-height:1.35;}" +
        ".totals{margin-top:16px;display:flex;justify-content:flex-end;}" +
        ".totals table{width:280px;border-collapse:collapse;font-size:12px;}" +
        ".totals td{border:none;padding:4px 6px;}" +
        ".totals .r{text-align:right;}" +
        ".grand td{font-weight:700;font-size:14px;border-top:1px solid #90a4ae;padding-top:8px;}" +
        ".inv-notes{margin-top:16px;padding:10px;border:1px dashed #cfd8dc;border-radius:4px;font-size:11px;}" +
        ".inv-notes p{margin:6px 0 0;}" +
        ".inv-tc{margin-top:16px;padding:12px 0 0;border-top:1px solid #cfd8dc;font-size:9px;line-height:1.5;color:#455a64;}" +
        ".inv-tc strong{display:block;font-size:10px;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;color:#546e7a;}" +
        ".foot{margin-top:16px;padding-top:10px;border-top:1px solid #eceff1;font-size:9px;color:#78909c;text-align:center;}"
      );
    }
    if (dt === "retail") {
      return (
        "body{font-family:'Segoe UI',Tahoma,Geneva,sans-serif;font-size:14px;color:#212121;margin:20px;line-height:1.45;}" +
        ".inv-wrap{max-width:760px;margin:0 auto;}" +
        ".hdr{display:flex;justify-content:space-between;align-items:flex-start;background:#eceff1;padding:16px 18px;border-radius:8px;margin-bottom:18px;gap:16px;}" +
        ".shop{flex:1;min-width:0;font-size:13px;}" +
        ".inv-head{text-align:right;font-size:13px;}" +
        ".inv-title{font-size:24px;font-weight:700;color:#0d47a1;margin:0 0 6px;}" +
        ".grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;}" +
        ".box{border:2px solid #90caf9;padding:12px 14px;border-radius:6px;background:#fff;}" +
        ".box h3{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#1565c0;}" +
        "table.inv-items{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px;}" +
        "table.inv-items th,table.inv-items td{border:1px solid #bbdefb;padding:8px 10px;vertical-align:top;}" +
        "table.inv-items th{background:#1565c0;color:#fff;text-align:left;font-weight:600;}" +
        "td.r{text-align:right;white-space:nowrap;}" +
        "td.c{text-align:center;width:40px;}" +
        ".inv-muted{color:#e3f2fd;font-weight:400;}" +
        "table.inv-items td .inv-muted{color:#424242;}" +
        ".inv-sub{font-size:11px;color:#37474f;margin-top:5px;line-height:1.35;}" +
        ".totals{margin-top:18px;display:flex;justify-content:flex-end;}" +
        ".totals table{width:300px;border-collapse:collapse;font-size:13px;}" +
        ".totals td{border:none;padding:5px 8px;}" +
        ".totals .r{text-align:right;}" +
        ".grand td{font-weight:700;font-size:15px;border-top:2px solid #0d47a1;padding-top:10px;}" +
        ".inv-notes{margin-top:20px;padding:12px;border:1px dashed #64b5f6;border-radius:6px;font-size:12px;}" +
        ".inv-notes p{margin:6px 0 0;}" +
        ".inv-tc{margin-top:20px;padding:14px 0 0;border-top:1px solid #90caf9;font-size:10px;line-height:1.5;color:#263238;}" +
        ".inv-tc strong{display:block;font-size:11px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;color:#0d47a1;}" +
        ".foot{margin-top:20px;padding-top:12px;border-top:1px solid #bbdefb;font-size:10px;color:#546e7a;text-align:center;}"
      );
    }
    if (dt === "gst") {
      return (
        "body{font-family:Arial,Helvetica,'Segoe UI',sans-serif;font-size:11px;color:#000;margin:10px 12px;line-height:1.35;}" +
        ".inv-wrap{max-width:800px;margin:0 auto;}" +
        ".inv-gst-top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #000;padding-bottom:8px;margin-bottom:8px;gap:12px;}" +
        ".inv-gst-shop-block{flex:1;min-width:0;text-align:left;}" +
        ".inv-gst-shop{font-size:16px;font-weight:700;margin:0 0 4px;letter-spacing:.02em;}" +
        ".inv-gst-addr{font-size:10px;line-height:1.4;margin:0;}" +
        ".inv-gst-idline{font-size:10px;margin:3px 0 0;line-height:1.35;}" +
        ".inv-gst-right-col{flex:0 1 48%;max-width:440px;font-size:10px;text-align:right;}" +
        ".inv-gst-doc-title-inline{font-size:13px;font-weight:700;margin:0 0 6px;letter-spacing:.06em;}" +
        ".inv-gst-patient-wrap{width:100%;text-align:left;margin-top:4px;}" +
        "table.inv-gst-patient-table{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed;}" +
        "table.inv-gst-patient-table td{border:none;padding:3px 0 3px 8px;vertical-align:top;}" +
        "table.inv-gst-patient-table .inv-gst-plabel{font-weight:600;text-align:right;padding:3px 6px 3px 0;width:42%;white-space:nowrap;}" +
        "table.inv-gst-patient-table .inv-gst-pval{text-align:left;word-break:break-word;}" +
        "table.inv-gst-patient-table .inv-gst-prow--strong .inv-gst-plabel," +
        "table.inv-gst-patient-table .inv-gst-prow--strong .inv-gst-pval{font-weight:700;}" +
        ".inv-gst-bill-bar{border:1px solid #000;padding:6px 10px;margin-bottom:8px;width:100%;box-sizing:border-box;}" +
        ".inv-gst-bill-line{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:12px;row-gap:4px;width:100%;font-size:10px;align-items:center;}" +
        ".inv-gst-bill-line--2{grid-template-columns:repeat(2,minmax(0,1fr));}" +
        ".inv-gst-bill-cell{text-align:center;min-width:0;padding:0 4px;white-space:nowrap;}" +
        ".inv-gst-bill-cell .k{font-weight:600;}" +
        "table.inv-gst-items{width:100%;border-collapse:collapse;font-size:9px;margin:0 0 8px;table-layout:fixed;}" +
        "table.inv-gst-items th,table.inv-gst-items td{border:1px solid #000;padding:3px 4px;vertical-align:top;word-break:break-word;}" +
        "table.inv-gst-items th{background:#f0f0f0;font-weight:700;text-align:center;font-size:8px;text-transform:uppercase;}" +
        "table.inv-gst-items .sn{width:22px;text-align:center;}" +
        "table.inv-gst-items th:nth-child(2),table.inv-gst-items td.nm{width:38%;min-width:11rem;text-align:left;}" +
        "table.inv-gst-items .r{text-align:right;white-space:nowrap;}" +
        "table.inv-gst-items .c{text-align:center;}" +
        ".inv-gst-sub{font-size:8px;color:#333;margin-top:2px;line-height:1.25;}" +
        "table.inv-gst-items{margin-bottom:0;}" +
        ".inv-gst-qr-band{margin:6px 0 0;}" +
        ".inv-gst-qr-row{display:flex;flex-direction:row;align-items:flex-start;gap:14px;flex-wrap:wrap;}" +
        ".inv-gst-notes-beside-qr{flex:1;min-width:140px;max-width:340px;}" +
        ".inv-gst-notes-beside-qr .inv-notes{margin-top:0;padding:6px 8px;border:1px dashed #666;font-size:9px;line-height:1.4;}" +
        ".inv-gst-qr-frame{display:inline-block;border:1px solid #000;padding:5px 8px 6px;background:#fff;vertical-align:top;flex-shrink:0;}" +
        ".inv-gst-qr-top{text-align:center;font-size:8px;font-weight:600;letter-spacing:.04em;margin-bottom:4px;}" +
        ".inv-gst-qr-mid{display:flex;flex-direction:row;align-items:center;justify-content:center;gap:6px;}" +
        ".inv-gst-qr-left,.inv-gst-qr-right{font-size:7px;font-weight:600;line-height:1.15;color:#000;width:1em;white-space:nowrap;}" +
        ".inv-gst-qr-left{writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;}" +
        ".inv-gst-qr-right{writing-mode:vertical-rl;text-align:center;}" +
        ".inv-gst-qr-img{display:block;width:88px;height:88px;border:1px solid #000;background:#fff;image-rendering:pixelated;flex-shrink:0;}" +
        ".inv-gst-qr-bot{text-align:center;font-size:8px;font-weight:600;margin-top:4px;letter-spacing:.02em;}" +
        ".inv-gst-words-full{font-size:10px;font-weight:600;margin:8px 0 0;padding:6px 0 8px;line-height:1.45;border-top:1px solid #000;border-bottom:1px solid #000;}" +
        ".inv-gst-bottom{display:grid;grid-template-columns:minmax(0,1.265fr) minmax(0,0.735fr);gap:14px;align-items:flex-start;margin-top:8px;padding-top:6px;}" +
        ".inv-gst-bottom-left{min-width:0;}" +
        ".inv-gst-bottom-right{display:flex;flex-direction:column;align-items:stretch;width:100%;min-width:0;}" +
        ".inv-gst-totals-wrap{width:100%;display:flex;justify-content:flex-end;margin-bottom:4px;}" +
        "table.inv-gst-totals{border-collapse:collapse;font-size:10px;width:100%;max-width:260px;margin-left:auto;}" +
        "table.inv-gst-totals td{padding:4px 0;vertical-align:baseline;border:none;}" +
        "table.inv-gst-totals .lbl{text-align:left;font-weight:600;padding-right:14px;white-space:nowrap;}" +
        "table.inv-gst-totals .inv-gst-amt{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:5rem;}" +
        "table.inv-gst-totals tbody tr:not(.inv-gst-pay-row) .inv-gst-amt{font-weight:500;}" +
        "table.inv-gst-totals tbody tr.inv-gst-pay-row td{padding-top:8px;border-top:1px solid #000;}" +
        "table.inv-gst-totals tbody tr.inv-gst-pay-row .lbl," +
        "table.inv-gst-totals tbody tr.inv-gst-pay-row .inv-gst-amt{font-weight:700;font-size:11px;}" +
        ".inv-gst-sig-block{margin-top:18px;width:100%;max-width:280px;margin-left:auto;margin-right:auto;text-align:center;}" +
        ".inv-gst-sig-for{font-size:10px;margin:0 0 4px;font-weight:600;line-height:1.35;}" +
        ".inv-gst-sig-line{min-height:32px;border-bottom:1px solid #000;margin:10px auto 8px;width:92%;max-width:220px;}" +
        ".inv-gst-sig-label{font-size:10px;margin:0;line-height:1.35;font-weight:500;}" +
        ".inv-gst-bottom-left .inv-gst-terms-head:first-child{margin-top:0;}" +
        ".inv-gst-terms-head{font-size:10px;font-weight:600;text-decoration:underline;margin:10px 0 6px;color:#000;}" +
        ".inv-gst-terms-list{margin:0;padding-left:1.1rem;font-size:9px;line-height:1.4;}" +
        ".inv-gst-terms-list li{margin:2px 0;}" +
        ".inv-notes{margin-top:8px;padding:6px;border:1px dashed #666;font-size:9px;}" +
        ".foot{margin-top:8px;padding-top:6px;border-top:1px solid #ccc;font-size:8px;color:#333;text-align:center;}"
      );
    }
    return (
      "body{font-family:Georgia,'Times New Roman',serif;font-size:14px;color:#111;margin:24px;line-height:1.45;}" +
      ".inv-wrap{max-width:720px;margin:0 auto;}" +
      ".hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #00695c;padding-bottom:14px;margin-bottom:18px;gap:16px;}" +
      ".shop{flex:1;min-width:0;font-size:13px;}" +
      ".inv-head{text-align:right;font-size:13px;}" +
      ".inv-title{font-size:22px;font-weight:700;color:#00695c;margin:0 0 6px;}" +
      ".grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;}" +
      ".box{border:1px solid #ccc;padding:12px 14px;border-radius:6px;background:#fafafa;}" +
      ".box h3{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#555;}" +
      "table.inv-items{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px;}" +
      "table.inv-items th,table.inv-items td{border:1px solid #ddd;padding:8px 10px;vertical-align:top;}" +
      "table.inv-items th{background:#eceff1;text-align:left;font-weight:600;}" +
      "td.r{text-align:right;white-space:nowrap;}" +
      "td.c{text-align:center;width:40px;}" +
      ".inv-muted{color:#555;font-weight:400;}" +
      ".inv-sub{font-size:11px;color:#444;margin-top:5px;line-height:1.35;}" +
      ".totals{margin-top:18px;display:flex;justify-content:flex-end;}" +
      ".totals table{width:300px;border-collapse:collapse;font-size:13px;}" +
      ".totals td{border:none;padding:5px 8px;}" +
      ".totals .r{text-align:right;}" +
      ".grand td{font-weight:700;font-size:15px;border-top:2px solid #333;padding-top:10px;}" +
      ".inv-notes{margin-top:20px;padding:12px;border:1px dashed #bbb;border-radius:6px;font-size:12px;}" +
      ".inv-notes p{margin:6px 0 0;}" +
      ".inv-tc{margin-top:20px;padding:14px 0 0;border-top:1px solid #bbb;font-size:10px;line-height:1.5;color:#222;}" +
      ".inv-tc strong{display:block;font-size:11px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;color:#333;}" +
      ".foot{margin-top:20px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#666;text-align:center;}"
    );
  }

  function formatScheduleForInvoice(sch) {
    if (!sch) return "";
    var parts = [];
    if (Number(sch.in_morning) === 1) parts.push("Morning");
    if (Number(sch.in_noon) === 1) parts.push("Noon");
    if (Number(sch.in_evening) === 1) parts.push("Evening");
    if (Number(sch.in_night) === 1) parts.push("Night");
    var s = parts.join(", ");
    if (sch.remarks && String(sch.remarks).trim()) {
      s += (s ? " — " : "") + String(sch.remarks).trim();
    }
    return s;
  }

  function formatGstPatientAddress(cust) {
    if (!cust) return "";
    var lines = [];
    if (cust.address_line1) lines.push(cust.address_line1);
    if (cust.address_line2) lines.push(cust.address_line2);
    var cityLine = [cust.city, cust.state, cust.pincode].filter(Boolean).join(", ");
    if (cityLine) lines.push(cityLine);
    return lines.length ? lines.map(escHtml).join(", ") : "";
  }

  function formatGstShopPhones(ent) {
    if (!ent) return "";
    var parts = [];
    if (ent.phone && String(ent.phone).trim()) parts.push(String(ent.phone).trim());
    if (ent.alternate_phone && String(ent.alternate_phone).trim()) parts.push(String(ent.alternate_phone).trim());
    return parts.length ? "Phone : " + parts.map(escHtml).join(", ") : "";
  }

  function paiseToRupeesFixed(paise) {
    return ((Number(paise) || 0) / 100).toFixed(2);
  }

  /** Deterministic RNG for GST placeholders (same order → same sample fillers). */
  function gstPlaceholderSeed(ent, o, cust) {
    var s =
      String((ent && ent.id) || 0) +
      ":" +
      String((o && o.id) || 0) +
      ":" +
      String((cust && cust.id) || 0);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function createGstPlaceholderRng(seed) {
    var s = seed >>> 0;
    function next() {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    }
    function nextInt(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    }
    function pick(arr) {
      return arr[nextInt(0, arr.length - 1)];
    }
    function digits(n) {
      var out = "";
      for (var i = 0; i < n; i++) out += String(nextInt(0, 9));
      return out;
    }
    function pad2(n) {
      return n < 10 ? "0" + n : String(n);
    }
    return { next: next, nextInt: nextInt, pick: pick, digits: digits, pad2: pad2 };
  }

  var GST_SAMPLE_PATIENT_NAMES = [
    "RITA SRIVASTAVA",
    "AMIT KUMAR VERMA",
    "PRIYA SHARMA",
    "RAJESH PATEL",
    "SUNITA DEVI",
  ];
  /** Shown on GST pharmacy invoice when no prescription doctor is available. */
  var GST_DEFAULT_DOCTOR_NAME = "DR. VIVEK AGARWAL";

  function trimDoctorNameFromRow(row) {
    if (!row) return "";
    var raw = row.doctor_name != null ? String(row.doctor_name).trim() : "";
    return raw;
  }

  /**
   * Doctor on GST invoice: (1) linked prescription on the order, else (2) most recent
   * prescription for the same customer (orders are often saved without an explicit link), else default.
   *
   * @param {object|null} order — shop_order row (customer_id, optional prescription_id)
   * @param {{ db?: object }} [printOpts] — MargDb; uses getPrescription, listPrescriptions
   * @returns {string} plain-text doctor label for the invoice
   */
  function resolveGstDoctorDisplayName(order, printOpts) {
    var db = printOpts && printOpts.db;
    if (!db) {
      return GST_DEFAULT_DOCTOR_NAME;
    }

    var rxId = order && order.prescription_id != null ? Number(order.prescription_id) : NaN;
    if (typeof db.getPrescription === "function" && rxId > 0 && !isNaN(rxId)) {
      try {
        var pack = db.getPrescription(rxId);
        if (pack && pack.header) {
          var fromLink = trimDoctorNameFromRow(pack.header);
          if (fromLink) return fromLink;
        }
      } catch (e) {
        /* try customer fallback */
      }
    }

    var cid = order && order.customer_id != null ? Number(order.customer_id) : NaN;
    if (cid > 0 && !isNaN(cid)) {
      try {
        var rows = null;
        if (typeof db.listPrescriptions === "function") {
          rows = db.listPrescriptions({ customerId: cid });
        } else if (typeof db.listPrescriptionsForCustomer === "function") {
          rows = db.listPrescriptionsForCustomer(cid);
        }
        if (rows && rows.length) {
          for (var i = 0; i < rows.length; i++) {
            var nm = trimDoctorNameFromRow(rows[i]);
            if (nm) return nm;
          }
        }
      } catch (e2) {
        /* ignore */
      }
    }

    return GST_DEFAULT_DOCTOR_NAME;
  }

  var GST_SAMPLE_ADDRESSES = [
    "TCV-66, VIBHUTI KHAND, GOMTI NAGAR, LUCKNOW",
    "12, ASHOK NAGAR, NEAR CITY MALL, KANPUR",
    "Plot 4, Sector 18, NOIDA, UTTAR PRADESH",
    "45, MG ROAD, INDIRANAGAR, BENGALURU",
  ];
  var GST_SAMPLE_SHOP_ADDR = [
    "TCV-66, VIBHUTI KHAND, GOMTI NAGAR, OPP RAM MANOHER LOHIYA HOSPITAL, LUCKNOW",
    "Shop 12, APNA BAZAR, ALIGANJ, LUCKNOW",
    "Ground Floor, Health Complex, GOMTI NAGAR EXTENSION, LUCKNOW",
  ];
  var GST_SAMPLE_PHONES = [
    "0522-4080158, 6389222202, 8090222202",
    "011-41234567, 9810012345",
    "080-25556677, 9876543210",
  ];
  var GST_SAMPLE_PRODUCT_NAMES = [
    "DAPANORM TRIO",
    "NEBILONG-5 TAB",
    "A TO Z GOLD",
    "CETANIL T",
    "PARACETAMOL 500 MG",
  ];
  var GST_DEFAULT_TERMS_LINES = [
    "Medicines are sold on dr.prescription only.",
    "For any reaction of medicine chemist will not be responsible.",
    "No exchange, no replacement.",
    "In special case full strip will be accepted for replacement only on producing the bill.",
    "Medicine should be used after checking the date of expiry.",
    "All subject to disputes Lucknow jurisdiction only.",
  ];

  /**
   * Small scannable QR (random payload per seeded rng). Uses external image API so print
   * works offline only if the image is already cached; payload is stable for same invoice seed.
   */
  function buildGstQrMarkup(rng) {
    var payload =
      "https://pharmapulse.app/health-offers?ref=" + rng.digits(14) + "&src=invoice";
    var src =
      "https://api.qrserver.com/v1/create-qr-code/?size=88x88&margin=1&ecc=M&data=" +
      encodeURIComponent(payload);
    return (
      '<div class="inv-gst-qr-frame">' +
      '<div class="inv-gst-qr-top">Scan &amp; Book</div>' +
      '<div class="inv-gst-qr-mid">' +
      '<div class="inv-gst-qr-left">Body Checkup</div>' +
      '<img class="inv-gst-qr-img" src="' +
      src +
      '" width="88" height="88" alt="Scan for health offers" />' +
      '<div class="inv-gst-qr-right">Health Offers</div>' +
      "</div>" +
      '<div class="inv-gst-qr-bot">Improve Your Health</div>' +
      "</div>"
    );
  }

  function buildGstInvoiceHtml(ent, o, cust, lineRows, fmt, printOpts) {
    var rng = createGstPlaceholderRng(gstPlaceholderSeed(ent, o, cust));
    var invNo =
      o.order_number && String(o.order_number).trim() ? escHtml(o.order_number) : "Order #" + o.id;
    var shopName = ent
      ? escHtml((ent.legal_name && String(ent.legal_name).trim()) || ent.entity_name || "Pharmacy")
      : escHtml("SAI MEDICAL HALL");

    var addrLines = [];
    if (ent) {
      if (ent.line1) addrLines.push(escHtml(ent.line1));
      if (ent.line2) addrLines.push(escHtml(ent.line2));
      var cityLine = [ent.city, ent.state, ent.pincode].filter(Boolean).join(", ");
      if (cityLine) addrLines.push(escHtml(cityLine));
    }
    var addrHtml = addrLines.length
      ? '<p class="inv-gst-addr">' + addrLines.join("<br>") + "</p>"
      : '<p class="inv-gst-addr">' + escHtml(rng.pick(GST_SAMPLE_SHOP_ADDR)) + "</p>";

    var phoneRaw = fmt.showShopPhone !== false && ent ? formatGstShopPhones(ent) : "";
    var phoneLine = "";
    if (fmt.showShopPhone !== false) {
      phoneLine = phoneRaw ? phoneRaw : "Phone : " + escHtml(rng.pick(GST_SAMPLE_PHONES));
    }

    var dlVal =
      fmt.showShopDl !== false && ent && ent.dl_number && String(ent.dl_number).trim()
        ? String(ent.dl_number).trim()
        : "LKO/FDA-20-" + rng.digits(4) + "/12, LKO/FDA-21-" + rng.digits(4) + "/12";
    var dlLine = fmt.showShopDl !== false ? '<div class="inv-gst-idline">DL NO: ' + escHtml(dlVal) + "</div>" : "";

    var gstinVal =
      fmt.showShopGstin !== false && ent && ent.gstin && String(ent.gstin).trim()
        ? String(ent.gstin).trim()
        : "09" + rng.digits(11) + "Z" + rng.nextInt(0, 9);
    var gstinLine =
      fmt.showShopGstin !== false
        ? '<div class="inv-gst-idline">GSTIN : ' + escHtml(gstinVal) + "</div>"
        : "";

    var fssaiLine = "";
    if (fmt.showShopGstin !== false) {
      var fssaiVal =
        ent && ent.fssai != null && String(ent.fssai).trim()
          ? String(ent.fssai).trim()
          : rng.digits(14);
      fssaiLine = '<div class="inv-gst-idline">FSSAI NO: ' + escHtml(fssaiVal) + "</div>";
    }

    var docTitle = escHtml(
      fmt.documentTitle && String(fmt.documentTitle).trim() ? fmt.documentTitle : "GST INVOICE"
    );

    var patientName =
      cust && cust.name && String(cust.name).trim()
        ? escHtml(cust.name)
        : escHtml(rng.pick(GST_SAMPLE_PATIENT_NAMES));
    var patientAddr = formatGstPatientAddress(cust);
    if (!patientAddr) {
      patientAddr = escHtml(rng.pick(GST_SAMPLE_ADDRESSES));
    }
    var patientPhone =
      cust && cust.phone && String(cust.phone).trim()
        ? escHtml(cust.phone)
        : escHtml("9" + rng.digits(9));
    var doctorName = escHtml(resolveGstDoctorDisplayName(o, printOpts));

    var billTime =
      rng.pad2(rng.nextInt(9, 21)) + ":" + rng.pad2(rng.nextInt(0, 59));
    var userCode = ("00" + rng.nextInt(0, 999)).slice(-3);
    if (o && o.created_at) {
      var tm = String(o.created_at).match(/T(\d{2}):(\d{2})/);
      if (tm) billTime = tm[1] + ":" + tm[2];
    }
    if (o && (o.customer_id != null || o.id != null)) {
      var uid = Number(o.customer_id) || Number(o.id) || 0;
      userCode = ("00" + String(uid % 1000)).slice(-3);
    }

    var patientRows = "";
    if (fmt.showBillTo) {
      patientRows =
        '<div class="inv-gst-patient-wrap">' +
        '<table class="inv-gst-patient-table" role="presentation">' +
        "<tbody>" +
        '<tr class="inv-gst-prow inv-gst-prow--strong">' +
        '<td class="inv-gst-plabel">Patient Name :</td><td class="inv-gst-pval">' +
        patientName +
        "</td></tr>" +
        '<tr class="inv-gst-prow">' +
        '<td class="inv-gst-plabel">Patient Address :</td><td class="inv-gst-pval">' +
        patientAddr +
        "</td></tr>" +
        '<tr class="inv-gst-prow">' +
        '<td class="inv-gst-plabel">Patient Mob.No. :</td><td class="inv-gst-pval">' +
        patientPhone +
        "</td></tr>" +
        '<tr class="inv-gst-prow inv-gst-prow--strong">' +
        '<td class="inv-gst-plabel">Doctor Name :</td><td class="inv-gst-pval">' +
        doctorName +
        "</td></tr>" +
        "</tbody></table></div>";
    }

    var billRows;
    if (fmt.showInvoiceStatus !== false) {
      billRows =
        '<div class="inv-gst-bill-line">' +
        '<div class="inv-gst-bill-cell"><span class="k">BILL NO. :</span> <span class="v">' +
        invNo +
        "</span></div>" +
        '<div class="inv-gst-bill-cell"><span class="k">Date :</span> <span class="v">' +
        formatDisplayDate(o.order_date) +
        "</span></div>" +
        '<div class="inv-gst-bill-cell"><span class="k">Time :</span> <span class="v">' +
        escHtml(billTime) +
        "</span></div>" +
        '<div class="inv-gst-bill-cell"><span class="k">USER :</span> <span class="v">' +
        escHtml(userCode) +
        "</span></div>" +
        "</div>";
    } else {
      billRows =
        '<div class="inv-gst-bill-line inv-gst-bill-line--2">' +
        '<div class="inv-gst-bill-cell"><span class="k">BILL NO. :</span> <span class="v">' +
        invNo +
        "</span></div>" +
        '<div class="inv-gst-bill-cell"><span class="k">Date :</span> <span class="v">' +
        formatDisplayDate(o.order_date) +
        "</span></div>" +
        "</div>";
    }

    var rightColHtml =
      '<div class="inv-gst-right-col">' +
      '<p class="inv-gst-doc-title-inline">' +
      docTitle +
      "</p>" +
      patientRows +
      "</div>";

    var billMetaHtml = '<div class="inv-gst-bill-bar">' + billRows + "</div>";

    var packSamples = ["1×10", "1×15", "1×15", "1×15"];
    var expSamples = ["5/27", "6/27", "2/27", "10/27"];
    var rowsHtml = lineRows
      .map(function (item, idx) {
        var ln = item.line;
        var sch = item.schedule;
        var qty = Number(ln.quantity) || 0;
        var qtyFmt = qty + ":0";
        var pack =
          ln.pack_label && String(ln.pack_label).trim()
            ? escHtml(String(ln.pack_label).trim())
            : escHtml(packSamples[idx % packSamples.length]);
        var batch =
          fmt.showProductCode !== false && ln.product_code && String(ln.product_code).trim()
            ? escHtml(String(ln.product_code).trim().replace(/\s/g, ""))
            : "—";
        var exp = expSamples[idx % expSamples.length];
        var linePaise = Number(ln.total_price_paise) || 0;
        var qtySafe = qty > 0 ? qty : 1;
        var unitRupees = linePaise / qtySafe / 100;
        var mrpStr = isFinite(unitRupees) ? unitRupees.toFixed(2) : "0.00";
        var rawName =
          ln.product_name && String(ln.product_name).trim()
            ? ln.product_name
            : GST_SAMPLE_PRODUCT_NAMES[idx % GST_SAMPLE_PRODUCT_NAMES.length];
        var name = escHtml(rawName);
        var extras = "";
        if (fmt.showLineSchedule && sch) {
          var dose = formatScheduleForInvoice(sch);
          if (dose) extras += '<div class="inv-gst-sub">' + escHtml(dose) + "</div>";
        }
        if (fmt.showLineNotes !== false && ln.line_notes && String(ln.line_notes).trim()) {
          extras += '<div class="inv-gst-sub">' + escHtml(ln.line_notes) + "</div>";
        }
        return (
          "<tr>" +
          '<td class="sn c">' +
          (idx + 1) +
          "</td>" +
          '<td class="nm"><strong>' +
          name +
          "</strong>" +
          extras +
          "</td>" +
          '<td class="c">' + pack + "</td>" +
          '<td class="c">' +
          escHtml(qtyFmt) +
          "</td>" +
          '<td class="c">' + batch + "</td>" +
          '<td class="c">' +
          escHtml(exp) +
          "</td>" +
          '<td class="r">' +
          mrpStr +
          "</td>" +
          '<td class="r">' +
          "0.00" +
          "</td>" +
          '<td class="r">' +
          paiseToRupeesFixed(linePaise) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    var subtotal = lineRows.reduce(function (s, item) {
      return s + (Number(item.line.total_price_paise) || 0);
    }, 0);
    var disc = Number(o.order_discount_paise) || 0;
    var grand = Number(o.order_total_price_paise) || 0;
    var afterDiscPaise = subtotal - disc;
    var roundOffPaise = grand - afterDiscPaise;
    var rupeesForWords = Math.round(grand / 100);

    var termsHtml = "";
    var termsRaw = "";
    if (fmt.showTerms) {
      if (typeof global.MargTermsDefaults !== "undefined" && MargTermsDefaults.resolveTermsText) {
        termsRaw = MargTermsDefaults.resolveTermsText(ent, ent && ent.id, { seedLs: false }) || "";
      } else if (ent && ent.terms_and_conditions && String(ent.terms_and_conditions).trim()) {
        termsRaw = ent.terms_and_conditions;
      }
      if (!termsRaw || !String(termsRaw).trim()) {
        termsRaw = GST_DEFAULT_TERMS_LINES.join("\n");
      }
      if (termsRaw && String(termsRaw).trim()) {
        var lines = String(termsRaw)
          .split(/\r?\n/)
          .map(function (l) {
            return l.trim().replace(/^\d+\.\s*/, "");
          })
          .filter(Boolean);
        if (lines.length) {
          termsHtml =
            '<div class="inv-gst-terms-head">Terms &amp; conditions</div>' +
            "<ol class=\"inv-gst-terms-list\">" +
            lines
              .map(function (line) {
                return "<li>" + escHtml(line) + "</li>";
              })
              .join("") +
            "</ol>";
        }
      }
    }

    var notesBlock = "";
    if (fmt.showOrderNotes && o.notes && String(o.notes).trim()) {
      notesBlock =
        '<div class="inv-notes"><strong>Order notes</strong><p>' + escHtml(o.notes) + "</p></div>";
    }

    var preTableSummary = "";
    if (fmt.showSummaryBox) {
      preTableSummary =
        '<p class="inv-gst-pretable-summary" style="font-size:10px;margin:0 0 6px;color:#333">Summary · ' +
        lineRows.length +
        " line item(s) · amounts in INR</p>";
    }

    var qrRowInner = "";
    if (fmt.showQrCode !== false) {
      qrRowInner += buildGstQrMarkup(rng);
    }
    if (notesBlock) {
      qrRowInner += '<aside class="inv-gst-notes-beside-qr">' + notesBlock + "</aside>";
    }
    var qrBandHtml =
      qrRowInner.trim() !== ""
        ? '<div class="inv-gst-qr-band"><div class="inv-gst-qr-row">' + qrRowInner + "</div></div>"
        : "";

    var footParts = "";
    if (fmt.showGeneratedFooter) {
      footParts +=
        '<p class="foot">Generated by Pharmacy ERP · This document is not a tax invoice unless GST/HSN rules are configured for your shop.</p>';
    }
    if (fmt.customFooterLine && String(fmt.customFooterLine).trim()) {
      footParts += '<p class="foot inv-foot-custom">' + escHtml(String(fmt.customFooterLine).trim()) + "</p>";
    }

    var sigName = ent
      ? escHtml((ent.legal_name && String(ent.legal_name).trim()) || ent.entity_name || "Shop")
      : "Shop";

    var css = getInvoiceCssForDesign("gst");
    if (normalizePrintColorMode(fmt.printColorMode) === "grayscale") {
      css +=
        ".inv-wrap.inv-print-bw{filter:grayscale(100%);-webkit-filter:grayscale(100%);}" +
        "@media print{.inv-wrap.inv-print-bw{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}";
    }
    css += getPaperAndPrintCss(fmt);
    var wrapClass =
      "inv-wrap" + (normalizePrintColorMode(fmt.printColorMode) === "grayscale" ? " inv-print-bw" : "");

    var body =
      '<div class="inv-gst-top">' +
      '<div class="inv-gst-shop-block">' +
      '<h1 class="inv-gst-shop">' +
      shopName +
      "</h1>" +
      addrHtml +
      (phoneLine ? '<p class="inv-gst-addr">' + phoneLine + "</p>" : "") +
      dlLine +
      gstinLine +
      fssaiLine +
      "</div>" +
      rightColHtml +
      "</div>" +
      billMetaHtml +
      preTableSummary +
      "<table class=\"inv-gst-items\"><thead><tr>" +
      '<th class="sn">SN.</th>' +
      "<th>PRODUCT NAME</th>" +
      "<th>PACK</th>" +
      "<th>TABS</th>" +
      "<th>BATCH</th>" +
      "<th>EXP.</th>" +
      "<th>MRP</th>" +
      "<th>DIS.</th>" +
      "<th>AMOUNT</th>" +
      "</tr></thead><tbody>" +
      rowsHtml +
      "</tbody></table>" +
      qrBandHtml +
      '<p class="inv-gst-words-full">' +
      escHtml("Rs. " + rupeesToWordsIndian(rupeesForWords) + " only") +
      "</p>" +
      '<div class="inv-gst-bottom">' +
      '<div class="inv-gst-bottom-left">' +
      termsHtml +
      "</div>" +
      '<div class="inv-gst-bottom-right">' +
      '<div class="inv-gst-totals-wrap">' +
      '<table class="inv-gst-totals"><tbody>' +
      "<tr><td class=\"lbl\">TOTAL</td><td class=\"inv-gst-amt\">" +
      paiseToRupeesFixed(subtotal) +
      "</td></tr>" +
      "<tr><td class=\"lbl\">DISCOUNT</td><td class=\"inv-gst-amt\">" +
      paiseToRupeesFixed(disc) +
      "</td></tr>" +
      "<tr><td class=\"lbl\">ROUND OFF</td><td class=\"inv-gst-amt\">" +
      paiseToRupeesFixed(roundOffPaise) +
      "</td></tr>" +
      '<tr class="inv-gst-pay-row"><td class="lbl">PLEASE PAY</td><td class="inv-gst-amt">' +
      paiseToRupeesFixed(grand) +
      "</td></tr>" +
      "</tbody></table></div>" +
      '<div class="inv-gst-sig-block">' +
      '<p class="inv-gst-sig-for">For ' +
      sigName +
      "</p>" +
      '<div class="inv-gst-sig-line" aria-hidden="true"></div>' +
      '<p class="inv-gst-sig-label">Authorised Signatory</p>' +
      "</div>" +
      "</div>" +
      "</div>" +
      footParts;

    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Invoice " +
      invNo +
      "</title><style>" +
      css +
      "</style></head><body><div class=\"" +
      wrapClass +
      "\">" +
      body +
      "</div></body></html>"
    );
  }

  /**
   * @param {object|null} ent — entity row (getCurrentEntity)
   * @param {object} o — order header
   * @param {object|null} cust — customer row
   * @param {Array<{line: object, schedule: object|null}>} lineRows
   * @param {object} [fmt] — merged invoice format (optional; merged from ent if omitted)
   * @param {{ db?: object }} [printOpts] — pass `{ db }` so GST layout can resolve doctor from linked prescription
   * @returns {string} full HTML document
   */
  function buildDocument(ent, o, cust, lineRows, fmt, printOpts) {
    if (!fmt && typeof global.MargInvoiceFormatDefaults !== "undefined" && MargInvoiceFormatDefaults.merge) {
      fmt = MargInvoiceFormatDefaults.merge(ent);
    }
    if (!fmt) {
      fmt = {
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
    }
    if (normalizeDesignTemplate(fmt.designTemplate) === "gst") {
      return buildGstInvoiceHtml(ent, o, cust, lineRows, fmt, printOpts);
    }
    var invLabel =
      o.order_number && String(o.order_number).trim() ? escHtml(o.order_number) : "Order #" + o.id;
    var rowsHtml = lineRows
      .map(function (item, idx) {
        var ln = item.line;
        var sch = item.schedule;
        var name = escHtml(ln.product_name || "");
        var code =
          fmt.showProductCode !== false &&
          ln.product_code &&
          String(ln.product_code).trim()
            ? ' <span class="inv-muted">(' + escHtml(ln.product_code) + ")</span>"
            : "";
        var extras = "";
        var dose = fmt.showLineSchedule ? formatScheduleForInvoice(sch) : "";
        if (dose) {
          extras += '<div class="inv-sub">Dose / schedule: ' + escHtml(dose) + "</div>";
        }
        if (fmt.showLineNotes !== false && ln.line_notes && String(ln.line_notes).trim()) {
          extras += '<div class="inv-sub">Line note: ' + escHtml(ln.line_notes) + "</div>";
        }
        return (
          "<tr>" +
          '<td class="c">' +
          (idx + 1) +
          "</td>" +
          "<td><strong>" +
          name +
          "</strong>" +
          code +
          extras +
          "</td>" +
          '<td class="r">' +
          escHtml(String(ln.quantity)) +
          "</td>" +
          '<td class="r">' +
          formatInrPlain(ln.total_price_paise) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    var subtotal = lineRows.reduce(function (s, item) {
      return s + (Number(item.line.total_price_paise) || 0);
    }, 0);
    var disc = Number(o.order_discount_paise) || 0;
    var grand = Number(o.order_total_price_paise) || 0;
    var st = escHtml(o.status || "draft");
    var notesBlock = "";
    if (fmt.showOrderNotes && o.notes && String(o.notes).trim()) {
      notesBlock =
        '<div class="inv-notes"><strong>Order notes</strong><p>' + escHtml(o.notes) + "</p></div>";
    }
    var termsBlock = "";
    var termsRaw = "";
    if (fmt.showTerms) {
      if (typeof global.MargTermsDefaults !== "undefined" && MargTermsDefaults.resolveTermsText) {
        termsRaw = MargTermsDefaults.resolveTermsText(ent, ent && ent.id, { seedLs: false });
      } else if (ent && ent.terms_and_conditions && String(ent.terms_and_conditions).trim()) {
        termsRaw = ent.terms_and_conditions;
      }
      if (termsRaw && String(termsRaw).trim()) {
        termsBlock =
          '<div class="inv-tc"><strong>Terms &amp; conditions</strong><div class="inv-tc-body">' +
          escHtml(termsRaw).replace(/\n/g, "<br>") +
          "</div></div>";
      }
    }
    var grid2Html = "";
    if (fmt.showBillTo || fmt.showSummaryBox) {
      grid2Html = '<div class="grid2">';
      if (fmt.showBillTo) {
        grid2Html += '<div class="box"><h3>Bill to</h3>' + formatCustomerInvoiceBlock(cust) + "</div>";
      }
      if (fmt.showSummaryBox) {
        grid2Html +=
          '<div class="box"><h3>Summary</h3><div>Line items: ' +
          lineRows.length +
          "</div>" +
          "<div>Amounts in INR (incl. line totals)</div></div>";
      }
      grid2Html += "</div>";
    }
    var footParts = "";
    if (fmt.showGeneratedFooter) {
      footParts +=
        '<p class="foot">Generated by Pharmacy ERP · This document is not a tax invoice unless GST/HSN rules are configured for your shop.</p>';
    }
    if (fmt.customFooterLine && String(fmt.customFooterLine).trim()) {
      footParts += '<p class="foot inv-foot-custom">' + escHtml(String(fmt.customFooterLine).trim()) + "</p>";
    }
    var docHeading = escHtml(
      fmt.documentTitle && String(fmt.documentTitle).trim() ? fmt.documentTitle : "Sales invoice"
    );
    var statusHtml =
      fmt.showInvoiceStatus !== false
        ? "<div><strong>Status</strong> " + st + "</div>"
        : "";
    var css = getInvoiceCssForDesign(fmt.designTemplate);
    if (normalizePrintColorMode(fmt.printColorMode) === "grayscale") {
      css +=
        ".inv-wrap.inv-print-bw{filter:grayscale(100%);-webkit-filter:grayscale(100%);}" +
        "@media print{.inv-wrap.inv-print-bw{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}";
    }
    css += getPaperAndPrintCss(fmt);
    var wrapClass =
      "inv-wrap" + (normalizePrintColorMode(fmt.printColorMode) === "grayscale" ? " inv-print-bw" : "");
    return (
      "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Invoice " +
      invLabel +
      "</title><style>" +
      css +
      "</style></head><body><div class=\"" +
      wrapClass +
      "\">" +
      '<div class="hdr"><div class="shop">' +
      formatEntityInvoiceBlock(ent, fmt) +
      '</div><div class="inv-head"><h1 class="inv-title">' +
      docHeading +
      "</h1>" +
      "<div><strong>No.</strong> " +
      invLabel +
      "</div>" +
      "<div><strong>Date</strong> " +
      formatDisplayDate(o.order_date) +
      "</div>" +
      statusHtml +
      "</div></div>" +
      grid2Html +
      "<table class=\"inv-items\"><thead><tr>" +
      "<th class=\"c\">#</th><th>Item</th><th class=\"r\">Tabs</th><th class=\"r\">Amount</th>" +
      "</tr></thead><tbody>" +
      rowsHtml +
      "</tbody></table>" +
      '<div class="totals"><table><tbody>' +
      "<tr><td>Subtotal (lines)</td><td class=\"r\">" +
      formatInrPlain(subtotal) +
      "</td></tr>" +
      "<tr><td>Header discount</td><td class=\"r\">− " +
      formatInrPlain(disc) +
      "</td></tr>" +
      '<tr class="grand"><td>Total</td><td class=\"r\">' +
      formatInrPlain(grand) +
      "</td></tr></tbody></table></div>" +
      notesBlock +
      termsBlock +
      footParts +
      "</div>" +
      "</body></html>"
    );
  }

  global.MargInvoiceHtml = {
    buildDocument: buildDocument,
  };
})(typeof window !== "undefined" ? window : this);
