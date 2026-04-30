(function initializeCentersDataApi() {
  const appConfig = window.CENTERS_CONFIG || {}
  const apiBaseUrl = String(appConfig.apiBaseUrl || "/api").replace(/\/$/, "")
  let adminSessionToken = ""

  const defaultWorkSettings = {
    workdayStartTime: "09:00",
    workdayEndTime: "17:00",
    lateGraceMinutes: 15
  }

  function buildUrl(path) {
    return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`
  }

  async function apiRequest(path, options = {}) {
    const { auth = false, body, headers = {}, method = "GET" } = options
    const requestHeaders = {
      ...headers
    }

    if (body !== undefined) {
      requestHeaders["Content-Type"] = "application/json"
    }

    if (auth && adminSessionToken) {
      requestHeaders["x-admin-token"] = adminSessionToken
    }

    const response = await fetch(buildUrl(path), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin"
    })

    const contentType = response.headers.get("content-type") || ""
    const payload = contentType.includes("application/json") ? await response.json() : await response.text()

    if (!response.ok) {
      const errorMessage = typeof payload === "object" && payload ? payload.error || payload.message : payload
      throw new Error(errorMessage || `Request failed with status ${response.status}`)
    }

    return payload
  }

  function createEmployeeId(fullName) {
    const normalizedName = String(fullName || "employee")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")

    return `${normalizedName || "employee"}-${Date.now()}`
  }

  function getPublicBootstrap() {
    return apiRequest("/public-bootstrap")
  }

  function loginAdmin(password) {
    return apiRequest("/auth-login", {
      method: "POST",
      body: {
        password
      }
    }).then((payload) => {
      adminSessionToken = String(payload?.token || "")
      return payload
    })
  }

  function logoutAdmin() {
    adminSessionToken = ""
    return apiRequest("/auth-logout", {
      method: "POST"
    })
  }

  async function checkAdminSession() {
    try {
      const payload = await apiRequest("/auth-session", {
        auth: true
      })
      return Boolean(payload?.ok)
    } catch (error) {
      return false
    }
  }

  function getAdminBootstrap() {
    return apiRequest("/dashboard-bootstrap", {
      auth: true
    })
  }

  function saveEmployee(profile) {
    return apiRequest("/dashboard-employees", {
      method: "POST",
      auth: true,
      body: profile
    })
  }

  function deleteEmployee(employeeId) {
    return apiRequest(`/dashboard-employees?id=${encodeURIComponent(employeeId)}`, {
      method: "DELETE",
      auth: true
    })
  }

  function saveWorkSettings(settings) {
    return apiRequest("/dashboard-settings", {
      method: "POST",
      auth: true,
      body: settings
    })
  }

  function submitAttendance(action, payload) {
    return apiRequest(`/attendance-${action}`, {
      method: "POST",
      body: payload
    })
  }

  function getApiHealthUrl() {
    return buildUrl(appConfig.apiHealthPath || "/health")
  }

  window.CENTERS_DATA = {
    apiBaseUrl,
    createEmployeeId,
    defaultWorkSettings,
    getPublicBootstrap,
    loginAdmin,
    logoutAdmin,
    checkAdminSession,
    getAdminBootstrap,
    saveEmployee,
    deleteEmployee,
    saveWorkSettings,
    submitAttendance,
    getApiHealthUrl
  }
})()
