import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { usuarios } from "./db/schema.js";

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) throw new Error("SESSION_SECRET deve possuir pelo menos 32 caracteres.");
const ttl = 8 * 60 * 60;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected || expected.length !== 128) return false;
  try {
    const actual = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
  } catch { return false; }
}
const b64 = (value) => Buffer.from(value).toString("base64url");
export function signToken(user) {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(JSON.stringify({ userId: user.id, perfil: user.perfil, primeiroAcesso: Boolean(user.primeiroAcesso), iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttl }));
  const signature = b64(crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}
export function verifyToken(token) {
  const [header, payload, signature] = String(token || "").split(".");
  if (!header || !payload || !signature) return null;
  const expected = b64(crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    return value.exp > Math.floor(Date.now() / 1000) ? value : null;
  } catch { return null; }
}
export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Não autenticado." });
  try {
    const [user] = await db.select({ id: usuarios.id, perfil: usuarios.perfil, ativo: usuarios.ativo, primeiroAcesso: usuarios.primeiroAcesso }).from(usuarios).where(eq(usuarios.id, payload.userId));
    if (!user || !user.ativo) return res.status(401).json({ error: "Usuário inválido ou inativo." });
    req.usuario = user;
    if (user.primeiroAcesso && !(["/me", "/auth/me", "/trocar-senha", "/auth/trocar-senha"].includes(req.path))) return res.status(403).json({ error: "Troque sua senha no primeiro acesso." });
    next();
  } catch (error) { next(error); }
}
export const roles = (...allowed) => (req, res, next) => allowed.includes(req.usuario?.perfil) ? next() : res.status(403).json({ error: "Você não possui permissão para esta operação." });
export const onlyDigits = (value) => String(value || "").replace(/\D/g, "");
export const validId = (value) => Number.isInteger(Number(value)) && Number(value) > 0;