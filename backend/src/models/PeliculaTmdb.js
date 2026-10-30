import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/db.js';

/** Datos del póster de una película de TMDB (lo usa `peliculasTmdb.service`). */
export class PeliculaTmdb extends Model {}

PeliculaTmdb.init(
  {
    tmdbId: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    imdbId: {
      type: DataTypes.STRING(15),
      allowNull: true
    },
    titulo: {
      type: DataTypes.STRING(300),
      allowNull: false
    },
    poster: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    estreno: {
      type: DataTypes.STRING(10),
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'peliculas_tmdb'
  }
);
