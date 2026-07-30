// French invitation email body. Kept as plain string templates rather than a
// component/rendering library — one email, no reuse pressure yet.

export interface InviteEmailInput {
  collegeName: string
  /** Public URL, already resolved — this module does no storage lookups. */
  collegeLogoUrl: string | null
  recipientName: string
  actionLink: string
}

export function inviteEmailSubject({ collegeName }: InviteEmailInput): string {
  return `Bienvenue sur l'espace budget de ${collegeName}`
}

export function inviteEmailHtml({ collegeName, collegeLogoUrl, recipientName, actionLink }: InviteEmailInput): string {
  const logo = collegeLogoUrl
    ? `<img src="${collegeLogoUrl}" alt="${collegeName}" width="48" height="48" style="border-radius:10px;display:block;margin:0 0 16px;" />`
    : ""

  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1c1c1c;">
      ${logo}
      <h1 style="font-size:18px;margin:0 0 12px;">Bonjour ${recipientName},</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px;">
        Un compte vient d'être créé pour vous sur l'espace de gestion budgétaire de
        <strong>${collegeName}</strong>. Pour y accéder, choisissez votre mot de passe
        en cliquant sur le bouton ci-dessous.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${actionLink}" style="background:#0f3d3e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;display:inline-block;">
          Choisir mon mot de passe
        </a>
      </p>
      <p style="font-size:12px;line-height:1.6;color:#6b6b6b;margin:0;">
        Ce lien est à usage unique et expire après un certain délai. Si vous ne vous
        attendiez pas à cet e-mail, vous pouvez l'ignorer.
      </p>
    </div>
  `
}
