'use strict';

/**
 * Lo mínimo para dibujar el póster de una película de TMDB (2026-10-17): lo usan las listas
 * fijas de Películas (ganadoras y nominadas al Óscar). Antes se pedía la ficha completa de
 * cada una a TMDB cada vez que el backend arrancaba (26 ganadoras + las nominadas del día).
 * - poster: la ruta de TMDB («/abc.jpg»), sin el tamaño.
 * - estreno: «2024-10-14».
 * - Se vuelve a pedir a TMDB a los 30 días (updated_at): el póster o el título en
 *   español pueden cambiar.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('peliculas_tmdb', {
      tmdb_id: {
        type: Sequelize.INTEGER,
        primaryKey: true
      },
      imdb_id: {
        type: Sequelize.STRING(15),
        allowNull: true
      },
      titulo: {
        type: Sequelize.STRING(300),
        allowNull: false
      },
      poster: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      estreno: {
        type: Sequelize.STRING(10),
        allowNull: true
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
    await queryInterface.dropTable('peliculas_tmdb');
  }
};
