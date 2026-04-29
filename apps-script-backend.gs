const SPREADSHEET_ID = "1UrFQFuDRG2l-Y6G1_1a_xYG2Qha48M89tLtJscuwSmA";
const SHEET_NAME = "Sheet1";
const DRIVE_FOLDER_ID = "";
const IMAGE_ROW_HEIGHT = 120;
const HEADERS = [
  "Username",
  "Sign-in Date",
  "Sign-in Time",
  "Sign-in Photo",
  "Sign-out Date",
  "Sign-out Time",
  "Sign-out Photo",
  "Duration",
  "Timestamp",
  "Sign-in Photo URL",
  "Sign-out Photo URL",
];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.view) || "";

  if (action === "records" || action === "") {
    return jsonOutput({
      records: getAttendanceRecords(),
    });
  }

  return jsonOutput({
    ok: true,
    message: "Centers attendance backend is running.",
  });
}

function doPost(e) {
  try {
    const rawBody = (e && e.postData && e.postData.contents) || "{}";
    const payload = JSON.parse(rawBody);
    const sheet = getSheet();

    ensureHeaders(sheet);

    const username = String(payload.username || "").trim();
    const action = String(payload.action || "").toLowerCase();
    const timestamp = String(payload.timestamp || new Date().toISOString());

    if (!username || !action) {
      return jsonOutput({
        ok: false,
        error: "username and action are required",
      });
    }

    if (action === "signin") {
      const signInPhotoFile = createImageFile(payload.signInPhoto || payload.photo || "", username, "signin", timestamp);
      const signInPhotoUrl = signInPhotoFile ? buildPublicImageUrl(signInPhotoFile.getId()) : "";

      sheet.appendRow([
        username,
        payload.signInDate || "",
        payload.signInTime || "",
        signInPhotoUrl ? buildImageFormula(signInPhotoUrl) : "",
        "",
        "",
        "",
        "",
        timestamp,
        signInPhotoUrl,
        "",
      ]);

      const rowIndex = sheet.getLastRow();
      sheet.setRowHeight(rowIndex, IMAGE_ROW_HEIGHT);
      sheet.setColumnWidth(4, 180);
      sheet.setColumnWidth(7, 180);

      return jsonOutput({ ok: true, action: "signin" });
    }

    if (action === "signout") {
      const rowIndex = findLatestOpenRow(sheet, username);

      if (rowIndex > 0) {
        const signOutPhotoFile = createImageFile(payload.signOutPhoto || payload.photo || "", username, "signout", timestamp);
        const signOutPhotoUrl = signOutPhotoFile ? buildPublicImageUrl(signOutPhotoFile.getId()) : "";

        sheet.getRange(rowIndex, 5, 1, 5).setValues([[
          payload.signOutDate || "",
          payload.signOutTime || "",
          signOutPhotoUrl ? buildImageFormula(signOutPhotoUrl) : "",
          payload.duration || "",
          timestamp,
        ]]);
        sheet.getRange(rowIndex, 11).setValue(signOutPhotoUrl);
        sheet.setRowHeight(rowIndex, IMAGE_ROW_HEIGHT);
        sheet.setColumnWidth(4, 180);
        sheet.setColumnWidth(7, 180);

        return jsonOutput({ ok: true, action: "signout", updatedRow: rowIndex });
      }

      const fallbackSignOutPhotoFile = createImageFile(payload.signOutPhoto || payload.photo || "", username, "signout", timestamp);
      const fallbackSignOutPhotoUrl = fallbackSignOutPhotoFile ? buildPublicImageUrl(fallbackSignOutPhotoFile.getId()) : "";

      sheet.appendRow([
        username,
        "",
        "",
        "",
        payload.signOutDate || "",
        payload.signOutTime || "",
        fallbackSignOutPhotoUrl ? buildImageFormula(fallbackSignOutPhotoUrl) : "",
        payload.duration || "",
        timestamp,
        "",
        fallbackSignOutPhotoUrl,
      ]);

      const fallbackRowIndex = sheet.getLastRow();
      sheet.setRowHeight(fallbackRowIndex, IMAGE_ROW_HEIGHT);
      sheet.setColumnWidth(4, 180);
      sheet.setColumnWidth(7, 180);

      return jsonOutput({ ok: true, action: "signout", appendedFallback: true });
    }

    return jsonOutput({
      ok: false,
      error: "Unsupported action",
    });
  } catch (error) {
    return jsonOutput({
      ok: false,
      error: error.message,
    });
  }
}

function getAttendanceRecords() {
  const sheet = getSheet();
  ensureHeaders(sheet);

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return [];
  }

  const headers = values[0];
  return values.slice(1).map(function(row) {
    const record = {};

    headers.forEach(function(header, index) {
      record[header] = normalizeCellValue(header, row[index]);
    });

    return record;
  });
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
  return sheet;
}

function ensureHeaders(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  const existingHeaders = headerRange.getValues()[0];
  const headersMatch = HEADERS.every(function(header, index) {
    return existingHeaders[index] === header;
  });

  if (!headersMatch) {
    headerRange.setValues([HEADERS]);
  }

  hideHelperColumns(sheet);
}

function findLatestOpenRow(sheet, username) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return -1;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const row = values[index];
    const rowUsername = String(row[0] || "").trim();
    const signOutDate = String(row[4] || "").trim();

    if (rowUsername === username && !signOutDate) {
      return index + 2;
    }
  }

  return -1;
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeCellValue(header, value) {
  if (value && value.valueType === SpreadsheetApp.ValueType.IMAGE) {
    return value.getContentUrl();
  }

  if (!(value instanceof Date)) {
    return value;
  }

  if (header === "Sign-in Date" || header === "Sign-out Date") {
    return Utilities.formatDate(value, "Africa/Cairo", "dd/MM/yyyy");
  }

  if (header === "Sign-in Time" || header === "Sign-out Time") {
    return Utilities.formatDate(value, "Africa/Cairo", "HH:mm:ss");
  }

  if (header === "Timestamp") {
    return value.toISOString();
  }

  return value;
}

function createImageFile(dataUri, username, action, timestamp) {
  if (!dataUri) {
    return null;
  }

  return saveDataUriImage(dataUri, username, action, timestamp);
}

function saveDataUriImage(dataUri, username, action, timestamp) {
  const matches = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid image data format");
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const extension = mimeType.split("/")[1] || "jpg";
  const safeUsername = String(username || "user").replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeAction = String(action || "attendance").replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeTimestamp = String(timestamp || new Date().toISOString()).replace(/[:.]/g, "-");
  const filename = safeUsername + "_" + safeAction + "_" + safeTimestamp + "." + extension;
  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, mimeType, filename);
  const folder = getImageFolder();
  const file = folder.createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}

function buildPublicImageUrl(fileId) {
  return "https://drive.google.com/uc?export=view&id=" + fileId;
}

function buildImageFormula(imageUrl) {
  const safeUrl = String(imageUrl || "").replace(/"/g, '""');
  return '=IMAGE("' + safeUrl + '", 4, 120, 160)';
}

function authorizeServices() {
  const sheet = getSheet();
  ensureHeaders(sheet);
  getImageFolder();
  return "Authorization completed";
}

function hideHelperColumns(sheet) {
  if (sheet.getMaxColumns() >= 11) {
    sheet.hideColumns(10, 2);
  }
}

function getImageFolder() {
  if (DRIVE_FOLDER_ID) {
    return DriveApp.getFolderById(DRIVE_FOLDER_ID);
  }

  return DriveApp.getRootFolder();
}
