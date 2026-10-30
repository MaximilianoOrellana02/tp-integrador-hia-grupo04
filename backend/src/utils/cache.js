/**
 * Caché en memoria con vencimiento y tamaño máximo.
 *
 * Alcanza para un solo servidor: si se reinicia, se vacía y se vuelve a llenar sola.
 * Sirve para no repetirle a TMDB los mismos pedidos (ej.: el elenco de una película
 * que abren varias personas) y para que la app reciba la respuesta más rápido.
 */
export function crearCache({ duracionMs, maximo }) {
  const datos = new Map();
  // Cálculos que todavía no terminaron: un segundo pedido igual espera al primero
  const enCurso = new Map();

  return {
    obtener(clave) {
      const entrada = datos.get(clave);
      if (!entrada) return undefined;
      if (entrada.vence < Date.now()) {
        datos.delete(clave);
        return undefined;
      }
      return entrada.valor;
    },

    guardar(clave, valor) {
      // Un Map recuerda el orden de inserción: el primero es el más viejo
      if (datos.size >= maximo) datos.delete(datos.keys().next().value);
      datos.set(clave, { valor, vence: Date.now() + duracionMs });
    },

    /**
     * Devuelve lo guardado o, si no hay, ejecuta `calcular` y guarda el resultado. Si ya se
     * está calculando esa clave, espera ese mismo cálculo (al despertar el servidor llegan
     * varios pedidos juntos y cada uno lo armaba de cero). Si falla, no se guarda nada.
     */
    async obtenerOCalcular(clave, calcular) {
      const guardado = this.obtener(clave);
      if (guardado !== undefined) return guardado;
      if (enCurso.has(clave)) return enCurso.get(clave);

      const promesa = (async () => {
        try {
          const valor = await calcular();
          this.guardar(clave, valor);
          return valor;
        } finally {
          enCurso.delete(clave);
        }
      })();
      enCurso.set(clave, promesa);
      return promesa;
    },
  };
}
