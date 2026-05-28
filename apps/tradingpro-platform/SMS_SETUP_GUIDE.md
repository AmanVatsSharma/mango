# SMS OTP Setup Guide for MarketPulse360

## 🚨 Current Issue: "Resolved credential object is not valid"

This error occurs when AWS SNS credentials are not properly configured. Follow this guide to fix the SMS OTP functionality.

## 🔧 Quick Fix Options

### Option 1: Configure AWS SNS (Recommended for Production)

1. **Add Environment Variables** to your `.env` file:
```bash
# AWS SNS Configuration for OTP
AWS_ACCESS_KEY_ID="your-aws-access-key-id"
AWS_SECRET_ACCESS_KEY="your-aws-secret-access-key"
AWS_REGION="ap-south-1"
```

2. **AWS SNS Setup Steps**:
   - Create AWS account at https://aws.amazon.com
   - Navigate to SNS service
   - Create IAM user with SNS permissions
   - Generate Access Key ID and Secret Access Key
   - Add credentials to `.env` file

### Option 2: Development Mode (Quick Testing)

If you don't have AWS credentials yet, the system now supports development mode:

1. **No AWS credentials needed** - OTP will be logged to console
2. **Check browser console** for OTP during login
3. **Use the logged OTP** to complete verification

## 📱 How It Works Now

### With AWS Credentials:
- ✅ Real SMS sent to user's phone
- ✅ Professional delivery via AWS SNS
- ✅ Proper error handling

### Without AWS Credentials (Development):
- 🔧 OTP logged to server console
- 🔧 Development mode simulation
- ⚠️ Shows "SMS service not configured" in production

## 🛠️ Testing Steps

1. **Start your development server**:
   ```bash
   npm run dev
   ```

2. **Try to login** with mobile number

3. **Check server console** for OTP:
   ```
   🔧 DEVELOPMENT MODE: OTP for +919876543210 is: 123456
   📱 SMS Message: Your MarketPulse360 verification OTP is: 123456...
   ```

4. **Use the OTP** from console to complete verification

## 🔍 Troubleshooting

### Error: "Resolved credential object is not valid"
- **Cause**: Missing or invalid AWS credentials
- **Fix**: Add proper AWS credentials to `.env` file

### Error: "SMS service not configured"
- **Cause**: AWS credentials not found
- **Fix**: Either add AWS credentials or use development mode

### Error: "Invalid phone number format"
- **Cause**: Phone number not in correct format
- **Fix**: Ensure phone number is 10 digits (Indian format)

## 📋 Environment Variables Checklist

```bash
# Required for SMS functionality
AWS_ACCESS_KEY_ID="AKIA..."           # Your AWS Access Key
AWS_SECRET_ACCESS_KEY="..."           # Your AWS Secret Key
AWS_REGION="ap-south-1"              # Mumbai region for India

# Existing variables (should already be set)
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="your-secret"
```

## 🚀 Production Deployment

For production deployment:

1. **Set up AWS SNS** with proper IAM permissions
2. **Add credentials** to your production environment
3. **Test SMS delivery** with real phone numbers
4. **Monitor AWS SNS** for delivery status

## 📞 Support

If you continue to have issues:
1. Check server console logs for detailed error messages
2. Verify AWS credentials are correctly formatted
3. Ensure phone numbers are in correct format (+91XXXXXXXXXX)
4. Contact support with specific error messages

---

**Note**: The system now gracefully handles missing AWS credentials and provides clear error messages to help with debugging.
