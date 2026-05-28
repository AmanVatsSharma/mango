import { Resend } from "resend";
import { BRAND_ASSETS, BRAND_IDENTITY, buildAssetUrl, buildAuthUrl, getResendFromEmail } from "@/Branding";

// Lazy initialization to avoid build-time errors
let resendClient: Resend | null = null;
let apiKeyChecked = false;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY ?? process.env.NEXT_PUBLIC_RESEND_API_KEY ?? 'dummy-key-for-build';
    
    // Log API key status (without exposing the key)
    if (!apiKeyChecked) {
      if (apiKey === 'dummy-key-for-build') {
        console.warn("[RESEND] ⚠️ Resend API key not configured! Using dummy key. Email sending will fail.");
      } else {
        console.log("[RESEND] ✅ Resend API key found and initialized");
      }
      apiKeyChecked = true;
    }
    
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function isResendConfigured(): boolean {
  const apiKey = process.env.RESEND_API_KEY ?? process.env.NEXT_PUBLIC_RESEND_API_KEY;
  return apiKey !== undefined && apiKey !== 'dummy-key-for-build' && apiKey.trim() !== '';
}

const resend = new Proxy({} as Resend, {
  get(target, prop) {
    const client = getResendClient();
    return client[prop as keyof Resend];
  }
});

export const sendVerificationEmail = async (email: string, token: string) => {
    const confirmLink = buildAuthUrl(`email-verification?token=${token}`)

    await resend.emails.send({
        from: getResendFromEmail(),
        to: email,
        subject: "Confirm your email",
        html: `
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Verify Your Email - ${BRAND_IDENTITY.names.full}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333333;
                        margin: 0;
                        padding: 0;
                        background-color: #f4f4f4;
                    }
                    .container {
                        max-width: 600px;
                        margin: 20px auto;
                        background-color: #ffffff;
                        padding: 20px;
                        border-radius: 5px;
                        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                    }
                    .logo {
                        text-align: center;
                        margin-bottom: 20px;
                    }
                    .logo img {
                        max-width: 200px;
                        height: auto;
                    }
                    h1 {
                        color: #4CAF50;
                        text-align: center;
                    }
                    .button {
                        display: inline-block;
                        background-color: #4CAF50;
                        color: #ffffff;
                        text-decoration: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        margin-top: 20px;
                    }
                    .footer {
                        margin-top: 20px;
                        text-align: center;
                        font-size: 12px;
                        color: #666666;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo">
                        <img src="${buildAssetUrl(BRAND_ASSETS.logos.email)}" alt="${BRAND_IDENTITY.names.full} Logo">
                    </div>
                    <h1>Welcome to ${BRAND_IDENTITY.names.full}!</h1>
                    <p>Dear Store Owner,</p>
                    <p>Thank you for choosing ${BRAND_IDENTITY.names.full} for your trading journey. We're excited to have you on board!</p>
                    <p>To get started, please verify your email address by clicking the button below:</p>
                    <p style="text-align: center;">
                        <a href="${confirmLink}" class="button">Verify Email Address</a>
                    </p>
                    <p>If the button above doesn't work, you can also copy and paste the following link into your browser:</p>
                    <p>${confirmLink}</p>
                    <p>This link will expire in 24 hours for security reasons. If you didn't create an account with ${BRAND_IDENTITY.names.full}, please ignore this email.</p>
                    <p>We look forward to helping you grow your online business!</p>
                    <p>Best regards,<br>The ${BRAND_IDENTITY.names.full} Team</p>
                    <div class="footer">
                        <p>&copy; ${BRAND_IDENTITY.legal.copyrightYear} ${BRAND_IDENTITY.names.full}. All rights reserved.</p>
                        <p>If you have any questions, please contact our support team at ${BRAND_IDENTITY.email.support}</p>
                    </div>
                </div>
            </body>
        </html>`
    });
};


export const sendPasswordResetEmail = async (email: string, token: string) => {
    try {
        const confirmLink = buildAuthUrl(`password-reset?token=${token}`);

        await resend.emails.send({
            from: getResendFromEmail(),
            to: email,
            subject: "Reset your password",
            html: `
            <h1>Reset Your ${BRAND_IDENTITY.names.full} Password</h1>
            <p>Click the link below to reset your password:</p>
            <a href='${confirmLink}'>Reset Password</a>
            <p>If you didn't request this, please ignore this email.</p>
            <p>This link will expire in 1 hour.</p>
        `
        });
    } catch (error) {
        console.error("Error sending reset email:", error);
        throw new Error("Failed to send reset email");
    }
};

export const sendOtpEmail = async (
  email: string,
  otp: string,
  purpose: string,
  expiresAt?: Date,
  maskedPhone?: string
) => {
  try {
    // Validate Resend configuration
    if (!isResendConfigured()) {
      const errorMsg = "Resend API key not configured. Please set RESEND_API_KEY environment variable.";
      console.error(`[RESEND] ❌ ${errorMsg}`);
      return { success: false, error: errorMsg } as const;
    }

    // Validate email format
    if (!email || !email.includes('@')) {
      const errorMsg = `Invalid email address: ${email}`;
      console.error(`[RESEND] ❌ ${errorMsg}`);
      return { success: false, error: errorMsg } as const;
    }

    console.log(`[RESEND] 📧 Sending OTP email to ${email} for purpose: ${purpose}`);

    const subjectPurpose = purpose ? purpose.charAt(0).toUpperCase() + purpose.slice(1) : "Verification";
    const expiryText = expiresAt ? ` This OTP expires at ${expiresAt.toLocaleTimeString()}.` : " Valid for 5 minutes.";
    const phoneText = maskedPhone ? ` Mobile: ${maskedPhone}.` : "";

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111;">
        <h2 style="color:#047857;">Your ${subjectPurpose} OTP</h2>
        <p>Use the OTP below to continue.${phoneText}${expiryText}</p>
        <div style="font-size:28px; font-weight:700; letter-spacing: 4px; padding: 16px 0;">${otp}</div>
        <p>Do not share this OTP with anyone.</p>
      </div>
    `;

    const result = await resend.emails.send({
      from: getResendFromEmail(),
      to: email,
      subject: `Your ${subjectPurpose} OTP`,
      html,
    });

    if (result.error) {
      console.error(`[RESEND] ❌ Failed to send OTP email to ${email}:`, result.error);
      return { 
        success: false, 
        error: result.error instanceof Error ? result.error.message : JSON.stringify(result.error)
      } as const;
    }

    console.log(`[RESEND] ✅ OTP email sent successfully to ${email}. Message ID: ${result.data?.id || 'N/A'}`);
    return { success: true, messageId: result.data?.id } as const;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[RESEND] ❌ Exception sending OTP email to ${email}:`, errorMessage);
    console.error(`[RESEND] Error details:`, error);
    return { success: false, error: errorMessage } as const;
  }
};
