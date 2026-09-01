// src/services/mailService.ts

export interface EmailPayload {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlBody: string;
}

export interface WorkerEnv {
  ZEPTOMAIL_API_KEY: string;
  ZEPTOMAIL_FROM_EMAIL: string;
}

/**
 * Sends a transactional email using the Zoho ZeptoMail REST API.
 */
export async function sendZeptoMail(payload: EmailPayload, env: WorkerEnv) {
  // Use https://api.zeptomail.in/v1.1/email for Zoho India accounts,
  // or https://api.zeptomail.com/v1.1/email for Zoho US/Global accounts.
  const endpoint = "https://api.zeptomail.com/v1.1/email";

  const requestBody = {
    from: {
      address: env.ZEPTOMAIL_FROM_EMAIL,
      name: "SkipWait",
    },
    to: [
      {
        email_address: {
          address: payload.toEmail,
          name: payload.toName || payload.toEmail.split("@")[0],
        },
      },
    ],
    subject: payload.subject,
    htmlbody: payload.htmlBody,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Zoho-enczapikey ${env.ZEPTOMAIL_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ZeptoMail delivery failed (${response.status}): ${errorText}`);
  }

  return await response.json();
}
