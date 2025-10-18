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

// Create email transporter
function createTransporter() {
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
            subject: 'Verify Your Dnest Account - Registration Code',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
                        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
                        .code { background: #f8f9fa; padding: 25px; text-align: center; margin: 25px 0; border-radius: 8px; border: 2px dashed #dee2e6; }
                        .code-number { font-size: 42px; font-weight: bold; color: #333; letter-spacing: 8px; }
                        .footer { background: #f8f9fa; padding: 15px; text-align: center; border-radius: 0 0 10px 10px; color: #666; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Dnest Property Management</h1>
                            <p>Email Verification</p>
                        </div>
                        
                        <h2>Hello ${username},</h2>
                        <p>Welcome to Dnest! Please use the following verification code to complete your registration:</p>
                        
                        <div class="code">
                            <div class="code-number">${code}</div>
                        </div>
                        
                        <p><strong>This code will expire in 10 minutes.</strong></p>
                        <p>If you didn't request this code, please ignore this email.</p>
                        
                        <div class="footer">
                            <p>Best regards,<br><strong>The Dnest Team</strong></p>
                            <p style="font-size: 12px; color: #999; margin-top: 10px;">
                                This is an automated message, please do not reply to this email.
                            </p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        const result = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${email} - Message ID: ${result.messageId}`);
        return { success: true, messageId: result.messageId };
        
    } catch (error) {
        console.error('❌ Email sending failed:', error);
        return { 
            success: false, 
            error: error.message,
            note: 'Check SMTP configuration in Render environment variables'
        };
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Dnest Mailer API is running!',
        status: 'OK',
        timestamp: new Date().toISOString(),
        email_configured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
        endpoints: [
            'GET /health',
            'POST /send-registration-code',
            'POST /verify-code'
        ]
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Dnest Mailer',
        timestamp: new Date().toISOString(),
        email_configured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
        smtp_host: process.env.SMTP_HOST || 'Not set'
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

        // Check if SMTP is configured
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            return res.status(500).json({
                success: false,
                message: 'Email service not configured. Please check server settings.'
            });
        }

        // Generate code
        const code = generateCode();
        
        // Store code (10 minutes expiry)
        verificationCodes.set(email, {
            code: code,
            expiresAt: Date.now() + 10 * 60 * 1000
        });

        console.log(`📧 Sending verification code to ${email}: ${code}`);

        // Send email
        const emailResult = await sendVerificationEmail(email, code, username);

        if (emailResult.success) {
            res.json({
                success: true,
                message: 'Verification code sent to your email successfully!',
                note: 'Please check your inbox (and spam folder)'
            });
        } else {
            // If email fails, still return the code for debugging
            res.json({
                success: true,
                message: 'Code generated but email delivery failed',
                debugCode: code,
                emailError: emailResult.error
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
    console.log(`📧 SMTP Configured: ${!!(process.env.SMTP_USER && process.env.SMTP_PASS)}`);
    if (process.env.SMTP_USER) {
        console.log(`📧 SMTP User: ${process.env.SMTP_USER}`);
    }
});
