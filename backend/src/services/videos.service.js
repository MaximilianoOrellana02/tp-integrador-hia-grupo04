import { VideoLibre } from "../models/index.js";
import { ErrorHttp } from "../utils/ErrorHttp.js";

const IMAGENES = "https://images.metahub.space";

/** Los videos libres como los copia el progreso, para mostrarlos en una fila. */
export async function listarVideos() {
  const videos = await VideoLibre.findAll({ order: [["anio", "DESC"]] });
  return videos.map((v) => ({
    id: v.idVideo,
    tipo: "movie",
    nombre: v.nombre,
    poster: `${IMAGENES}/poster/medium/${v.idVideo}/img`,
    fondo: `${IMAGENES}/background/medium/${v.idVideo}/img`,
    anio: v.anio,
    generos: [],
    descripcion: v.descripcion,
  }));
}

export async function obtenerVideo(idVideo) {
  const video = await VideoLibre.findByPk(idVideo);
  if (!video) throw new ErrorHttp(404, "Este título no tiene un video libre");
  return { url: video.url, autor: video.autor, licencia: video.licencia };
}
