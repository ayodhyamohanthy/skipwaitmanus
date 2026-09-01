// server/routes.ts (or server/auth.ts)
import { sendZeptoMail } from "../src/services/mailService";

// Helper function to generate a 6-digit numeric OTP
function generateOtp(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (100000 + (buffer[0] % 900000)).toString();
}

// In-memory OTP store (or use your database/Redis table if multi-instance)
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

const BLOCKED_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "protonmail.com",
  "zoho.com",
]);

// 1. Send OTP Endpoint
app.post("/api/auth/work-email/send-otp", async (req, res) => {
  try {
    const { workEmail, userId } = req.body;

    if (!workEmail || !workEmail.includes("@")) {
      return res.status(400).json({ error: "A valid corporate email address is required." });
    }

    const domain = workEmail.split("@")[1].toLowerCase();
    if (BLOCKED_DOMAINS.has(domain)) {
      return res.status(400).json({ error: "Please provide your corporate work email, not a personal email provider." });
    }

    const otp = generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP keyed by userId & email
    const key = `${userId || "anon"}:${workEmail.toLowerCase()}`;
    otpStore.set(key, { otp, expiresAt });

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 460px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #111827; margin: 0 0 12px; font-size: 20px;">Verify your corporate email</h2>
        <p style="color: #4b5563; font-size: 14px; line-height: 1.5; margin: 0 0 20px;">
          Enter the 6-digit verification code below on SkipWait to confirm your corporate affiliation:
        </p>
        <div style="background-color: #f3f4f6; border-radius: 6px; padding: 16px; text-align: center; margin-bottom: 20px;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #111827;">${otp}</span>
        </div>
        <p style="color: #9ca3af; font-size: 12px; line-height: 1.4; margin: 0;">
          This code expires in 10 minutes. If you did not request this verification, please ignore this email.
        </p>
      </div>
    `;

    // Dispatches via ZeptoMail using environment variables forwarded by worker.ts
    await sendZeptoMail(
      {
        toEmail: workEmail,
        subject: `SkipWait Verification Code: ${otp}`,
        htmlBody,
      },
      {
        ZEPTOMAIL_API_KEY: process.env.ZEPTOMAIL_API_KEY!,
        ZEPTOMAIL_FROM_EMAIL: process.env.ZEPTOMAIL_FROM_EMAIL || "noreply@skipwait.me",
      }
    );

    return res.status(200).json({ success: true, message: "Verification code sent." });
  } catch (error: any) {
    console.error("Error sending work email OTP:", error);
    return res.status(500).json({ error: error.message || "Failed to send verification code." });
  }
});

// 2. Verify OTP Endpoint
app.post("/api/auth/work-email/verify-otp", async (req, res) => {
  try {
    const { workEmail, otp, userId } = req.body;

    if (!workEmail || !otp) {
      return res.status(400).json({ error: "Work email and OTP code are required." });
    }

    const key = `${userId || "anon"}:${workEmail.toLowerCase()}`;
    const entry = otpStore.get(key);

    if (!entry) {
      return res.status(400).json({ error: "Verification code expired or not requested." });
    }

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
    }

    if (entry.otp !== otp.trim()) {
      return res.status(400).json({ error: "Invalid verification code. Please check and try again." });
    }

    // Clear the verified OTP
    otpStore.delete(key);

    const domain = workEmail.split("@")[1].toLowerCase();

    // TODO: Update user record in your database (e.g. mark work_email_verified = true, company_domain = domain)

    return res.status(200).json({
      success: true,
      companyDomain: domain,
      message: "Work email verified successfully.",
    });
  } catch (error: any) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({ error: error.message || "Verification failed." });
  }
});
