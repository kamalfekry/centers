const crypto = require("node:crypto")
const { getConfig } = require("./config")
const { errorResponse } = require("./responses")
const SESSION_COOKIE_NAME = "centers_admin_session"

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "===".slice((normalized.length + 3) % 4)
  return Buffer.from(padded, "base64").toString("utf8")
}

function createAdminToken() {
  const { adminJwtSecret } = getConfig()
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: "centers-admin",
      exp: Date.now() + 12 * 60 * 60 * 1000
    })
  )
  const signature = crypto
    .createHmac("sha256", adminJwtSecret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")

  return `${header}.${payload}.${signature}`
}

function isHttpsRequest(request) {
  const forwardedProto = String(request.headers.get("x-forwarded-proto") || "").toLowerCase()
  if (forwardedProto === "https") {
    return true
  }

  try {
    return new URL(request.url).protocol === "https:"
  } catch (error) {
    return false
  }
}

function verifyAdminToken(token) {
  if (!token) {
    return false
  }

  const { adminJwtSecret } = getConfig()
  const [header, payload, signature] = String(token).split(".")
  if (!header || !payload || !signature) {
    return false
  }

  const expectedSignature = crypto
    .createHmac("sha256", adminJwtSecret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")

  if (signature !== expectedSignature) {
    return false
  }

  const parsedPayload = JSON.parse(base64UrlDecode(payload))
  return Number(parsedPayload.exp || 0) > Date.now()
}

function readBearerToken(request) {
  const authorization = request.headers.get("authorization") || ""
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : ""
}

function readCustomHeaderToken(request) {
  return String(request.headers.get("x-admin-token") || "").trim()
}

function readCookieToken(request) {
  const cookieHeader = request.headers.get("cookie") || ""
  const cookiePairs = cookieHeader.split(";")
  for (const cookiePair of cookiePairs) {
    const [rawName, ...rawValueParts] = cookiePair.trim().split("=")
    if (rawName === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rawValueParts.join("="))
    }
  }

  return ""
}

function createAdminSessionCookie(request) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(createAdminToken())}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${12 * 60 * 60}`
  ]

  if (isHttpsRequest(request)) {
    attributes.push("Secure")
  }

  return attributes.join("; ")
}

function clearAdminSessionCookie(request) {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ]

  if (isHttpsRequest(request)) {
    attributes.push("Secure")
  }

  return attributes.join("; ")
}

function requireAdmin(request) {
  const token = readCustomHeaderToken(request) || readBearerToken(request) || readCookieToken(request)
  if (!verifyAdminToken(token)) {
    return errorResponse(401, "Admin authentication is required.")
  }

  return null
}

module.exports = {
  createAdminToken,
  createAdminSessionCookie,
  clearAdminSessionCookie,
  requireAdmin
}
