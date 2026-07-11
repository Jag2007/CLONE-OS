import Razorpay from 'razorpay';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { UserService } from '../services/user.service';
import crypto from 'crypto';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const CREDITS_PER_RUPEE = 100;

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount } = req.body; // amount in rupees
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }
    const order = await razorpay.orders.create({
      amount: amount * 100, // Razorpay expects paise
      currency: 'INR',
      payment_capture: true,
      notes: {
        userId: req.user?.id || '',
        credits: amount * CREDITS_PER_RUPEE,
      },
    });
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

export const handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Razorpay webhook received:', req.body.event);
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
    const signature = req.headers['x-razorpay-signature'] as string;
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    if (signature !== expectedSignature) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    if (req.body.event === 'payment.captured') {
      const userId = req.body.payload.payment.entity.notes.userId;
      const credits = parseInt(req.body.payload.payment.entity.notes.credits, 10);
      if (userId && credits) {
        const userService = new UserService();
        await userService.addCredits(userId, credits);
        console.log(`Credits updated for user ${userId}: +${credits}`);
      }
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
