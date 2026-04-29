const centersData = window.CENTERS_DATA || {}
const appConfig = window.CENTERS_CONFIG || {}
const appTimezone = appConfig.timezone || "Africa/Cairo"

const video = document.getElementById("video")
const canvas = document.getElementById("canvas")
const captureBtn = document.getElementById("captureBtn")
const retakeBtn = document.getElementById("retakeBtn")
const signInBtn = document.getElementById("signInBtn")
const signOutBtn = document.getElementById("signOutBtn")
const form = document.getElementById("signInOutForm")
const employeeSelect = document.getElementById("username")
const cameraContainer = document.getElementById("cameraContainer")
const photoPreview = document.getElementById("photoPreview")
const previewImage = document.getElementById("previewImage")

let stream = null
let photoTaken = false
let isRequestInProgress = false
let employeeProfiles = []
let activeEmployeeIds = new Set()

document.addEventListener("DOMContentLoaded", async () => {
  await loadBootstrapData()
  initializeCamera()
  updateButtonStates()
})

async function loadBootstrapData() {
  try {
    const bootstrap = await centersData.getPublicBootstrap()
    employeeProfiles = Array.isArray(bootstrap.employees)
      ? bootstrap.employees.filter((profile) => profile.active !== false)
      : []
    activeEmployeeIds = new Set(bootstrap.activeEmployeeIds || [])
  } catch (error) {
    console.error("Unable to load bootstrap data from Azure:", error)
    employeeProfiles = []
    activeEmployeeIds = new Set()
    alert("Unable to load employee data from Azure right now. Please refresh and try again.")
  }

  populateEmployeeOptions()
}

function populateEmployeeOptions() {
  const previousValue = employeeSelect.value
  const optionsMarkup = [
    '<option value="">Choose an employee</option>',
    ...employeeProfiles
      .slice()
      .sort((first, second) => first.fullName.localeCompare(second.fullName, "ar"))
      .map((profile) => {
        const isSignedIn = activeEmployeeIds.has(profile.id)
        const statusLabel = isSignedIn ? " - Signed in" : ""
        return `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.fullName + statusLabel)}</option>`
      })
  ].join("")

  employeeSelect.innerHTML = optionsMarkup
  if (previousValue && employeeProfiles.some((profile) => profile.id === previousValue)) {
    employeeSelect.value = previousValue
  }
}

function initializeCamera() {
  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then((videoStream) => {
      stream = videoStream
      video.srcObject = videoStream
      video.play()
    })
    .catch((error) => {
      console.error("Error accessing the camera:", error)
      alert("Unable to access camera. Please make sure you have granted camera permissions.")
    })
}

function getSelectedProfile() {
  return employeeProfiles.find((profile) => profile.id === employeeSelect.value.trim()) || null
}

function updateButtonStates() {
  const selectedEmployeeId = employeeSelect.value.trim()
  const isSignedIn = activeEmployeeIds.has(selectedEmployeeId)

  signInBtn.disabled = isRequestInProgress || !selectedEmployeeId || isSignedIn
  signOutBtn.disabled = isRequestInProgress || !selectedEmployeeId || !isSignedIn
}

captureBtn.addEventListener("click", () => {
  try {
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext("2d")

    if (context) {
      context.drawImage(video, 0, 0)
      const photoData = canvas.toDataURL("image/jpeg", 0.8)
      previewImage.src = photoData
      video.classList.add("d-none")
      photoPreview.classList.remove("d-none")
      photoTaken = true
      cameraContainer.classList.remove("is-invalid")
    }
  } catch (error) {
    console.error("Error capturing photo:", error)
    alert("Error capturing photo. Please try again.")
  }
})

retakeBtn.addEventListener("click", () => {
  video.classList.remove("d-none")
  photoPreview.classList.add("d-none")
  photoTaken = false
})

function validateForm(action) {
  let isValid = true
  form.classList.add("was-validated")

  const selectedProfile = getSelectedProfile()
  if (!selectedProfile) {
    isValid = false
    employeeSelect.classList.add("is-invalid")
  } else {
    employeeSelect.classList.remove("is-invalid")
  }

  if (!photoTaken) {
    isValid = false
    cameraContainer.classList.add("is-invalid")
  } else {
    cameraContainer.classList.remove("is-invalid")
  }

  if (!selectedProfile) {
    return false
  }

  const isSignedIn = activeEmployeeIds.has(selectedProfile.id)
  if (action === "signin" && isSignedIn) {
    alert("This employee is already signed in.")
    isValid = false
  } else if (action === "signout" && !isSignedIn) {
    alert("This employee is not currently signed in.")
    isValid = false
  }

  return isValid
}

async function handleSignInOut(action) {
  try {
    if (isRequestInProgress || !validateForm(action)) {
      return
    }

    const selectedProfile = getSelectedProfile()
    if (!selectedProfile) {
      return
    }

    isRequestInProgress = true
    updateButtonStates()

    const photoData = canvas.toDataURL("image/jpeg", 0.5)
    const attendancePayload = buildAttendancePayload(action, selectedProfile, photoData)
    const payload = {
      username: selectedProfile.fullName,
      employeeName: selectedProfile.fullName,
      employeeUsername: selectedProfile.username,
      employeeId: selectedProfile.id,
      photo: photoData,
      action,
      timestamp: attendancePayload.timestamp,
      signInDate: attendancePayload.signInDate,
      signInTime: attendancePayload.signInTime,
      signInPhoto: attendancePayload.signInPhoto,
      signOutDate: attendancePayload.signOutDate,
      signOutTime: attendancePayload.signOutTime,
      signOutPhoto: attendancePayload.signOutPhoto,
      duration: attendancePayload.duration
    }

    await centersData.submitAttendance(action, payload)

    if (action === "signin") {
      activeEmployeeIds.add(selectedProfile.id)
      populateEmployeeOptions()
      window.location.href = `welcome.html?employeeId=${encodeURIComponent(selectedProfile.id)}&employeeName=${encodeURIComponent(selectedProfile.fullName)}`
      return
    }

    activeEmployeeIds.delete(selectedProfile.id)
    populateEmployeeOptions()
    alert("Signed out successfully!")
    resetForm()
  } catch (error) {
    console.error(`Error during ${action}:`, error)
    alert(`An error occurred during ${action}. Please try again.`)
  } finally {
    isRequestInProgress = false
    updateButtonStates()
  }
}

function resetForm() {
  form.reset()
  form.classList.remove("was-validated")
  video.classList.remove("d-none")
  photoPreview.classList.add("d-none")
  photoTaken = false
  cameraContainer.classList.remove("is-invalid")
  populateEmployeeOptions()
  updateButtonStates()
}

function buildAttendancePayload(action, selectedProfile, photoData) {
  const now = new Date()
  const timestamp = now.toISOString()
  const { dateText, timeText } = formatDateTimeParts(now)

  if (action === "signin") {
    return {
      username: selectedProfile.fullName,
      employeeName: selectedProfile.fullName,
      employeeUsername: selectedProfile.username,
      employeeId: selectedProfile.id,
      signInDate: dateText,
      signInTime: timeText,
      signInPhoto: photoData,
      signOutDate: "",
      signOutTime: "",
      signOutPhoto: "",
      duration: "",
      timestamp,
      signInTimestamp: timestamp
    }
  }

  return {
    username: selectedProfile.fullName,
    employeeName: selectedProfile.fullName,
    employeeUsername: selectedProfile.username,
    employeeId: selectedProfile.id,
    signInDate: "",
    signInTime: "",
    signInPhoto: "",
    signOutDate: dateText,
    signOutTime: timeText,
    signOutPhoto: photoData,
    duration: "",
    timestamp,
    signOutTimestamp: timestamp
  }
}

function formatDateTimeParts(date) {
  return {
    dateText: new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: appTimezone
    }).format(date),
    timeText: new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: appTimezone
    }).format(date)
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

employeeSelect.addEventListener("change", updateButtonStates)

signInBtn.addEventListener("click", (event) => {
  event.preventDefault()
  handleSignInOut("signin")
})

signOutBtn.addEventListener("click", (event) => {
  event.preventDefault()
  handleSignInOut("signout")
})

window.addEventListener("beforeunload", () => {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
  }
})
