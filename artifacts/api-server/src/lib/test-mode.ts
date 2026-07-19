export function envFlag(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function envText(name: string, fallback: string) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export const testMode = {
  enabled: envFlag("APP_TEST_MODE", false),
  allowDemoOtp: envFlag("ALLOW_DEMO_OTP", true),
  allowDemoKyc: envFlag("ALLOW_DEMO_KYC", envFlag("APP_TEST_MODE", false)),
  allowDemoSelfie: envFlag("ALLOW_DEMO_SELFIE", envFlag("APP_TEST_MODE", false)),
  allowDemoPayment: envFlag("ALLOW_DEMO_PAYMENT", envFlag("APP_TEST_MODE", false)),
  allowDemoPayout: envFlag("ALLOW_DEMO_PAYOUT", envFlag("APP_TEST_MODE", false)),
  allowDemoApproval: envFlag("ALLOW_DEMO_APPROVAL", envFlag("APP_TEST_MODE", false)),
  requireRealGps: envFlag("REQUIRE_REAL_GPS", true),
  allowFakeGps: envFlag("ALLOW_FAKE_GPS", false),
  requireLocationPermission: envFlag("REQUIRE_LOCATION_PERMISSION", true),
  demoOtpCode: envText("DEMO_OTP_CODE", "123456"),
  demoPaymentSuccess: envFlag("DEMO_PAYMENT_SUCCESS", true),
  demoPayoutSuccess: envFlag("DEMO_PAYOUT_SUCCESS", true),
  demoKycStatus: envText("DEMO_KYC_STATUS", "APPROVED"),
  demoSelfieStatus: envText("DEMO_SELFIE_STATUS", "VERIFIED"),
  locationIntervalSeconds: Number(envText("LOCATION_UPDATE_INTERVAL_SECONDS", "5")),
  maxAccuracyMeters: Number(envText("LOCATION_MAX_ACCEPTABLE_ACCURACY_METERS", "100")),
};

export function assertTestModeFeature(enabled: boolean, feature: string) {
  if (!testMode.enabled || !enabled) {
    const err = new Error(`${feature} is available only in test mode`);
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}

export function isDemoOtp(otp?: string | null) {
  const code = String(otp ?? "").trim();
  const demoCode = String(testMode.demoOtpCode || "123456").trim();
  return testMode.allowDemoOtp && (code === demoCode || code === "123456");
}
