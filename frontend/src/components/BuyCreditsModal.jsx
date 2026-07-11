import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useAuthStore } from "../store/auth.store";
import {
  createOrder,
  refetchProfileAndUpdateStore,
} from "../services/payment.service";
import { useToast } from "../hooks/use-toast";
import { springSoft } from "../motion/springs";

const CREDITS_PER_RUPEE = 100;

const PRESET_PACKS = [
  { amount: 99, label: "₹99", credits: 99 * CREDITS_PER_RUPEE },
  { amount: 199, label: "₹199", credits: 199 * CREDITS_PER_RUPEE },
  { amount: 499, label: "₹499", credits: 499 * CREDITS_PER_RUPEE },
];

const MIN_AMOUNT = 10;
const MAX_AMOUNT = 10000;

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve(); // Resolve anyway so we can show error in UI
    document.body.appendChild(script);
  });
}

export default function BuyCreditsModal({ open, onClose }) {
  const [selectedAmount, setSelectedAmount] = useState(99);
  const [customAmount, setCustomAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuthStore();
  const { toast } = useToast();

  const amountInRupees = customAmount.trim()
    ? Number(customAmount)
    : selectedAmount;
  const isValidAmount =
    amountInRupees >= MIN_AMOUNT &&
    amountInRupees <= MAX_AMOUNT &&
    Number.isInteger(amountInRupees);
  const credits = amountInRupees * CREDITS_PER_RUPEE;

  const handleCustomChange = (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCustomAmount(v);
    setError(null);
  };

  const handlePay = async () => {
    if (!isValidAmount) {
      setError(`Enter an amount between ₹${MIN_AMOUNT} and ₹${MAX_AMOUNT}`);
      return;
    }
    const keyId = process.env.REACT_APP_RAZORPAY_KEY_ID;
    if (!keyId) {
      toast({
        title: "Configuration error",
        description:
          "Payment is not configured. Please set REACT_APP_RAZORPAY_KEY_ID.",
        variant: "destructive",
      });
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const { order } = await createOrder(amountInRupees);
      await loadRazorpayScript();
      if (!window.Razorpay) {
        toast({
          title: "Payment unavailable",
          description: "Could not load payment provider. Please try again.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      const rzp = new window.Razorpay({
        key: keyId,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "DCVerse",
        description: `Buy ${credits} credits`,
        prefill: {
          email: user?.email || "",
          name: user?.email?.split("@")[0] || "",
        },
        handler: async () => {
          setIsLoading(false);
          try {
            await refetchProfileAndUpdateStore();
            toast({
              title: "Payment successful",
              description: `${credits} credits have been added to your account.`,
            });
            onClose();
            setCustomAmount("");
            setSelectedAmount(99);
          } catch (err) {
            toast({
              title: "Credits will be updated shortly",
              description:
                "Payment succeeded. If credits do not update, refresh the page.",
            });
            onClose();
          }
        },
        modal: {
          ondismiss: () => {
            setIsLoading(false);
          },
        },
      });
      rzp.on("payment.failed", () => {
        toast({
          title: "Payment failed",
          description: "The payment could not be completed. Please try again.",
          variant: "destructive",
        });
        setIsLoading(false);
      });
      // Close our modal first so its overlay and focus trap don't block the Razorpay iframe
      onClose();
      rzp.open();
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.message ||
        "Failed to create order. Please try again.";
      setError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={springSoft}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>Buy credits</DialogTitle>
            <DialogDescription>
              Credits are used for video generation. 100 credits = ₹1.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium text-foreground">
                Choose amount
              </Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRESET_PACKS.map((pack) => (
                  <Button
                    key={pack.amount}
                    type="button"
                    variant={
                      selectedAmount === pack.amount && !customAmount
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      setSelectedAmount(pack.amount);
                      setCustomAmount("");
                      setError(null);
                    }}
                    disabled={isLoading}
                  >
                    {pack.label} ({pack.credits} credits)
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="custom-amount"
                className="text-sm font-medium text-foreground"
              >
                Or enter custom amount (₹)
              </Label>
              <Input
                id="custom-amount"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 500"
                value={customAmount}
                onChange={handleCustomChange}
                disabled={isLoading}
                className="bg-background border-border"
              />
              {customAmount && (
                <p className="text-xs text-muted-foreground">
                  {credits} credits (min ₹{MIN_AMOUNT}, max ₹{MAX_AMOUNT})
                </p>
              )}
            </div>
            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}
            <div className="rounded-md bg-muted/50 p-3 text-sm text-foreground">
              You will get{" "}
              <strong className="text-foreground font-semibold">
                {credits} credits
              </strong>{" "}
              for ₹{amountInRupees}.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handlePay} disabled={!isValidAmount || isLoading}>
              {isLoading ? "Opening payment…" : "Pay with Razorpay"}
            </Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
