const express = require('express');
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

// Routes
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Dnest Mailer API is running!',
        status: 'OK',
        timestamp: new Date().toISOString(),
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
        timestamp: new Date().toISOString()
    });
});

app.post('/send-registration-code', (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Generate code
        const code = generateCode();
        
        // Store code (10 minutes expiry)
        verificationCodes.set(email, {
            code: code,
            expiresAt: Date.now() + 10 * 60 * 1000
        });

        console.log(`📧 Verification code for ${email}: ${code}`);

        res.json({
            success: true,
            message: 'Verification code generated successfully',
            debugCode: code, // Always return code for testing
            note: 'In production, this would be sent via email'
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
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
});
