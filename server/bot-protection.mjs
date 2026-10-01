import { ApiError } from './security.mjs'

// Cloudflare Turnstile je volitelný lokálně, ale produkční kontrola konfigurace
// jej může vynutit. Token se ověřuje výhradně server-to-server se secret klíčem.
export async function verifyBotChallenge(token, remoteAddress, config, expectedAction) {
  if (!config.botProtectionRequired) return
  if (!token || typeof token !== 'string' || token.length > 2_048) {
    throw new ApiError(400, 'BOT_CHALLENGE_REQUIRED', 'Potvrď, že požadavek neposílá automat.')
  }

  const form = new URLSearchParams({ secret: config.turnstileSecretKey, response: token })
  if (remoteAddress && remoteAddress !== 'unknown') form.set('remoteip', remoteAddress)

  let verification
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(6_000),
    })
    verification = response.ok ? await response.json() : null
  } catch {
    throw new ApiError(503, 'BOT_CHECK_UNAVAILABLE', 'Ochranu proti automatům se nepodařilo ověřit. Zkus to prosím znovu.')
  }

  const expectedHostname = new URL(config.publicSiteUrl).hostname
  if (!verification?.success || verification.action !== expectedAction || verification.hostname !== expectedHostname) {
    throw new ApiError(400, 'BOT_CHALLENGE_FAILED', 'Ochrana proti automatům ověření odmítla.')
  }
}
