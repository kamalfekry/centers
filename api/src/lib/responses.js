function json(body, status = 200, extraHeaders = {}) {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders
    },
    jsonBody: body
  }
}

function errorResponse(status, message) {
  return json(
    {
      ok: false,
      error: message
    },
    status
  )
}

module.exports = {
  json,
  errorResponse
}
