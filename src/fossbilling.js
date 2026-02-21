const { postJson, postForm } = require("./http-client");

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function throwIfApiError(body) {
  if (!body || typeof body !== "object") {
    return;
  }
  if (!body.error) {
    return;
  }

  if (typeof body.error === "string") {
    throw new Error(body.error);
  }

  const message =
    body.error.message ||
    body.error.msg ||
    body.error.code ||
    JSON.stringify(body.error);
  throw new Error(String(message));
}

function unwrapApiResult(body) {
  throwIfApiError(body);
  if (body && Object.prototype.hasOwnProperty.call(body, "result")) {
    return body.result;
  }
  return body;
}

function safeText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value.list)) {
    return value.list;
  }
  if (Array.isArray(value.data)) {
    return value.data;
  }
  if (Array.isArray(value.items)) {
    return value.items;
  }

  return [];
}

function buildBasicAuthHeader(username, password) {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

function isAuthenticationFailureError(error) {
  const message = String(error?.message || error || "");
  return (
    message.includes("Authentication Failed") ||
    message.includes("HTTP 401") ||
    message.includes("code\":206") ||
    message.includes("code 206")
  );
}

function isMethodNotFoundError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("method not found") ||
    message.includes("unknown method") ||
    message.includes("invalid method") ||
    message.includes("does not exist") ||
    message.includes("does not exists") ||
    message.includes("not implemented")
  );
}

/**
 * API Schema represents available methods and field mappings per FOSSBilling instance.
 * Cached in database to avoid repeated discovery calls.
 */
class ApiSchema {
  constructor() {
    this.endpoints = {};
    this.fieldMaps = {};
    this.discoveredAt = null;
  }

  registerEndpoint(scope, method, variants = []) {
    const key = `${scope}/${method}`;
    this.endpoints[key] = {
      scope,
      method,
      variants: Array.isArray(variants) ? variants : [method],
    };
  }

  registerFieldMap(entity, fields = {}) {
    this.fieldMaps[entity] = fields;
  }

  getFieldMap(entity) {
    return this.fieldMaps[entity] || {};
  }

  tryMethods(scope, method) {
    const key = `${scope}/${method}`;
    const endpoint = this.endpoints[key];
    if (!endpoint) {
      return [method];
    }
    return endpoint.variants;
  }
}

class FossBillingClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey;
    this.schema = new ApiSchema();
    this._initializeDefaultSchema();
  }

  _initializeDefaultSchema() {
    // Profile endpoints
    this.schema.registerEndpoint("guest", "client/login", ["client/login"]);
    this.schema.registerEndpoint("client", "profile/get", ["profile/get", "client/get"]);

    // Service/Order endpoints
    this.schema.registerEndpoint("client", "order/get_list", [
      "order/get_list",
      "order/gets",
      "service/get_list",
    ]);
    this.schema.registerEndpoint("admin", "order/get_list", ["order/get_list"]);

    // Invoice endpoints
    this.schema.registerEndpoint("client", "invoice/get_list", [
      "invoice/get_list",
      "invoice/gets",
    ]);
    this.schema.registerEndpoint("admin", "invoice/get_list", ["invoice/get_list"]);
    this.schema.registerEndpoint("guest", "invoice/payment", [
      "invoice/payment",
      "invoice/pay",
    ]);

    // Ticket endpoints
    this.schema.registerEndpoint("client", "support/ticket_get_list", [
      "support/ticket_get_list",
      "support/ticket/get_list",
      "support/ticket_gets",
      "support/ticket/gets",
    ]);
    this.schema.registerEndpoint("admin", "support/ticket_get_list", [
      "support/ticket_get_list",
    ]);

    // Domain endpoints
    this.schema.registerEndpoint("client", "domain/get_list", [
      "domain/get_list",
      "domain/gets",
    ]);
    this.schema.registerEndpoint("admin", "domain/get_list", ["domain/get_list"]);

    // Addon/Extra endpoints
    this.schema.registerEndpoint("client", "addon/get_list", [
      "addon/get_list",
      "addon/gets",
    ]);
    this.schema.registerEndpoint("admin", "addon/get_list", ["addon/get_list"]);

    // Renewal invoice
    this.schema.registerEndpoint("client", "invoice/renewal_invoice", [
      "invoice/renewal_invoice",
    ]);
    this.schema.registerEndpoint("admin", "invoice/renewal_invoice", [
      "invoice/renewal_invoice",
    ]);

    // Field mappings for normalization
    this.schema.registerFieldMap("account", {
      id: ["id", "client_id", "clientId"],
      email: ["email"],
      firstName: ["first_name", "firstName"],
      lastName: ["last_name", "lastName"],
      fullName: ["name"],
      status: ["status"],
      balance: ["balance", "credit"],
      currency: ["currency", "currency_code", "currencyCode", "currency_title"],
      group: ["group", "group_name"],
    });

    this.schema.registerFieldMap("service", {
      id: ["id", "order_id", "orderId", "invoiceable_id", "service_id"],
      title: ["title", "product_title", "label", "description", "domain"],
      status: ["status", "service_status"],
      nextDue: ["next_due", "renewal_date", "expires_at", "paid_till"],
      loginUrl: ["login_url", "manage_url", "panel_url", "sso_url", "url"],
      description: ["description"],
    });

    this.schema.registerFieldMap("invoice", {
      id: ["id", "invoice_id", "invoiceId"],
      status: ["status"],
      total: ["total", "price", "amount"],
      currency: ["currency", "currency_code", "currencyCode"],
      dueAt: ["due_at", "due_date", "due_date_utc"],
      paymentUrl: ["pay_url", "payment_url", "url", "link"],
      createdAt: ["created_at", "created_date"],
      description: ["description"],
    });

    this.schema.registerFieldMap("ticket", {
      id: ["id", "ticket_id", "ticketId"],
      subject: ["subject", "title"],
      status: ["status"],
      updatedAt: ["updated_at", "updated_at_utc", "updated", "created_at"],
      priority: ["priority"],
      lastReplyAt: ["last_reply_at", "reply_date"],
    });

    this.schema.registerFieldMap("domain", {
      id: ["id", "domain_id"],
      name: ["name", "domain"],
      status: ["status"],
      registrar: ["registrar"],
      expiresAt: ["expires_at", "expiration_date"],
      registrationDate: ["registration_date", "created_at"],
    });

    this.schema.registerFieldMap("addon", {
      id: ["id", "addon_id"],
      title: ["title", "name"],
      status: ["status"],
      relatedOrderId: ["order_id", "related_order_id"],
      price: ["price", "amount"],
    });
  }

  _endpoint(scope, method) {
    return `${this.baseUrl}/api/${scope}/${method}`;
  }

  _withAdminAuth(payload = {}) {
    return {
      ...payload,
      api_key: this.apiKey,
      api_token: this.apiKey,
      token: this.apiKey,
    };
  }

  _buildClientRequest(payload = {}, auth = null) {
    const mergedPayload = { ...payload };
    const headers = {};

    if (!auth || typeof auth !== "object") {
      return { payload: mergedPayload, headers };
    }

    if (auth.token) {
      mergedPayload.token = auth.token;
      mergedPayload.api_token = auth.token;
      mergedPayload.client_token = auth.token;
    }
    if (auth.apiToken) {
      mergedPayload.api_token = auth.apiToken;
      mergedPayload.token = auth.apiToken;
    }
    if (auth.sid) {
      mergedPayload.sid = auth.sid;
      mergedPayload.session_id = auth.sid;
    }
    if (auth.sessionId) {
      mergedPayload.session_id = auth.sessionId;
    }
    if (auth.cookie) {
      headers.Cookie = String(auth.cookie);
    }
    if (auth.clientApiKey) {
      headers.Authorization = buildBasicAuthHeader("client", String(auth.clientApiKey));
    }

    return { payload: mergedPayload, headers };
  }

  async _call(scope, method, payload = {}, options = {}) {
    const endpoint = this._endpoint(scope, method);
    const requestHeaders = options.headers || {};

    const jsonResponse = await postJson(endpoint, payload, {
      headers: requestHeaders,
    });
    if (jsonResponse.statusCode >= 500) {
      throw new Error(
        `FOSSBilling ${scope}/${method} failed with HTTP ${jsonResponse.statusCode}`,
      );
    }

    const jsonBody = jsonResponse.data;
    const isJsonLike =
      jsonBody && typeof jsonBody === "object" && !Array.isArray(jsonBody);
    if (jsonResponse.statusCode < 400 && isJsonLike) {
      const result = unwrapApiResult(jsonBody);
      if (options.rawResponse) {
        return { result, response: jsonResponse };
      }
      return result;
    }

    const formResponse = await postForm(endpoint, payload, {
      headers: requestHeaders,
    });
    if (formResponse.statusCode >= 400) {
      throw new Error(
        `FOSSBilling ${scope}/${method} failed with HTTP ${formResponse.statusCode}: ${formResponse.rawBody.slice(
          0,
          300,
        )}`,
      );
    }

    const result = unwrapApiResult(formResponse.data);
    if (options.rawResponse) {
      return { result, response: formResponse };
    }
    return result;
  }

  async callGuest(method, payload = {}) {
    return this._call("guest", method, payload);
  }

  async callClient(method, payload = {}, auth = null) {
    const request = this._buildClientRequest(payload, auth);
    return this._call("client", method, request.payload, {
      headers: request.headers,
    });
  }

  async callAdmin(method, payload = {}) {
    return this._call("admin", method, this._withAdminAuth(payload), {
      headers: {
        Authorization: buildBasicAuthHeader("admin", this.apiKey),
      },
    });
  }

  async _callClientWithFallback(methodKey, payloads, auth) {
    const methodList = this.schema.tryMethods("client", methodKey);
    const payloadList =
      Array.isArray(payloads) && payloads.length > 0 ? payloads : [{}];

    let lastError = null;
    for (const method of methodList) {
      for (const payload of payloadList) {
        try {
          return await this.callClient(method, payload, auth);
        } catch (error) {
          if (isAuthenticationFailureError(error)) {
            throw error;
          }
          lastError = error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    return null;
  }

  async _callAdminWithFallback(methodKey, payloads) {
    const methodList = this.schema.tryMethods("admin", methodKey);
    const payloadList =
      Array.isArray(payloads) && payloads.length > 0 ? payloads : [{}];

    let lastError = null;
    for (const method of methodList) {
      for (const payload of payloadList) {
        try {
          return await this.callAdmin(method, payload);
        } catch (error) {
          lastError = error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }
    return null;
  }

  _extractAuthFromObject(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    if (typeof value.token === "string" && value.token) {
      return { token: value.token };
    }
    if (typeof value.api_token === "string" && value.api_token) {
      return { token: value.api_token, apiToken: value.api_token };
    }
    if (typeof value.client_token === "string" && value.client_token) {
      return { token: value.client_token };
    }
    if (typeof value.sid === "string" && value.sid) {
      return { sid: value.sid };
    }
    if (typeof value.session_id === "string" && value.session_id) {
      return { sessionId: value.session_id };
    }

    return null;
  }

  _extractAuth(loginResult) {
    if (typeof loginResult === "string") {
      return { token: loginResult };
    }

    if (typeof loginResult === "boolean") {
      if (loginResult === false) {
        throw new Error("Invalid billing credentials.");
      }
      return null;
    }

    if (typeof loginResult === "number") {
      if (loginResult <= 0) {
        throw new Error("Invalid billing credentials.");
      }
      return null;
    }

    if (!loginResult || typeof loginResult !== "object") {
      return null;
    }

    return (
      this._extractAuthFromObject(loginResult) ||
      this._extractAuthFromObject(loginResult.result) ||
      this._extractAuthFromObject(loginResult.data) ||
      null
    );
  }

  _extractProfileFromValue(value) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const id = value.id || value.client_id || value.clientId || null;
    const email = value.email || null;

    if (!id && !email) {
      return null;
    }

    return {
      ...value,
      id: id ? String(id) : undefined,
      email: email ? String(email) : undefined,
    };
  }

  _extractProfileFromLoginResult(loginResult) {
    return (
      this._extractProfileFromValue(loginResult) ||
      this._extractProfileFromValue(loginResult?.result) ||
      this._extractProfileFromValue(loginResult?.data) ||
      null
    );
  }

  async loginByClientApiKey(email, clientApiKey) {
    const auth = { clientApiKey: String(clientApiKey || "").trim() };
    if (!auth.clientApiKey) {
      return null;
    }

    try {
      const profile = await this.getClientProfile(auth);
      const profileEmail = String(profile?.email || "").trim().toLowerCase();
      const requestedEmail = String(email || "").trim().toLowerCase();
      if (requestedEmail && profileEmail && requestedEmail !== profileEmail) {
        throw new Error("The provided client API key does not match the given email.");
      }
      return { auth, profile };
    } catch (_error) {
      return null;
    }
  }

  _extractCookieHeader(headers = {}) {
    const setCookie = headers["set-cookie"];
    if (!setCookie) {
      return "";
    }

    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
    return list
      .map((item) => String(item).split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
  }

  _pickClientByEmail(items, email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      return items[0] || null;
    }

    const exact = items.find(
      (item) => String(item?.email || "").trim().toLowerCase() === normalizedEmail,
    );
    return exact || items[0] || null;
  }

  async findClientByEmail(email) {
    const normalized = String(email || "").trim();
    if (!normalized) {
      return null;
    }

    const attempts = [
      { search: normalized, page: 1, per_page: 100 },
      { email: normalized, page: 1, per_page: 100 },
      { query: normalized, page: 1, per_page: 100 },
    ];

    for (const payload of attempts) {
      try {
        const result = await this.callAdmin("client/get_list", payload);
        const items = toArray(result);
        const picked = this._pickClientByEmail(items, normalized);
        if (picked) {
          return picked;
        }
      } catch (_error) {
        // Try next payload shape.
      }
    }

    return null;
  }

  async loginClient(email, passwordOrApiKey) {
    const directKeyLogin = await this.loginByClientApiKey(email, passwordOrApiKey);
    if (directKeyLogin) {
      return directKeyLogin;
    }

    const loginResponse = await this._call(
      "guest",
      "client/login",
      { email, password: passwordOrApiKey },
      { rawResponse: true },
    );
    const result = loginResponse.result;
    const auth = this._extractAuth(result);
    const cookie = this._extractCookieHeader(loginResponse.response?.headers || {});

    const resolvedAuth =
      auth && typeof auth === "object"
        ? {
            ...auth,
            ...(cookie ? { cookie } : {}),
          }
        : cookie
          ? { cookie }
          : null;

    let profile = this._extractProfileFromLoginResult(result);

    if (!profile && resolvedAuth) {
      try {
        profile = await this.getClientProfile(resolvedAuth);
      } catch (_error) {
        profile = null;
      }
    }

    if (!profile) {
      profile = await this.findClientByEmail(email);
    }

    if (!profile) {
      profile = { email: String(email || "") };
    }

    return { auth: resolvedAuth, profile };
  }

  async getClientProfile(auth) {
    const profileMethods = [
      "profile/get",
      "client/get",
    ];
    const errors = [];

    for (const method of profileMethods) {
      try {
        return await this.callClient(method, {}, auth);
      } catch (error) {
        errors.push(error);
        if (isAuthenticationFailureError(error)) {
          throw error;
        }
      }
    }

    if (errors.length > 0) {
      throw errors[errors.length - 1];
    }
    throw new Error("Unable to load client profile.");
  }

  /**
   * Extract field value using schema-driven field map fallbacks
   */
  _extractField(item, fieldKey, entityType = "service") {
    const fieldMap = this.schema.getFieldMap(entityType);
    const possibleKeys = fieldMap[fieldKey] || [fieldKey];

    for (const key of possibleKeys) {
      if (key in item && item[key] != null) {
        return item[key];
      }
    }
    return null;
  }

  /**
   * Normalize item using schema field maps
   */
  _normalizeItem(item, entityType, defaultTitle = "Item") {
    if (!item || typeof item !== "object") {
      return null;
    }

    const fieldMap = this.schema.getFieldMap(entityType);
    const normalized = {};

    Object.keys(fieldMap).forEach((key) => {
      const value = this._extractField(item, key, entityType);
      if (value != null) {
        normalized[key] = value;
      }
    });

    // Ensure ID exists
    if (!normalized.id) {
      normalized.id = this._extractField(item, "id", entityType);
    }

    return normalized;
  }

  // ============ ACCOUNT ============

  async getAccountSummary({ auth, clientId, email }) {
    let profile = null;
    let clientError = null;

    try {
      profile = await this.getClientProfile(auth);
    } catch (error) {
      clientError = error;
    }

    if (!profile && clientId) {
      const id = String(clientId);
      const payloads = [
        { id },
        { client_id: id },
      ];
      try {
        profile = await this._callAdminWithFallback("client/get_list", payloads);
        if (Array.isArray(profile)) {
          profile = profile[0] || null;
        }
      } catch (_error) {
        // Continue to email fallback.
      }
    }

    if (!profile && email) {
      profile = await this.findClientByEmail(email);
    }

    if (!profile) {
      if (clientError) {
        throw clientError;
      }
      return null;
    }

    return this._normalizeAccount(profile);
  }

  _normalizeAccount(profile) {
    const normalized = this._normalizeItem(profile, "account", "Account");
    if (!normalized) return null;

    const firstName = safeText(normalized.firstName || "");
    const lastName = safeText(normalized.lastName || "");
    const fullName = normalized.fullName || safeText(`${firstName} ${lastName}`.trim());

    return {
      id: safeText(normalized.id || ""),
      email: safeText(normalized.email || ""),
      fullName,
      status: safeText(normalized.status || "unknown"),
      balance: safeText(normalized.balance || "0"),
      currency: safeText(normalized.currency || ""),
      group: safeText(normalized.group || ""),
    };
  }

  // ============ SERVICES ============

  async getServices({ auth, clientId, email }) {
    let clientError = null;
    try {
      const result = await this._callClientWithFallback(
        "order/get_list",
        [{ page: 1, per_page: 100 }],
        auth,
      );
      const services = this._normalizeServices(toArray(result));
      if (services.length > 0) {
        return services;
      }
    } catch (error) {
      clientError = error;
    }

    let resolvedClientId = clientId ? String(clientId) : "";
    if (!resolvedClientId && email) {
      const client = await this.findClientByEmail(email);
      if (client?.id) {
        resolvedClientId = String(client.id);
      }
    }

    const adminPayload = { page: 1, per_page: 100 };
    if (resolvedClientId) {
      adminPayload.client_id = resolvedClientId;
    } else if (email) {
      adminPayload.search = email;
    }

    try {
      const adminResult = await this._callAdminWithFallback(
        "order/get_list",
        [adminPayload],
      );
      return this._normalizeServices(toArray(adminResult));
    } catch (adminError) {
      if (clientError && isAuthenticationFailureError(adminError)) {
        throw clientError;
      }
      throw adminError;
    }
  }

  _normalizeServices(items) {
    return items
      .map((item) => this._normalizeItem(item, "service", "Service"))
      .filter(Boolean)
      .map((normalized) => ({
        orderId: safeText(normalized.id, ""),
        title: safeText(normalized.title, "Service"),
        status: safeText(normalized.status, "unknown"),
        nextDue: normalized.nextDue || null,
        loginUrl: normalized.loginUrl || null,
        description: safeText(normalized.description, ""),
      }));
  }

  // ============ INVOICES ============

  async createRenewalInvoice({ auth, clientId, orderId }) {
    const payload = {
      order_id: orderId,
      orderId,
      id: orderId,
    };

    let clientError = null;
    try {
      const result = await this._callClientWithFallback(
        "invoice/renewal_invoice",
        [payload],
        auth,
      );
      return this._normalizeRenewalResult(result);
    } catch (error) {
      clientError = error;
      const adminPayload = this._withAdminAuth({
        ...payload,
        client_id: clientId || undefined,
      });
      try {
        const result = await this._call("admin", "invoice/renewal_invoice", adminPayload);
        return this._normalizeRenewalResult(result);
      } catch (adminError) {
        if (clientError && isAuthenticationFailureError(adminError)) {
          throw clientError;
        }
        throw adminError;
      }
    }
  }

  _normalizeRenewalResult(result) {
    if (typeof result === "string" || typeof result === "number") {
      return { invoiceId: String(result) };
    }

    if (!result || typeof result !== "object") {
      throw new Error("Billing API did not return an invoice id.");
    }

    const invoiceId =
      result.invoice_id || result.id || result.invoiceId || result.invoice;
    if (!invoiceId) {
      throw new Error("Billing API did not include invoice details.");
    }

    return {
      invoiceId: String(invoiceId),
      paymentUrl:
        result.payment_url || result.pay_url || result.url || result.link || null,
    };
  }

  async getInvoicePaymentLink({ auth, invoiceId }) {
    try {
      const result = await this.callGuest("invoice/payment", {
        invoice_id: invoiceId,
        id: invoiceId,
      });
      if (result && typeof result === "object") {
        if (typeof result.url === "string" && result.url) {
          return result.url;
        }
        if (typeof result.link === "string" && result.link) {
          return result.link;
        }
        if (typeof result.payment_url === "string" && result.payment_url) {
          return result.payment_url;
        }
      }
    } catch (_error) {
      // Fall back to built URL.
    }

    if (auth && auth.token) {
      return `${this.baseUrl}/invoice/${invoiceId}?token=${encodeURIComponent(
        auth.token,
      )}`;
    }

    return `${this.baseUrl}/invoice/${invoiceId}`;
  }

  async getInvoices({ auth, clientId, email }) {
    const basePayload = { page: 1, per_page: 20 };
    let clientError = null;

    try {
      const clientResult = await this._callClientWithFallback(
        "invoice/get_list",
        [basePayload],
        auth,
      );
      const invoices = this._normalizeInvoices(toArray(clientResult));
      return invoices;
    } catch (error) {
      clientError = error;
      if (
        !isAuthenticationFailureError(error) &&
        !isMethodNotFoundError(error)
      ) {
        throw error;
      }
    }

    let resolvedClientId = clientId ? String(clientId) : "";
    if (!resolvedClientId && email) {
      const client = await this.findClientByEmail(email);
      if (client?.id) {
        resolvedClientId = String(client.id);
      }
    }

    const adminPayload = { page: 1, per_page: 20 };
    if (resolvedClientId) {
      adminPayload.client_id = resolvedClientId;
    } else if (email) {
      adminPayload.search = email;
    }

    try {
      const adminResult = await this._callAdminWithFallback(
        "invoice/get_list",
        [adminPayload],
      );
      return this._normalizeInvoices(toArray(adminResult));
    } catch (adminError) {
      if (clientError && isAuthenticationFailureError(adminError)) {
        throw clientError;
      }
      throw adminError;
    }
  }

  _normalizeInvoices(items) {
    return items
      .map((item) => this._normalizeItem(item, "invoice", "Invoice"))
      .filter(Boolean)
      .map((normalized) => ({
        invoiceId: safeText(normalized.id, ""),
        status: safeText(normalized.status, "unknown"),
        total: safeText(normalized.total, "0"),
        currency: safeText(normalized.currency, ""),
        dueAt: normalized.dueAt || null,
        paymentUrl: normalized.paymentUrl || null,
        createdAt: normalized.createdAt || null,
        description: safeText(normalized.description, ""),
      }));
  }

  // ============ TICKETS ============

  async getTickets({ auth, clientId, email }) {
    const payloads = [
      { page: 1, per_page: 20 },
      { per_page: 20 },
    ];

    let clientError = null;
    try {
      const clientResult = await this._callClientWithFallback(
        "support/ticket_get_list",
        payloads,
        auth,
      );
      return this._normalizeTickets(toArray(clientResult));
    } catch (error) {
      clientError = error;
      if (
        !isAuthenticationFailureError(error) &&
        !isMethodNotFoundError(error)
      ) {
        throw error;
      }
    }

    let resolvedClientId = clientId ? String(clientId) : "";
    if (!resolvedClientId && email) {
      const client = await this.findClientByEmail(email);
      if (client?.id) {
        resolvedClientId = String(client.id);
      }
    }

    const adminPayload = { page: 1, per_page: 20 };
    if (resolvedClientId) {
      adminPayload.client_id = resolvedClientId;
    } else if (email) {
      adminPayload.search = email;
    }

    try {
      const adminResult = await this._callAdminWithFallback(
        "support/ticket_get_list",
        [adminPayload],
      );
      return this._normalizeTickets(toArray(adminResult));
    } catch (adminError) {
      if (clientError && isAuthenticationFailureError(adminError)) {
        throw clientError;
      }
      throw adminError;
    }
  }

  _normalizeTickets(items) {
    return items
      .map((item) => this._normalizeItem(item, "ticket", "Ticket"))
      .filter(Boolean)
      .map((normalized) => ({
        ticketId: safeText(normalized.id, ""),
        subject: safeText(normalized.subject, "Ticket"),
        status: safeText(normalized.status, "unknown"),
        updatedAt: normalized.updatedAt || null,
        priority: safeText(normalized.priority, "normal"),
      }));
  }

  // ============ DOMAINS ============

  async getDomains({ auth, clientId, email }) {
    let clientError = null;

    try {
      const result = await this._callClientWithFallback(
        "domain/get_list",
        [{ page: 1, per_page: 20 }],
        auth,
      );
      const domains = this._normalizeDomains(toArray(result));
      if (domains.length > 0) {
        return domains;
      }
    } catch (error) {
      clientError = error;
      if (
        !isAuthenticationFailureError(error) &&
        !isMethodNotFoundError(error)
      ) {
        throw error;
      }
    }

    let resolvedClientId = clientId ? String(clientId) : "";
    if (!resolvedClientId && email) {
      const client = await this.findClientByEmail(email);
      if (client?.id) {
        resolvedClientId = String(client.id);
      }
    }

    const adminPayload = { page: 1, per_page: 20 };
    if (resolvedClientId) {
      adminPayload.client_id = resolvedClientId;
    } else if (email) {
      adminPayload.search = email;
    }

    try {
      const adminResult = await this._callAdminWithFallback(
        "domain/get_list",
        [adminPayload],
      );
      return this._normalizeDomains(toArray(adminResult));
    } catch (adminError) {
      if (clientError && isAuthenticationFailureError(adminError)) {
        throw clientError;
      }
      // Gracefully fail if domains not supported
      return [];
    }
  }

  _normalizeDomains(items) {
    return items
      .map((item) => this._normalizeItem(item, "domain", "Domain"))
      .filter(Boolean)
      .map((normalized) => ({
        domainId: safeText(normalized.id, ""),
        name: safeText(normalized.name, "Domain"),
        status: safeText(normalized.status, "unknown"),
        registrar: safeText(normalized.registrar, ""),
        expiresAt: normalized.expiresAt || null,
        registrationDate: normalized.registrationDate || null,
      }));
  }

  // ============ ADDONS ============

  async getAddons({ auth, clientId, email }) {
    let clientError = null;

    try {
      const result = await this._callClientWithFallback(
        "addon/get_list",
        [{ page: 1, per_page: 20 }],
        auth,
      );
      const addons = this._normalizeAddons(toArray(result));
      if (addons.length > 0) {
        return addons;
      }
    } catch (error) {
      clientError = error;
      if (
        !isAuthenticationFailureError(error) &&
        !isMethodNotFoundError(error)
      ) {
        throw error;
      }
    }

    let resolvedClientId = clientId ? String(clientId) : "";
    if (!resolvedClientId && email) {
      const client = await this.findClientByEmail(email);
      if (client?.id) {
        resolvedClientId = String(client.id);
      }
    }

    const adminPayload = { page: 1, per_page: 20 };
    if (resolvedClientId) {
      adminPayload.client_id = resolvedClientId;
    } else if (email) {
      adminPayload.search = email;
    }

    try {
      const adminResult = await this._callAdminWithFallback(
        "addon/get_list",
        [adminPayload],
      );
      return this._normalizeAddons(toArray(adminResult));
    } catch (adminError) {
      if (clientError && isAuthenticationFailureError(adminError)) {
        throw clientError;
      }
      // Gracefully fail if addons not supported
      return [];
    }
  }

  _normalizeAddons(items) {
    return items
      .map((item) => this._normalizeItem(item, "addon", "Addon"))
      .filter(Boolean)
      .map((normalized) => ({
        addonId: safeText(normalized.id, ""),
        title: safeText(normalized.title, "Addon"),
        status: safeText(normalized.status, "unknown"),
        relatedOrderId: safeText(normalized.relatedOrderId, ""),
        price: safeText(normalized.price, "0"),
      }));
  }
}

module.exports = {
  FossBillingClient,
};
