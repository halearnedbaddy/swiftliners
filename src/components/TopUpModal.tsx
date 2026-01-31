import { useState, useEffect, useCallback } from 'react';
import { XIcon, LoaderIcon, ShieldIcon, CheckIcon } from '@/components/icons';
import { Smartphone, CreditCard, Wallet, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { useWallet } from '@/hooks/useWallet';

interface TopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newBalance: number) => void;
}

type Step = 'amount' | 'payment' | 'review' | 'processing' | 'success';

type PaymentMethod = 'MPESA' | 'CARD' | 'MOBILE_MONEY';

interface PaymentMethodOption {
  id: PaymentMethod;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

declare global {
  interface Window {
    PaystackPop: {
      setup: (config: PaystackConfig) => { openIframe: () => void };
    };
  }
}

interface PaystackConfig {
  key: string;
  email: string;
  amount: number;
  currency: string;
  ref: string;
  metadata: Record<string, unknown>;
  callback: (response: { reference: string }) => void;
  onClose: () => void;
}

export function TopUpModal({ isOpen, onClose, onSuccess }: TopUpModalProps) {
  const { toast } = useToast();
  const { user } = useSupabaseAuth();
  const { verifyTopup, fetchWallet, initializeTopup, session } = useWallet();
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  // Load Paystack script
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.PaystackPop) {
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onload = () => setPaystackLoaded(true);
      document.body.appendChild(script);
    } else if (window.PaystackPop) {
      setPaystackLoaded(true);
    }
  }, []);

  // Reset to first step when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('amount');
      setAmount('');
      setPaymentMethod('CARD');
      setNewBalance(null);
    }
  }, [isOpen]);

  const quickAmounts = [500, 1000, 2500, 5000, 10000, 20000];

  const paymentMethods: PaymentMethodOption[] = [
    {
      id: 'CARD',
      name: 'Card Payment',
      description: 'Credit or Debit Card (Visa, Mastercard)',
      icon: <CreditCard className="text-[#5d2ba3]" size={24} />,
      color: 'text-[#5d2ba3]',
      bgColor: 'bg-[#5d2ba3]/20',
      borderColor: 'border-[#5d2ba3]',
    },
    {
      id: 'MPESA',
      name: 'M-Pesa',
      description: 'Pay via M-Pesa STK Push',
      icon: <Smartphone className="text-[#5d2ba3]" size={24} />,
      color: 'text-[#5d2ba3]',
      bgColor: 'bg-[#5d2ba3]/20',
      borderColor: 'border-[#5d2ba3]',
    },
    {
      id: 'MOBILE_MONEY',
      name: 'Mobile Money',
      description: 'Airtel Money, T-Kash & more',
      icon: <Wallet className="text-purple-600" size={24} />,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-600',
    },
  ];

  const topUpAmount = Number(amount) || 0;
  const isValidAmount = topUpAmount >= 100;
  const userEmail = user?.email || '';

  const handleAmountContinue = () => {
    if (!isValidAmount) {
      toast({
        title: 'Invalid Amount',
        description: 'Minimum top-up amount is KES 100',
        variant: 'destructive',
      });
      return;
    }
    setStep('payment');
  };

  const handlePaymentContinue = () => {
    setStep('review');
  };

  const handleVerifyPayment = useCallback(async (reference: string) => {
    try {
      const result = await verifyTopup(reference);
      
      if (result.success && result.data) {
        setNewBalance(result.data.new_balance);
        setStep('success');
        
        toast({
          title: 'Top-up Successful!',
          description: `KES ${result.data.amount.toLocaleString()} added to your wallet`,
        });

        // Call success callback
        if (onSuccess) {
          onSuccess(result.data.new_balance);
        }

        // Refresh wallet data
        await fetchWallet();
      } else {
        toast({
          title: 'Verification Failed',
          description: result.error || 'Failed to verify payment. Please contact support.',
          variant: 'destructive',
        });
        setStep('review');
      }
    } catch (err) {
      console.error('Verification error:', err);
      toast({
        title: 'Error',
        description: 'Failed to verify payment. Please contact support.',
        variant: 'destructive',
      });
      setStep('review');
    } finally {
      setIsProcessing(false);
    }
  }, [verifyTopup, fetchWallet, toast, onSuccess]);

  const handleTopUp = async () => {
    if (!userEmail) {
      toast({
        title: 'Email Required',
        description: 'Please ensure your email is set in your profile',
        variant: 'destructive',
      });
      return;
    }

    if (!session?.access_token) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to top up your wallet',
        variant: 'destructive',
      });
      return;
    }

    if (!paystackLoaded || !window.PaystackPop) {
      toast({
        title: 'Loading Payment...',
        description: 'Please wait a moment and try again',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setStep('processing');

    try {
      // Get initialization data from backend
      const initResult = await initializeTopup(topUpAmount, userEmail);
      
      if (!initResult.success || !initResult.data) {
        throw new Error(initResult.error || 'Failed to initialize payment');
      }

      const { reference, publicKey } = initResult.data;

      // Open Paystack popup
      const handler = window.PaystackPop.setup({
        key: publicKey,
        email: userEmail,
        amount: topUpAmount * 100, // Convert to kobo
        currency: 'KES',
        ref: reference,
        metadata: {
          user_id: user?.id,
          transaction_type: 'wallet_topup',
        },
        callback: (response: { reference: string }) => {
          // Payment successful - verify on backend
          handleVerifyPayment(response.reference);
        },
        onClose: () => {
          if (step === 'processing') {
            setIsProcessing(false);
            setStep('review');
            toast({
              title: 'Payment Cancelled',
              description: 'You cancelled the payment',
            });
          }
        },
      });

      handler.openIframe();
    } catch (err) {
      console.error('Top-up error:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to initialize top-up. Please try again.',
        variant: 'destructive',
      });
      setIsProcessing(false);
      setStep('review');
    }
  };

  const getStepNumber = (stepName: Step) => {
    const steps: Step[] = ['amount', 'payment', 'review'];
    return steps.indexOf(stepName) + 1;
  };

  const selectedPaymentMethod = paymentMethods.find(m => m.id === paymentMethod);

  const handleClose = () => {
    if (step === 'success' && onSuccess && newBalance !== null) {
      onSuccess(newBalance);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-lg max-w-lg w-full relative shadow-2xl scale-100 animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#5d2ba3] to-[#3d1a7a] px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Top Up Wallet</h2>
              <p className="text-white/90 text-sm mt-1">Add funds securely to your wallet</p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/20 rounded-full transition text-white"
            >
              <XIcon size={20} />
            </button>
          </div>

          {/* Progress Steps */}
          {step !== 'success' && (
            <div className="flex items-center gap-2 mt-6">
              {(['amount', 'payment', 'review'] as Step[]).map((s, idx) => (
                <div key={s} className="flex items-center flex-1">
                  <div className="flex items-center gap-2 flex-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                        getStepNumber(step) > getStepNumber(s)
                          ? 'bg-white text-[#5d2ba3]'
                          : getStepNumber(step) === getStepNumber(s)
                          ? 'bg-white text-[#5d2ba3] ring-4 ring-white/30'
                          : 'bg-white/30 text-white'
                      }`}
                    >
                      {getStepNumber(step) > getStepNumber(s) ? (
                        <CheckIcon size={16} />
                      ) : (
                        getStepNumber(s)
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium hidden sm:block ${
                        getStepNumber(step) >= getStepNumber(s) ? 'text-white' : 'text-white/70'
                      }`}
                    >
                      {s === 'amount' ? 'Amount' : s === 'payment' ? 'Payment' : 'Review'}
                    </span>
                  </div>
                  {idx < 2 && (
                    <div
                      className={`h-1 flex-1 mx-2 rounded-full transition-all ${
                        getStepNumber(step) > getStepNumber(s) ? 'bg-white' : 'bg-white/30'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6">
          {/* Step 1: Amount Selection */}
          {step === 'amount' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Select or Enter Amount
                </label>
                
                {/* Quick Amount Buttons */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmount(amt.toString())}
                      className={`py-3 rounded-lg font-bold text-sm transition-all transform ${
                        amount === amt.toString()
                          ? 'bg-[#5d2ba3] text-white shadow-lg scale-105 ring-2 ring-[#5d2ba3]/30'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                      }`}
                    >
                      KES {amt.toLocaleString()}
                    </button>
                  ))}
                </div>

                {/* Custom Amount Input */}
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">KES</span>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    placeholder="Enter custom amount (min KES 100)"
                    className="w-full pl-14 pr-4 py-4 rounded-lg border-2 border-gray-200 focus:outline-none focus:border-[#5d2ba3] focus:ring-4 focus:ring-[#5d2ba3]/10 transition font-bold text-lg"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                  <ShieldIcon size={12} className="text-[#5d2ba3]" />
                  Minimum amount: KES 100
                </p>
              </div>

              {amount && isValidAmount && (
                <div className="bg-[#5d2ba3]/10 border-2 border-[#5d2ba3]/30 rounded-lg p-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-[#5d2ba3] font-semibold uppercase tracking-wide">Top Up Amount</p>
                      <p className="text-2xl font-bold text-[#5d2ba3] mt-1">
                        KES {topUpAmount.toLocaleString()}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-[#5d2ba3] rounded-full flex items-center justify-center">
                      <CheckIcon size={20} className="text-white" />
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleAmountContinue}
                disabled={!isValidAmount}
                className="w-full bg-[#5d2ba3] text-white font-bold py-4 rounded-lg hover:bg-[#3d1a7a] transition transform active:scale-98 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#5d2ba3]/30"
              >
                Continue
                <ChevronRight size={20} />
              </button>
            </div>
          )}

          {/* Step 2: Payment Method Selection */}
          {step === 'payment' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h3 className="text-lg font-bold text-[#3d1a7a] mb-1">Choose Payment Method</h3>
                <p className="text-sm text-gray-600">Select your preferred payment option</p>
              </div>

              <div className="space-y-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id)}
                    className={`w-full p-4 rounded-lg border-2 transition-all transform ${
                      paymentMethod === method.id
                        ? `${method.bgColor} ${method.borderColor} shadow-lg scale-[1.02]`
                        : 'border-gray-200 hover:border-gray-300 hover:scale-[1.01]'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-lg ${paymentMethod === method.id ? method.bgColor : 'bg-gray-100'}`}>
                        {method.icon}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-bold text-gray-900">{method.name}</p>
                        <p className="text-sm text-gray-600">{method.description}</p>
                      </div>
                      {paymentMethod === method.id && (
                        <CheckCircle2 className="text-[#5d2ba3]" size={24} />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('amount')}
                  className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-200 transition"
                >
                  Back
                </button>
                <button
                  onClick={handlePaymentContinue}
                  className="flex-1 bg-[#5d2ba3] text-white font-bold py-3 rounded-lg hover:bg-[#3d1a7a] transition transform active:scale-98 flex items-center justify-center gap-2 shadow-lg shadow-[#5d2ba3]/30"
                >
                  Continue
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 'review' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h3 className="text-lg font-bold text-[#3d1a7a] mb-1">Review Your Top Up</h3>
                <p className="text-sm text-gray-600">Please review before proceeding</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                  <span className="text-sm text-gray-600">Amount</span>
                  <span className="text-2xl font-bold text-gray-900">KES {topUpAmount.toLocaleString()}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Payment Method</span>
                  <div className="flex items-center gap-2">
                    {selectedPaymentMethod?.icon}
                    <span className="font-semibold text-gray-900">{selectedPaymentMethod?.name}</span>
                  </div>
                </div>

                {userEmail && (
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                    <span className="text-sm text-gray-600">Receipt Email</span>
                    <span className="text-sm font-medium text-gray-900">{userEmail}</span>
                  </div>
                )}
              </div>

              <div className="bg-[#5d2ba3]/10 border border-[#5d2ba3]/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <ShieldIcon size={20} className="text-[#5d2ba3] mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[#5d2ba3]">Secure Payment</p>
                    <p className="text-xs text-[#5d2ba3] mt-1">
                      Your payment is processed securely via Paystack. No card details are stored on our servers.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('payment')}
                  className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-200 transition"
                >
                  Back
                </button>
                <button
                  onClick={handleTopUp}
                  disabled={isProcessing}
                  className="flex-1 bg-[#5d2ba3] text-white font-bold py-3 rounded-lg hover:bg-[#3d1a7a] transition transform active:scale-98 flex items-center justify-center gap-2 disabled:opacity-70 shadow-lg shadow-[#5d2ba3]/30"
                >
                  {isProcessing ? (
                    <>
                      <LoaderIcon size={18} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      Proceed to Payment
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Processing */}
          {step === 'processing' && (
            <div className="text-center py-12 animate-in fade-in duration-300">
              <div className="w-16 h-16 border-4 border-[#5d2ba3] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-lg font-semibold text-gray-900 mb-2">Processing Payment...</p>
              <p className="text-sm text-gray-600">Please complete payment in the popup window</p>
            </div>
          )}

          {/* Step 5: Success */}
          {step === 'success' && (
            <div className="text-center py-8 animate-in fade-in duration-300">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="text-green-600" size={40} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Top-up Successful!</h3>
              <p className="text-gray-600 mb-4">
                KES {topUpAmount.toLocaleString()} has been added to your wallet
              </p>
              {newBalance !== null && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-green-700">New Balance</p>
                  <p className="text-3xl font-bold text-green-600">KES {newBalance.toLocaleString()}</p>
                </div>
              )}
              <button
                onClick={handleClose}
                className="w-full bg-[#5d2ba3] text-white font-bold py-3 rounded-lg hover:bg-[#3d1a7a] transition"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
