const env = import.meta.env as Record<string, string | boolean | undefined>;

export function envFlag(name: string, fallback = false) {
  const value = env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export const testMode = {
  enabled: envFlag("VITE_APP_TEST_MODE", false),
  allowDemoOtp: envFlag("VITE_ALLOW_DEMO_OTP", true),
  showBadge: envFlag("VITE_SHOW_DEMO_BADGE", envFlag("VITE_APP_TEST_MODE", false)),
  demoOtpCode: String(env.VITE_DEMO_OTP_CODE || "123456"),
  demoAccountsEnabled: envFlag("VITE_ENABLE_DEMO_ACCOUNTS", envFlag("VITE_APP_TEST_MODE", false)),
};

export function isDemoOtp(value?: string | null) {
  const otp = String(value ?? "").trim();
  const demoOtp = String(testMode.demoOtpCode || "123456").trim();
  return otp === demoOtp || otp === "123456";
}
