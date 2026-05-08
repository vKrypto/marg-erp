/**
 * Invoice print options: built-in presets, v2 state (active + custom formats), merge for entity row.
 */
(function (global) {
  var FORMAT_STATE_VERSION = 2;

  /** Visual print theme: classic (serif/teal), minimal (light sans), retail (bold header/table). */
  var DEFAULTS = {
    designTemplate: "gst",
    /** "color" | "grayscale" — grayscale for black & white style printing. */
    printColorMode: "color",
    /** ISO / CSS @page size: a4 (default), letter, a5, custom (use mm fields below) */
    paperSize: "a4",
    /** Used when paperSize === "custom"; CSS @page size: Wmm Hmm */
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
    /** GST pharmacy layout: promotional QR block below line table (other designs ignore). */
    showQrCode: true,
    customFooterLine: "",
  };

  /** @type {Array<{ id: string, name: string, description: string, options: object }>} */
  var BUILT_IN_PRESETS = [
    {
      id: "builtin-classic",
      name: "Classic",
      description: "Full detail — serif, teal accents; bill to, summary, terms, shop lines.",
      options: {
        designTemplate: "classic",
      },
    },
    {
      id: "builtin-minimal",
      name: "Minimal",
      description: "Compact layout — light sans-serif look; fewer content blocks.",
      options: {
        designTemplate: "minimal",
        documentTitle: "Bill",
        showBillTo: true,
        showSummaryBox: false,
        showLineSchedule: false,
        showProductCode: true,
        showLineNotes: true,
        showInvoiceStatus: true,
        showOrderNotes: false,
        showTerms: false,
        showShopPhone: true,
        showShopGstin: false,
        showShopDl: false,
        showGeneratedFooter: true,
        customFooterLine: "",
      },
    },
    {
      id: "builtin-retail",
      name: "Retail",
      description: "Retail look — bold header, strong table; SKUs, GSTIN/DL.",
      options: {
        designTemplate: "retail",
        documentTitle: "Tax invoice",
        showBillTo: true,
        showSummaryBox: true,
        showLineSchedule: true,
        showProductCode: true,
        showLineNotes: true,
        showInvoiceStatus: true,
        showOrderNotes: true,
        showTerms: true,
        showShopPhone: true,
        showShopGstin: true,
        showShopDl: true,
        showGeneratedFooter: true,
        customFooterLine: "",
      },
    },
    {
      id: "builtin-gst-pharmacy",
      name: "GST pharmacy grid",
      description:
        "Indian pharmacy style — centered header, patient/bill block, GST table (pack, batch, exp., MRP, discount).",
      options: {
        designTemplate: "gst",
        documentTitle: "GST INVOICE",
        showBillTo: true,
        showSummaryBox: false,
        showLineSchedule: false,
        showProductCode: true,
        showLineNotes: true,
        showInvoiceStatus: false,
        showOrderNotes: true,
        showTerms: true,
        showShopPhone: true,
        showShopGstin: true,
        showShopDl: true,
        showGeneratedFooter: true,
        customFooterLine: "",
      },
    },
  ];

  function newCustomFormatId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return "cf_" + global.crypto.randomUUID().replace(/-/g, "");
    }
    return "cf_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 11);
  }

  function cloneBaseOptions() {
    var out = {};
    var k;
    for (k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
        out[k] = DEFAULTS[k];
      }
    }
    return out;
  }

  /** Merge preset partial options over DEFAULTS. */
  function builtinOptionsById(presetId) {
    var preset = null;
    for (var i = 0; i < BUILT_IN_PRESETS.length; i++) {
      if (BUILT_IN_PRESETS[i].id === presetId) {
        preset = BUILT_IN_PRESETS[i];
        break;
      }
    }
    var out = cloneBaseOptions();
    if (!preset || !preset.options) return out;
    for (var k in preset.options) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
        out[k] = preset.options[k];
      }
    }
    return out;
  }

  /**
   * Normalize a partial options object to full shape (all keys from DEFAULTS).
   * @param {object} partial
   * @returns {object}
   */
  function normalizeDesignTemplate(v) {
    if (v === "minimal" || v === "retail" || v === "classic" || v === "gst") return "gst";
    return "gst";
  }

  function normalizePrintColorMode(v) {
    return v === "grayscale" ? "grayscale" : "color";
  }

  function normalizePaperSize(v) {
    if (v === "letter" || v === "a5" || v === "custom") return v;
    return "a4";
  }

  /** @param {unknown} v
   * @param {number} fallback
   * @returns {number} mm between 80 and 500
   */
  function normalizePaperMmDim(v, fallback) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) {
      n = fallback;
    }
    return Math.round(Math.min(500, Math.max(80, n)));
  }

  function normalizeOptions(partial) {
    var out = cloneBaseOptions();
    if (!partial || typeof partial !== "object") return out;
    for (var k in partial) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) {
        out[k] = partial[k];
      }
    }
    out.designTemplate = normalizeDesignTemplate(partial.designTemplate != null ? partial.designTemplate : out.designTemplate);
    out.printColorMode = normalizePrintColorMode(
      partial.printColorMode != null ? partial.printColorMode : out.printColorMode
    );
    out.paperSize = normalizePaperSize(partial.paperSize != null ? partial.paperSize : out.paperSize);
    out.customPaperWidthMm = normalizePaperMmDim(
      partial.customPaperWidthMm != null ? partial.customPaperWidthMm : out.customPaperWidthMm,
      210
    );
    out.customPaperHeightMm = normalizePaperMmDim(
      partial.customPaperHeightMm != null ? partial.customPaperHeightMm : out.customPaperHeightMm,
      297
    );
    return out;
  }

  function defaultState() {
    return {
      v: FORMAT_STATE_VERSION,
      activeFormatId: "builtin-gst-pharmacy",
      customFormats: [],
    };
  }

  function normalizeV2State(raw) {
    var s = defaultState();
    if (raw.activeFormatId && typeof raw.activeFormatId === "string") {
      s.activeFormatId = raw.activeFormatId;
    }
    if (Array.isArray(raw.customFormats)) {
      s.customFormats = raw.customFormats
        .filter(function (c) {
          return c && typeof c.id === "string" && c.id.indexOf("cf_") === 0;
        })
        .map(function (c) {
          return {
            id: c.id,
            name: c.name && String(c.name).trim() ? String(c.name).trim() : "Custom format",
            options: normalizeOptions(c.options),
          };
        });
    }
    return s;
  }

  /**
   * True if entity row has legacy flat invoice_format_json (no v:2).
   * @param {object|null} entRow
   */
  function isLegacyInvoiceFormatRow(entRow) {
    if (!entRow || entRow.invoice_format_json == null || String(entRow.invoice_format_json).trim() === "") {
      return false;
    }
    try {
      var p = JSON.parse(entRow.invoice_format_json);
      if (!p || typeof p !== "object") return false;
      return p.v !== FORMAT_STATE_VERSION;
    } catch (e) {
      return false;
    }
  }

  /**
   * Migrate flat legacy object to v2 state with one custom format.
   * @param {object} legacyFlat
   */
  function migrateLegacyToV2(legacyFlat) {
    var opts = normalizeOptions(legacyFlat);
    var id = newCustomFormatId();
    return {
      v: FORMAT_STATE_VERSION,
      activeFormatId: id,
      customFormats: [
        {
          id: id,
          name: "Imported settings",
          options: opts,
        },
      ],
    };
  }

  /**
   * Parse stored JSON from entity row into v2 state (migrate legacy on the fly).
   * @param {object|null} entRow
   */
  function parseState(entRow) {
    if (!entRow || !entRow.invoice_format_json) {
      return defaultState();
    }
    try {
      var raw = JSON.parse(entRow.invoice_format_json);
      if (!raw || typeof raw !== "object") {
        return defaultState();
      }
      if (raw.v === FORMAT_STATE_VERSION) {
        return normalizeV2State(raw);
      }
      return migrateLegacyToV2(raw);
    } catch (e) {
      return defaultState();
    }
  }

  function validateActiveReference(state) {
    var id = state.activeFormatId;
    if (isBuiltinId(id)) {
      return state;
    }
    var found = (state.customFormats || []).some(function (c) {
      return c.id === id;
    });
    if (!found) {
      state.activeFormatId = "builtin-gst-pharmacy";
    }
    return state;
  }

  function isBuiltinId(formatId) {
    return typeof formatId === "string" && formatId.indexOf("builtin-") === 0;
  }

  /**
   * Resolve merged options for printing (used by merge).
   * @param {object} state — v2 state
   * @param {string} [formatId] — default state.activeFormatId
   */
  function resolveOptionsForFormatId(state, formatId) {
    var fid = formatId != null ? formatId : state.activeFormatId;
    var out = cloneBaseOptions();
    if (isBuiltinId(fid)) {
      var bi = builtinOptionsById(fid);
      for (var k in out) {
        out[k] = bi[k];
      }
      return out;
    }
    var cf = (state.customFormats || []).filter(function (c) {
      return c.id === fid;
    })[0];
    if (cf && cf.options) {
      for (var k2 in out) {
        if (Object.prototype.hasOwnProperty.call(cf.options, k2)) {
          out[k2] = cf.options[k2];
        }
      }
    }
    return out;
  }

  /**
   * @param {object|null} entRow
   * @returns {object} merged options for current active format
   */
  function merge(entRow) {
    var state = parseState(entRow);
    state = validateActiveReference(state);
    return resolveOptionsForFormatId(state, state.activeFormatId);
  }

  /**
   * For UI: list built-ins + custom entries.
   * @param {object} state
   */
  function listFormatsForUi(state) {
    var built = BUILT_IN_PRESETS.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        builtIn: true,
      };
    });
    var custom = (state.customFormats || []).map(function (c) {
      return {
        id: c.id,
        name: c.name,
        description: "",
        builtIn: false,
      };
    });
    return { builtIn: built, custom: custom };
  }

  function prepareStateForSave(state) {
    var s = normalizeV2State(state);
    s = validateActiveReference(s);
    s.v = FORMAT_STATE_VERSION;
    return s;
  }

  var DESIGN_TEMPLATES = [
    { id: "classic", label: "Classic", hint: "Serif body, teal title — traditional look." },
    { id: "minimal", label: "Minimal", hint: "Light sans-serif, soft borders." },
    { id: "retail", label: "Retail", hint: "Bold header strip, blue table headings." },
    { id: "gst", label: "GST pharmacy grid", hint: "Centered shop header, patient/bill meta, full GST-style line table." },
  ];

  /** CSS @page size names; labels show common mm / inch sizes. */
  var PAPER_SIZES = [
    { id: "a4", label: "A4", hint: "210 × 297 mm (8.27 × 11.69 in) — ISO default" },
    { id: "letter", label: "US Letter", hint: "216 × 279 mm (8.5 × 11 in)" },
    { id: "a5", label: "A5", hint: "148 × 210 mm (5.83 × 8.27 in)" },
    { id: "custom", label: "Custom", hint: "Set width and height in millimetres" },
  ];

  global.MargInvoiceFormatDefaults = {
    DEFAULTS: DEFAULTS,
    DESIGN_TEMPLATES: DESIGN_TEMPLATES,
    PAPER_SIZES: PAPER_SIZES,
    FORMAT_STATE_VERSION: FORMAT_STATE_VERSION,
    BUILT_IN_PRESETS: BUILT_IN_PRESETS,
    merge: merge,
    normalizeDesignTemplate: normalizeDesignTemplate,
    normalizePrintColorMode: normalizePrintColorMode,
    normalizePaperSize: normalizePaperSize,
    normalizePaperMmDim: normalizePaperMmDim,
    parseState: parseState,
    defaultState: defaultState,
    normalizeOptions: normalizeOptions,
    resolveOptionsForFormatId: resolveOptionsForFormatId,
    builtinOptionsById: builtinOptionsById,
    listFormatsForUi: listFormatsForUi,
    prepareStateForSave: prepareStateForSave,
    isLegacyInvoiceFormatRow: isLegacyInvoiceFormatRow,
    isBuiltinId: isBuiltinId,
    newCustomFormatId: newCustomFormatId,
  };
})(typeof window !== "undefined" ? window : this);
