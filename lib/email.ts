import { Resend } from "resend";

const FROM_EMAIL = process.env.EMAIL_FROM ?? "FarmHack AI <noreply@farmhack.ai>";

let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set. Configure it to enable email verification.");
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendVerificationEmail({
  user,
  url,
}: {
  user: { email: string; name?: string | null };
  url: string;
}) {
  const resendClient = getResend();

  const { error } = await resendClient.emails.send({
    from: FROM_EMAIL,
    to: [user.email],
    subject: "Verify your FarmHack AI account",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin:0; padding:0; font-family: system-ui, -apple-system, sans-serif; background:#f7f9f5; color:#18231b;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9f5; padding:20px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" max-width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; border:1px solid #dce5dc;">
                  <tr>
                    <td align="center" style="padding:32px 24px;">
                      <h1 style="margin:0 0 16px; font-size:24px; font-weight:600; color:#18231b;">Verify your email</h1>
                      <p style="margin:0 0 24px; font-size:16px; line-height:1.6; color:#5a675d;">
                        Hi${user.name ? ` ${user.name}` : ""}, welcome to FarmHack AI!
                        Please verify your email address to start using the crop health assistant.
                      </p>
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center">
                            <a href="${url}" style="display:inline-block; background:#236b45; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600; font-size:16px;">
                              Verify email address
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:24px 0 0; font-size:14px; color:#5a675d;">
                        If you didn't create this account, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });

  if (error) {
    console.error("Resend error:", error);
    throw error;
  }
}
