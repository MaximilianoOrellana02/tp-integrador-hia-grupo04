'use strict';

/**
 * ID de IMDb de cada título de TMDB (2026-10-17). Antes vivía solo en memoria: cada vez
 * que el backend arrancaba se perdía y armar Películas volvía a pedirle ~140 a TMDB.
 * Un ID de IMDb no cambia, así que no vence.
 * - tipo_tmdb: "movie" o "tv" (TMDB numera películas y series por separado).
 * - Solo se guardan los que existen: un título sin ID de IMDb puede tenerlo más adelante.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ids_imdb', {
      tipo_tmdb: {
        type: Sequelize.STRING(5),
        primaryKey: true
      },
      tmdb_id: {
        type: Sequelize.INTEGER,
        primaryKey: true
      },
      imdb_id: {
        type: Sequelize.STRING(15),
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ids_imdb');
  }
};
