const { Op } = require('sequelize');
const { AuditLog, User } = require('../models');

// Super admin sees everything; company admins see only their company's activity.
exports.list = async (req, res) => {
  const { user_id, action, from, to } = req.query;
  const where = {};

  if (req.user.role !== 'super_admin') {
    where.company_id = req.companyId;
  } else if (req.companyId) {
    where.company_id = req.companyId;
  }

  if (user_id) where.user_id = user_id;
  if (action) where.action = action;
  if (from || to) {
    where.createdAt = { ...(from && { [Op.gte]: new Date(from) }), ...(to && { [Op.lte]: new Date(`${to}T23:59:59`) }) };
  }

  const logs = await AuditLog.findAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
    order: [['createdAt', 'DESC']],
    limit: 500,
  });
  res.json(logs);
};
