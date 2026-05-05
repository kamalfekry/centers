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
  listLeaveRecords,
  upsertLeaveRecord,
  deleteLeaveRecord,
  listPayrollAdjustments,
  upsertPayrollAdjustment,
  deletePayrollAdjustment,
  listPayrollLocks,
  setPayrollLock,
  addAuditLogEntry,
  listAuditLog,
  createAttendanceSignIn,
  completeAttendanceSignOut,
  listAttendanceRecords,
  listOpenAttendanceEmployeeIds,
  deleteAttendanceRecordsBefore,
  deleteSelectedAttendanceRecords,
  fixMissingSignOut
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

    const [records, employees, settings, auditLog, leaveRecords, payrollAdjustments, payrollLocks] = await Promise.all([
      listAttendanceRecords(),
      listEmployees(),
      getWorkSettings(),
      listAuditLog(),
      listLeaveRecords(),
      listPayrollAdjustments(),
      listPayrollLocks()
    ])

    return json({
      ok: true,
      records,
      employees,
      settings,
      auditLog,
      leaveRecords,
      payrollAdjustments,
      payrollLocks
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
      `${employee.fullName} (${employee.username}) - salary ${employee.monthlySalary || 0}${employee.notes ? `, notes: ${employee.notes}` : ""}${employee.active ? "" : " marked inactive"}`
    )

    return json({
      ok: true,
      employee
    })
  }
})

app.http("dashboard-leaves", {
  methods: ["POST", "DELETE"],
  authLevel: "anonymous",
  route: "dashboard-leaves",
  handler: async (request) => {
    const authError = requireAdmin(request)
    if (authError) {
      return authError
    }

    if (request.method === "DELETE") {
      const leaveId = request.query.get("id")
      if (!leaveId) {
        return errorResponse(400, "Leave id is required.")
      }

      await deleteLeaveRecord(leaveId)
      await addAuditLogEntry("Deleted leave", `Removed leave record ${leaveId}.`)
      return json({ ok: true })
    }

    const body = await readJsonBody(request)
    if (!body?.employeeId || !body?.date) {
      return errorResponse(400, "Employee and leave date are required.")
    }

    const leave = await upsertLeaveRecord(body)
    await addAuditLogEntry(
      body.id ? "Updated leave" : "Added leave",
      `${leave.employeeName} - ${leave.type} on ${leave.date}${leave.notes ? ` (${leave.notes})` : ""}`
    )

    return json({
      ok: true,
      leave
    })
  }
})

app.http("dashboard-payroll-adjustments", {
  methods: ["POST", "DELETE"],
  authLevel: "anonymous",
  route: "dashboard-payroll-adjustments",
  handler: async (request) => {
    const authError = requireAdmin(request)
    if (authError) {
      return authError
    }

    if (request.method === "DELETE") {
      const adjustmentId = request.query.get("id")
      if (!adjustmentId) {
        return errorResponse(400, "Adjustment id is required.")
      }

      await deletePayrollAdjustment(adjustmentId)
      await addAuditLogEntry("Deleted payroll adjustment", `Removed payroll adjustment ${adjustmentId}.`)
      return json({ ok: true })
    }

    const body = await readJsonBody(request)
    if (!body?.employeeId || !body?.monthKey) {
      return errorResponse(400, "Employee and month are required.")
    }

    const adjustment = await upsertPayrollAdjustment(body)
    await addAuditLogEntry(
      "Updated payroll adjustment",
      `${adjustment.employeeName} - ${adjustment.monthKey}, bonus ${adjustment.bonus}, penalty ${adjustment.penalty}, advance ${adjustment.advance}`
    )

    return json({
      ok: true,
      adjustment
    })
  }
})

app.http("dashboard-payroll-lock", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "dashboard-payroll-lock",
  handler: async (request) => {
    const authError = requireAdmin(request)
    if (authError) {
      return authError
    }

    const body = await readJsonBody(request)
    const monthKey = String(body?.monthKey || "").trim()
    const password = String(body?.password || "")
    const locked = body?.locked !== false
    const config = getConfig()

    if (password !== config.adminPassword) {
      return errorResponse(403, "Incorrect admin password.")
    }

    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return errorResponse(400, "A valid month is required.")
    }

    const result = await setPayrollLock(monthKey, locked)
    await addAuditLogEntry(locked ? "Locked payroll month" : "Unlocked payroll month", `${monthKey}`)

    return json({
      ok: true,
      lock: result
    })
  }
})

app.http("dashboard-fix-signout", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "dashboard-fix-signout",
  handler: async (request) => {
    const authError = requireAdmin(request)
    if (authError) {
      return authError
    }

    const body = await readJsonBody(request)
    const recordId = String(body?.recordId || "").trim()
    if (!recordId || !body?.signOutDate || !body?.signOutTime || !body?.signOutTimestamp) {
      return errorResponse(400, "Record id and sign-out information are required.")
    }

    const result = await fixMissingSignOut(recordId, body)
    await addAuditLogEntry("Fixed missing sign-out", `Closed open attendance record ${recordId}.`)

    return json({
      ok: true,
      result
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
      `Workday ${settings.workdayStartTime}-${settings.workdayEndTime}, grace ${settings.lateGraceMinutes} minutes, ${settings.monthlyWorkingDays} workdays`
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
