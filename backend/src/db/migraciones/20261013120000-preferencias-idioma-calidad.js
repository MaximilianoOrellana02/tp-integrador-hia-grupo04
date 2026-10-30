'use strict';

/**
 * Preferencias de reproducción como las muestra Ajustes en la app:
 *
 * - `idioma_audio` (un solo idioma) pasa a `idiomas_audio`: el ORDEN en que se buscan
 *   los audios, ej. {latino,castellano,original}. «original» es lo que la app muestra
 *   como «Subtitulado». El idioma que tenía cada perfil queda primero; el viejo
 *   «ingles» pasa a «original» (casi siempre es el idioma original).
 * - `calidad_maxima` suma «automatica» y pasa a ser el valor por defecto. Los perfiles
 *   existentes tenían «1080p» porque era el valor por defecto (no había dónde
 *   elegirla): pasan a «automatica», que es lo que la app hacía hasta ahora.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'perfiles',
        'idiomas_audio',
        {
          type: Sequelize.ARRAY(Sequelize.STRING(20)),
          allowNull: false,
          defaultValue: ['latino', 'castellano', 'original']
        },
        { transaction }
      );

      // El idioma de antes primero y después los otros dos, en el orden por defecto
      await queryInterface.sequelize.query(
        `UPDATE perfiles SET idiomas_audio = CASE
           WHEN idioma_audio = 'castellano' THEN ARRAY['castellano', 'latino', 'original']
           WHEN idioma_audio IN ('ingles', 'original') THEN ARRAY['original', 'latino', 'castellano']
           ELSE ARRAY['latino', 'castellano', 'original']
         END::varchar(20)[]`,
        { transaction }
      );
      await queryInterface.removeColumn('perfiles', 'idioma_audio', { transaction });

      await queryInterface.changeColumn(
        'perfiles',
        'calidad_maxima',
        { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'automatica' },
        { transaction }
      );
      await queryInterface.sequelize.query(
        `UPDATE perfiles SET calidad_maxima = 'automatica' WHERE calidad_maxima = '1080p'`,
        { transaction }
      );
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'perfiles',
        'idioma_audio',
        { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'latino' },
        { transaction }
      );
      await queryInterface.sequelize.query(
        'UPDATE perfiles SET idioma_audio = idiomas_audio[1]',
        { transaction }
      );
      await queryInterface.removeColumn('perfiles', 'idiomas_audio', { transaction });

      await queryInterface.sequelize.query(
        `UPDATE perfiles SET calidad_maxima = '1080p' WHERE calidad_maxima = 'automatica'`,
        { transaction }
      );
      await queryInterface.changeColumn(
        'perfiles',
        'calidad_maxima',
        { type: Sequelize.STRING(10), allowNull: false, defaultValue: '1080p' },
        { transaction }
      );
    });
  }
};
