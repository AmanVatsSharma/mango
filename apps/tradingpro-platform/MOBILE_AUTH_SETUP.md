# MarketPulse360 Mobile Authentication Setup

This document outlines the new mobile-first authentication system implemented for MarketPulse360 trading platform.

## 🎯 Overview

The new authentication system provides:
- **Mobile/ClientID Login**: Users can log in using their mobile number or client ID
- **OTP Verification**: SMS-based OTP verification using Amazon SNS
- **mPin Security**: 4-6 digit mPin for trading authentication
- **Multi-step Verification**: Phone → OTP → mPin → Dashboard flow

## 🏗️ Architecture Components

### 1. Database Schema Updates
- **User Model**: Added `phone`, `phoneVerified`, `mPin` fields
- **OtpToken Model**: Tracks OTP generation and verification
- **SessionAuth Model**: Enhanced session management with mPin verification

### 2. Authentication Flow
```
Registration → Phone Verification → mPin Setup → KYC → Dashboard
Login → OTP Verification → mPin Verification → Dashboard
```

### 3. Key Services
- **OtpService**: Handles OTP generation, sending, and verification
- **MpinService**: Manages mPin setup, verification, and security
- **AWS SNS Integration**: Professional SMS delivery

## 🛠️ Setup Instructions

### 1. Environment Variables
Add these to your `.env` file:

```bash
# AWS SNS Configuration for OTP
AWS_ACCESS_KEY_ID="your-aws-access-key-id"
AWS_SECRET_ACCESS_KEY="your-aws-secret-access-key"
AWS_REGION="ap-south-1"

# Existing variables remain the same
DATABASE_URL="your-database-url"
NEXTAUTH_SECRET="your-nextauth-secret"
```

### 2. AWS SNS Setup
1. Create an AWS account and navigate to SNS service
2. Create IAM user with SNS permissions:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "sns:Publish",
           "sns:CreateTopic",
           "sns:Subscribe"
         ],
         "Resource": "*"
       }
     ]
   }
   ```
3. Note down Access Key ID and Secret Access Key
4. Verify your sender ID "MarketPu" with AWS SNS (required for India)

### 3. Database Migration
Run the Prisma migration to update your database schema:

```bash
npx prisma db push
# or
npx prisma migrate dev
```

### 4. Install Dependencies
The following packages are required:

```bash
npm install @aws-sdk/client-sns
# Other dependencies are already included
```

## 🔐 Security Features

### 1. OTP Security
- **6-digit numeric OTP**
- **5-minute expiration**
- **3 attempt limit** before regeneration required
- **Rate limiting**: 1 OTP per minute per user
- **Auto cleanup** of expired tokens

### 2. mPin Security
- **4-6 digit numeric mPin**
- **bcrypt hashing** with cost factor 12
- **Lockout mechanism** after failed attempts
- **Session-based verification**

### 3. Phone Number Validation
- **Indian mobile number validation** (starts with 6-9)
- **International format conversion** (+91)
- **Duplicate prevention**

## 📱 User Experience Flow

### Registration Flow
1. **User enters**: Name, Email, Mobile, Password
2. **System sends**: OTP to mobile number
3. **User verifies**: OTP within 5 minutes
4. **User sets up**: 4-6 digit mPin
5. **Redirect to**: KYC completion

### Login Flow
1. **User enters**: Mobile/ClientID + Password
2. **System sends**: OTP for verification
3. **User verifies**: OTP
4. **User enters**: mPin
5. **Redirect to**: Dashboard (if KYC approved) or KYC page

## 🎨 UI Components

### New Components Created
- `MobileLoginForm`: Main login interface
- `OtpVerificationForm`: OTP input with countdown timer
- `MpinForm`: Setup and verification of mPin
- `MobileRegistrationForm`: Enhanced registration
- `MobileAuthFlow`: Orchestrates the entire flow

### Features
- **Progress indicators** for multi-step flow
- **Real-time validation** and error handling
- **Responsive design** for mobile-first experience
- **Professional UI** with MarketPulse360 branding

## 🔄 Migration from Existing System

### Backward Compatibility
- **Legacy email login** still supported
- **Existing users** can continue using email/password
- **Gradual migration** encouraged through UI prompts

### For Existing Users
1. First login with email/password
2. System prompts for mobile number addition
3. OTP verification for mobile
4. mPin setup
5. Future logins use mobile/mPin flow

## 🚀 API Endpoints

### New Action Functions
- `mobileLogin()`: Handle mobile/clientID login
- `verifyOtp()`: Verify OTP tokens
- `setupMpin()`: Initial mPin setup
- `verifyMpin()`: mPin verification
- `resendOtp()`: Resend OTP functionality
- `registerWithMobile()`: Enhanced registration

## 🐛 Troubleshooting

### Common Issues

1. **OTP not received**
   - Check AWS SNS configuration
   - Verify phone number format
   - Check AWS SNS quotas and limits

2. **mPin verification fails**
   - Check database mPin hash
   - Verify session token validity
   - Check bcrypt comparison

3. **Rate limiting issues**
   - Implement exponential backoff
   - Check OTP cleanup job
   - Monitor failed attempt counts

### Debugging
- Enable detailed logging in production
- Monitor AWS SNS delivery reports
- Track OTP success/failure rates

## 📊 Monitoring & Analytics

### Key Metrics to Track
- OTP delivery success rate
- mPin verification success rate
- Login flow completion rate
- User drop-off points
- SMS costs per user

### Recommended Monitoring
- AWS CloudWatch for SNS metrics
- Application logs for auth flows
- Database queries for bottlenecks

## 🔐 Production Considerations

### Security Best Practices
1. **Environment Variables**: Never commit AWS credentials
2. **Rate Limiting**: Implement at application and WAF level
3. **Logging**: Log security events but not sensitive data
4. **Monitoring**: Set up alerts for unusual patterns

### Scalability
- **SMS Costs**: Monitor and set budgets
- **Database Optimization**: Index on phone numbers and tokens
- **Session Management**: Regular cleanup of expired sessions

### Compliance
- **Data Protection**: Handle phone numbers per privacy laws
- **SMS Regulations**: Comply with telecom regulations
- **KYC Integration**: Ensure seamless flow to KYC

## 📞 Support

For technical issues or questions:
1. Check this documentation first
2. Review application logs
3. Contact the development team
4. Create detailed issue reports

---

**Note**: This implementation provides a robust, secure, and user-friendly authentication system suitable for a professional trading platform. Regular security audits and updates are recommended.
