// lib/cleanup-jobs.ts
import { OtpService } from "./otp-service";
import { MpinService } from "./mpin-service";

/**
 * Cleanup expired OTPs and sessions
 * Should be run periodically (e.g., every hour)
 */
export async function runCleanupJobs() {
  try {
    console.log("Starting cleanup jobs...");
    
    // Cleanup expired OTPs
    await OtpService.cleanupExpiredOtps();
    console.log("✅ Expired OTPs cleaned up");
    
    // Cleanup expired sessions
    await MpinService.cleanupExpiredSessions();
    console.log("✅ Expired sessions cleaned up");
    
    console.log("Cleanup jobs completed successfully");
  } catch (error) {
    console.error("Cleanup jobs failed:", error);
  }
}

// For cron job or scheduled execution
if (require.main === module) {
  runCleanupJobs().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error("Cleanup jobs failed:", error);
    process.exit(1);
  });
}
