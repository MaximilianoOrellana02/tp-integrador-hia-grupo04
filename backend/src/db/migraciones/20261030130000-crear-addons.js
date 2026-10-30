'use strict';

/**
 * Los addons que carga cada cuenta. La URL suele llevar una clave adentro, así que va cifrada;
 * `huella` es un HMAC de la URL, para no repetir un addon sin poder leerla.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('addons', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      cuenta_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'cuentas', key: 'id' },
        onDelete: 'CASCADE'
      },
      nombre: { type: Sequelize.STRING(120), allowNull: false },
      url_cifrada: { type: Sequelize.TEXT, allowNull: false },
      huella: { type: Sequelize.STRING(64), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('addons', ['cuenta_id', 'huella'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('addons');
  }
};
