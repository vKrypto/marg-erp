/**
 * Default terms & conditions + localStorage cache per entity (key: marg_terms_entity_<id>).
 * Priority: SQLite entity.terms_and_conditions → localStorage → built-in default.
 */
(function (global) {
  var DEFAULT_TEXT = [
    "1. All prices are in Indian Rupees (INR) unless stated otherwise.",
    "2. Medicines are sold strictly against valid prescription where required by law. The customer confirms that prescriptions provided are genuine.",
    "3. Goods once sold may be returned or exchanged only as per shop policy and applicable drugs & cosmetics rules. Perishable or cold-chain items may not be returnable.",
    "4. Expiry dates and storage instructions on the label must be followed. The shop is not liable for misuse or improper storage after delivery.",
    "5. Payment is due as per agreed terms (cash / UPI / card). Cheques are subject to realisation.",
    "6. The shop may refuse service if required by law or if a prescription or identification is incomplete.",
    "7. Subject to Hyderabad / Telangana jurisdiction (amend as appropriate for your entity).",
    "8. For complaints or adverse reactions, contact the shop immediately and seek medical attention where needed.",
  ].join("\n");

  function storageKey(entityId) {
    return "marg_terms_entity_" + String(entityId);
  }

  /**
   * @param {object|null} entityRow — row from getCurrentEntity()
   * @param {number|null} entityId
   * @param {{ seedLs?: boolean }} [options] — if seedLs true (default), writes default text to localStorage when DB and LS are both empty (first visit to Terms page).
   * @returns {string}
   */
  function resolveTermsText(entityRow, entityId, options) {
    options = options || {};
    var seedLs = options.seedLs !== false;

    var fromDb =
      entityRow &&
      entityRow.terms_and_conditions != null &&
      String(entityRow.terms_and_conditions).trim();
    if (fromDb) {
      return String(entityRow.terms_and_conditions);
    }

    var fromLs = null;
    try {
      if (entityId != null) {
        fromLs = global.localStorage.getItem(storageKey(entityId));
      }
    } catch (e) {
      /* quota / private mode */
    }
    if (fromLs != null && String(fromLs).trim()) {
      return fromLs;
    }

    if (seedLs && entityId != null && DEFAULT_TEXT) {
      try {
        global.localStorage.setItem(storageKey(entityId), DEFAULT_TEXT);
      } catch (e) {
        /* ignore */
      }
    }
    return DEFAULT_TEXT;
  }

  /**
   * Call after saving to DB so browser cache matches.
   * @param {number} entityId
   * @param {string|null} text
   */
  function setTermsLocalStorage(entityId, text) {
    if (entityId == null) return;
    try {
      global.localStorage.setItem(storageKey(entityId), text != null ? String(text) : "");
    } catch (e) {
      /* ignore */
    }
  }

  global.MargTermsDefaults = {
    TEXT: DEFAULT_TEXT,
    storageKey: storageKey,
    resolveTermsText: resolveTermsText,
    setTermsLocalStorage: setTermsLocalStorage,
  };
})(typeof window !== "undefined" ? window : this);
