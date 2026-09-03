-- Better Auth 1.7+ agregó `account.issuer` (obligatorio) — el CLI 1.4.x que
-- generó `..._better_auth` no lo incluyó. La tabla `account` está vacía en prod
-- (auth recién se estrena en F3); el DEFAULT '' solo cubre el instante de la
-- migración y Better Auth siempre escribe el valor real en cada insert.
ALTER TABLE "account" ADD COLUMN "issuer" TEXT NOT NULL DEFAULT '';
