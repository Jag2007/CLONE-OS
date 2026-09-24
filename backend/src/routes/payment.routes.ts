import { Router } from 'express';
import { createOrder, verifyPayment, handleWebhook } from '../controllers/payment.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Route to create a Razorpay order for buying credits / pro plan (protected)
router.post('/buy-credits', authenticateToken, createOrder);

// Route to verify Razorpay payment from frontend checkout (protected)
router.post('/verify', authenticateToken, verifyPayment);

// Route to handle Razorpay webhook
router.post('/webhook', handleWebhook);

export default router;
