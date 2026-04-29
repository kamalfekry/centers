document.addEventListener("DOMContentLoaded", async () => {
  const welcomeUsername = document.getElementById("welcomeUsername")
  const urlParams = new URLSearchParams(window.location.search)
  const employeeId = String(urlParams.get("employeeId") || "").trim()
  const fallbackName = String(urlParams.get("employeeName") || "").trim()
  let username = fallbackName

  if (employeeId && window.CENTERS_DATA?.getPublicBootstrap) {
    try {
      const bootstrap = await window.CENTERS_DATA.getPublicBootstrap()
      const profiles = Array.isArray(bootstrap.employees) ? bootstrap.employees : []
      const matchedProfile = profiles.find((profile) => profile.id === employeeId)
      if (matchedProfile?.fullName) {
        username = matchedProfile.fullName
      }
    } catch (error) {
      console.error("Unable to resolve welcome employee from Azure:", error)
    }
  }

  if (username) {
    welcomeUsername.textContent = username
    if (window.history?.replaceState) {
      window.history.replaceState({}, document.title, "welcome.html")
    }
    return
  }

  window.location.href = "index.html"
})
