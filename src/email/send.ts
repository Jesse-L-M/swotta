import { Resend } from "resend";

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface EmailResult {
  id: string;
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: "Swotta <reports@swotta.com>",
    to: options.to,
    subject: options.subject,
    html: options.html,
  });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return { id: data?.id ?? "" };
}
