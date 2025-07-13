const { getPool } = require('../config/database');
const logger = require('../utils/logger');

// Generate a 6-digit OTP
function generateOTPCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate and store OTP
async function generateOTP(mobileNumber, purpose = 'login') {
  try {
    const pool = getPool();
    const otp = generateOTPCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Invalidate any existing OTPs for this mobile number and purpose
    await pool.query(
      'UPDATE otps SET used = true WHERE mobile_number = $1 AND purpose = $2 AND used = false',
      [mobileNumber, purpose]
    );

    // Insert new OTP
    await pool.query(
      'INSERT INTO otps (mobile_number, otp, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [mobileNumber, otp, purpose, expiresAt]
    );

    logger.info(`OTP generated for ${mobileNumber}: ${otp} (Purpose: ${purpose})`);
    return otp;
  } catch (error) {
    logger.error('Error generating OTP:', error);
    throw error;
  }
}

// Verify OTP
async function verifyOTP(mobileNumber, otp, purpose = 'login') {
  try {
    const pool = getPool();

    // Find valid OTP
    const result = await pool.query(
      'SELECT id FROM otps WHERE mobile_number = $1 AND otp = $2 AND purpose = $3 AND used = false AND expires_at > NOW()',
      [mobileNumber, otp, purpose]
    );

    if (result.rows.length === 0) {
      logger.warn(`Invalid OTP attempt for ${mobileNumber}: ${otp} (Purpose: ${purpose})`);
      return false;
    }

    // Mark OTP as used
    await pool.query(
      'UPDATE otps SET used = true WHERE id = $1',
      [result.rows[0].id]
    );

    logger.info(`OTP verified successfully for ${mobileNumber} (Purpose: ${purpose})`);
    return true;
  } catch (error) {
    logger.error('Error verifying OTP:', error);
    throw error;
  }
}

// Clean up expired OTPs (should be called periodically)
async function cleanupExpiredOTPs() {
  try {
    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM otps WHERE expires_at < NOW() OR used = true'
    );
    
    logger.info(`Cleaned up ${result.rowCount} expired/used OTPs`);
    return result.rowCount;
  } catch (error) {
    logger.error('Error cleaning up OTPs:', error);
    throw error;
  }
}

module.exports = {
  generateOTP,
  verifyOTP,
  cleanupExpiredOTPs
};
