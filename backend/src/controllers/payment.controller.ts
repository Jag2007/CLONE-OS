import Razorpay from 'razorpay';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { UserService } from '../services/user.service';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import crypto from 'crypto';

const keyId = config.razorpay.keyId || process.env.RAZORPAY_KEY_ID || '';
const keySecret = config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET || '';

const razorpay = keyId && keySecret
  ? new Razorpay({ key_id: keyId, key_secret: keySecret })
  : null;

const CREDITS_PER_RUPEE = 100;

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, purchaseType } = req.body; // amount in rupees, purchaseType: 'credits' | 'pro'
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    const creditsToGrant = purchaseType === 'pro' ? 50000 : amount * CREDITS_PER_RUPEE;

    if (!razorpay) {
      // Return a simulated order if Razorpay is not configured on backend
      const mockOrderId = `order_mock_${Date.now()}`;
      return res.json({
        success: true,
        order: {
          id: mockOrderId,
          amount: amount * 100,
          currency: 'INR',
          status: 'created',
          notes: {
            userId: req.user?.id || '',
            credits: creditsToGrant,
            purchaseType: purchaseType || 'credits',
          },
        },
        isMock: true,
      });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100, // Razorpay expects paise
      currency: 'INR',
      payment_capture: true,
      notes: {
        userId: req.user?.id || '',
        credits: creditsToGrant,
        purchaseType: purchaseType || 'credits',
      },
    });
    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
};

export const verifyPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, purchaseType } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    if (keySecret && razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Invalid payment signature' });
      }
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (purchaseType === 'pro' || amount >= 499) {
      user.plan = 'pro';
      user.creditsBalance += 50000;
    } else {
      const creditsToAdd = (amount || 99) * CREDITS_PER_RUPEE;
      user.creditsBalance += creditsToAdd;
    }

    await userRepository.save(user);

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      message: 'Payment verified and account updated successfully',
      user: userWithoutPassword,
    });
  } catch (err) {
    next(err);
  }
};

export const handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Razorpay webhook received:', req.body.event);
    const secret = config.razorpay.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || '';
    if (secret) {
      const signature = req.headers['x-razorpay-signature'] as string;
      const body = JSON.stringify(req.body);
      const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');
      if (signature !== expectedSignature) {
        return res.status(400).json({ success: false, message: 'Invalid signature' });
      }
    }

    if (req.body.event === 'payment.captured') {
      const notes = req.body.payload.payment.entity.notes || {};
      const userId = notes.userId;
      const credits = parseInt(notes.credits, 10);
      const purchaseType = notes.purchaseType;

      if (userId) {
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({ where: { id: userId } });
        if (user) {
          if (purchaseType === 'pro') {
            user.plan = 'pro';
          }
          if (credits > 0) {
            user.creditsBalance += credits;
          }
          await userRepository.save(user);
          console.log(`Updated user ${userId}: plan=${user.plan}, credits=${user.creditsBalance}`);
        }
      }
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
