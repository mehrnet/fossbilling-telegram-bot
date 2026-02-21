const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const tls = require("node:tls");

const RETRYABLE_PROXY_CODES = new Set([
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "EAI_AGAIN",
  "ERR_SOCKET_CLOSED",
]);

const SOCKS_REPLY_ERRORS = {
  0x01: "General SOCKS server failure",
  0x02: "Connection not allowed by ruleset",
  0x03: "Network unreachable",
  0x04: "Host unreachable",
  0x05: "Connection refused by destination host",
  0x06: "TTL expired",
  0x07: "Command not supported",
  0x08: "Address type not supported",
};

function getTransport(url) {
  return url.protocol === "https:" ? https : http;
}

function defaultPort(protocol) {
  if (protocol === "https:") {
    return 443;
  }
  if (protocol === "http:") {
    return 80;
  }
  if (protocol === "socks:" || protocol === "socks5:" || protocol === "socks5h:") {
    return 1080;
  }
  return 0;
}

function getProxyLabel(proxyUrl) {
  return `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port || defaultPort(proxyUrl.protocol)}`;
}

function describeError(error) {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof AggregateError || Array.isArray(error.errors)) {
    const children = Array.isArray(error.errors) ? error.errors : [];
    const childMessages = children
      .map((child) => {
        if (!child) {
          return "";
        }
        const parts = [];
        if (child.code) {
          parts.push(String(child.code));
        }
        if (child.message) {
          parts.push(String(child.message));
        }
        if (child.address || child.port) {
          parts.push(
            [
              child.address ? `address=${child.address}` : "",
              child.port ? `port=${child.port}` : "",
            ]
              .filter(Boolean)
              .join(" "),
          );
        }
        return parts.join(" | ").trim();
      })
      .filter(Boolean);

    if (childMessages.length > 0) {
      return childMessages.join(" ; ");
    }
  }

  const fallbackParts = [];
  if (error.code) {
    fallbackParts.push(String(error.code));
  }
  if (error.message) {
    fallbackParts.push(String(error.message));
  }
  if (fallbackParts.length > 0) {
    return fallbackParts.join(" | ");
  }

  try {
    return JSON.stringify(error);
  } catch (_error) {
    return String(error);
  }
}

function normalizeRequestError(error, contextLabel) {
  const message = describeError(error);
  const wrapped = new Error(`${contextLabel}: ${message}`);
  wrapped.cause = error;
  if (error && error.code) {
    wrapped.code = error.code;
  }
  return wrapped;
}

function isRetryableProxyError(error) {
  const code = error?.code || error?.cause?.code || "";
  if (code && RETRYABLE_PROXY_CODES.has(String(code))) {
    return true;
  }

  const message = describeError(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("connect failed") ||
    message.includes("proxy") ||
    message.includes("socks")
  );
}

function getProxyAuthorizationHeader(proxyUrl) {
  if (!proxyUrl.username && !proxyUrl.password) {
    return "";
  }

  const username = decodeURIComponent(proxyUrl.username || "");
  const password = decodeURIComponent(proxyUrl.password || "");
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

function normalizeProxyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  try {
    return new URL(raw);
  } catch (_error) {
    return new URL(`http://${raw}`);
  }
}

function isSupportedProxyProtocol(protocol) {
  return (
    protocol === "http:" ||
    protocol === "https:" ||
    protocol === "socks:" ||
    protocol === "socks5:" ||
    protocol === "socks5h:"
  );
}

function parseNoProxyEntries(noProxyValue) {
  return String(noProxyValue || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isProxyDisabledByEnv() {
  const value = String(process.env.DISABLE_SYSTEM_PROXY || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function shouldBypassProxy(targetUrl) {
  const entries = parseNoProxyEntries(process.env.NO_PROXY || process.env.no_proxy);
  if (entries.length === 0) {
    return false;
  }

  const hostname = String(targetUrl.hostname || "").toLowerCase();
  const targetPort = String(targetUrl.port || defaultPort(targetUrl.protocol));

  for (const entry of entries) {
    if (entry === "*") {
      return true;
    }

    const hasPort = entry.includes(":");
    const [entryHostRaw, entryPort] = hasPort ? entry.split(":", 2) : [entry, ""];
    const entryHost = entryHostRaw.replace(/^\./, "");
    if (!entryHost) {
      continue;
    }

    if (entryPort && entryPort !== targetPort) {
      continue;
    }

    if (hostname === entryHost || hostname.endsWith(`.${entryHost}`)) {
      return true;
    }
  }

  return false;
}

function getProxyCandidatesForTarget(targetUrl) {
  if (isProxyDisabledByEnv() || shouldBypassProxy(targetUrl)) {
    return [];
  }

  const orderedValues =
    targetUrl.protocol === "https:"
      ? [
          process.env.HTTPS_PROXY,
          process.env.https_proxy,
          process.env.ALL_PROXY,
          process.env.all_proxy,
          process.env.HTTP_PROXY,
          process.env.http_proxy,
        ]
      : [
          process.env.HTTP_PROXY,
          process.env.http_proxy,
          process.env.ALL_PROXY,
          process.env.all_proxy,
        ];

  const seen = new Set();
  const list = [];

  for (const value of orderedValues) {
    const parsed = normalizeProxyUrl(value);
    if (!parsed || !isSupportedProxyProtocol(parsed.protocol)) {
      continue;
    }

    const key = parsed.toString();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    list.push(parsed);
  }

  return list;
}

function finalizeResponse(res, chunks) {
  const rawBody = Buffer.concat(chunks).toString("utf8");
  const contentType = String(res.headers["content-type"] || "");
  let data = rawBody;

  if (contentType.includes("application/json")) {
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch (_error) {
      data = rawBody;
    }
  } else if (rawBody.startsWith("{") || rawBody.startsWith("[")) {
    try {
      data = JSON.parse(rawBody);
    } catch (_error) {
      data = rawBody;
    }
  }

  return {
    statusCode: res.statusCode || 0,
    headers: res.headers,
    data,
    rawBody,
  };
}

function requestDirect(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const transport = getTransport(targetUrl);
    const headers = { ...(options.headers || {}) };
    const body = options.body || "";

    if (body && !headers["Content-Length"] && !headers["content-length"]) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port || defaultPort(targetUrl.protocol),
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method: options.method || "GET",
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve(finalizeResponse(res, chunks));
        });
      },
    );

    req.setTimeout(options.timeoutMs || 15000, () => {
      req.destroy(new Error("Request timeout"));
    });

    req.on("error", (error) => {
      reject(normalizeRequestError(error, `HTTP request failed (${targetUrl.hostname})`));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function requestHttpViaHttpProxy(targetUrl, proxyUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const transport = getTransport(proxyUrl);
    const proxyLabel = getProxyLabel(proxyUrl);
    const headers = { ...(options.headers || {}) };
    const body = options.body || "";

    headers.Host = headers.Host || targetUrl.host;
    const proxyAuth = getProxyAuthorizationHeader(proxyUrl);
    if (proxyAuth) {
      headers["Proxy-Authorization"] = proxyAuth;
    }

    if (body && !headers["Content-Length"] && !headers["content-length"]) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = transport.request(
      {
        protocol: proxyUrl.protocol,
        hostname: proxyUrl.hostname,
        port: proxyUrl.port || defaultPort(proxyUrl.protocol),
        method: options.method || "GET",
        path: targetUrl.toString(),
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve(finalizeResponse(res, chunks));
        });
      },
    );

    req.setTimeout(options.timeoutMs || 15000, () => {
      req.destroy(new Error("Request timeout"));
    });

    req.on("error", (error) => {
      reject(
        normalizeRequestError(
          error,
          `HTTP proxy request failed (${proxyLabel} -> ${targetUrl.hostname})`,
        ),
      );
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function openHttpConnectTunnel(targetUrl, proxyUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const transport = getTransport(proxyUrl);
    const proxyLabel = getProxyLabel(proxyUrl);
    const targetPort = Number(targetUrl.port || defaultPort(targetUrl.protocol));
    const proxyHeaders = {};
    const proxyAuth = getProxyAuthorizationHeader(proxyUrl);
    if (proxyAuth) {
      proxyHeaders["Proxy-Authorization"] = proxyAuth;
    }

    const connectReq = transport.request({
      protocol: proxyUrl.protocol,
      hostname: proxyUrl.hostname,
      port: proxyUrl.port || defaultPort(proxyUrl.protocol),
      method: "CONNECT",
      path: `${targetUrl.hostname}:${targetPort}`,
      headers: {
        Host: `${targetUrl.hostname}:${targetPort}`,
        ...proxyHeaders,
      },
    });

    connectReq.setTimeout(options.timeoutMs || 15000, () => {
      connectReq.destroy(new Error("Proxy CONNECT timeout"));
    });

    connectReq.on("connect", (res, socket, head) => {
      if ((res.statusCode || 0) !== 200) {
        socket.destroy();
        reject(
          new Error(
            `Proxy CONNECT failed with status ${res.statusCode || 0} (${proxyLabel})`,
          ),
        );
        return;
      }

      if (head && head.length > 0) {
        socket.unshift(head);
      }

      resolve(socket);
    });

    connectReq.on("error", (error) => {
      reject(
        normalizeRequestError(
          error,
          `Proxy CONNECT failed (${proxyLabel} -> ${targetUrl.hostname})`,
        ),
      );
    });

    connectReq.end();
  });
}

function requestHttpsOverSocket(targetUrl, socket, contextLabel, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (error, responsePayload) => {
      if (settled) {
        return;
      }
      settled = true;
      agent.destroy();

      if (error) {
        socket.destroy();
        reject(normalizeRequestError(error, contextLabel));
        return;
      }

      resolve(responsePayload);
    };

    const targetPort = Number(targetUrl.port || 443);
    const agent = new https.Agent({
      keepAlive: false,
      maxSockets: 1,
    });
    agent.createConnection = () =>
      tls.connect({
        socket,
        servername: targetUrl.hostname,
      });

    const headers = { ...(options.headers || {}) };
    const body = options.body || "";
    headers.Host = headers.Host || targetUrl.host;
    if (body && !headers["Content-Length"] && !headers["content-length"]) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = https.request(
      {
        protocol: "https:",
        hostname: targetUrl.hostname,
        port: targetPort,
        method: options.method || "GET",
        path: `${targetUrl.pathname}${targetUrl.search}`,
        headers,
        agent,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          done(null, finalizeResponse(response, chunks));
        });
      },
    );

    req.setTimeout(options.timeoutMs || 15000, () => {
      req.destroy(new Error("Request timeout"));
    });
    req.on("error", (error) => done(error));

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function requestHttpOverSocket(targetUrl, socket, contextLabel, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (error, responsePayload) => {
      if (settled) {
        return;
      }
      settled = true;
      agent.destroy();

      if (error) {
        socket.destroy();
        reject(normalizeRequestError(error, contextLabel));
        return;
      }

      resolve(responsePayload);
    };

    const agent = new http.Agent({
      keepAlive: false,
      maxSockets: 1,
    });
    agent.createConnection = () => socket;

    const headers = { ...(options.headers || {}) };
    const body = options.body || "";
    headers.Host = headers.Host || targetUrl.host;
    if (body && !headers["Content-Length"] && !headers["content-length"]) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = http.request(
      {
        protocol: "http:",
        hostname: targetUrl.hostname,
        port: Number(targetUrl.port || 80),
        method: options.method || "GET",
        path: `${targetUrl.pathname}${targetUrl.search}`,
        headers,
        agent,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          done(null, finalizeResponse(response, chunks));
        });
      },
    );

    req.setTimeout(options.timeoutMs || 15000, () => {
      req.destroy(new Error("Request timeout"));
    });
    req.on("error", (error) => done(error));

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function waitForReadable(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onReadable = () => {
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (error) => {
      settled = true;
      cleanup();
      reject(error);
    };
    const onClosed = () => {
      settled = true;
      cleanup();
      reject(new Error("Socket closed unexpectedly"));
    };
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error("Socket read timeout"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("readable", onReadable);
      socket.off("error", onError);
      socket.off("end", onClosed);
      socket.off("close", onClosed);
    };

    socket.on("readable", onReadable);
    socket.on("error", onError);
    socket.on("end", onClosed);
    socket.on("close", onClosed);
  });
}

async function readBytes(socket, expected, timeoutMs) {
  const chunks = [];
  let total = 0;

  while (total < expected) {
    const chunk = socket.read(expected - total);
    if (!chunk) {
      await waitForReadable(socket, timeoutMs);
      continue;
    }

    chunks.push(chunk);
    total += chunk.length;
  }

  return Buffer.concat(chunks, expected);
}

function writeBytes(socket, buffer, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy(new Error("Socket write timeout"));
      reject(new Error("Socket write timeout"));
    }, timeoutMs);

    socket.write(buffer, (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function connectTcp(hostname, port, timeoutMs, contextLabel) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({
      host: hostname,
      port,
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy(new Error("Connection timeout"));
      reject(new Error("Connection timeout"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("error", onError);
    };

    const onConnect = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(socket);
    };

    const onError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(normalizeRequestError(error, contextLabel));
    };

    socket.on("connect", onConnect);
    socket.on("error", onError);
  });
}

async function openSocks5Tunnel(targetUrl, proxyUrl, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const proxyLabel = getProxyLabel(proxyUrl);
  const proxyPort = Number(proxyUrl.port || 1080);
  const targetPort = Number(targetUrl.port || defaultPort(targetUrl.protocol));

  const socket = await connectTcp(
    proxyUrl.hostname,
    proxyPort,
    timeoutMs,
    `SOCKS proxy connect failed (${proxyLabel})`,
  );

  try {
    const username = decodeURIComponent(proxyUrl.username || "");
    const password = decodeURIComponent(proxyUrl.password || "");
    const hasAuth = username.length > 0 || password.length > 0;

    const methods = hasAuth ? Buffer.from([0x00, 0x02]) : Buffer.from([0x00]);
    await writeBytes(
      socket,
      Buffer.concat([Buffer.from([0x05, methods.length]), methods]),
      timeoutMs,
    );

    const methodResponse = await readBytes(socket, 2, timeoutMs);
    if (methodResponse[0] !== 0x05) {
      throw new Error(`Invalid SOCKS version: ${methodResponse[0]}`);
    }
    if (methodResponse[1] === 0xff) {
      throw new Error("SOCKS proxy has no acceptable authentication method.");
    }

    if (methodResponse[1] === 0x02) {
      const userBytes = Buffer.from(username, "utf8");
      const passBytes = Buffer.from(password, "utf8");
      if (userBytes.length > 255 || passBytes.length > 255) {
        throw new Error("SOCKS username/password is too long.");
      }

      await writeBytes(
        socket,
        Buffer.concat([
          Buffer.from([0x01, userBytes.length]),
          userBytes,
          Buffer.from([passBytes.length]),
          passBytes,
        ]),
        timeoutMs,
      );

      const authResponse = await readBytes(socket, 2, timeoutMs);
      if (authResponse[1] !== 0x00) {
        throw new Error("SOCKS authentication failed.");
      }
    } else if (methodResponse[1] !== 0x00) {
      throw new Error(`SOCKS authentication method ${methodResponse[1]} not supported.`);
    }

    const hostBytes = Buffer.from(targetUrl.hostname, "utf8");
    if (hostBytes.length === 0 || hostBytes.length > 255) {
      throw new Error("Target host is invalid for SOCKS tunneling.");
    }

    const connectRequest = Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, hostBytes.length]),
      hostBytes,
      Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff]),
    ]);
    await writeBytes(socket, connectRequest, timeoutMs);

    const replyHead = await readBytes(socket, 4, timeoutMs);
    if (replyHead[0] !== 0x05) {
      throw new Error(`Invalid SOCKS reply version: ${replyHead[0]}`);
    }
    if (replyHead[1] !== 0x00) {
      const explanation =
        SOCKS_REPLY_ERRORS[replyHead[1]] || `Unknown SOCKS reply code ${replyHead[1]}`;
      throw new Error(`SOCKS CONNECT rejected: ${explanation}`);
    }

    if (replyHead[3] === 0x01) {
      await readBytes(socket, 4 + 2, timeoutMs);
    } else if (replyHead[3] === 0x04) {
      await readBytes(socket, 16 + 2, timeoutMs);
    } else if (replyHead[3] === 0x03) {
      const len = await readBytes(socket, 1, timeoutMs);
      await readBytes(socket, len[0] + 2, timeoutMs);
    } else {
      throw new Error(`SOCKS CONNECT returned unknown address type ${replyHead[3]}`);
    }

    return socket;
  } catch (error) {
    socket.destroy();
    throw normalizeRequestError(
      error,
      `SOCKS tunnel failed (${proxyLabel} -> ${targetUrl.hostname}:${targetPort})`,
    );
  }
}

async function requestViaProxy(targetUrl, proxyUrl, options = {}) {
  const protocol = proxyUrl.protocol;
  const proxyLabel = getProxyLabel(proxyUrl);

  if (protocol === "http:" || protocol === "https:") {
    if (targetUrl.protocol === "http:") {
      return requestHttpViaHttpProxy(targetUrl, proxyUrl, options);
    }
    if (targetUrl.protocol === "https:") {
      const tunnelSocket = await openHttpConnectTunnel(targetUrl, proxyUrl, options);
      return requestHttpsOverSocket(
        targetUrl,
        tunnelSocket,
        `HTTPS request failed through proxy (${proxyLabel} -> ${targetUrl.hostname})`,
        options,
      );
    }
    throw new Error(`Unsupported target protocol: ${targetUrl.protocol}`);
  }

  if (protocol === "socks:" || protocol === "socks5:" || protocol === "socks5h:") {
    const tunnelSocket = await openSocks5Tunnel(targetUrl, proxyUrl, options);
    if (targetUrl.protocol === "http:") {
      return requestHttpOverSocket(
        targetUrl,
        tunnelSocket,
        `HTTP request failed through SOCKS proxy (${proxyLabel} -> ${targetUrl.hostname})`,
        options,
      );
    }
    if (targetUrl.protocol === "https:") {
      return requestHttpsOverSocket(
        targetUrl,
        tunnelSocket,
        `HTTPS request failed through SOCKS proxy (${proxyLabel} -> ${targetUrl.hostname})`,
        options,
      );
    }
    throw new Error(`Unsupported target protocol: ${targetUrl.protocol}`);
  }

  throw new Error(`Unsupported proxy protocol: ${protocol}`);
}

async function request(urlString, options = {}) {
  const targetUrl = new URL(urlString);
  const proxyCandidates = options.disableProxy ? [] : getProxyCandidatesForTarget(targetUrl);

  if (proxyCandidates.length === 0) {
    return requestDirect(targetUrl, options);
  }

  const failures = [];
  for (const proxyUrl of proxyCandidates) {
    try {
      return await requestViaProxy(targetUrl, proxyUrl, options);
    } catch (error) {
      failures.push({
        proxy: getProxyLabel(proxyUrl),
        message: describeError(error),
        error,
      });

      if (!isRetryableProxyError(error)) {
        break;
      }
    }
  }

  const details = failures
    .map((item) => `${item.proxy} => ${item.message}`)
    .join(" ; ");
  const finalError = new Error(
    `All proxy attempts failed for ${targetUrl.hostname}: ${details}`,
  );
  finalError.cause = failures.length > 0 ? failures[failures.length - 1].error : null;
  throw finalError;
}

async function postJson(urlString, payload, options = {}) {
  return request(urlString, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: JSON.stringify(payload || {}),
    timeoutMs: options.timeoutMs,
  });
}

async function postForm(urlString, payload, options = {}) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) {
      continue;
    }
    form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }

  return request(urlString, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options.headers || {}),
    },
    body: form.toString(),
    timeoutMs: options.timeoutMs,
  });
}

module.exports = {
  request,
  postJson,
  postForm,
};
