type BrandedEmailInput = {
  eyebrow: string;
  headline: string;
  body: string;
  primaryAction: { label: string; url: string };
  extra?: string;
};

export function renderBrandedEmailHtml({ eyebrow, headline, body, primaryAction, extra = "" }: BrandedEmailInput) {
  return `<main style="max-width:560px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;color:#0f172a"><section style="border:1px solid #dbeafe;border-radius:18px;padding:24px"><p style="margin:0;color:#0B57D0;font-size:12px;font-weight:700;letter-spacing:.12em">${eyebrow}</p><h1 style="margin:14px 0 0;font-size:24px">${headline}</h1><p style="margin:14px 0 0;color:#475569;line-height:1.5">${body}</p><a href="${primaryAction.url}" style="display:block;margin-top:22px;border-radius:9px;background:#0B57D0;padding:14px;color:#fff;text-align:center;font-weight:700;text-decoration:none">${primaryAction.label}</a>${extra}</section></main>`;
}

export function renderSecondaryActions(actions: Array<{ label: string; url: string }>) {
  return `<p style="margin:20px 0 8px;color:#475569;font-size:13px;font-weight:700">Or decline with one reason</p><div>${actions.map(action => `<a href="${action.url}" style="display:inline-block;margin:0 8px 8px 0;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;color:#334155;font-size:13px;font-weight:700;text-decoration:none">${action.label}</a>`).join("")}</div>`;
}
