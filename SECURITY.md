# Bezpečnost a produkční provoz CHVOZ

## Co aplikace chrání sama

- hashované 256bit relace v `HttpOnly`, produkčně `Secure` a `__Host-` cookies;
- hesla pomocí salted `scrypt`, serverové role a absolutní expirace staff relace 12 hodin;
- kontrola `Origin`/`Referer`, CSP, HSTS, zakázané framing/permissions a `no-store` API;
- parametrizované SQL, transakční sklad a idempotentní vytvoření objednávky;
- rate limiting pro celý web, login, registraci, košík, checkout a staff zápisy;
- Turnstile + honeypot pro registraci a checkout, včetně kontroly hostname a action;
- upload pouze PNG/JPEG/WebP/GIF, magic bytes, hashovaný název, limit velikosti, rozlišení, pixelů, celkové kvóty a rezervy disku;
- auditní záznamy změn produktů, médií, objednávek a rolí.

## Povinné před prvním ostrým spuštěním

1. Změň admin heslo. Heslo použité během vývoje bylo sdílené v konverzaci a pro produkci se považuje za kompromitované.
2. Vytvoř Turnstile site/secret klíč a ulož ho jen do `/etc/chvoz/chvoz.env` nebo secrets manageru.
3. Node nech na `127.0.0.1:8787`; internet smí vidět pouze Nginx/CDN/WAF na 80/443.
4. Použij lokální trvalý disk `/var/lib/chvoz`, nikdy OneDrive/NFS/synchronizovanou složku.
5. Spouštěj jednu instanci. Pro více replik přejdi na PostgreSQL a objektové úložiště.
6. Nastav firewall, automatické bezpečnostní aktualizace, monitoring 5xx/429, místa na disku a expirace TLS.
7. Dobírku a rezervaci skladu zapni až s reálným potvrzováním e-mailu/SMS. Platební kartu označuj jako zaplacenou pouze z podepsaného webhooku brány.
8. `X-Forwarded-For` přijímej jen od vlastní proxy. Nginx vzor původní klientský header přepisuje; při Cloudflare proxy musíš navíc bezpečně nakonfigurovat jeho aktuální real-IP rozsahy.

## Záloha a obnova

SQLite běží ve WAL režimu. Nekopíruj pouze živý `chvoz.sqlite`. Nejjednodušší konzistentní varianta pro malý obchod je krátké zastavení služby, snapshot celého `/var/lib/chvoz` (DB, `-wal`, `-shm`, uploads) a opětovné spuštění. Zálohu šifruj, ukládej off-site a pravidelně zkoušej obnovu na jiném stroji.

Před každým deployem:

```bash
pnpm install --frozen-lockfile
pnpm run verify
NODE_ENV=production pnpm run check:production
```

## Omezení

Žádný kód nezaručí absolutní ochranu proti DDoS, zero-day chybám, kompromitovanému serveru nebo podvodu se skutečnými identitami. Produkční obrana musí kombinovat aplikaci, aktualizovaný OS/Node, TLS proxy, CDN/WAF, správu secrets, zálohy, monitoring a reakci na incidenty.
