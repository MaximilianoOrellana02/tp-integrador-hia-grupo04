'use strict';

/**
 * «Mi lista» de cada perfil (2026-10-17): películas y series guardadas para después.
 * - id_titulo: el ID de IMDb del título ("tt0111161").
 * - titulo: copia de los datos (nombre, póster, géneros…), como en `progreso`, para
 *   mostrar la lista sin pedirle cada título a Cinemeta.
 * - created_at: cuándo se agregó (ordena «Agregado recientemente»).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('mi_lista', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      perfil_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'perfiles', key: 'id' },
        // Si se borra el perfil, se borra su lista
        onDelete: 'CASCADE'
      },
      id_titulo: {
        type: Sequelize.STRING(60),
        allowNull: false
      },
      titulo: {
        type: Sequelize.JSONB,
        allowNull: false
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

    // Un título una sola vez por perfil
    await queryInterface.addIndex('mi_lista', ['perfil_id', 'id_titulo'], {
      unique: true,
      name: 'mi_lista_perfil_titulo'
    });
    // La lista de un perfil, de lo último agregado a lo primero
    await queryInterface.addIndex('mi_lista', ['perfil_id', 'created_at'], {
      name: 'mi_lista_perfil_reciente'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mi_lista');
  }
};
