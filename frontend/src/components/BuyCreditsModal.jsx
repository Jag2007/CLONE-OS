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
  verifyPaymentPayload,
  refetchProfileAndUpdateStore,
} from "../services/payment.service";
import { useToast } from "../hooks/use-toast";
import { springSoft } from "../motion/springs";
import { Crown, Sparkles, Check, Zap } from "lucide-react";

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
    script.onerror = () => resolve();
    document.body.appendChild(script);
  });
}

export default function BuyCreditsModal({ open, onClose, defaultTab = "credits" }) {
  const [tab, setTab] = useState(defaultTab); // 'credits' | 'pro'
  const [selectedAmount, setSelectedAmount] = useState(99);
  const [customAmount, setCustomAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuthStore();
  const { toast } = useToast();

  const isProPurchase = tab === "pro";
  const amountInRupees = isProPurchase ? 499 : customAmount.trim() ? Number(customAmount) : selectedAmount;
  const isValidAmount =
    isProPurchase ||
    (amountInRupees >= MIN_AMOUNT &&
      amountInRupees <= MAX_AMOUNT &&
      Number.isInteger(amountInRupees));
  const credits = isProPurchase ? 50000 : amountInRupees * CREDITS_PER_RUPEE;

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
    const keyId = process.env.REACT_APP_RAZORPAY_KEY_ID || "rzp_test_mock";
    setError(null);
    setIsLoading(true);

    try {
      const purchaseType = isProPurchase ? "pro" : "credits";
      const { order, isMock } = await createOrder(amountInRupees, purchaseType);

      // Handle Mock / Demo payment if Razorpay keys aren't configured in dev
      if (isMock || !window.Razorpay && keyId === "rzp_test_mock") {
        await verifyPaymentPayload({
          razorpay_order_id: order.id,
          razorpay_payment_id: `pay_mock_${Date.now()}`,
          razorpay_signature: "mock_signature",
          amount: amountInRupees,
          purchaseType,
        });
        await refetchProfileAndUpdateStore();
        toast({
          title: isProPurchase ? "Welcome to Pro!" : "Payment successful",
          description: isProPurchase
            ? "Your account is now upgraded to Pro. All actors unlocked!"
            : `${credits.toLocaleString()} credits added to your balance.`,
        });
        setIsLoading(false);
        onClose();
        return;
      }

      await loadRazorpayScript();
      if (!window.Razorpay) {
        toast({
          title: "Payment provider error",
          description: "Could not load Razorpay SDK. Please check your internet connection.",
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
        name: "Clone OS",
        description: isProPurchase ? "Upgrade to Clone OS Pro Plan" : `Buy ${credits} credits`,
        prefill: {
          email: user?.email || "",
          name: user?.email?.split("@")[0] || "",
        },
        handler: async (response) => {
          setIsLoading(false);
          try {
            await verifyPaymentPayload({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount: amountInRupees,
              purchaseType,
            });
            await refetchProfileAndUpdateStore();
            toast({
              title: isProPurchase ? "Pro Plan Unlocked!" : "Payment successful",
              description: isProPurchase
                ? "You now have access to Tarina and all premium Pro actors!"
                : `${credits.toLocaleString()} credits added to your account.`,
            });
            onClose();
          } catch (err) {
            await refetchProfileAndUpdateStore();
            toast({
              title: "Payment processed",
              description: "Your credits & plan will update shortly.",
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
          description: "The payment transaction was cancelled or declined.",
          variant: "destructive",
        });
        setIsLoading(false);
      });

      onClose();
      rzp.open();
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.message ||
        "Failed to create payment order. Please try again.";
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
      <DialogContent className="max-w-lg overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={springSoft}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Credits & Subscriptions
            </DialogTitle>
            <DialogDescription>
              Unlock premium actors like Tarina, generate high-definition video clones, and top up credits.
            </DialogDescription>
          </DialogHeader>

          {/* Navigation Tabs */}
          <div className="flex border-b border-border/60">
            <button
              type="button"
              onClick={() => setTab("credits")}
              className={`flex-1 pb-2.5 text-xs font-semibold tracking-wide border-b-2 transition-colors ${
                tab === "credits"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Buy Credits
            </button>
            <button
              type="button"
              onClick={() => setTab("pro")}
              className={`flex-1 pb-2.5 text-xs font-semibold tracking-wide border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                tab === "pro"
                  ? "border-amber-400 text-amber-400 font-bold"
                  : "border-transparent text-muted-foreground hover:text-amber-400"
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              Pro Plan (Unlock Tarina)
            </button>
          </div>

          {tab === "credits" ? (
            <div className="space-y-4 py-1">
              <div>
                <Label className="text-xs font-medium text-foreground">
                  Choose Credit Pack
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
                      {pack.label} ({pack.credits.toLocaleString()} credits)
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="custom-amount"
                  className="text-xs font-medium text-foreground"
                >
                  Custom Amount (₹)
                </Label>
                <Input
                  id="custom-amount"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 500"
                  value={customAmount}
                  onChange={handleCustomChange}
                  disabled={isLoading}
                  className="bg-background border-border text-sm"
                />
                {customAmount && (
                  <p className="text-xs text-muted-foreground">
                    You get {credits.toLocaleString()} credits (min ₹{MIN_AMOUNT}, max ₹{MAX_AMOUNT})
                  </p>
                )}
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-xs text-foreground flex items-center justify-between">
                <span>Total Credits to be added:</span>
                <strong className="text-emerald-400 font-bold text-sm">
                  +{credits.toLocaleString()} credits
                </strong>
              </div>
            </div>
          ) : (
            <div className="py-2 space-y-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/15 via-purple-500/10 to-primary/10 border border-amber-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-400/20 text-amber-300 border border-amber-400/40">
                    Most Popular
                  </span>
                  <span className="text-xl font-extrabold text-foreground">₹499 <span className="text-xs font-normal text-muted-foreground">/ month</span></span>
                </div>
                <h4 className="text-base font-bold text-foreground flex items-center gap-1.5 mb-3">
                  <Crown className="w-4 h-4 text-amber-400" /> Clone OS Pro Access
                </h4>
                <ul className="space-y-2 text-xs text-foreground">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span><strong>Unlock Tarina</strong> & all Pro AI actors</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span><strong>50,000 Bonus Credits</strong> immediately added</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Priority RunPod GPU rendering pipeline</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Free AI influencers (Reina) always available</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 px-1" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              onClick={handlePay}
              disabled={!isValidAmount || isLoading}
              className={isProPurchase ? "bg-gradient-to-r from-amber-500 to-amber-600 text-black font-bold hover:opacity-90" : "btn-gradient-primary"}
            >
              {isLoading
                ? "Processing..."
                : isProPurchase
                ? "Upgrade to Pro (₹499)"
                : `Pay ₹${amountInRupees} with Razorpay`}
            </Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
