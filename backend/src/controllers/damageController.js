const damageService = require('../services/damageService');

exports.list = async (req, res) => {
  const rows = await damageService.listDamages(req.companyId, req.query);
  res.json(rows);
};

exports.types = async (req, res) => {
  res.json(damageService.DAMAGE_TYPES);
};

exports.create = async (req, res) => {
  const row = await damageService.reportDamage(req.companyId, req.user.id, req.body);
  res.status(201).json(row);
};

exports.clear = async (req, res) => {
  const row = await damageService.clearDamage(req.companyId, req.user.id, req.params.id);
  res.json(row);
};

exports.remove = async (req, res) => {
  const result = await damageService.deleteDamage(req.companyId, req.params.id);
  res.json(result);
};
