'use strict';

/**
 * Por dónde va cada perfil en cada video («Seguir viendo», «Continuar»).
 * - id_video: texto ("tt0111161" o "tt0903747:1:3"), el ID de IMDb del video.
 * - titulo / episodio / siguiente: copia de los datos para mostrar «Seguir viendo»
 *   sin pedirle cada título a Cinemeta (decisión del 2026-10-12).
 * - updated_at lo pone el servidor: el reloj de la app puede estar mal.
 * Milisegundos en INTEGER (hasta ~596 horas): BIGINT llegaría como texto a Node.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('progreso', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      perfil_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'perfiles', key: 'id' },
        // Si se borra el perfil, se borra su progreso
        onDelete: 'CASCADE'
      },
      id_video: {
        type: Sequelize.STRING(60),
        allowNull: false
      },
      posicion_ms: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      duracion_ms: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      titulo: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      episodio: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      siguiente: {
        type: Sequelize.JSONB,
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

    // Un registro por perfil y video (el guardado lo actualiza)
    await queryInterface.addIndex('progreso', ['perfil_id', 'id_video'], {
      unique: true,
      name: 'progreso_perfil_video'
    });
    // «Seguir viendo»: los más recientes de un perfil
    await queryInterface.addIndex('progreso', ['perfil_id', 'updated_at'], {
      name: 'progreso_perfil_reciente'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('progreso');
  }
};
