import { lookup as buscarDns } from "node:dns";
import { request as pedirHttp } from "node:http";
import { request as pedirHttps } from "node:https";
import { BlockList, isIP } from "node:net";
import { ErrorHttp } from "./ErrorHttp.js";

/**
 * Pedidos a direcciones que carga una persona (addons y sus enlaces). Sin esto, alguien podría
 * apuntar un «addon» a la base de datos, a otro contenedor o a la red de la casa (SSRF).
 * La dirección se revisa dentro de `lookup`, justo antes de conectar: así un dominio no puede
 * contestar una IP pública al revisar y una privada al conectar.
 *
 * Los mensajes de error nunca incluyen la URL, porque puede llevar una clave.
 */
const PROHIBIDAS = new BlockList();
for (const [red, largo] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]]) {
  PROHIBIDAS.addSubnet(red, largo, "ipv4");
}
for (const [red, largo] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]]) {
  PROHIBIDAS.addSubnet(red, largo, "ipv6");
}

function esProhibida(ip) {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (v4) return PROHIBIDAS.check(v4, "ipv4");
  return PROHIBIDAS.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");
}

function lookupSeguro(nombre, opciones, listo) {
  buscarDns(nombre, { ...opciones, all: true }, (error, direcciones) => {
    if (error) return listo(error);
    if (direcciones.some((d) => esProhibida(d.address))) {
      return listo(new ErrorHttp(400, "Esa dirección apunta a una red privada"));
    }
    if (opciones.all) return listo(null, direcciones);
    listo(null, direcciones[0].address, direcciones[0].family);
  });
}

export function leerUrl(texto, { soloHttps = false } = {}) {
  let url;
  try {
    url = new URL(texto);
  } catch {
    throw new ErrorHttp(400, "La dirección no es válida");
  }
  const permitido = url.protocol === "https:" || (!soloHttps && url.protocol === "http:");
  if (!permitido) throw new ErrorHttp(400, soloHttps ? "La dirección tiene que empezar con https://" : "La dirección no es válida");
  if (url.username || url.password) throw new ErrorHttp(400, "La dirección no puede llevar usuario ni contraseña");
  const anfitrion = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(anfitrion) && esProhibida(anfitrion)) throw new ErrorHttp(400, "Esa dirección apunta a una red privada");
  return url;
}

/** Un pedido sin seguir redirecciones. `maxBytes` 0: solo interesan los encabezados. */
function pedirUna(url, { encabezados, maxBytes, esperaMs }) {
  return new Promise((resolver, rechazar) => {
    const pedir = url.protocol === "https:" ? pedirHttps : pedirHttp;
    const req = pedir(url, { method: "GET", headers: { "User-Agent": "MaxFlix/1.0", ...encabezados }, lookup: lookupSeguro, timeout: esperaMs }, (res) => {
      if (maxBytes === 0 || (res.statusCode >= 300 && res.statusCode < 400)) {
        res.destroy();
        return resolver({ estado: res.statusCode, encabezados: res.headers, cuerpo: null });
      }
      const partes = [];
      let total = 0;
      res.on("data", (parte) => {
        total += parte.length;
        if (total > maxBytes) {
          res.destroy();
          return rechazar(new ErrorHttp(502, "El addon respondió demasiados datos"));
        }
        partes.push(parte);
      });
      res.on("end", () => resolver({ estado: res.statusCode, encabezados: res.headers, cuerpo: Buffer.concat(partes).toString("utf8") }));
      res.on("error", () => rechazar(new ErrorHttp(502, "Se cortó la conexión")));
    });
    req.on("timeout", () => req.destroy(new ErrorHttp(504, "El servidor tardó demasiado")));
    req.on("error", (error) => rechazar(error instanceof ErrorHttp ? error : new ErrorHttp(502, "No se pudo conectar")));
    req.end();
  });
}

/** Sigue redirecciones revisando cada salto. Devuelve la respuesta y la dirección final. */
export async function pedirSeguro(texto, { soloHttps = false, encabezados = {}, maxBytes = 2_000_000, esperaMs = 15000, saltos = 5 } = {}) {
  let url = leerUrl(texto, { soloHttps });
  for (let i = 0; i <= saltos; i++) {
    const respuesta = await pedirUna(url, { encabezados, maxBytes, esperaMs });
    const destino = respuesta.encabezados.location;
    if (respuesta.estado < 300 || respuesta.estado >= 400 || !destino) return { ...respuesta, url: url.href };
    url = leerUrl(new URL(destino, url).href, { soloHttps });
  }
  throw new ErrorHttp(502, "Demasiadas redirecciones");
}

export async function pedirJson(texto, opciones) {
  const respuesta = await pedirSeguro(texto, opciones);
  if (respuesta.estado !== 200) throw new ErrorHttp(502, "El addon respondió " + respuesta.estado);
  try {
    return JSON.parse(respuesta.cuerpo);
  } catch {
    throw new ErrorHttp(502, "El addon no respondió JSON");
  }
}
