import logger from '../utils/logger.js';

const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const target = req[source];
    const { error, value } = schema.validate(target, { abortEarly: false });
    if (error) {
      const errorMessages = error.details.map((detail) => detail.message);
      logger.warn(`Validation Error: ${errorMessages.join(', ')}`);
      return res.status(400).json({ success: false, errors: errorMessages });
    }
    req[source] = value;
    next();
  };
};

export { validate };
