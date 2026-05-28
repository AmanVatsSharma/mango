// lib/aws-sns.ts
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { BRAND_IDENTITY, getSmsSenderId } from "@/Branding";

// Validate AWS credentials
let _awsConfigLogged = false;
const validateAWSCredentials = () => {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "ap-south-1";

  if (!accessKeyId || !secretAccessKey) {
    if (!_awsConfigLogged) {
      console.warn("⚠️ AWS credentials not configured. SMS functionality will be disabled.");
      console.warn(
        `AWS env presence → AWS_ACCESS_KEY_ID: ${!!accessKeyId}, AWS_SECRET_ACCESS_KEY: ${!!secretAccessKey}, AWS_REGION: ${region}`
      );
      _awsConfigLogged = true;
    }
    return null;
  }

  if (!_awsConfigLogged) {
    console.log(
      `✅ AWS SNS configured (masked) → AWS_ACCESS_KEY_ID: ****${accessKeyId.slice(-4)}, region: ${region}`
    );
    _awsConfigLogged = true;
  }

  return {
    accessKeyId,
    secretAccessKey,
    region,
  };
};

// Configure AWS SNS client with proper error handling
const createSNSClient = () => {
  const credentials = validateAWSCredentials();
  
  if (!credentials) {
    return null;
  }

  try {
    return new SNSClient({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });
  } catch (error) {
    console.error("Failed to create SNS client:", error);
    return null;
  }
};

const snsClient = createSNSClient();

export interface SendSMSParams {
  phoneNumber: string;
  message: string;
  messageAttributes?: {
    [key: string]: {
      DataType: string;
      StringValue: string;
    };
  };
}

export async function sendSMS({ phoneNumber, message, messageAttributes }: SendSMSParams) {
  try {
    // Check if SNS client is available
    if (!snsClient) {
      console.error("SNS client not available. AWS credentials may be missing.");
      return {
        success: false,
        error: "SMS service not configured. Please contact support.",
      };
    }

    // Format phone number to international format
    const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
    
    console.log(`📱 Attempting to send SMS to: ${formattedPhoneNumber}`);
    
    const command = new PublishCommand({
      PhoneNumber: formattedPhoneNumber,
      Message: message,
      MessageAttributes: {
        "AWS.SNS.SMS.SenderID": {
          DataType: "String",
          StringValue: getSmsSenderId(), // Brand sender ID (max 6 chars for India)
        },
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: "Transactional", // Transactional SMS for OTP
        },
        ...messageAttributes,
      },
    });

    const response = await snsClient.send(command);
    
    console.log(`✅ SMS sent successfully. MessageId: ${response.MessageId}`);
    
    return {
      success: true,
      messageId: response.MessageId,
      data: response,
    };
  } catch (error) {
    console.error("❌ SMS sending failed:", error);
    
    // Provide more specific error messages
    let errorMessage = "Failed to send SMS";
    let errorCode = "UNKNOWN" as
      | "INVALID_PHONE"
      | "INVALID_CREDENTIALS"
      | "AUTH_ERROR"
      | "THROTTLED"
      | "CONFIG_MISSING"
      | "UNKNOWN";
    
    if (error instanceof Error) {
      if (error.message.includes("InvalidParameterValue")) {
        errorMessage = "Invalid phone number format";
        errorCode = "INVALID_PHONE";
      } else if (error.message.includes("AuthorizationError")) {
        errorMessage = "AWS credentials are invalid or expired";
        errorCode = "AUTH_ERROR";
      } else if (error.message.includes("InvalidClientTokenId") || error.message.includes("UnrecognizedClientException")) {
        errorMessage = "Invalid AWS access keys or token";
        errorCode = "INVALID_CREDENTIALS";
      } else if (error.message.includes("Throttling")) {
        errorMessage = "SMS service is temporarily unavailable. Please try again later";
        errorCode = "THROTTLED";
      } else {
        errorMessage = error.message;
      }
    }
    if (!snsClient) {
      errorCode = "CONFIG_MISSING";
    }
    
    return {
      success: false,
      error: errorMessage,
      code: errorCode,
    };
  }
}

export async function sendOtpSMS(phoneNumber: string, otp: string, purpose: string = "verification") {
  const brandSignature = BRAND_IDENTITY.sms.otpSignature;
  const message = `Your ${brandSignature} ${purpose} OTP is: ${otp}. Valid for 5 minutes. Do not share this OTP with anyone. -${brandSignature}`;
  
  // Development fallback when AWS credentials are not configured
  if (!snsClient) {
    console.log(`🔧 DEVELOPMENT MODE: OTP for ${phoneNumber} is: ${otp}`);
    console.log(`📱 SMS Message: ${message}`);
    
    // In development, we can simulate success
    if (process.env.NODE_ENV === 'development') {
      return {
        success: true,
        messageId: `dev-${Date.now()}`,
        data: { development: true },
      };
    }
    
    return {
      success: false,
      error: "SMS service not configured. Please contact support.",
    };
  }
  
  return sendSMS({
    phoneNumber,
    message,
    messageAttributes: {
      "AWS.SNS.SMS.MaxPrice": {
        DataType: "Number",
        StringValue: "0.50", // Max price per SMS in USD
      },
    },
  });
}

export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const cleanPhone = phone.replace(/\D/g, "");
  
  // Add +91 country code for Indian numbers if not present
  if (cleanPhone.length === 10) {
    return `+91${cleanPhone}`;
  } else if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
    return `+${cleanPhone}`;
  } else if (cleanPhone.startsWith("91") && cleanPhone.length === 12) {
    return `+${cleanPhone}`;
  }
  
  // Return as is if already properly formatted
  return cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`;
}

export function generateOTP(length: number = 6): string {
  const digits = "0123456789";
  let otp = "";
  
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  
  return otp;
}

export function validatePhoneNumber(phone: string): boolean {
  // Indian mobile number validation
  const cleanPhone = phone.replace(/\D/g, "");
  
  // Check if it's a valid 10-digit Indian mobile number
  if (cleanPhone.length === 10) {
    return /^[6-9]\d{9}$/.test(cleanPhone);
  }
  
  // Check if it's a valid international format Indian number
  if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
    const mobileNumber = cleanPhone.substring(2);
    return /^[6-9]\d{9}$/.test(mobileNumber);
  }
  
  return false;
}
