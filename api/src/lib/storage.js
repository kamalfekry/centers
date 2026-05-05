const crypto = require("node:crypto")
const { TableClient } = require("@azure/data-tables")
const {
  BlobServiceClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters
} = require("@azure/storage-blob")
const { getConfig } = require("./config")
const { defaultEmployeeProfiles, defaultWorkSettings } = require("./defaults")

let storageStatePromise

function getTableClients() {
  const config = getConfig()
  return {
    attendance: TableClient.fromConnectionString(config.storageConnectionString, config.tables.attendance),
    employees: TableClient.fromConnectionString(config.storageConnectionString, config.tables.employees),
    settings: TableClient.fromConnectionString(config.storageConnectionString, config.tables.settings),
    auditLog: TableClient.fromConnectionString(config.storageConnectionString, config.tables.auditLog)
  }
}

function getContainerClient() {
  const config = getConfig()
  const blobServiceClient = BlobServiceClient.fromConnectionString(config.storageConnectionString)
  return blobServiceClient.getContainerClient(config.photosContainerName)
}

function getBlobSharedKeyCredential() {
  const { storageConnectionString } = getConfig()
  const connectionParts = Object.fromEntries(
    storageConnectionString.split(";").map((segment) => {
      const [key, ...rest] = segment.split("=")
      return [key, rest.join("=")]
    })
  )

  if (!connectionParts.AccountName || !connectionParts.AccountKey) {
    return null
  }

  return new StorageSharedKeyCredential(connectionParts.AccountName, connectionParts.AccountKey)
}

async function ensureStorage() {
  if (!storageStatePromise) {
    storageStatePromise = initializeStorage()
  }

  return storageStatePromise
}

async function initializeStorage() {
  const tables = getTableClients()
  await Promise.all(
    Object.values(tables).map(async (client) => {
      try {
        await client.createTable()
      } catch (error) {
        if (error.statusCode !== 409) {
          throw error
        }
      }
    })
  )

  const containerClient = getContainerClient()
  await containerClient.createIfNotExists()

  await seedEmployeesTable(tables.employees)
  await seedSettingsTable(tables.settings)

  return {
    tables,
    containerClient
  }
}

async function seedEmployeesTable(client) {
  let hasEmployees = false
  for await (const _entity of client.listEntities()) {
    hasEmployees = true
    break
  }

  if (!hasEmployees) {
    await Promise.all(defaultEmployeeProfiles.map((employee) => upsertEmployee(employee, client)))
  }
}

async function seedSettingsTable(client) {
  const existingSetting = await getEntity(client, "settings", "attendance")
  if (!existingSetting) {
    await client.upsertEntity({
      partitionKey: "settings",
      rowKey: "attendance",
      ...defaultWorkSettings
    })
  }
}

async function getEntity(client, partitionKey, rowKey) {
  try {
    return await client.getEntity(partitionKey, rowKey)
  } catch (error) {
    if (error.statusCode === 404) {
      return null
    }

    throw error
  }
}

function createEmployeeId(fullName) {
  const normalizedName = String(fullName || "employee")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

  return `${normalizedName || "employee"}-${Date.now()}`
}

function createRecordId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`
}

function buildMonthKeyFromTimestamp(timestamp) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function parseRecordId(recordId) {
  const [partitionKey, ...rowKeyParts] = String(recordId || "").split("__")
  return {
    partitionKey,
    rowKey: rowKeyParts.join("__")
  }
}

function normalizeEmployee(employee) {
  return {
    id: String(employee.id || createEmployeeId(employee.fullName || employee.username || "employee")),
    username: String(employee.username || "").trim(),
    fullName: String(employee.fullName || employee.username || "").trim(),
    active: employee.active !== false,
    monthlySalary: Math.max(0, Number(employee.monthlySalary || 0)),
    notes: String(employee.notes || "").trim()
  }
}

async function listEmployees() {
  const { tables } = await ensureStorage()
  const employees = []
  for await (const entity of tables.employees.listEntities()) {
    employees.push({
      id: entity.rowKey,
      username: entity.username,
      fullName: entity.fullName,
      active: entity.active !== false,
      monthlySalary: Math.max(0, Number(entity.monthlySalary || 0)),
      notes: entity.notes || ""
    })
  }

  return employees.sort((first, second) => first.fullName.localeCompare(second.fullName, "ar"))
}

async function upsertEmployee(employee, clientOverride) {
  const normalizedEmployee = normalizeEmployee(employee)
  const client = clientOverride || (await ensureStorage()).tables.employees

  await client.upsertEntity({
    partitionKey: "employee",
    rowKey: normalizedEmployee.id,
    username: normalizedEmployee.username,
    fullName: normalizedEmployee.fullName,
    active: normalizedEmployee.active,
    monthlySalary: normalizedEmployee.monthlySalary,
    notes: normalizedEmployee.notes
  }, "Replace")

  return normalizedEmployee
}

async function deleteEmployee(employeeId) {
  const { tables } = await ensureStorage()
  await tables.employees.deleteEntity("employee", employeeId)
}

async function replaceEmployeesWithDefaults() {
  const { tables } = await ensureStorage()
  const existingEmployees = []
  for await (const entity of tables.employees.listEntities()) {
    existingEmployees.push(entity)
  }

  for (const entity of existingEmployees) {
    await tables.employees.deleteEntity(entity.partitionKey, entity.rowKey)
  }

  await Promise.all(defaultEmployeeProfiles.map((employee) => upsertEmployee(employee, tables.employees)))
  return listEmployees()
}

async function getWorkSettings() {
  const { tables } = await ensureStorage()
  const entity = await getEntity(tables.settings, "settings", "attendance")
  return {
    workdayStartTime: String(entity?.workdayStartTime || defaultWorkSettings.workdayStartTime),
    workdayEndTime: String(entity?.workdayEndTime || defaultWorkSettings.workdayEndTime),
    lateGraceMinutes: Number(entity?.lateGraceMinutes ?? defaultWorkSettings.lateGraceMinutes),
    monthlyWorkingDays: Math.max(1, Number(entity?.monthlyWorkingDays ?? defaultWorkSettings.monthlyWorkingDays ?? 26))
  }
}

async function listLeaveRecords() {
  const { tables } = await ensureStorage()
  const leaves = []
  for await (const entity of tables.settings.listEntities({
    queryOptions: {
      filter: "PartitionKey eq 'leave'"
    }
  })) {
    leaves.push({
      id: entity.rowKey,
      employeeId: entity.employeeId || "",
      employeeName: entity.employeeName || "",
      date: entity.date || "",
      monthKey: entity.monthKey || "",
      type: entity.type || "Paid Leave",
      notes: entity.notes || "",
      createdAt: entity.createdAt || ""
    })
  }

  return leaves.sort((first, second) => String(second.date).localeCompare(String(first.date)))
}

async function upsertLeaveRecord(leave) {
  const { tables } = await ensureStorage()
  const normalizedLeave = {
    id: String(leave.id || createRecordId("leave")),
    employeeId: String(leave.employeeId || "").trim(),
    employeeName: String(leave.employeeName || "").trim(),
    date: String(leave.date || "").trim(),
    type: String(leave.type || "Paid Leave").trim(),
    notes: String(leave.notes || "").trim(),
    createdAt: String(leave.createdAt || new Date().toISOString())
  }

  normalizedLeave.monthKey = normalizedLeave.date.slice(0, 7)
  await assertMonthUnlocked(normalizedLeave.monthKey)
  await tables.settings.upsertEntity({
    partitionKey: "leave",
    rowKey: normalizedLeave.id,
    ...normalizedLeave
  }, "Replace")

  return normalizedLeave
}

async function deleteLeaveRecord(leaveId) {
  const { tables } = await ensureStorage()
  const entity = await tables.settings.getEntity("leave", leaveId)
  await assertMonthUnlocked(entity.monthKey || "")
  await tables.settings.deleteEntity("leave", leaveId)
}

async function listPayrollAdjustments() {
  const { tables } = await ensureStorage()
  const adjustments = []
  for await (const entity of tables.settings.listEntities({
    queryOptions: {
      filter: "PartitionKey eq 'payrollAdjustment'"
    }
  })) {
    adjustments.push({
      id: entity.rowKey,
      employeeId: entity.employeeId || "",
      employeeName: entity.employeeName || "",
      monthKey: entity.monthKey || "",
      bonus: Math.max(0, Number(entity.bonus || 0)),
      penalty: Math.max(0, Number(entity.penalty || 0)),
      advance: Math.max(0, Number(entity.advance || 0)),
      notes: entity.notes || "",
      updatedAt: entity.updatedAt || ""
    })
  }

  return adjustments.sort((first, second) => String(second.monthKey).localeCompare(String(first.monthKey)))
}

async function upsertPayrollAdjustment(adjustment) {
  const { tables } = await ensureStorage()
  const normalizedAdjustment = {
    id: String(adjustment.id || `${adjustment.employeeId}_${adjustment.monthKey}`),
    employeeId: String(adjustment.employeeId || "").trim(),
    employeeName: String(adjustment.employeeName || "").trim(),
    monthKey: String(adjustment.monthKey || "").trim(),
    bonus: Math.max(0, Number(adjustment.bonus || 0)),
    penalty: Math.max(0, Number(adjustment.penalty || 0)),
    advance: Math.max(0, Number(adjustment.advance || 0)),
    notes: String(adjustment.notes || "").trim(),
    updatedAt: new Date().toISOString()
  }

  await assertMonthUnlocked(normalizedAdjustment.monthKey)
  await tables.settings.upsertEntity({
    partitionKey: "payrollAdjustment",
    rowKey: normalizedAdjustment.id,
    ...normalizedAdjustment
  }, "Replace")

  return normalizedAdjustment
}

async function deletePayrollAdjustment(adjustmentId) {
  const { tables } = await ensureStorage()
  const entity = await tables.settings.getEntity("payrollAdjustment", adjustmentId)
  await assertMonthUnlocked(entity.monthKey || "")
  await tables.settings.deleteEntity("payrollAdjustment", adjustmentId)
}

async function listPayrollLocks() {
  const { tables } = await ensureStorage()
  const locks = []
  for await (const entity of tables.settings.listEntities({
    queryOptions: {
      filter: "PartitionKey eq 'payrollLock'"
    }
  })) {
    locks.push({
      monthKey: entity.rowKey,
      locked: entity.locked !== false,
      lockedAt: entity.lockedAt || "",
      lockedBy: entity.lockedBy || "Admin"
    })
  }

  return locks.sort((first, second) => String(second.monthKey).localeCompare(String(first.monthKey)))
}

async function setPayrollLock(monthKey, locked) {
  const { tables } = await ensureStorage()
  const normalizedMonthKey = String(monthKey || "").trim()
  await tables.settings.upsertEntity({
    partitionKey: "payrollLock",
    rowKey: normalizedMonthKey,
    locked: Boolean(locked),
    lockedAt: new Date().toISOString(),
    lockedBy: "Admin"
  }, "Replace")

  return {
    monthKey: normalizedMonthKey,
    locked: Boolean(locked)
  }
}

async function isMonthLocked(monthKey) {
  const { tables } = await ensureStorage()
  const entity = await getEntity(tables.settings, "payrollLock", monthKey)
  return entity?.locked !== false && Boolean(entity)
}

async function assertMonthUnlocked(monthKey) {
  if (monthKey && await isMonthLocked(monthKey)) {
    throw new Error(`Month ${monthKey} is payroll locked.`)
  }
}

async function saveWorkSettings(settings) {
  const { tables } = await ensureStorage()
  const normalizedSettings = {
    workdayStartTime: String(settings.workdayStartTime || defaultWorkSettings.workdayStartTime),
    workdayEndTime: String(settings.workdayEndTime || defaultWorkSettings.workdayEndTime),
    lateGraceMinutes: Number(settings.lateGraceMinutes ?? defaultWorkSettings.lateGraceMinutes),
    monthlyWorkingDays: Math.max(1, Number(settings.monthlyWorkingDays ?? defaultWorkSettings.monthlyWorkingDays ?? 26))
  }

  await tables.settings.upsertEntity({
    partitionKey: "settings",
    rowKey: "attendance",
    ...normalizedSettings
  }, "Replace")

  return normalizedSettings
}

async function addAuditLogEntry(action, details) {
  const { tables } = await ensureStorage()
  const timestamp = new Date().toISOString()
  const rowKey = `${timestamp}_${crypto.randomBytes(4).toString("hex")}`

  await tables.auditLog.createEntity({
    partitionKey: "audit",
    rowKey,
    action: String(action || "updated"),
    details: String(details || ""),
    timestamp
  })
}

async function listAuditLog(limit = 200) {
  const { tables } = await ensureStorage()
  const entries = []
  for await (const entity of tables.auditLog.listEntities()) {
    entries.push({
      id: entity.rowKey,
      action: entity.action,
      details: entity.details,
      timestamp: entity.timestamp
    })
  }

  return entries
    .sort((first, second) => new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime())
    .slice(0, limit)
}

function parseDataUri(dataUri) {
  const matches = String(dataUri || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!matches) {
    throw new Error("Invalid image data format.")
  }

  return {
    mimeType: matches[1],
    buffer: Buffer.from(matches[2], "base64")
  }
}

async function uploadPhoto(dataUri, employeeId, action, timestamp) {
  if (!dataUri) {
    return {
      blobName: "",
      url: ""
    }
  }

  const { containerClient } = await ensureStorage()
  const { mimeType, buffer } = parseDataUri(dataUri)
  const extension = mimeType.split("/")[1] || "jpg"
  const sanitizedEmployeeId = String(employeeId || "employee").replace(/[^a-zA-Z0-9._-]/g, "_")
  const sanitizedAction = String(action || "attendance").replace(/[^a-zA-Z0-9._-]/g, "_")
  const sanitizedTimestamp = String(timestamp || new Date().toISOString()).replace(/[:.]/g, "-")
  const blobName = `${sanitizedEmployeeId}/${sanitizedAction}-${sanitizedTimestamp}.${extension}`
  const blobClient = containerClient.getBlockBlobClient(blobName)

  await blobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: mimeType
    }
  })

  return {
    blobName,
    url: buildBlobReadUrl(blobName)
  }
}

function buildBlobReadUrl(blobName) {
  if (!blobName) {
    return ""
  }

  const containerClient = getContainerClient()
  const blobClient = containerClient.getBlockBlobClient(blobName)
  const sharedKeyCredential = getBlobSharedKeyCredential()

  if (!sharedKeyCredential) {
    return blobClient.url
  }

  const sas = generateBlobSASQueryParameters(
    {
      containerName: containerClient.containerName,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: new Date(Date.now() - 5 * 60 * 1000),
      expiresOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    },
    sharedKeyCredential
  ).toString()

  return `${blobClient.url}?${sas}`
}

function normalizeAttendancePayload(payload) {
  return {
    employeeId: String(payload.employeeId || "").trim(),
    employeeName: String(payload.employeeName || payload.username || "").trim(),
    employeeUsername: String(payload.employeeUsername || "").trim(),
    signInDate: String(payload.signInDate || "").trim(),
    signInTime: String(payload.signInTime || "").trim(),
    signOutDate: String(payload.signOutDate || "").trim(),
    signOutTime: String(payload.signOutTime || "").trim(),
    duration: String(payload.duration || "").trim(),
    timestamp: String(payload.timestamp || new Date().toISOString()),
    signInPhoto: String(payload.signInPhoto || payload.photo || ""),
    signOutPhoto: String(payload.signOutPhoto || payload.photo || "")
  }
}

function calculateDurationText(startTimestamp, endTimestamp) {
  const startDate = new Date(startTimestamp)
  const endDate = new Date(endTimestamp)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return ""
  }

  const totalMinutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) {
    return `${minutes}m`
  }

  return `${hours}h ${minutes}m`
}

async function createAttendanceSignIn(payload) {
  const { tables } = await ensureStorage()
  const normalizedPayload = normalizeAttendancePayload(payload)
  await assertMonthUnlocked(buildMonthKeyFromTimestamp(normalizedPayload.timestamp))
  const signInPhoto = await uploadPhoto(
    normalizedPayload.signInPhoto,
    normalizedPayload.employeeId,
    "signin",
    normalizedPayload.timestamp
  )
  const rowKey = `${normalizedPayload.timestamp}_${crypto.randomBytes(4).toString("hex")}`

  await tables.attendance.createEntity({
    partitionKey: normalizedPayload.employeeId,
    rowKey,
    employeeId: normalizedPayload.employeeId,
    employeeName: normalizedPayload.employeeName,
    employeeUsername: normalizedPayload.employeeUsername,
    signInDate: normalizedPayload.signInDate,
    signInTime: normalizedPayload.signInTime,
    signInPhotoUrl: signInPhoto.url,
    signInPhotoBlobName: signInPhoto.blobName,
    signOutDate: "",
    signOutTime: "",
    signOutPhotoUrl: "",
    signOutPhotoBlobName: "",
    duration: "",
    timestamp: normalizedPayload.timestamp,
    signInTimestamp: normalizedPayload.timestamp,
    signOutTimestamp: "",
    status: "open"
  })

  return {
    rowKey,
    signInPhotoUrl: signInPhoto.url
  }
}

async function findOpenAttendanceRecord(employeeId) {
  const { tables } = await ensureStorage()
  const openRecords = []
  for await (const entity of tables.attendance.listEntities({
    queryOptions: {
      filter: `PartitionKey eq '${escapeODataValue(employeeId)}' and status eq 'open'`
    }
  })) {
    openRecords.push(entity)
  }

  openRecords.sort((first, second) => String(second.signInTimestamp || "").localeCompare(String(first.signInTimestamp || "")))
  return openRecords[0] || null
}

async function completeAttendanceSignOut(payload) {
  const { tables } = await ensureStorage()
  const normalizedPayload = normalizeAttendancePayload(payload)
  await assertMonthUnlocked(buildMonthKeyFromTimestamp(normalizedPayload.timestamp))
  const existingRecord = await findOpenAttendanceRecord(normalizedPayload.employeeId)
  const signOutPhoto = await uploadPhoto(
    normalizedPayload.signOutPhoto,
    normalizedPayload.employeeId,
    "signout",
    normalizedPayload.timestamp
  )

  if (!existingRecord) {
    const rowKey = `${normalizedPayload.timestamp}_${crypto.randomBytes(4).toString("hex")}`
    await tables.attendance.createEntity({
      partitionKey: normalizedPayload.employeeId,
      rowKey,
      employeeId: normalizedPayload.employeeId,
      employeeName: normalizedPayload.employeeName,
      employeeUsername: normalizedPayload.employeeUsername,
      signInDate: "",
      signInTime: "",
      signInPhotoUrl: "",
      signInPhotoBlobName: "",
      signOutDate: normalizedPayload.signOutDate,
      signOutTime: normalizedPayload.signOutTime,
      signOutPhotoUrl: signOutPhoto.url,
      signOutPhotoBlobName: signOutPhoto.blobName,
      duration: normalizedPayload.duration,
      timestamp: normalizedPayload.timestamp,
      signInTimestamp: "",
      signOutTimestamp: normalizedPayload.timestamp,
      status: "closed"
    })

    return {
      rowKey,
      signOutPhotoUrl: signOutPhoto.url,
      appendedFallback: true
    }
  }

  const calculatedDuration =
    normalizedPayload.duration ||
    calculateDurationText(existingRecord.signInTimestamp || existingRecord.timestamp, normalizedPayload.timestamp)

  await tables.attendance.upsertEntity({
    partitionKey: existingRecord.partitionKey,
    rowKey: existingRecord.rowKey,
    employeeId: existingRecord.employeeId,
    signInDate: existingRecord.signInDate,
    signInTime: existingRecord.signInTime,
    signInPhotoUrl: existingRecord.signInPhotoUrl,
    signInPhotoBlobName: existingRecord.signInPhotoBlobName || "",
    signInTimestamp: existingRecord.signInTimestamp,
    employeeName: normalizedPayload.employeeName,
    employeeUsername: normalizedPayload.employeeUsername,
    signOutDate: normalizedPayload.signOutDate,
    signOutTime: normalizedPayload.signOutTime,
    signOutPhotoUrl: signOutPhoto.url,
    signOutPhotoBlobName: signOutPhoto.blobName,
    duration: calculatedDuration,
    timestamp: normalizedPayload.timestamp,
    signOutTimestamp: normalizedPayload.timestamp,
    status: "closed"
  }, "Replace")

  return {
    rowKey: existingRecord.rowKey,
    signOutPhotoUrl: signOutPhoto.url,
    updatedRow: existingRecord.rowKey
  }
}

async function listAttendanceRecords() {
  const { tables } = await ensureStorage()
  const records = []
  for await (const entity of tables.attendance.listEntities()) {
    records.push({
      recordId: `${entity.partitionKey}__${entity.rowKey}`,
      employeeId: entity.employeeId,
      employeeName: entity.employeeName,
      employeeUsername: entity.employeeUsername,
      username: entity.employeeName,
      signInDate: entity.signInDate || "-",
      signInTime: entity.signInTime || "-",
      signInPhotoUrl: buildBlobReadUrl(entity.signInPhotoBlobName || "") || entity.signInPhotoUrl || "",
      signOutDate: entity.signOutDate || "-",
      signOutTime: entity.signOutTime || "-",
      signOutPhotoUrl: buildBlobReadUrl(entity.signOutPhotoBlobName || "") || entity.signOutPhotoUrl || "",
      duration: entity.duration || "-",
      timestamp: entity.timestamp || "",
      signInTimestamp: entity.signInTimestamp || "",
      signOutTimestamp: entity.signOutTimestamp || "",
      status: entity.status || "closed"
    })
  }

  return records.sort((first, second) => new Date(second.timestamp).getTime() - new Date(first.timestamp).getTime())
}

async function listOpenAttendanceEmployeeIds() {
  const { tables } = await ensureStorage()
  const employeeIds = new Set()
  for await (const entity of tables.attendance.listEntities({
    queryOptions: {
      filter: "status eq 'open'"
    }
  })) {
    if (entity.employeeId) {
      employeeIds.add(entity.employeeId)
    }
  }

  return Array.from(employeeIds)
}

async function deleteAttendanceRecordsBefore(cutoffIso) {
  const { tables } = await ensureStorage()
  const cutoffDate = new Date(cutoffIso)
  if (Number.isNaN(cutoffDate.getTime())) {
    throw new Error("Invalid cutoff date.")
  }

  const deletableEntities = []
  const monthKeysToValidate = new Set()
  for await (const entity of tables.attendance.listEntities()) {
    const entityTimestamp = entity.signInTimestamp || entity.timestamp || entity.signOutTimestamp || ""
    const recordDate = new Date(entityTimestamp)
    if (Number.isNaN(recordDate.getTime()) || recordDate >= cutoffDate) {
      continue
    }

    monthKeysToValidate.add(buildMonthKeyFromTimestamp(recordDate.toISOString()))
    deletableEntities.push(entity)
  }

  for (const monthKey of monthKeysToValidate) {
    await assertMonthUnlocked(monthKey)
  }

  let deletedCount = 0
  for (const entity of deletableEntities) {
    await tables.attendance.deleteEntity(entity.partitionKey, entity.rowKey)
    deletedCount += 1
  }

  return deletedCount
}

async function deleteSelectedAttendanceRecords(recordIds) {
  const { tables } = await ensureStorage()
  const uniqueRecordIds = Array.from(new Set((recordIds || []).map((item) => String(item || "").trim()).filter(Boolean)))
  const deletableEntities = []
  const monthKeysToValidate = new Set()

  for (const recordId of uniqueRecordIds) {
    const { partitionKey, rowKey } = parseRecordId(recordId)
    if (!partitionKey || !rowKey) {
      continue
    }

    try {
      const entity = await tables.attendance.getEntity(partitionKey, rowKey)
      const entityTimestamp = entity.signInTimestamp || entity.timestamp || entity.signOutTimestamp || ""
      monthKeysToValidate.add(buildMonthKeyFromTimestamp(entityTimestamp))
      deletableEntities.push({ partitionKey, rowKey })
    } catch (error) {
      if (error.statusCode !== 404) {
        throw error
      }
    }
  }

  for (const monthKey of monthKeysToValidate) {
    await assertMonthUnlocked(monthKey)
  }

  let deletedCount = 0

  for (const entity of deletableEntities) {
    await tables.attendance.deleteEntity(entity.partitionKey, entity.rowKey)
    deletedCount += 1
  }

  return deletedCount
}

async function fixMissingSignOut(recordId, payload) {
  const { tables } = await ensureStorage()
  const { partitionKey, rowKey } = parseRecordId(recordId)
  if (!partitionKey || !rowKey) {
    throw new Error("Invalid attendance record id.")
  }

  const entity = await tables.attendance.getEntity(partitionKey, rowKey)
  const signOutTimestamp = String(payload.signOutTimestamp || new Date().toISOString())
  await assertMonthUnlocked(buildMonthKeyFromTimestamp(entity.signInTimestamp || entity.timestamp || signOutTimestamp))
  const calculatedDuration = calculateDurationText(entity.signInTimestamp || entity.timestamp, signOutTimestamp)

  await tables.attendance.upsertEntity({
    ...entity,
    signOutDate: String(payload.signOutDate || ""),
    signOutTime: String(payload.signOutTime || ""),
    signOutTimestamp,
    duration: calculatedDuration,
    status: "closed"
  }, "Replace")

  return {
    recordId,
    duration: calculatedDuration
  }
}

function escapeODataValue(value) {
  return String(value || "").replace(/'/g, "''")
}

module.exports = {
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
  isMonthLocked,
  addAuditLogEntry,
  listAuditLog,
  createAttendanceSignIn,
  completeAttendanceSignOut,
  listAttendanceRecords,
  listOpenAttendanceEmployeeIds,
  deleteAttendanceRecordsBefore,
  deleteSelectedAttendanceRecords,
  fixMissingSignOut
}
