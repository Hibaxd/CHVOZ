# CHVOZ — full-stack e-shop

React/TypeScript frontend a vlastní Node.js backend se SQLite databází. Web zachovává
VHS vizuál, ale účty, role, košík, katalog, uploady, objednávky a sklad už nejsou demo
data v prohlížeči.

## Lokální spuštění na Windows

Projekt vyžaduje Node.js 24 nebo novější. V PowerShellu používej příkazy s příponou
`.cmd`, které neblokuje Execution Policy:

```powershell
cd C:\Users\Marek\OneDrive\Dokumenty\CHVOZ
pnpm.cmd install --frozen-lockfile
pnpm.cmd run dev
```

Potom otevři [http://127.0.0.1:4173](http://127.0.0.1:4173). Jeden příkaz spouští:

- web na portu `4173`,
- API na portu `8787`.

Oba servery vypneš jedním `Ctrl+C` ve stejném okně PowerShellu.

## Co se ukládá

- databáze: `data/chvoz.sqlite`,
- nahrané obrázky: `data/uploads/`,
- v prohlížeči zůstávají jen náhodné `HttpOnly` identifikátory relace a košíku,
- hesla jsou uložená jako salted `scrypt` hash,
- objednávka obsahuje neměnnou kopii názvů, cen a položek z okamžiku nákupu.

Složka `data/` a `.env.local` jsou ignorované Gitem. Databázi v ostrém provozu
pravidelně zálohuj včetně uploadů.

## Konfigurace

Lokální tajné hodnoty jsou v `.env.local`; bezpečnou šablonu obsahuje `.env.example`.
Server podporuje mimo jiné:

```dotenv
CHVOZ_ADMIN_USERNAME=Hiba
CHVOZ_ADMIN_EMAIL=admin@example.cz
CHVOZ_ADMIN_PASSWORD_SHA256=...
CHVOZ_BANK_ACCOUNT=123456789/0100
CHVOZ_ALLOWED_ORIGINS=https://www.chvoz.cz
```

Admin hash z původní verze se po prvním úspěšném přihlášení automaticky převede na
`scrypt`. Tajné hodnoty nikdy nepojmenovávej `VITE_*` — taková proměnná by se mohla
dostat do klientského JavaScriptu.

## Kontroly

```powershell
pnpm.cmd run verify
```

Backendový test prochází registraci, cookies, košík, objednávku, sklad, admin login,
upload, změnu stavu i vrácení skladu po stornu. Podrobný popis API je v
[`server/README.md`](server/README.md).

## Produkční provoz

Produkce používá jedinou Node instanci na `127.0.0.1:8787` za HTTPS reverse proxy.
Připravené vzory jsou v `deploy/nginx-chvoz.conf.example`,
`deploy/chvoz-proxy.conf.example` a `deploy/chvoz.service.example`.

Minimální postup na Linux serveru:

1. vytvoř samostatného uživatele `chvoz`, kód v `/opt/chvoz/current` a data v `/var/lib/chvoz`;
2. secrets ulož do `/etc/chvoz/chvoz.env` s právy `0600` podle `.env.example`;
3. spusť `pnpm install --frozen-lockfile && pnpm run verify` (ověření už obsahuje build);
4. pouze při úplně prvním nasazení nastav nové jednorázové `CHVOZ_ADMIN_PASSWORD` a bez veřejného proxy spusť bootstrap:

```bash
NODE_ENV=production pnpm run bootstrap:production
```

5. hned potom `CHVOZ_ADMIN_PASSWORD` ze secrets odstraň; heslo už je v DB jako `scrypt` hash;
6. ještě před startem veřejné služby spusť produkční kontrolu:

```bash
NODE_ENV=production pnpm run check:production
```

7. až po úspěšné kontrole nastav DNS/certifikát, nainstaluj Nginx a zapni systemd službu. Vzor služby stejnou kontrolu opakuje přes `ExecStartPre` při každém restartu.

Při dalších deployích spusť `pnpm install --frozen-lockfile`, `pnpm run verify` a
`NODE_ENV=production pnpm run check:production` před restartem služby nebo přepnutím
nové verze do Nginx.

V produkci se `.env.local` záměrně nenačítá. Povinné jsou skutečné HTTPS originy,
`CHVOZ_PUBLIC_URL`, explicitní trvalý `CHVOZ_DATA_DIR` a při zapnuté ochraně botů
oba Turnstile klíče. Node port nesmí být ve firewallu veřejný.
`CHVOZ_TRUST_PROXY=true` smí důvěřovat pouze adrese vlastní lokální proxy uvedené v
`CHVOZ_TRUSTED_PROXY_ADDRESSES`. Pokud doménu proxuje Cloudflare, použij jeho aktuální
důvěryhodné real-IP rozsahy a `CF-Connecting-IP`; jinak nech DNS záznam v režimu DNS-only.

Dobírka a evidence bankovního převodu jsou implementované, ale před reálným prodejem
je nutné doplnit transakční e-maily a ověření kontaktu. Online karta, výdejní widget
a štítky dopravce vyžadují smlouvu a tajné API klíče; zaplacení se smí potvrdit
jen podepsaným webhookem brány.

Kompletní bezpečnostní checklist, omezení a zálohování jsou v [SECURITY.md](SECURITY.md).
