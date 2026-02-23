'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn('sales_item_metrics', 'discount', {
      type: Sequelize.DECIMAL(30,2),
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn('sales_item_metrics', 'costPrice', {
      type: Sequelize.DECIMAL(30,2),
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn('sales_item_metrics', 'tax', {
      type: Sequelize.DECIMAL(30,2),
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn('sales_item_metrics', 'total', {
      type: Sequelize.DECIMAL(30,2),
      allowNull: false,
      defaultValue: 0
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('sales_item_metrics', 'discount');
    await queryInterface.removeColumn('sales_item_metrics', 'costPrice');
    await queryInterface.removeColumn('sales_item_metrics', 'tax');
    await queryInterface.removeColumn('sales_item_metrics', 'total');
  }
};
