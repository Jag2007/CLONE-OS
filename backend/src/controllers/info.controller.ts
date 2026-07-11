import { Request, Response, NextFunction } from 'express';
import { InfoService } from '../services/info.service';

const infoService = new InfoService();

export const submitInfo = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { fullName, email, company, useCase } = req.body;

  if (!fullName || !email) {
    res.status(400).json({ message: 'Full name and email are required.' });
    return;
  }

  try {
    await infoService.submitInfo({ fullName, email, company, useCase });
    res.status(200).json({ message: 'Info submitted successfully.' });
  } catch (error) {
    next(error);
  }
};
