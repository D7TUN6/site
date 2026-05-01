import { sendApiError } from "../lib/api.mjs";

function isApiRequest(req) {
  const url = typeof req?.originalUrl === "string" ? req.originalUrl : "";
  return url === "/api" || url.startsWith("/api/");
}

function statusFromError(error) {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : null;
  if (status && Number.isFinite(status) && status >= 400 && status <= 599) return status;
  return null;
}

function isBodyParserSyntaxError(error) {
  if (!error || typeof error !== "object") return false;
  return error instanceof SyntaxError && "type" in error && error.type === "entity.parse.failed";
}

export function installApiErrorHandler() {
  return (error, req, res, next) => {
    void next;
    if (res.headersSent) {
      return next(error);
    }

    if (!isApiRequest(req)) {
      return next(error);
    }

    if (isBodyParserSyntaxError(error)) {
      return sendApiError(res, req, 400, "Invalid JSON payload", {
        code: "BAD_JSON"
      });
    }

    const status = statusFromError(error) ?? 500;
    const message = status >= 500 ? "Internal server error" : String(error?.message || "Request failed");

    if (status >= 500) {
      console.error("api error", { requestId: req.requestId, status, message, error });
    }

    return sendApiError(res, req, status, message, {
      code: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED",
      details: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      }
    });
  };
}
