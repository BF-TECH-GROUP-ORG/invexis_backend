const mongoose = require('mongoose');

const validateMongoId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid MongoDB ID: "${id}". Please check the request URL and ensure you're using a valid ObjectId.`);
  }
};

module.exports = { validateMongoId };