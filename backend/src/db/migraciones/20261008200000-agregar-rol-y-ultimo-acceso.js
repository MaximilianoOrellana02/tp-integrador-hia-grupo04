'use strict';

/**
 * - rol: "usuario" o "admin". El admin puede ver todas las cuentas desde el panel.
 *   La restricción CHECK evita valores inventados aunque alguien escriba directo en la base.
 * - ultimo_acceso: última vez que la cuenta usó la API (se actualiza cada pocos minutos).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('cuentas', 'rol', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'usuario'
    });
    await queryInterface.addConstraint('cuentas', {
      fields: ['rol'],
      type: 'check',
      where: { rol: ['usuario', 'admin'] },
      name: 'cuentas_rol_valido'
    });
    await queryInterface.addColumn('cuentas', 'ultimo_acceso', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('cuentas', 'ultimo_acceso');
    await queryInterface.removeConstraint('cuentas', 'cuentas_rol_valido');
    await queryInterface.removeColumn('cuentas', 'rol');
  }
};
