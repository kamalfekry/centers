function requireSetting(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required application setting: ${name}`)
  }

  return value
}

function getConfig() {
  return {
    storageConnectionString: requireSetting("AZURE_STORAGE_CONNECTION_STRING"),
    adminPassword: requireSetting("ADMIN_PASSWORD"),
    adminJwtSecret: requireSetting("ADMIN_JWT_SECRET"),
    photosContainerName: process.env.PHOTOS_CONTAINER_NAME || "attendance-photos",
    tables: {
      attendance: process.env.ATTENDANCE_TABLE_NAME || "AttendanceRecords",
      employees: process.env.EMPLOYEES_TABLE_NAME || "EmployeeProfiles",
      settings: process.env.SETTINGS_TABLE_NAME || "AppSettings",
      auditLog: process.env.AUDIT_LOG_TABLE_NAME || "AuditLog"
    }
  }
}

module.exports = {
  getConfig
}
