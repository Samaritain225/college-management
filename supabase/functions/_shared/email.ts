// Thin Resend client, shared by any edge function that needs to send mail
// (admin-users' invitations today, expense notifications later — see
// docs/access-lifecycle-plan-2026-07-29.md part 5).
//
// RESEND_API_KEY / EMAIL_FROM must be read inside the caller, never at
// module scope: a module-scope env read that throws stops the whole
// function from booting, and even its CORS preflight then returns a bare
// 500 with nothing in the logs to explain why (see the storage-sign gotcha
// in AGENTS.md). They are Edge Function Secrets (`supabase secrets set`),
// not Supabase Vault — Vault is a database store `Deno.env.get()` cannot see.

export interface SendEmailInput {
  apiKey: string
  from: string
  to: string
  subject: string
  html: string
}

export interface SendEmailResult {
  ok: boolean
  error?: string
}

export async function sendEmail({ apiKey, from, to, subject, html }: SendEmailInput): Promise<SendEmailResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `Resend ${res.status}: ${body}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error sending email" }
  }
}
