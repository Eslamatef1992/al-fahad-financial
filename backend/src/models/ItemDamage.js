// A quantity of an Item taken out of sellable stock because it was damaged —
// torn, water-damaged, defective from the manufacturer, returned in
// unsellable condition, etc. Purpose-built for a retailer (e.g. mattresses)
// where damage write-offs are a routine, trackable part of the business
// rather than a rare edge case handled through the generic stock-adjustment
// dialog.
//
// status: 'reported' (logged, stock NOT yet touched — lets it be reviewed or
// corrected first) -> 'cleared' (super admin wrote it off: stock actually
// reduced via itemService.issueStock, and a Debit Damage Expense / Credit
// Inventory journal entry posted at that moment, mirroring how a booking's
// stock impact only lands at fulfillment, not at reservation time).
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ItemDamage', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    item_id: { type: DataTypes.UUID, allowNull: false },
    variant_id: { type: DataTypes.UUID, allowNull: true },
    branch_id: { type: DataTypes.UUID, allowNull: true },
    quantity: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
    unit_cost: { type: DataTypes.DECIMAL(18, 3), allowNull: true }, // snapshot of cost at the moment it was cleared/written off
    damage_type: {
      type: DataTypes.ENUM('transport', 'warehouse', 'manufacturing_defect', 'customer_return', 'water_damage', 'other'),
      defaultValue: 'other',
    },
    notes: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM('reported', 'cleared'), defaultValue: 'reported' },
    write_off_voucher_id: { type: DataTypes.UUID, allowNull: true },
    reported_by: { type: DataTypes.UUID, allowNull: true },
    cleared_by: { type: DataTypes.UUID, allowNull: true },
    cleared_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'item_damages',
  });
};
