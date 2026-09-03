// Env vars falsas pero válidas contra el schema de src/config/env.ts, para que
// los tests no dependan de credenciales reales de Supabase. Debe ejecutarse
// antes de importar cualquier módulo que importe src/config/env.ts.
process.env.NODE_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.APP_TIMEZONE = "America/Bogota";
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
process.env.DIRECT_URL = "postgresql://user:pass@localhost:5432/test";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.INTERNAL_JOBS_TOKEN = "test-internal-jobs-token-0123456789";
process.env.WHATSAPP_VERIFY_TOKEN = "test-whatsapp-verify-token";
// Clave AES-256 (32 bytes en base64) para utils/crypto.ts — cifrado de secretos
// por-tenant. Valor fijo de test; crypto.test.ts prueba los casos borde aparte.
process.env.SECRETS_ENCRYPTION_KEY = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=";
// Better Auth (panel de operador). Secreto de test, no valida contra nada real.
process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-0123456789abcdef";
// Sin valor por defecto salvo que un archivo de test la fije explícitamente (ver
// gift-card-redeem.test.ts): así el resultado no depende del .env local del dev.
process.env.STAFF_PIN = "";
