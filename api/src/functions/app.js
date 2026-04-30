const { app } = require("@azure/functions")
const { getConfig } = require("../lib/config")
const { createAdminToken, createAdminSessionCookie, clearAdminSessionCookie, requireAdmin } = require("../lib/auth")
const { errorResponse, json } = require("../lib/responses")
const {
  ensureStorage,
  listEmployees,
  upsertEmployee,
  deleteEmployee,
  replaceEmployeesWithDefaults,
  getWorkSettings,
  saveWorkSettings,
  addAuditLogEntry,
  listAuditLog,
  createAttendanceSignIn,
  completeAttendanceSignOut,
  listAttendanceRecords,
  listOpenAttendanceEmployeeIds,
  deleteAttendanceRecordsBefore,
  deleteSelectedAttendanceRecords
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

    const token = createAdminToken()
    return json(
      {
        ok: true,
        token
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

app.http("dashboard-bootstrap", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard-bootstrap",
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

app.http("dashboard-employees", {
  methods: ["POST", "DELETE"],
  authLevel: "anonymous",
  route: "dashboard-employees",
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

app.http("dashboard-sync-employees", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "dashboard-sync-employees",
  handler: async (request) => {
    const authError = requireAdmin(request)
    if (authError) {
      return authError
    }

    const openEmployeeIds = await listOpenAttendanceEmployeeIds()
    if (openEmployeeIds.length) {
      return errorResponse(409, "Some employees are currently signed in. Please complete sign-outs before replacing the employee list.")
    }

    const employees = await replaceEmployeesWithDefaults()
    await addAuditLogEntry("Replaced employee list", `Synced ${employees.length} employees from the imported workbook.`)

    return json({
      ok: true,
      employees,
      replacedCount: employees.length
    })
  }
})

app.http("dashboard-settings", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "dashboard-settings",
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

app.http("dashboard-delete-records", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "dashboard-delete-records",
  handler: async (request) => {
    const authError = requireAdmin(request)
    if (authError) {
      return authError
    }

    const body = await readJsonBody(request)
    const password = String(body?.password || "")
    const beforeMonthKey = String(body?.beforeMonthKey || "").trim()
    const config = getConfig()

    if (password !== config.adminPassword) {
      return errorResponse(403, "Incorrect admin password.")
    }

    if (!/^\d{4}-\d{2}$/.test(beforeMonthKey)) {
      return errorResponse(400, "A valid month must be selected before deleting old records.")
    }

    const [yearText, monthText] = beforeMonthKey.split("-")
    const cutoffIso = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, 1)).toISOString()
    const deletedCount = await deleteAttendanceRecordsBefore(cutoffIso)
    await addAuditLogEntry("Deleted old attendance records", `Deleted ${deletedCount} records before ${beforeMonthKey}.`)

    return json({
      ok: true,
      deletedCount
    })
  }
})

app.http("dashboard-delete-selected-records", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "dashboard-delete-selected-records",
  handler: async (request) => {
    const authError = requireAdmin(request)
    if (authError) {
      return authError
    }

    const body = await readJsonBody(request)
    const password = String(body?.password || "")
    const recordIds = Array.isArray(body?.recordIds) ? body.recordIds : []
    const config = getConfig()

    if (password !== config.adminPassword) {
      return errorResponse(403, "Incorrect admin password.")
    }

    if (!recordIds.length) {
      return errorResponse(400, "Select at least one attendance record to delete.")
    }

    const deletedCount = await deleteSelectedAttendanceRecords(recordIds)
    await addAuditLogEntry("Deleted selected attendance records", `Deleted ${deletedCount} manually selected attendance records.`)

    return json({
      ok: true,
      deletedCount
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
