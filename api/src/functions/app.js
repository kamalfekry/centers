const { app } = require("@azure/functions")
const { getConfig } = require("../lib/config")
const { createAdminSessionCookie, clearAdminSessionCookie, requireAdmin } = require("../lib/auth")
const { errorResponse, json } = require("../lib/responses")
const {
  ensureStorage,
  listEmployees,
  upsertEmployee,
  deleteEmployee,
  getWorkSettings,
  saveWorkSettings,
  addAuditLogEntry,
  listAuditLog,
  createAttendanceSignIn,
  completeAttendanceSignOut,
  listAttendanceRecords,
  listOpenAttendanceEmployeeIds
} = require("../lib/storage")

app.http("public-bootstrap", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "public-bootstrap",
  handler: async () => {
    await ensureStorage()
    const employees = (await listEmployees()).filter((employee) => employee.active !== false)
    const activeEmployeeIds = await listOpenAttendanceEmployeeIds()

    return json({
      ok: true,
      employees,
      activeEmployeeIds
    })
  }
})

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async () => {
    await ensureStorage()
    return json({
      ok: true,
      service: "centers-api"
    })
  }
})

app.http("auth-login", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth-login",
  handler: async (request) => {
    const body = await readJsonBody(request)
    if (!body?.password) {
      return errorResponse(400, "Password is required.")
    }

    const config = getConfig()
    if (String(body.password) !== config.adminPassword) {
      return errorResponse(401, "Incorrect admin password.")
    }

    return json(
      {
        ok: true
      },
      200,
      {
        "Set-Cookie": createAdminSessionCookie(request)
      }
    )
  }
})

app.http("auth-session", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth-session",
  handler: async (request) => {
    const authError = requireAdmin(request)
    if (authError) {
      return authError
    }

    return json({
      ok: true
    })
  }
})

app.http("auth-logout", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth-logout",
  handler: async (request) => {
    return json(
      {
        ok: true
      },
      200,
      {
        "Set-Cookie": clearAdminSessionCookie(request)
      }
    )
  }
})

app.http("attendance-signin", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "attendance-signin",
  handler: async (request) => {
    const body = await readJsonBody(request)
    if (!body?.employeeId || !body?.employeeName) {
      return errorResponse(400, "Employee information is required.")
    }

    const result = await createAttendanceSignIn(body)
    return json({
      ok: true,
      action: "signin",
      ...result
    })
  }
})

app.http("attendance-signout", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "attendance-signout",
  handler: async (request) => {
    const body = await readJsonBody(request)
    if (!body?.employeeId || !body?.employeeName) {
      return errorResponse(400, "Employee information is required.")
    }

    const result = await completeAttendanceSignOut(body)
    return json({
      ok: true,
      action: "signout",
      ...result
    })
  }
})

app.http("admin-bootstrap", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "admin-bootstrap",
  handler: async (request) => {
    const authError = requireAdmin(request)
    if (authError) {
      return authError
    }

    const [records, employees, settings, auditLog] = await Promise.all([
      listAttendanceRecords(),
      listEmployees(),
      getWorkSettings(),
      listAuditLog()
    ])

    return json({
      ok: true,
      records,
      employees,
      settings,
      auditLog
    })
  }
})

app.http("admin-employees", {
  methods: ["POST", "DELETE"],
  authLevel: "anonymous",
  route: "admin-employees",
  handler: async (request) => {
    const authError = requireAdmin(request)
    if (authError) {
      return authError
    }

    if (request.method === "DELETE") {
      const employeeId = request.query.get("id")
      if (!employeeId) {
        return errorResponse(400, "Employee id is required.")
      }

      await deleteEmployee(employeeId)
      await addAuditLogEntry("Deleted employee", `Removed employee ${employeeId}`)
      return json({ ok: true })
    }

    const body = await readJsonBody(request)
    if (!body?.fullName || !body?.username) {
      return errorResponse(400, "Employee full name and username are required.")
    }

    const employee = await upsertEmployee(body)
    await addAuditLogEntry(
      body.id ? "Updated employee" : "Added employee",
      `${employee.fullName} (${employee.username})${employee.active ? "" : " marked inactive"}`
    )

    return json({
      ok: true,
      employee
    })
  }
})

app.http("admin-settings", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "admin-settings",
  handler: async (request) => {
    const authError = requireAdmin(request)
    if (authError) {
      return authError
    }

    const body = await readJsonBody(request)
    const settings = await saveWorkSettings(body || {})
    await addAuditLogEntry(
      "Updated settings",
      `Workday ${settings.workdayStartTime}-${settings.workdayEndTime}, grace ${settings.lateGraceMinutes} minutes`
    )

    return json({
      ok: true,
      settings
    })
  }
})

async function readJsonBody(request) {
  try {
    return await request.json()
  } catch (error) {
    return null
  }
}
