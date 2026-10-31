'use strict';

/** Si los catálogos de un addon aparecen en «Para ti». Por defecto sí; cada cuenta lo elige por addon. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('addons', 'en_inicio', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('addons', 'en_inicio');
  }
};
