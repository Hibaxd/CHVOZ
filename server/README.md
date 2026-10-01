# CHVOZ backend

Backend běží na Node.js 24 a vestavěném SQLite. Nepotřebuje samostatný databázový
server ani nativní npm modul. Vývojový frontend a API spustí společně:

```powershell
node scripts/dev.mjs
```

Samostatné API lze spustit pomocí `node server/server.mjs`. Výchozí adresa je
`http://127.0.0.1:8787`; data vzniknou v `data/chvoz.sqlite` a nahrané soubory v
`data/uploads`. Po produkčním buildu umí API ze stejného portu servírovat i `dist`,
což zjednodušuje cookies a CORS.

## Serverové proměnné

Patří do `.env.local`, který nesmí být commitnutý:

- `CHVOZ_ADMIN_USERNAME` a `CHVOZ_ADMIN_EMAIL`
- `CHVOZ_ADMIN_PASSWORD_SHA256` pro jednorázové převzetí starého lokálního hashe;
  po prvním úspěšném loginu se v databázi automaticky změní na scrypt
- alternativně `CHVOZ_ADMIN_PASSWORD` pouze při úplně prvním seedování
- `CHVOZ_BANK_ACCOUNT` zapne bankovní převod
- `CHVOZ_ALLOWED_ORIGINS` je čárkou oddělený seznam povolených frontend adres
- `CHVOZ_PORT`, `CHVOZ_HOST`, `CHVOZ_DATA_DIR` a `CHVOZ_DATABASE_PATH` mění provozní cesty

Proměnné začínající `VITE_` jsou veřejné a nesmí obsahovat heslo ani serverový
secret. V produkci musí server běžet za HTTPS; pak používá `Secure` cookies s
prefixem `__Host-`.

## API

- `GET /api/config`, `GET /api/catalog`, `/api/products`, `/api/gallery`, `/api/archive`
- `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- `GET /api/cart`, `POST /api/cart/items`, `PATCH|DELETE /api/cart/items/:id`, `DELETE /api/cart`
- `POST /api/orders`, `GET /api/orders/mine`, `GET /api/orders/:id`
- staff: CRUD produktů a médií, `GET /api/admin/orders`, `PATCH /api/admin/orders/:id/status`
- admin: `GET|POST /api/admin/users`, `PATCH /api/admin/users/:id`

Frontend musí u všech requestů používat `credentials: 'include'`. Cenu, dopravu,
sklad i role vždy znovu ověřuje server; hodnoty poslané prohlížečem nejsou autoritativní.

## Ověření

```powershell
node server/smoke-test.mjs
```

Test vytvoří izolovanou dočasnou databázi a ověří seed, registraci, session cookie,
cookie košík, objednávku, dopravu zdarma, odečet i vrácení skladu, admin login,
bezpečný upload a změnu stavu objednávky. Po doběhnutí všechna testovací data smaže.

Před veřejným provozem je ještě nutné nastavit zálohy databáze a uploadů, HTTPS,
reálný e-mailový kanál a integrace dopravce/platební brány. Backend úmyslně
neoznačuje bankovní převod jako zaplacený bez potvrzení administrátorem nebo budoucím webhookem.

