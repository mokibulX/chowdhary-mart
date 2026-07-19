# ChowdharyMart OTP and Push Setup

## Mobile OTP

Use one SMS provider:

- Fast2SMS: create account at `fast2sms.com`, copy API key.
- MSG91: create account at `msg91.com`, create OTP template, copy Auth Key and Template ID.
- Twilio: create account at `twilio.com`, copy Account SID, Auth Token and From number.

Add to `.env`:

```env
MAX_ACCOUNTS_PER_PHONE=3
OTP_TTL_MINUTES=5
OTP_MAX_ATTEMPTS=5
SMS_PROVIDER=fast2sms
FAST2SMS_API_KEY=your_key_here
```

## Email OTP

For OTP to Gmail or any email inbox, use an email API provider:

- Resend: create account at `resend.com`, verify sender/domain, copy API key.
- Brevo: create account at `brevo.com`, verify sender, copy SMTP/API key.

Example:

```env
EMAIL_PROVIDER=resend
EMAIL_FROM=ChowdharyMart <otp@yourdomain.com>
RESEND_API_KEY=your_key_here
```

## Push Notification

Use Firebase Cloud Messaging:

1. Create Firebase project.
2. Add Android app with the package name from the Android project.
3. Download `google-services.json`.
4. Put it in `artifacts/web/android/app/google-services.json`.
5. Go to Firebase Project Settings -> Service accounts -> Generate new private key.
6. Copy these values from the downloaded JSON:

```env
FCM_PROJECT_ID=your_firebase_project_id
FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Legacy `FCM_SERVER_KEY` is also supported if your Firebase project still provides it, but service-account HTTP v1 is the preferred setup.

## Database

Run `docs/otp-push-setup.sql` once in Supabase SQL Editor. It:

- removes unique mobile number restriction,
- allows up to 3 accounts per mobile in application code,
- creates `otp_codes`,
- creates `push_tokens`.
