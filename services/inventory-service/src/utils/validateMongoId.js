const mongoose = require('mongoose');

const validateMongoId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid MongoDB ID');
  }
};

module.exports = { validateMongoId };