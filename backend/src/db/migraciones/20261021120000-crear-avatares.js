'use strict';

/**
 * Avatares de perfil (2026-10-21): imágenes que carga el administrador desde la app y que
 * cada perfil elige. Van en la base y no en el disco de el servidor, que se borra en cada
 * despliegue.
 * - clave: lo que guarda `perfiles.avatar` ("avatar_13"). avatar_01 … avatar_12 son los
 *   colores de siempre y no necesitan fila (si la tienen, la imagen reemplaza al color).
 * - imagen / tipo: el archivo ya achicado (WebP, PNG o JPEG, hasta 300 KB).
 * - hash: SHA-256 de la imagen, para no cargar dos veces la misma.
 * - retirado: no aparece para elegir, pero los perfiles que ya lo tienen lo siguen viendo.
 *   Nunca se borra un avatar en uso.
 * - updated_at: cambia con cada imagen nueva y va en la URL (?v=…): así las apps no se
 *   quedan con la imagen vieja guardada en caché.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('avatares', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      clave: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true
      },
      imagen: {
        type: Sequelize.BLOB,
        allowNull: false
      },
      tipo: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      hash: {
        type: Sequelize.CHAR(64),
        allowNull: false,
        unique: true
      },
      orden: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      retirado: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('avatares');
  }
};
