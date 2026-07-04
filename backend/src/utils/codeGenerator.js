// Generates a simple, deterministic sequential code like "CLI-00001" for a given
// company + model, based on how many rows already exist for that company. Used
// wherever a module's code should be fully system-generated rather than manually
// typed, to avoid typos, accidental duplicates, and inconsistent numbering schemes.
async function nextCode(Model, companyId, prefix, padLength = 5) {
  const count = await Model.count({ where: { company_id: companyId } });
  return `${prefix}-${String(count + 1).padStart(padLength, '0')}`;
}

module.exports = { nextCode };
