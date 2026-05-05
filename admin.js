const centersData = window.CENTERS_DATA || {}
const adminConfig = window.CENTERS_CONFIG || {}
const timezone = adminConfig.timezone || "Africa/Cairo"

const adminAuthGate = document.getElementById("adminAuthGate")
const adminContent = document.getElementById("adminContent")
const adminPasswordForm = document.getElementById("adminPasswordForm")
const adminPasswordInput = document.getElementById("adminPasswordInput")
const adminPasswordError = document.getElementById("adminPasswordError")
const statusMessage = document.getElementById("statusMessage")
const apiHealthLink = document.getElementById("apiHealthLink")
const refreshBtn = document.getElementById("refreshBtn")
const exportBtn = document.getElementById("exportBtn")
const exportSummaryBtn = document.getElementById("exportSummaryBtn")
const logoutBtn = document.getElementById("logoutBtn")

const totalRecords = document.getElementById("totalRecords")
const currentMonthLabel = document.getElementById("currentMonthLabel")
const currentSignedInCount = document.getElementById("currentSignedInCount")
const presentTodayCount = document.getElementById("presentTodayCount")
const lateTodayCount = document.getElementById("lateTodayCount")
const absentTodayCount = document.getElementById("absentTodayCount")
const missingSignOutCount = document.getElementById("missingSignOutCount")

const searchInput = document.getElementById("searchInput")
const employeeFilter = document.getElementById("employeeFilter")
const monthFilter = document.getElementById("monthFilter")
const actionFilter = document.getElementById("actionFilter")

const todayChips = document.getElementById("todayChips")
const currentSignedInList = document.getElementById("currentSignedInList")
const attentionList = document.getElementById("attentionList")
const absentTodayList = document.getElementById("absentTodayList")

const monthlySummaryBody = document.getElementById("monthlySummaryBody")
const monthlySummaryEmpty = document.getElementById("monthlySummaryEmpty")
const employeeDetailTitle = document.getElementById("employeeDetailTitle")
const detailDaysPresent = document.getElementById("detailDaysPresent")
const detailTotalHours = document.getElementById("detailTotalHours")
const detailLateMinutes = document.getElementById("detailLateMinutes")
const detailMissingSignOuts = document.getElementById("detailMissingSignOuts")
const employeeDetailBody = document.getElementById("employeeDetailBody")
const employeeDetailEmpty = document.getElementById("employeeDetailEmpty")

const settingsForm = document.getElementById("settingsForm")
const workdayStartTimeInput = document.getElementById("workdayStartTime")
const workdayEndTimeInput = document.getElementById("workdayEndTime")
const lateGraceMinutesInput = document.getElementById("lateGraceMinutes")
const monthlyWorkingDaysInput = document.getElementById("monthlyWorkingDays")

const employeeForm = document.getElementById("employeeForm")
const employeeIdInput = document.getElementById("employeeIdInput")
const employeeNameInput = document.getElementById("employeeNameInput")
const employeeUsernameInput = document.getElementById("employeeUsernameInput")
const employeeSalaryInput = document.getElementById("employeeSalaryInput")
const employeeActiveInput = document.getElementById("employeeActiveInput")
const resetEmployeeFormBtn = document.getElementById("resetEmployeeFormBtn")
const syncImportedEmployeesBtn = document.getElementById("syncImportedEmployeesBtn")
const employeeDirectoryBody = document.getElementById("employeeDirectoryBody")
const auditLogList = document.getElementById("auditLogList")

const recordsTableBody = document.getElementById("recordsTableBody")
const emptyState = document.getElementById("emptyState")
const deleteSelectedRecordsBtn = document.getElementById("deleteSelectedRecordsBtn")
const deleteOldRecordsBtn = document.getElementById("deleteOldRecordsBtn")
const selectAllRecordsCheckbox = document.getElementById("selectAllRecordsCheckbox")

let allRecords = []
let employeeProfiles = []
let workSettings = centersData.defaultWorkSettings || {
  workdayStartTime: "09:00",
  workdayEndTime: "17:00",
  lateGraceMinutes: 15,
  monthlyWorkingDays: 26
}
let auditLogEntries = []
let selectedRecordIds = new Set()
let isSyncingImportedEmployees = false
let currentView = {
  enrichedRecords: [],
  monthRecords: [],
  filteredRecords: [],
  summaries: [],
  detailSummary: null,
  todayOverview: null
}

document.addEventListener("DOMContentLoaded", async () => {
  setupApiHealthLink()
  await initializeAdminPage()
})

adminPasswordForm.addEventListener("submit", handlePasswordSubmit)
refreshBtn.addEventListener("click", () => {
  loadAdminState()
})
exportBtn.addEventListener("click", exportDashboardWorkbook)
exportSummaryBtn.addEventListener("click", exportMonthlySummaryWorkbook)
logoutBtn.addEventListener("click", handleAdminLogout)
searchInput.addEventListener("input", deriveAndRender)
employeeFilter.addEventListener("change", deriveAndRender)
monthFilter.addEventListener("change", deriveAndRender)
actionFilter.addEventListener("change", deriveAndRender)
settingsForm.addEventListener("submit", handleSettingsSave)
employeeForm.addEventListener("submit", handleEmployeeSave)
resetEmployeeFormBtn.addEventListener("click", resetEmployeeForm)
syncImportedEmployeesBtn.addEventListener("click", handleSyncImportedEmployees)
deleteSelectedRecordsBtn.addEventListener("click", handleDeleteSelectedRecords)
deleteOldRecordsBtn.addEventListener("click", handleDeleteOldRecords)
selectAllRecordsCheckbox.addEventListener("change", handleSelectAllRecords)

function setupApiHealthLink() {
  if (apiHealthLink) {
    apiHealthLink.href = centersData.getApiHealthUrl ? centersData.getApiHealthUrl() : "#"
  }
}

async function initializeAdminPage() {
  try {
    const hasSession = await centersData.checkAdminSession?.()
    if (!hasSession) {
      lockAdminPage()
      return
    }

    unlockAdminPage(false)
    await loadAdminState()
  } catch (error) {
    console.error("Unable to initialize admin page:", error)
    lockAdminPage()
  }
}

async function handlePasswordSubmit(event) {
  event.preventDefault()

  try {
    await centersData.loginAdmin(adminPasswordInput.value)
    adminPasswordError.classList.add("d-none")
    adminPasswordForm.reset()
    unlockAdminPage(false)
    await loadAdminState()
  } catch (error) {
    adminPasswordError.textContent = error.message || "Incorrect password. Please try again."
    adminPasswordError.classList.remove("d-none")
    adminPasswordInput.focus()
    adminPasswordInput.select()
  }
}

async function handleAdminLogout() {
  try {
    await centersData.logoutAdmin?.()
  } catch (error) {
    console.error("Unable to log out admin session:", error)
  }

  setStatus("Admin session ended.")
  lockAdminPage()
}

function unlockAdminPage(shouldLoad = true) {
  adminAuthGate.classList.add("d-none")
  adminContent.classList.remove("d-none")
  if (shouldLoad) {
    loadAdminState()
  }
}

function lockAdminPage() {
  adminAuthGate.classList.remove("d-none")
  adminContent.classList.add("d-none")
  adminPasswordForm.reset()
  adminPasswordInput.focus()
}

async function loadAdminState() {
  try {
    setStatus("Loading Azure attendance data...")
    const payload = await centersData.getAdminBootstrap()
    allRecords = Array.isArray(payload.records) ? payload.records.map(normalizeAttendanceRow).filter(Boolean) : []
    employeeProfiles = Array.isArray(payload.employees)
      ? payload.employees
      : []
    workSettings = payload.settings || workSettings
    auditLogEntries = Array.isArray(payload.auditLog) ? payload.auditLog : []
    loadWorkSettingsIntoForm()
    deriveAndRender()
    setStatus(`Loaded ${allRecords.length} attendance records from Azure.`)
  } catch (error) {
    console.error("Unable to load admin state:", error)
    if (/401|authentication/i.test(String(error.message || ""))) {
      try {
        await centersData.logoutAdmin?.()
      } catch (logoutError) {
        console.error("Unable to clear admin session after auth failure:", logoutError)
      }
      lockAdminPage()
      adminPasswordError.textContent = "Your admin session expired. Please enter the password again."
      adminPasswordError.classList.remove("d-none")
    }
    setStatus(error.message || "Unable to load Azure data.")
  }
}

function deriveAndRender() {
  populateEmployeeFilterOptions()
  populateMonthFilterOptions()

  const enrichedRecords = allRecords.map((record) => enrichRecord(record)).filter(Boolean)
  const selectedMonthKey = getSelectedMonthKey()
  const monthRecords = enrichedRecords.filter((record) => getRecordMonthKey(record) === selectedMonthKey)
  const filteredRecords = getFilteredRecords(monthRecords)
  const summaries = buildMonthlySummaries(monthRecords)
  const detailSummary = buildEmployeeDetail(monthRecords, summaries)
  const todayOverview = buildTodayOverview(enrichedRecords)
  const visibleRecordIds = new Set(enrichedRecords.map((record) => record.recordId).filter(Boolean))
  selectedRecordIds = new Set(Array.from(selectedRecordIds).filter((recordId) => visibleRecordIds.has(recordId)))

  currentView = {
    enrichedRecords,
    monthRecords,
    filteredRecords,
    summaries,
    detailSummary,
    todayOverview
  }

  renderSummaryCards(selectedMonthKey, monthRecords, todayOverview)
  renderTodayOverview(todayOverview)
  renderMonthlySummary(summaries)
  renderEmployeeDetail(detailSummary)
  renderRecords(filteredRecords)
  renderEmployeeDirectory()
  renderAuditLog()
  syncImportedEmployeesButtonState(todayOverview)
}

function loadWorkSettingsIntoForm() {
  workdayStartTimeInput.value = workSettings.workdayStartTime || "09:00"
  workdayEndTimeInput.value = workSettings.workdayEndTime || "17:00"
  lateGraceMinutesInput.value = String(workSettings.lateGraceMinutes ?? 15)
  monthlyWorkingDaysInput.value = String(workSettings.monthlyWorkingDays ?? 26)
}

async function handleSettingsSave(event) {
  event.preventDefault()

  try {
    const nextSettings = {
      workdayStartTime: workdayStartTimeInput.value || "09:00",
      workdayEndTime: workdayEndTimeInput.value || "17:00",
      lateGraceMinutes: Number(lateGraceMinutesInput.value || 0),
      monthlyWorkingDays: Number(monthlyWorkingDaysInput.value || 26)
    }

    const response = await centersData.saveWorkSettings(nextSettings)
    workSettings = response.settings || nextSettings
    setStatus("Attendance settings were saved in Azure.")
    await loadAdminState()
  } catch (error) {
    console.error("Unable to save settings:", error)
    setStatus(error.message || "Unable to save work settings.")
  }
}

async function handleEmployeeSave(event) {
  event.preventDefault()

  const fullName = employeeNameInput.value.trim()
  const username = employeeUsernameInput.value.trim()
  const monthlySalary = Number(employeeSalaryInput.value || 0)
  if (!fullName || !username) {
    setStatus("Full name and username are required.")
    return
  }

  try {
    await centersData.saveEmployee({
      id: employeeIdInput.value.trim() || centersData.createEmployeeId(fullName),
      fullName,
      username,
      monthlySalary,
      active: employeeActiveInput.checked
    })
    resetEmployeeForm()
    setStatus("Employee saved to Azure successfully.")
    await loadAdminState()
  } catch (error) {
    console.error("Unable to save employee:", error)
    setStatus(error.message || "Unable to save employee.")
  }
}

async function handleSyncImportedEmployees() {
  if (isSyncingImportedEmployees) {
    return
  }

  const openAttendanceExists = currentView.todayOverview?.currentSignedIn?.length > 0
  if (openAttendanceExists) {
    const message = "Some employees are currently signed in. Please complete sign-outs before replacing the employee list."
    setStatus(message)
    window.alert(message)
    return
  }

  if (!window.confirm("Replace the current employee list with the imported workbook employees? This will remove the existing employee directory on Azure.")) {
    return
  }

  try {
    isSyncingImportedEmployees = true
    syncImportedEmployeesButtonState(currentView.todayOverview)
    setStatus("Replacing the employee list with the imported workbook employees...")
    const response = await centersData.syncImportedEmployees()
    const successMessage = `Replaced the employee list with ${response.replacedCount || 0} imported employees.`
    setStatus(successMessage)
    window.alert(successMessage)
    await loadAdminState()
  } catch (error) {
    console.error("Unable to sync imported employees:", error)
    const message = error.message || "Unable to replace the employee list."
    setStatus(message)
    window.alert(message)
  } finally {
    isSyncingImportedEmployees = false
    syncImportedEmployeesButtonState(currentView.todayOverview)
  }
}

async function handleDeleteOldRecords() {
  const beforeMonthKey = getSelectedMonthKey()
  const monthLabel = formatMonthLabel(beforeMonthKey)
  const password = window.prompt(`Enter the admin password to delete all attendance records before ${monthLabel}.`)

  if (password === null) {
    return
  }

  if (!password.trim()) {
    setStatus("The admin password is required to delete old records.")
    return
  }

  if (!window.confirm(`Delete all attendance records before ${monthLabel}? This action cannot be undone.`)) {
    return
  }

  try {
    const response = await centersData.deleteRecordsBeforeMonth(beforeMonthKey, password.trim())
    setStatus(`Deleted ${response.deletedCount || 0} old attendance records before ${monthLabel}.`)
    await loadAdminState()
  } catch (error) {
    console.error("Unable to delete old attendance records:", error)
    setStatus(error.message || "Unable to delete old attendance records.")
  }
}

async function handleDeleteSelectedRecords() {
  const recordIds = Array.from(selectedRecordIds)
  if (!recordIds.length) {
    setStatus("Select the attendance records you want to delete first.")
    return
  }

  const password = window.prompt(`Enter the admin password to delete ${recordIds.length} selected attendance records.`)
  if (password === null) {
    return
  }

  if (!password.trim()) {
    setStatus("The admin password is required to delete selected records.")
    return
  }

  if (!window.confirm(`Delete ${recordIds.length} selected attendance records? This action cannot be undone.`)) {
    return
  }

  try {
    const response = await centersData.deleteSelectedRecords(recordIds, password.trim())
    selectedRecordIds.clear()
    setStatus(`Deleted ${response.deletedCount || 0} selected attendance records.`)
    await loadAdminState()
  } catch (error) {
    console.error("Unable to delete selected attendance records:", error)
    setStatus(error.message || "Unable to delete selected attendance records.")
  }
}

function handleSelectAllRecords() {
  const visibleRecords = currentView.filteredRecords.filter((record) => record.recordId)
  if (!visibleRecords.length) {
    selectedRecordIds.clear()
    syncSelectAllCheckbox(visibleRecords)
    return
  }

  if (selectAllRecordsCheckbox.checked) {
    visibleRecords.forEach((record) => {
      selectedRecordIds.add(record.recordId)
    })
  } else {
    visibleRecords.forEach((record) => {
      selectedRecordIds.delete(record.recordId)
    })
  }

  renderRecords(currentView.filteredRecords)
}

function syncSelectAllCheckbox(records) {
  if (!selectAllRecordsCheckbox) {
    return
  }

  const visibleRecordIds = records.map((record) => record.recordId).filter(Boolean)
  const selectedVisibleCount = visibleRecordIds.filter((recordId) => selectedRecordIds.has(recordId)).length
  selectAllRecordsCheckbox.checked = visibleRecordIds.length > 0 && selectedVisibleCount === visibleRecordIds.length
  selectAllRecordsCheckbox.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleRecordIds.length
}

function resetEmployeeForm() {
  employeeForm.reset()
  employeeIdInput.value = ""
  employeeSalaryInput.value = "0"
  employeeActiveInput.checked = true
}

function renderEmployeeDirectory() {
  const sortedProfiles = employeeProfiles.slice().sort((first, second) => {
    return first.fullName.localeCompare(second.fullName, "ar")
  })

  employeeDirectoryBody.innerHTML = sortedProfiles
    .map((profile) => {
      return `
        <tr>
          <td class="fw-semibold">${escapeHtml(profile.fullName)}</td>
          <td>${escapeHtml(profile.username)}</td>
          <td>${escapeHtml(formatCurrency(profile.monthlySalary || 0))}</td>
          <td>${renderStatusBadge(profile.active ? "Active" : "Inactive", profile.active ? "success" : "secondary")}</td>
          <td>
            <div class="d-flex gap-2 flex-wrap">
              <button type="button" class="btn btn-sm btn-outline-primary" data-action="edit-employee" data-employee-id="${escapeHtml(profile.id)}">Edit</button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete-employee" data-employee-id="${escapeHtml(profile.id)}">Delete</button>
            </div>
          </td>
        </tr>
      `
    })
    .join("")

  employeeDirectoryBody.querySelectorAll("[data-action='edit-employee']").forEach((button) => {
    button.addEventListener("click", () => {
      editEmployee(button.dataset.employeeId)
    })
  })

  employeeDirectoryBody.querySelectorAll("[data-action='delete-employee']").forEach((button) => {
    button.addEventListener("click", () => {
      deleteEmployee(button.dataset.employeeId)
    })
  })
}

function syncImportedEmployeesButtonState(todayOverview) {
  if (!syncImportedEmployeesBtn) {
    return
  }

  const hasOpenAttendance = Boolean(todayOverview?.currentSignedIn?.length)
  syncImportedEmployeesBtn.disabled = isSyncingImportedEmployees || hasOpenAttendance

  if (isSyncingImportedEmployees) {
    syncImportedEmployeesBtn.textContent = "Replacing Employees..."
    syncImportedEmployeesBtn.title = "Please wait while Azure updates the employee list."
    return
  }

  syncImportedEmployeesBtn.textContent = "Replace With Imported Employees"
  syncImportedEmployeesBtn.title = hasOpenAttendance
    ? "Sign out all currently signed-in employees first."
    : "Replace the current Azure employee list with the imported workbook employees."
}

function editEmployee(employeeId) {
  const profile = employeeProfiles.find((item) => item.id === employeeId)
  if (!profile) {
    return
  }

  employeeIdInput.value = profile.id
  employeeNameInput.value = profile.fullName
  employeeUsernameInput.value = profile.username
  employeeSalaryInput.value = String(profile.monthlySalary || 0)
  employeeActiveInput.checked = profile.active !== false
  employeeNameInput.focus()
}

async function deleteEmployee(employeeId) {
  const profile = employeeProfiles.find((item) => item.id === employeeId)
  if (!profile) {
    return
  }

  const activeOpenRecord = currentView.enrichedRecords.find((record) => record.employeeId === employeeId && record.isOpen)
  if (activeOpenRecord) {
    setStatus("This employee currently has an open sign-in. Please sign out first before deleting.")
    return
  }

  if (!window.confirm(`Delete ${profile.fullName} from Azure storage?`)) {
    return
  }

  try {
    await centersData.deleteEmployee(employeeId)
    setStatus("Employee deleted from Azure successfully.")
    await loadAdminState()
  } catch (error) {
    console.error("Unable to delete employee:", error)
    setStatus(error.message || "Unable to delete employee.")
  }
}

function populateEmployeeFilterOptions() {
  const previousValue = employeeFilter.value
  const options = [
    '<option value="">All employees</option>',
    ...employeeProfiles
      .slice()
      .sort((first, second) => first.fullName.localeCompare(second.fullName, "ar"))
      .map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.fullName)}</option>`)
  ]

  employeeFilter.innerHTML = options.join("")
  if (previousValue && employeeProfiles.some((profile) => profile.id === previousValue)) {
    employeeFilter.value = previousValue
  }
}

function populateMonthFilterOptions() {
  const previousValue = monthFilter.value
  const currentMonthKey = buildMonthKey(new Date())
  const monthKeys = new Set([currentMonthKey])

  allRecords.forEach((record) => {
    const recordDate =
      parseDateTime(record.signInDate, record.signInTime) ||
      parseDateTime(record.signOutDate, record.signOutTime) ||
      parseIsoDate(record.timestamp)
    if (recordDate) {
      monthKeys.add(buildMonthKey(recordDate))
    }
  })

  const sortedKeys = Array.from(monthKeys).sort().reverse()
  monthFilter.innerHTML = sortedKeys
    .map((monthKey) => `<option value="${escapeHtml(monthKey)}">${escapeHtml(formatMonthLabel(monthKey))}</option>`)
    .join("")

  monthFilter.value = sortedKeys.includes(previousValue) ? previousValue : currentMonthKey
}

function getSelectedMonthKey() {
  return monthFilter.value || buildMonthKey(new Date())
}

function normalizeAttendanceRow(record) {
  if (!record || typeof record !== "object") {
    return null
  }

  const employeeName = String(record.employeeName || record.username || "Unknown").trim()
  return {
    recordId: String(record.recordId || "").trim(),
    employeeId: String(record.employeeId || "").trim() || employeeName,
    employeeName,
    username: employeeName,
    signInDate: String(record.signInDate || "-"),
    signInTime: String(record.signInTime || "-"),
    signInPhoto: String(record.signInPhotoUrl || record.signInPhoto || ""),
    signOutDate: String(record.signOutDate || "-"),
    signOutTime: String(record.signOutTime || "-"),
    signOutPhoto: String(record.signOutPhotoUrl || record.signOutPhoto || ""),
    duration: String(record.duration || "-"),
    timestamp: String(record.timestamp || ""),
    signInTimestamp: String(record.signInTimestamp || ""),
    signOutTimestamp: String(record.signOutTimestamp || ""),
    status: String(record.status || "closed")
  }
}

function enrichRecord(record) {
  const employeeProfile = employeeProfiles.find((profile) => profile.id === record.employeeId) || null
  const employeeId = employeeProfile ? employeeProfile.id : record.employeeId || record.employeeName
  const employeeName = employeeProfile ? employeeProfile.fullName : record.employeeName || "Unknown"

  const signInAt = parseDateTime(record.signInDate, record.signInTime)
  const signOutAt = parseDateTime(record.signOutDate, record.signOutTime)
  const recordDate = signInAt || signOutAt || parseIsoDate(record.timestamp)
  if (!recordDate) {
    return null
  }

  const durationMinutes = getDurationMinutes(record, signInAt, signOutAt)
  const scheduleStart = signInAt ? buildScheduledDate(signInAt, workSettings.workdayStartTime) : null
  const scheduleEnd = signInAt ? buildScheduledDate(signInAt, workSettings.workdayEndTime) : null
  const lateMinutes =
    signInAt && scheduleStart
      ? Math.max(0, diffMinutes(scheduleStart, signInAt) - Number(workSettings.lateGraceMinutes || 0))
      : 0
  const earlyLeaveMinutes = signOutAt && scheduleEnd ? Math.max(0, diffMinutes(signOutAt, scheduleEnd)) : 0
  const overtimeMinutes = signOutAt && scheduleEnd ? Math.max(0, diffMinutes(scheduleEnd, signOutAt)) : 0
  const isOpen = record.status === "open" || Boolean(signInAt && !signOutAt)

  const statusItems = []
  if (isOpen) {
    statusItems.push("Open sign-in")
  }
  if (!signInAt && signOutAt) {
    statusItems.push("Sign-out only")
  }
  if (lateMinutes > 0) {
    statusItems.push("Late")
  }
  if (earlyLeaveMinutes > 0) {
    statusItems.push("Early leave")
  }
  if (overtimeMinutes > 0) {
    statusItems.push("Overtime")
  }
  if (!statusItems.length) {
    statusItems.push("On time")
  }

  return {
    ...record,
    employeeId,
    employeeName,
    username: employeeName,
    recordDate,
    signInAt,
    signOutAt,
    durationMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeMinutes,
    isOpen,
    statusItems
  }
}

function buildMonthlySummaries(records) {
  const summaryMap = new Map()
  const scheduledDailyMinutes = getScheduledWorkMinutesPerDay()
  const monthlyWorkingDays = Math.max(1, Number(workSettings.monthlyWorkingDays || 26))

  employeeProfiles
    .filter((profile) => profile.active !== false)
    .forEach((profile) => {
      summaryMap.set(profile.id, {
        employeeId: profile.id,
        employeeName: profile.fullName,
        username: profile.username,
        monthlySalary: Number(profile.monthlySalary || 0),
        daysPresentSet: new Set(),
        totalMinutes: 0,
        lateDays: 0,
        lateMinutes: 0,
        earlyLeaveDays: 0,
        earlyLeaveMinutes: 0,
        overtimeMinutes: 0,
        missingSignOuts: 0
      })
    })

  records.forEach((record) => {
    const summary = summaryMap.get(record.employeeId) || {
      employeeId: record.employeeId,
      employeeName: record.employeeName,
      username: "",
      monthlySalary: 0,
      daysPresentSet: new Set(),
      totalMinutes: 0,
      lateDays: 0,
      lateMinutes: 0,
      earlyLeaveDays: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      missingSignOuts: 0
    }

    summary.employeeName = record.employeeName
    summary.daysPresentSet.add(formatDateKey(record.recordDate))
    summary.totalMinutes += record.durationMinutes
    summary.lateMinutes += record.lateMinutes
    summary.earlyLeaveMinutes += record.earlyLeaveMinutes
    summary.overtimeMinutes += record.overtimeMinutes
    if (record.lateMinutes > 0) {
      summary.lateDays += 1
    }
    if (record.earlyLeaveMinutes > 0) {
      summary.earlyLeaveDays += 1
    }
    if (record.isOpen) {
      summary.missingSignOuts += 1
    }

    summaryMap.set(summary.employeeId, summary)
  })

  return Array.from(summaryMap.values())
    .map((summary) => {
      const daysPresent = summary.daysPresentSet.size
      const absentDays = Math.max(0, monthlyWorkingDays - daysPresent)
      const salaryPerDay = monthlyWorkingDays > 0 ? summary.monthlySalary / monthlyWorkingDays : 0
      const salaryPerMinute = scheduledDailyMinutes > 0 ? salaryPerDay / scheduledDailyMinutes : 0
      const absenceDeduction = absentDays * salaryPerDay
      const lateDeduction = summary.lateMinutes * salaryPerMinute
      const earlyLeaveDeduction = summary.earlyLeaveMinutes * salaryPerMinute
      const overtimePay = summary.overtimeMinutes * salaryPerMinute
      const totalDeductions = absenceDeduction + lateDeduction + earlyLeaveDeduction
      const netSalary = Math.max(0, summary.monthlySalary - totalDeductions + overtimePay)
      return {
        ...summary,
        daysPresent,
        absentDays,
        averageMinutesPerDay: daysPresent ? Math.round(summary.totalMinutes / daysPresent) : 0,
        salaryPerDay,
        salaryPerMinute,
        absenceDeduction,
        lateDeduction,
        earlyLeaveDeduction,
        overtimePay,
        totalDeductions,
        netSalary
      }
    })
    .sort((first, second) => second.totalMinutes - first.totalMinutes || first.employeeName.localeCompare(second.employeeName, "ar"))
}

function buildEmployeeDetail(records, summaries) {
  const selectedEmployeeId = employeeFilter.value
  if (!selectedEmployeeId) {
    return null
  }

  const employeeSummary = summaries.find((summary) => summary.employeeId === selectedEmployeeId)
  const selectedProfile = employeeProfiles.find((profile) => profile.id === selectedEmployeeId)
  if (!employeeSummary) {
    return selectedProfile
      ? {
          employeeId: selectedProfile.id,
          employeeName: selectedProfile.fullName,
          daysPresent: 0,
          totalMinutes: 0,
          lateMinutes: 0,
          missingSignOuts: 0,
          records: []
        }
      : null
  }

  return {
    employeeId: employeeSummary.employeeId,
    employeeName: employeeSummary.employeeName,
    daysPresent: employeeSummary.daysPresent,
    totalMinutes: employeeSummary.totalMinutes,
    lateMinutes: employeeSummary.lateMinutes,
    missingSignOuts: employeeSummary.missingSignOuts,
    records: records
      .filter((record) => record.employeeId === selectedEmployeeId)
      .sort((first, second) => second.recordDate.getTime() - first.recordDate.getTime())
  }
}

function buildTodayOverview(records) {
  const todayKey = formatDateKey(new Date())
  const presentTodayMap = new Map()
  const lateToday = []
  const currentSignedIn = []
  const missingSignOuts = []

  records.forEach((record) => {
    if (record.signInAt && formatDateKey(record.signInAt) === todayKey) {
      presentTodayMap.set(record.employeeId, record.employeeName)
      if (record.lateMinutes > 0) {
        lateToday.push(record)
      }
    }

    if (record.isOpen) {
      currentSignedIn.push(record)
      missingSignOuts.push(record)
    }
  })

  const absentToday = employeeProfiles
    .filter((profile) => profile.active !== false)
    .filter((profile) => !presentTodayMap.has(profile.id))

  return {
    todayKey,
    presentTodayCount: presentTodayMap.size,
    lateToday,
    currentSignedIn,
    missingSignOuts,
    absentToday
  }
}

function getFilteredRecords(monthRecords) {
  const searchValue = searchInput.value.trim().toLowerCase()
  const selectedEmployeeId = employeeFilter.value
  const selectedAction = actionFilter.value

  return monthRecords
    .filter((record) => {
      const matchesSearch = record.employeeName.toLowerCase().includes(searchValue)
      const matchesEmployee = !selectedEmployeeId || record.employeeId === selectedEmployeeId
      const matchesAction =
        selectedAction === "all" ||
        (selectedAction === "signin" && record.isOpen) ||
        (selectedAction === "signout" && !record.isOpen)
      return matchesSearch && matchesEmployee && matchesAction
    })
    .sort((first, second) => second.recordDate.getTime() - first.recordDate.getTime())
}

function renderSummaryCards(selectedMonthKey, monthRecords, todayOverview) {
  totalRecords.textContent = String(monthRecords.length)
  currentMonthLabel.textContent = formatMonthLabel(selectedMonthKey)
  currentSignedInCount.textContent = String(todayOverview.currentSignedIn.length)
  presentTodayCount.textContent = String(todayOverview.presentTodayCount)
  lateTodayCount.textContent = String(todayOverview.lateToday.length)
  absentTodayCount.textContent = String(todayOverview.absentToday.length)
  missingSignOutCount.textContent = String(todayOverview.missingSignOuts.length)
}

function renderTodayOverview(todayOverview) {
  todayChips.innerHTML = [
    renderChip(`Present today: ${todayOverview.presentTodayCount}`),
    renderChip(`Late today: ${todayOverview.lateToday.length}`),
    renderChip(`Currently signed in: ${todayOverview.currentSignedIn.length}`),
    renderChip(`Absent today: ${todayOverview.absentToday.length}`)
  ].join("")

  currentSignedInList.innerHTML = renderInsightItems(
    todayOverview.currentSignedIn.map((record) => ({
      title: record.employeeName,
      subtitle: `Signed in at ${record.signInTime || "-"}`
    })),
    "No employee is currently signed in."
  )

  const attentionItems = [
    ...todayOverview.lateToday.map((record) => ({
      title: `${record.employeeName} is late`,
      subtitle: `${formatMinutesAsDuration(record.lateMinutes)} late today`
    })),
    ...todayOverview.missingSignOuts.map((record) => ({
      title: `${record.employeeName} still needs sign-out`,
      subtitle: `Signed in on ${record.signInDate} at ${record.signInTime}`
    }))
  ]

  attentionList.innerHTML = renderInsightItems(attentionItems, "No late arrivals or missing sign-outs right now.")
  absentTodayList.innerHTML = renderInsightItems(
    todayOverview.absentToday.map((profile) => ({
      title: profile.fullName,
      subtitle: "No attendance record for today"
    })),
    "No one is absent today."
  )
}

function renderMonthlySummary(summaries) {
  if (!summaries.length) {
    monthlySummaryBody.innerHTML = ""
    monthlySummaryEmpty.classList.remove("d-none")
    return
  }

  monthlySummaryEmpty.classList.add("d-none")
  monthlySummaryBody.innerHTML = summaries
    .map((summary) => {
      const isSelected = employeeFilter.value === summary.employeeId
      return `
        <tr class="${isSelected ? "table-active" : ""}">
          <td>
            <button type="button" class="summary-link" data-summary-employee="${escapeHtml(summary.employeeId)}">
              ${escapeHtml(summary.employeeName)}
            </button>
          </td>
          <td>${escapeHtml(formatCurrency(summary.monthlySalary))}</td>
          <td>${summary.daysPresent}</td>
          <td>${summary.absentDays}</td>
          <td>${escapeHtml(formatMinutesAsDuration(summary.totalMinutes))}</td>
          <td>${escapeHtml(formatMinutesAsDuration(summary.averageMinutesPerDay))}</td>
          <td>${summary.lateDays}</td>
          <td>${summary.earlyLeaveDays}</td>
          <td>${escapeHtml(formatMinutesAsDuration(summary.overtimeMinutes))}</td>
          <td>${summary.missingSignOuts}</td>
          <td>${escapeHtml(formatCurrency(summary.totalDeductions))}</td>
          <td>${escapeHtml(formatCurrency(summary.overtimePay))}</td>
          <td>${escapeHtml(formatCurrency(summary.netSalary))}</td>
        </tr>
      `
    })
    .join("")

  monthlySummaryBody.querySelectorAll("[data-summary-employee]").forEach((button) => {
    button.addEventListener("click", () => {
      employeeFilter.value = button.dataset.summaryEmployee
      deriveAndRender()
    })
  })
}

function renderEmployeeDetail(detailSummary) {
  if (!detailSummary) {
    employeeDetailTitle.textContent = "Employee Detail"
    detailDaysPresent.textContent = "0"
    detailTotalHours.textContent = "0h 0m"
    detailLateMinutes.textContent = "0m"
    detailMissingSignOuts.textContent = "0"
    employeeDetailBody.innerHTML = ""
    employeeDetailEmpty.classList.remove("d-none")
    return
  }

  employeeDetailTitle.textContent = detailSummary.employeeName
  detailDaysPresent.textContent = String(detailSummary.daysPresent)
  detailTotalHours.textContent = formatMinutesAsDuration(detailSummary.totalMinutes)
  detailLateMinutes.textContent = formatMinutesAsDuration(detailSummary.lateMinutes)
  detailMissingSignOuts.textContent = String(detailSummary.missingSignOuts)
  employeeDetailEmpty.classList.toggle("d-none", detailSummary.records.length > 0)

  employeeDetailBody.innerHTML = detailSummary.records
    .map((record) => {
      return `
        <tr>
          <td>${escapeHtml(record.signInDate !== "-" ? record.signInDate : record.signOutDate)}</td>
          <td>${escapeHtml(record.signInTime)}</td>
          <td>${escapeHtml(record.signOutTime)}</td>
          <td>${escapeHtml(formatMinutesAsDuration(record.durationMinutes))}</td>
          <td>${escapeHtml(formatMinutesAsDuration(record.lateMinutes))}</td>
          <td>${escapeHtml(formatMinutesAsDuration(record.earlyLeaveMinutes))}</td>
          <td>${escapeHtml(formatMinutesAsDuration(record.overtimeMinutes))}</td>
          <td>${renderStatusList(record.statusItems)}</td>
        </tr>
      `
    })
    .join("")
}

function renderRecords(records) {
  if (!records.length) {
    recordsTableBody.innerHTML = ""
    emptyState.classList.remove("d-none")
    syncSelectAllCheckbox([])
    return
  }

  emptyState.classList.add("d-none")
  recordsTableBody.innerHTML = records
    .map((record) => {
      const isSelected = record.recordId && selectedRecordIds.has(record.recordId)
      return `
        <tr>
          <td>
            <input
              type="checkbox"
              class="form-check-input record-select-checkbox"
              data-record-id="${escapeHtml(record.recordId)}"
              ${isSelected ? "checked" : ""}
              aria-label="Select attendance record for ${escapeHtml(record.employeeName)}"
            >
          </td>
          <td class="fw-semibold">${escapeHtml(record.employeeName)}</td>
          <td>${escapeHtml(record.signInDate)}</td>
          <td>${escapeHtml(record.signInTime)}</td>
          <td>${renderPhotoCell(record.signInPhoto, record.employeeName, "sign-in")}</td>
          <td>${escapeHtml(record.signOutDate)}</td>
          <td>${escapeHtml(record.signOutTime)}</td>
          <td>${renderPhotoCell(record.signOutPhoto, record.employeeName, "sign-out")}</td>
          <td>${escapeHtml(formatMinutesAsDuration(record.durationMinutes))}</td>
          <td class="timestamp-cell">${escapeHtml(record.timestamp || "-")}</td>
        </tr>
      `
    })
    .join("")

  recordsTableBody.querySelectorAll(".record-select-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const recordId = String(checkbox.dataset.recordId || "").trim()
      if (!recordId) {
        return
      }

      if (checkbox.checked) {
        selectedRecordIds.add(recordId)
      } else {
        selectedRecordIds.delete(recordId)
      }

      syncSelectAllCheckbox(records)
    })
  })

  syncSelectAllCheckbox(records)
}

function renderAuditLog() {
  auditLogList.innerHTML = auditLogEntries.length
    ? auditLogEntries
        .map((item) => {
          const formatted = formatTimestamp(item.timestamp)
          return `
            <div class="audit-log-item">
              <strong>${escapeHtml(item.action)}</strong>
              <p class="mb-1">${escapeHtml(item.details)}</p>
              <span class="timestamp-cell">${escapeHtml(formatted.dateText)} ${escapeHtml(formatted.timeText)}</span>
            </div>
          `
        })
        .join("")
    : '<div class="empty-state">No admin changes have been logged yet.</div>'
}

function exportDashboardWorkbook() {
  if (typeof XLSX === "undefined") {
    setStatus("Excel export is not available right now. Please refresh the page and try again.")
    return
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildRecordExportRows(currentView.filteredRecords)), "Records")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildSummaryExportRows(currentView.summaries)), "Monthly Summary")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildPayrollExportRows(currentView.summaries)), "Payroll Report")

  if (currentView.detailSummary) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(buildDetailExportRows(currentView.detailSummary)),
      "Employee Detail"
    )
  }

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildAuditLogExportRows()), "Audit Log")
  XLSX.writeFile(workbook, buildExportFilename("dashboard"))
  setStatus(`Exported dashboard workbook with ${currentView.filteredRecords.length} records.`)
}

function exportMonthlySummaryWorkbook() {
  if (typeof XLSX === "undefined") {
    setStatus("Excel export is not available right now. Please refresh the page and try again.")
    return
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildSummaryExportRows(currentView.summaries)), "Monthly Summary")
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildPayrollExportRows(currentView.summaries)), "Payroll Report")
  XLSX.writeFile(workbook, buildExportFilename("monthly-summary"))
  setStatus(`Exported ${currentView.summaries.length} employee summaries to Excel.`)
}

function buildRecordExportRows(records) {
  return records.map((record) => ({
    "Employee Name": record.employeeName,
    "Sign-in Date": record.signInDate,
    "Sign-in Time": record.signInTime,
    "Sign-in Photo": record.signInPhoto,
    "Sign-out Date": record.signOutDate,
    "Sign-out Time": record.signOutTime,
    "Sign-out Photo": record.signOutPhoto,
    "Worked Duration": formatMinutesAsDuration(record.durationMinutes),
    "Late Duration": formatMinutesAsDuration(record.lateMinutes),
    "Early Leave": formatMinutesAsDuration(record.earlyLeaveMinutes),
    Overtime: formatMinutesAsDuration(record.overtimeMinutes),
    Status: record.statusItems.join(", "),
    Timestamp: record.timestamp || "-"
  }))
}

function buildSummaryExportRows(summaries) {
  return summaries.map((summary) => ({
    Employee: summary.employeeName,
    "Monthly Salary": roundCurrency(summary.monthlySalary),
    "Days Present": summary.daysPresent,
    "Absent Days": summary.absentDays,
    "Total Hours": formatMinutesAsDuration(summary.totalMinutes),
    "Average Per Day": formatMinutesAsDuration(summary.averageMinutesPerDay),
    "Late Days": summary.lateDays,
    "Late Minutes": formatMinutesAsDuration(summary.lateMinutes),
    "Early Leave Days": summary.earlyLeaveDays,
    "Early Leave Minutes": formatMinutesAsDuration(summary.earlyLeaveMinutes),
    Overtime: formatMinutesAsDuration(summary.overtimeMinutes),
    "Missing Sign-outs": summary.missingSignOuts,
    "Absence Deduction": roundCurrency(summary.absenceDeduction),
    "Late Deduction": roundCurrency(summary.lateDeduction),
    "Early Leave Deduction": roundCurrency(summary.earlyLeaveDeduction),
    "Total Deductions": roundCurrency(summary.totalDeductions),
    "Overtime Pay": roundCurrency(summary.overtimePay),
    "Net Salary": roundCurrency(summary.netSalary)
  }))
}

function buildPayrollExportRows(summaries) {
  return summaries.map((summary) => ({
    Employee: summary.employeeName,
    Username: summary.username || "",
    "Monthly Salary": roundCurrency(summary.monthlySalary),
    "Configured Workdays": Number(workSettings.monthlyWorkingDays || 26),
    "Days Present": summary.daysPresent,
    "Absent Days": summary.absentDays,
    "Salary Per Day": roundCurrency(summary.salaryPerDay),
    "Late Minutes": summary.lateMinutes,
    "Early Leave Minutes": summary.earlyLeaveMinutes,
    "Overtime Minutes": summary.overtimeMinutes,
    "Absence Deduction": roundCurrency(summary.absenceDeduction),
    "Late Deduction": roundCurrency(summary.lateDeduction),
    "Early Leave Deduction": roundCurrency(summary.earlyLeaveDeduction),
    "Total Deductions": roundCurrency(summary.totalDeductions),
    "Overtime Pay": roundCurrency(summary.overtimePay),
    "Net Salary": roundCurrency(summary.netSalary)
  }))
}

function buildDetailExportRows(detailSummary) {
  return detailSummary.records.map((record) => ({
    Employee: detailSummary.employeeName,
    Date: record.signInDate !== "-" ? record.signInDate : record.signOutDate,
    "Sign-in": record.signInTime,
    "Sign-out": record.signOutTime,
    "Worked Duration": formatMinutesAsDuration(record.durationMinutes),
    Late: formatMinutesAsDuration(record.lateMinutes),
    "Early Leave": formatMinutesAsDuration(record.earlyLeaveMinutes),
    Overtime: formatMinutesAsDuration(record.overtimeMinutes),
    Status: record.statusItems.join(", ")
  }))
}

function buildAuditLogExportRows() {
  return auditLogEntries.map((item) => ({
    Action: item.action,
    Details: item.details,
    Timestamp: item.timestamp
  }))
}

function buildExportFilename(type) {
  return `centers-${type}-${getSelectedMonthKey()}.xlsx`
}

function parseDateTime(dateText, timeText) {
  const safeDateText = String(dateText || "").trim()
  if (!safeDateText || safeDateText === "-") {
    return null
  }

  const dateMatch = safeDateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!dateMatch) {
    return null
  }

  const day = Number(dateMatch[1])
  const month = Number(dateMatch[2]) - 1
  const year = Number(dateMatch[3])
  let hours = 0
  let minutes = 0
  let seconds = 0

  const safeTimeText = String(timeText || "").trim()
  if (safeTimeText && safeTimeText !== "-") {
    const timeMatch = safeTimeText.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i)
    if (timeMatch) {
      hours = Number(timeMatch[1])
      minutes = Number(timeMatch[2])
      seconds = Number(timeMatch[3] || 0)
      const meridiem = String(timeMatch[4] || "").toLowerCase()
      if (meridiem === "pm" && hours < 12) {
        hours += 12
      }
      if (meridiem === "am" && hours === 12) {
        hours = 0
      }
    }
  }

  const parsed = new Date(year, month, day, hours, minutes, seconds)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseIsoDate(timestamp) {
  if (!timestamp) {
    return null
  }

  const parsed = new Date(timestamp)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function buildScheduledDate(referenceDate, timeValue) {
  const timeMatch = String(timeValue || "").match(/^(\d{1,2}):(\d{2})$/)
  if (!timeMatch) {
    return null
  }

  const result = new Date(referenceDate)
  result.setHours(Number(timeMatch[1]), Number(timeMatch[2]), 0, 0)
  return result
}

function diffMinutes(startDate, endDate) {
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000))
}

function getDurationMinutes(record, signInAt, signOutAt) {
  if (signInAt && signOutAt) {
    return Math.max(0, Math.round((signOutAt.getTime() - signInAt.getTime()) / 60000))
  }

  return parseDurationMinutes(record.duration)
}

function parseDurationMinutes(value) {
  const text = String(value || "").trim().toLowerCase()
  if (!text || text === "-") {
    return 0
  }

  const hourMatch = text.match(/(\d+)\s*h/)
  const minuteMatch = text.match(/(\d+)\s*m/)
  const hours = hourMatch ? Number(hourMatch[1]) : 0
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0
  return hours * 60 + minutes
}

function getScheduledWorkMinutesPerDay() {
  const startTime = String(workSettings.workdayStartTime || "")
  const endTime = String(workSettings.workdayEndTime || "")
  const startMatch = startTime.match(/^(\d{1,2}):(\d{2})$/)
  const endMatch = endTime.match(/^(\d{1,2}):(\d{2})$/)

  if (!startMatch || !endMatch) {
    return 8 * 60
  }

  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2])
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2])
  const diff = endMinutes - startMinutes
  return diff > 0 ? diff : 8 * 60
}

function formatMinutesAsDuration(totalMinutes) {
  const safeMinutes = Math.max(0, Math.round(Number(totalMinutes || 0)))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60

  if (hours === 0) {
    return `${minutes}m`
  }

  return `${hours}h ${minutes}m`
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function formatCurrency(value) {
  return `${roundCurrency(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} EGP`
}

function buildMonthKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

function getRecordMonthKey(record) {
  return buildMonthKey(record.recordDate)
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number)
  const date = new Date(year, (month || 1) - 1, 1)
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: timezone
  }).format(date)
}

function formatDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone
  }).format(date)
}

function formatTimestamp(timestamp) {
  const fallback = {
    dateText: "-",
    timeText: "-"
  }

  const parsedDate = parseIsoDate(timestamp)
  if (!parsedDate) {
    return fallback
  }

  return {
    dateText: new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: timezone
    }).format(parsedDate),
    timeText: new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: timezone
    }).format(parsedDate)
  }
}

function renderPhotoCell(photoValue, username, label) {
  if (!photoValue || photoValue === "-") {
    return '<div class="photo-placeholder">No Photo</div>'
  }

  return `<img src="${escapeHtml(photoValue)}" alt="${escapeHtml(label)} photo for ${escapeHtml(username)}" class="admin-photo">`
}

function renderStatusList(statusItems) {
  return statusItems
    .map((item) => renderStatusBadge(item, item === "On time" ? "success" : "warning"))
    .join("")
}

function renderStatusBadge(label, variant) {
  return `<span class="status-badge status-${escapeHtml(variant)}">${escapeHtml(label)}</span>`
}

function renderChip(label) {
  return `<span class="insight-chip">${escapeHtml(label)}</span>`
}

function renderInsightItems(items, emptyMessage) {
  if (!items.length) {
    return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`
  }

  return items
    .map((item) => {
      return `
        <div class="insight-item">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.subtitle)}</span>
        </div>
      `
    })
    .join("")
}

function setStatus(message) {
  statusMessage.textContent = message
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
