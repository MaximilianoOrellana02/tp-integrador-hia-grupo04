import { UniqueConstraintError, ValidationError } from 'sequelize';
import { ErrorHttp } from '../utils/ErrorHttp.js';

export function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

export function manejarErrores(err, req, res, next) {
  if (err instanceof UniqueConstraintError) {
    const mensaje = err.fields?.email
      ? 'Ese email ya está registrado'
      : 'Ya existe un registro con esos datos';
    return res.status(409).json({ error: mensaje });
  }

  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.errors.map((e) => e.message).join('. ') });
  }

  // Errores previstos (ErrorHttp), incluidos los 502 cuando TMDB no responde:
  // su mensaje está pensado para mostrarse
  if (err instanceof ErrorHttp || (err.status && err.status < 500)) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
}