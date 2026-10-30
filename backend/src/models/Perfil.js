import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/db.js';
import { urlDeAvatar } from '../utils/catalogoAvatares.js';

// «original» es lo que la app muestra como «Subtitulado» (el audio del idioma original)
export const IDIOMAS_AUDIO = ['latino', 'castellano', 'original'];
export const IDIOMAS_SUBTITULOS = ['ninguno', 'espanol', 'ingles'];
// «automatica»: lo que la app hace sin preferencia (1080p primero, 4K detrás)
export const CALIDADES = ['automatica', '4k', '1080p', '720p'];

export class Perfil extends Model {}

Perfil.init(
  {
    cuentaId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    nombre: {
      type: DataTypes.STRING(30),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'El nombre del perfil es obligatorio' },
        len: { args: [1, 30], msg: 'El nombre puede tener hasta 30 caracteres' }
      }
    },
    avatar: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'avatar_01',
      // Solo la forma: si el avatar existe y se puede elegir lo revisa perfiles.service
      // (los cargados están en la base y se suman con el tiempo)
      validate: { is: { args: /^avatar_\d{2,4}$/, msg: 'Avatar no válido' } }
    },
    // Dirección de la imagen del avatar, o null si es uno de los colores (ver catalogoAvatares)
    avatarUrl: {
      type: DataTypes.VIRTUAL,
      get() {
        return urlDeAvatar(this.getDataValue('avatar'));
      }
    },
    // Orden en que se buscan los audios al tocar «Reproducir»: siempre los tres
    // idiomas, sin repetir (ej.: ['castellano', 'latino', 'original'])
    idiomasAudio: {
      type: DataTypes.ARRAY(DataTypes.STRING(20)),
      allowNull: false,
      defaultValue: ['latino', 'castellano', 'original'],
      validate: {
        esOrdenCompleto(valor) {
          const valido =
            Array.isArray(valor) &&
            valor.length === IDIOMAS_AUDIO.length &&
            new Set(valor).size === valor.length &&
            valor.every((idioma) => IDIOMAS_AUDIO.includes(idioma));
          if (!valido) {
            throw new Error(`El orden de idiomas tiene que tener ${IDIOMAS_AUDIO.join(', ')}, una vez cada uno`);
          }
        }
      }
    },
    idiomaSubtitulos: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ninguno',
      validate: { isIn: { args: [IDIOMAS_SUBTITULOS], msg: 'Idioma de subtítulos no válido' } }
    },
    calidadMaxima: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'automatica',
      validate: { isIn: { args: [CALIDADES], msg: 'Calidad no válida' } }
    },
    orden: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  },
  {
    sequelize,
    tableName: 'perfiles'
  }
);