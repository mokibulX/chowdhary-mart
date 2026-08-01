type ApiErrorShape = {
  data?: { error?: string; message?: string; details?: unknown };
  response?: { data?: { error?: string; message?: string; details?: unknown } };
  message?: string;
};

const fallbackMessage = "Something went wrong. Please check the details and try again.";

function firstText(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstText(value[0]);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstText(record.message) ?? firstText(record.error) ?? firstText(Object.values(record)[0]);
  }
  return undefined;
}

export function getFriendlyErrorMessage(error: unknown, fallback = fallbackMessage) {
  const err = error as ApiErrorShape;
  const raw = firstText(err?.data?.error)
    ?? firstText(err?.data?.message)
    ?? firstText(err?.response?.data?.error)
    ?? firstText(err?.response?.data?.message)
    ?? firstText(err?.message)
    ?? (error instanceof Error ? error.message : undefined)
    ?? fallback;

  const text = String(raw).trim();
  const lower = text.toLowerCase();

  if (!text) return fallback;
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network connection")) {
    return "Server connection is not available. Please check internet/server and try again.";
  }
  if (lower.includes("duplicate key") || lower.includes("already exists") || lower.includes("unique constraint")) {
    return "This account or value already exists. Please use another email/mobile, or login.";
  }
  if (lower.includes("coupon code")) {
    return "Please enter a valid coupon code. Use 3-20 letters, numbers, dash or underscore.";
  }
  if (lower.includes("discount value")) {
    return "Please enter a valid discount value.";
  }
  if (lower.includes("invalid credentials") || lower.includes("account unavailable")) {
    return "Email/mobile or password is incorrect.";
  }
  if (lower.includes("valid 10 digit") || lower.includes("invalid mobile") || lower.includes("phone")) {
    return "Please enter a valid 10 digit mobile number.";
  }
  if (lower.includes("valid email") || lower.includes("email")) {
    return "Please enter a valid email address.";
  }
  if (lower.includes("otp")) {
    return "OTP is invalid or expired. Please enter 123456 in demo mode or request a new OTP.";
  }
  if (lower.includes("password")) {
    return "Please enter a valid password and make sure both passwords match.";
  }
  if (lower.includes("permission")) {
    return "Permission is required to continue. Please allow access and try again.";
  }
  if (lower.includes("outside") || lower.includes("service zone")) {
    return "This location is outside the current service zone. Please select another location.";
  }
  if (lower.includes("required")) {
    return "Please fill all required fields before continuing.";
  }

  return text.length > 160 ? fallback : text;
}

export function getFirstFormError(errors: unknown, fallback = "Please fill the highlighted fields correctly.") {
  const message = firstText(errors);
  return getFriendlyErrorMessage({ message }, fallback);
}
