'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('perfiles', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      cuenta_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'cuentas', key: 'id' },
        // Si se borra la cuenta, se borran sus perfiles
        onDelete: 'CASCADE'
      },
      nombre: {
        type: Sequelize.STRING(30),
        allowNull: false
      },
      avatar: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'avatar_01'
      },
      idioma_audio: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'latino'
      },
      idioma_subtitulos: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'ninguno'
      },
      calidad_maxima: {
        type: Sequelize.STRING(10),
        allowNull: false,
        defaultValue: '1080p'
      },
      orden: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
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

    // Dos perfiles de la misma cuenta no pueden llamarse igual
    await queryInterface.addIndex('perfiles', ['cuenta_id', 'nombre'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('perfiles');
  }
};