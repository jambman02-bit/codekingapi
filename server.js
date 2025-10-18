const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage
const verificationCodes = new Map();

// Generate 6-digit code
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Debug environment variables
console.log('🔧 Environment Check:');
console.log('SMTP_USER:', process.env.SMTP_USER ? 'Set' : 'Not set');
console.log('SMTP_PASS:', process.env.SMTP_PASS ? 'Set' : 'Not set');
console.log('SMTP_HOST:', process.env.SMTP_HOST || 'Not set');
console.log('SMTP_PORT:', process.env.SMTP_PORT || 'Not set');

// Create email transporter
function createTransporter() {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('SMTP credentials not configured');
    }

    return nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

// Send verification email
async function sendVerificationEmail(email, code, username = 'User') {
    try {
        const transporter = createTransporter();
        
        const mailOptions = {
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Verify Your Dnest Account',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="margin: 0;">Dnest Property Management</h1>
                        <p style="margin: 5px 0 0 0;">Email Verification</p>
                    </div>
                    
                    <div style="padding: 20px;">
                        <h2>Hello ${username},</h2>
                        <p>Welcome to Dnest! Please use the following verification code to complete your registration:</p>
                        
                        <div style="background: #f8f9fa; padding: 25px; text-align: center; margin: 20px 0; border-radius: 8px; border: 2px dashed #dee2e6;">
                            <div style="font-size: 42px; font-weight: bold; color: #333; letter-spacing: 8px;">${code}</div>
                        </div>
                        
                        <p><strong>This code will expire in 10 minutes.</strong></p>
                        <p>If you didn't request this code, please ignore this email.</p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 15px; text-align: center; border-radius: 0 0 10px 10px; color: #666;">
                        <p style="margin: 0;">Best regards,<br><strong>The Dnest Team</strong></p>
                    </div>
                </div>
            `
        };

        const result = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${email}`);
        return { success: true, messageId: result.messageId };
        
    } catch (error) {
        console.error('❌ Email failed:', error.message);
        return { 
            success: false, 
            error: error.message
        };
    }
}

// Routes
app.get('/', (req, res) => {
    const emailConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    
    res.json({
        message: '🚀 Dnest Mailer API is running!',
        status: 'OK',
        timestamp: new Date().toISOString(),
        email_configured: emailConfigured,
        smtp_user_set: !!process.env.SMTP_USER,
        smtp_pass_set: !!process.env.SMTP_PASS,
        endpoints: [
            'GET /health',
            'POST /send-registration-code',
            'POST /verify-code'
        ]
    });
});

app.get('/health', (req, res) => {
    const emailConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    
    res.json({
        status: 'OK',
        service: 'Dnest Mailer',
        timestamp: new Date().toISOString(),
        email_configured: emailConfigured,
        smtp_user_set: !!process.env.SMTP_USER,
        smtp_pass_set: !!process.env.SMTP_PASS,
        smtp_host: process.env.SMTP_HOST || 'default (smtp.gmail.com)',
        smtp_port: process.env.SMTP_PORT || 'default (587)'
    });
});

app.post('/send-registration-code', async (req, res) => {
    try {
        const { email, username = 'User' } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Check SMTP configuration
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.log('❌ SMTP not configured - missing credentials');
            return res.status(500).json({
                success: false,
                message: 'Email service not configured on server',
                debug: {
                    smtp_user_set: !!process.env.SMTP_USER,
                    smtp_pass_set: !!process.env.SMTP_PASS
                }
            });
        }

        // Generate code
        const code = generateCode();
        
        // Store code
        verificationCodes.set(email, {
            code: code,
            expiresAt: Date.now() + 10 * 60 * 1000
        });

        console.log(`📧 Attempting to send code to ${email}: ${code}`);

        // Send email
        const emailResult = await sendVerificationEmail(email, code, username);

        if (emailResult.success) {
            res.json({
                success: true,
                message: 'Verification code sent to your email! Please check your inbox.'
            });
        } else {
            // If email fails, provide the code for manual testing
            res.json({
                success: true,
                message: 'Email delivery issue - use this code for testing',
                debugCode: code,
                emailError: emailResult.error,
                note: 'This would be sent via email in production'
            });
        }

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

app.post('/verify-code', (req, res) => {
    try {
        const { email, code } = req.body;

        if (!email || !code) {
            return res.status(400).json({
                success: false,
                message: 'Email and code are required'
            });
        }

        const storedData = verificationCodes.get(email);

        if (!storedData) {
            return res.status(400).json({
                success: false,
                message: 'No verification code found. Please request a new one.'
            });
        }

        if (Date.now() > storedData.expiresAt) {
            verificationCodes.delete(email);
            return res.status(400).json({
                success: false,
                message: 'Verification code has expired. Please request a new one.'
            });
        }

        if (storedData.code !== code) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code. Please try again.'
            });
        }

        // Code is valid
        verificationCodes.delete(email);
        console.log(`✅ Email verified: ${email}`);

        res.json({
            success: true,
            message: 'Email verified successfully!'
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Dnest Mailer running on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    
    const emailConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
    console.log(`📧 Email Service: ${emailConfigured ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'}`);
    
    if (emailConfigured) {
        console.log(`📧 SMTP User: ${process.env.SMTP_USER}`);
        console.log(`📧 SMTP Host: ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
    } else {
        console.log('❌ Please set SMTP_USER and SMTP_PASS environment variables');
    }
});
