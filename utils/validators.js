const Joi = require('joi');

// Mobile number validation regex (supports various formats)
const mobileRegex = /^[+]?[1-9]\d{1,14}$/;

// User signup validation
const signupSchema = Joi.object({
  mobile_number: Joi.string()
    .pattern(mobileRegex)
    .required()
    .messages({
      'string.pattern.base': 'Mobile number must be a valid phone number',
      'any.required': 'Mobile number is required'
    }),
  name: Joi.string()
    .min(1)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Name must be at least 1 character long',
      'string.max': 'Name must be less than 100 characters'
    }),
  email: Joi.string()
    .email()
    .optional()
    .messages({
      'string.email': 'Email must be a valid email address'
    }),
  password: Joi.string()
    .min(6)
    .optional()
    .messages({
      'string.min': 'Password must be at least 6 characters long'
    })
});

// Send OTP validation
const sendOTPSchema = Joi.object({
  mobile_number: Joi.string()
    .pattern(mobileRegex)
    .required()
    .messages({
      'string.pattern.base': 'Mobile number must be a valid phone number',
      'any.required': 'Mobile number is required'
    }),
  purpose: Joi.string()
    .valid('login', 'password_reset', 'verification')
    .optional()
    .default('login')
});

// Verify OTP validation
const verifyOTPSchema = Joi.object({
  mobile_number: Joi.string()
    .pattern(mobileRegex)
    .required()
    .messages({
      'string.pattern.base': 'Mobile number must be a valid phone number',
      'any.required': 'Mobile number is required'
    }),
  otp: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'OTP must be a 6-digit number',
      'any.required': 'OTP is required'
    }),
  purpose: Joi.string()
    .valid('login', 'password_reset', 'verification')
    .optional()
    .default('login')
});

// Chatroom creation validation
const createChatroomSchema = Joi.object({
  title: Joi.string()
    .min(1)
    .max(200)
    .required()
    .messages({
      'string.min': 'Title must be at least 1 character long',
      'string.max': 'Title must be less than 200 characters',
      'any.required': 'Title is required'
    }),
  description: Joi.string()
    .max(1000)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description must be less than 1000 characters'
    })
});

// Message validation
const sendMessageSchema = Joi.object({
  content: Joi.string()
    .min(1)
    .max(5000)
    .required()
    .messages({
      'string.min': 'Message content cannot be empty',
      'string.max': 'Message content must be less than 5000 characters',
      'any.required': 'Message content is required'
    })
});

// Update profile validation
const updateProfileSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .optional()
    .messages({
      'string.min': 'Name must be at least 1 character long',
      'string.max': 'Name must be less than 100 characters'
    }),
  email: Joi.string()
    .email()
    .optional()
    .messages({
      'string.email': 'Email must be a valid email address'
    })
});

// Change password validation
const changePasswordSchema = Joi.object({
  current_password: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required'
    }),
  new_password: Joi.string()
    .min(6)
    .required()
    .messages({
      'string.min': 'New password must be at least 6 characters long',
      'any.required': 'New password is required'
    })
});

// Validation functions
function validateSignup(data) {
  return signupSchema.validate(data);
}

function validateSendOTP(data) {
  return sendOTPSchema.validate(data);
}

function validateVerifyOTP(data) {
  return verifyOTPSchema.validate(data);
}

function validateCreateChatroom(data) {
  return createChatroomSchema.validate(data);
}

function validateSendMessage(data) {
  return sendMessageSchema.validate(data);
}

function validateUpdateProfile(data) {
  return updateProfileSchema.validate(data);
}

function validateChangePassword(data) {
  return changePasswordSchema.validate(data);
}

// Generic validation helper
function validate(schema, data) {
  const result = schema.validate(data);
  if (result.error) {
    const error = new Error('Validation Error');
    error.name = 'ValidationError';
    error.details = result.error.details;
    throw error;
  }
  return result.value;
}

module.exports = {
  validateSignup,
  validateSendOTP,
  validateVerifyOTP,
  validateCreateChatroom,
  validateSendMessage,
  validateUpdateProfile,
  validateChangePassword,
  validate
};
