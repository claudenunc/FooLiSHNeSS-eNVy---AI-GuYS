// POST /api/lead — website contact form.
// Saves the lead to Supabase (durable), then emails Nathan via Resend (best effort).
// Env (Vercel project settings): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, LEAD_NOTIFY_TO, LEAD_FROM (optional)
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }

  // spam guards: hidden honeypot field + a human takes more than 3 seconds to fill the form
  if (clip(b.website, 200)) return res.status(200).json({ ok: true });
  if (Number(b.elapsed) > 0 && Number(b.elapsed) < 3000) return res.status(200).json({ ok: true });

  const lead = {
    name: clip(b.name, 120),
    business: clip(b.business, 160) || null,
    contact: clip(b.contact, 160),
    message: clip(b.message, 2000) || null,
    wants: clip(b.wants, 60) || null,
  };
  if (!lead.name || lead.contact.length < 3) return res.status(400).json({ ok: false, error: 'Please add your name and a phone number or email.' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, LEAD_NOTIFY_TO } = process.env;
  const LEAD_FROM = process.env.LEAD_FROM || 'FooLiSHNeSS eNVy website <onboarding@resend.dev>';

  let emailed = false;
  try {
    const text = [
      `New website lead`,
      ``,
      `Name: ${lead.name}`,
      `Business: ${lead.business || '-'}`,
      `Phone/email: ${lead.contact}`,
      `Interested in: ${lead.wants || '-'}`,
      ``,
      `What eats their week:`,
      lead.message || '-',
    ].join('\n');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: LEAD_FROM, to: [LEAD_NOTIFY_TO], subject: `Website lead: ${lead.name}${lead.business ? ' — ' + lead.business : ''}`, text }),
    });
    emailed = r.ok;
    if (!r.ok) console.error('resend', r.status, (await r.text()).slice(0, 300));
  } catch (e) { console.error('resend', e.message); }

  let saved = false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ ...lead, emailed }),
    });
    saved = r.ok;
    if (!r.ok) console.error('supabase', r.status, (await r.text()).slice(0, 300));
  } catch (e) { console.error('supabase', e.message); }

  if (!saved && !emailed) return res.status(500).json({ ok: false, error: "That didn't go through. Please text 270-709-0697 instead." });
  return res.status(200).json({ ok: true });
};
