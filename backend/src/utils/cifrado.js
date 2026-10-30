import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Cifra las URL de los addons con AES-256-GCM. La clave (ADDONS_CLAVE, 64 caracteres hexadecimales)
 * vive en el entorno: un backup de la base no alcanza para leerlas. Si se pierde, hay que volver a
 * cargar los addons. GCM además detecta si el valor guardado fue modificado.
 */
function clave() {
  const hex = process.env.ADDONS_CLAVE ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error("ADDONS_CLAVE tiene que tener 64 caracteres hexadecimales");
  }
  return Buffer.from(hex, "hex");
}

export function verificarClave() {
  clave();
}

export function cifrar(texto) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  return [iv, cifrador.getAuthTag(), datos].map((p) => p.toString("base64")).join(".");
}

export function descifrar(guardado) {
  const [iv, etiqueta, datos] = guardado.split(".").map((p) => Buffer.from(p, "base64"));
  const descifrador = createDecipheriv("aes-256-gcm", clave(), iv);
  descifrador.setAuthTag(etiqueta);
  return Buffer.concat([descifrador.update(datos), descifrador.final()]).toString("utf8");
}

export function huella(texto) {
  return createHmac("sha256", clave()).update(texto).digest("hex");
}
