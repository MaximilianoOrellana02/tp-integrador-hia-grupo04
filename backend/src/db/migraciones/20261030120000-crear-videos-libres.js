'use strict';

/**
 * Los únicos videos que reproduce la app: películas con licencia libre, por enlace directo a sus
 * sitios oficiales. El catálogo de TMDB solo muestra información; sin fila acá, no hay video.
 */
const VIDEOS = [
  {
    id_video: 'tt1254207',
    nombre: 'Big Buck Bunny',
    anio: '2008',
    descripcion: 'Un conejo gigante y bonachón se venga de tres roedores que le arruinan el día.',
    url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
    autor: 'Blender Foundation',
    licencia: 'CC BY 3.0'
  },
  {
    id_video: 'tt1727587',
    nombre: 'Sintel',
    anio: '2010',
    descripcion: 'Una joven recorre un mundo hostil en busca del pequeño dragón que crió.',
    url: 'https://archive.org/download/Sintel/sintel-2048-stereo.mp4',
    autor: 'Blender Foundation',
    licencia: 'CC BY 3.0'
  },
  {
    id_video: 'tt0807840',
    nombre: 'Elephants Dream',
    anio: '2006',
    descripcion: 'Dos personajes recorren una máquina infinita que cada uno entiende a su manera.',
    url: 'https://archive.org/download/ElephantsDream/ed_hd.mp4',
    autor: 'Orange Open Movie Project',
    licencia: 'CC BY 3.0'
  },
  {
    id_video: 'tt2285752',
    nombre: 'Tears of Steel',
    anio: '2012',
    descripcion: 'Un grupo de científicos intenta cambiar el pasado para salvar al mundo de los robots.',
    url: 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov',
    autor: 'Blender Foundation',
    licencia: 'CC BY 3.0'
  }
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('videos_libres', {
      id_video: { type: Sequelize.STRING(60), primaryKey: true },
      nombre: { type: Sequelize.STRING(200), allowNull: false },
      anio: { type: Sequelize.STRING(10), allowNull: true },
      descripcion: { type: Sequelize.TEXT, allowNull: true },
      url: { type: Sequelize.TEXT, allowNull: false },
      autor: { type: Sequelize.STRING(120), allowNull: false },
      licencia: { type: Sequelize.STRING(40), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.bulkInsert('videos_libres', VIDEOS);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('videos_libres');
  }
};
