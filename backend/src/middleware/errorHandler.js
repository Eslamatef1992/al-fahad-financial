function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({ message: err.errors?.[0]?.message || 'Validation error' });
  }
  if (err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10MB)' : err.message;
    return res.status(400).json({ message });
  }
  if (err.message?.includes('Unsupported file type')) {
    return res.status(400).json({ message: err.message });
  }
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
}

module.exports = errorHandler;
