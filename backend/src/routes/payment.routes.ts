import { Router } from 'express';
import { createOrder, handleWebhook } from '../controllers/payment.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Route to create a Razorpay order for buying credits (protected)
router.post('/buy-credits', authenticateToken, createOrder);

// Route to handle Razorpay webhook
router.post('/webhook', handleWebhook);

export default router;
