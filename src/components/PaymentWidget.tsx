import { useState } from 'react';
import { Smartphone, CreditCard, Loader, ExternalLink, ShieldCheck } from 'lucide-react';
import { usePaystackPayment } from 'react-paystack';
import { api } from '@/services/api';

interface PaymentWidgetProps {
  transactionId: string;
  amount: number;
  buyerName?: string;
  onPaymentSuccess?: () => void;
}

type PaymentMethod = 'mpesa' | 'card' | 'all';

export function PaymentWidget({ transactionId, amount, onPaymentSuccess }: PaymentWidgetProps) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'redirecting' | 'success' | 'failed'>('idle');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('all');

  // Paystack Config
  const config = {
    reference: (new Date()).getTime().toString(),
    email: email,
    amount: amount * 100, // Paystack is in kobo
    publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
    currency: 'KES',
    metadata: {
      custom_fields: [
        {
          display_name: "Transaction ID",
          variable_name: "transaction_id",
          value: transactionId
        }
      ]
    }
  };

  const onSuccess = (reference: any) => {
    setIsLoading(true);
    // Verify on backend
    api.verifyPaystackPayment(transactionId, reference.reference)
      .then((res) => {
        if (res.success) {
          setPaymentStatus('success');
          if (onPaymentSuccess) onPaymentSuccess();
        } else {
          setError(res.error || 'Payment verification failed');
          setPaymentStatus('failed');
        }
      })
      .catch((err) => {
        console.error(err);
        setError('Payment verification failed');
        setPaymentStatus('failed');
      })
      .finally(() => setIsLoading(false));
  };

  const onClose = () => {
    setIsLoading(false);
    console.log('Payment closed');
  };

  const PaystackHookExample = () => {
    const initializePayment = usePaystackPayment(config);
    return (
      <button
        type="button"
        disabled={isLoading || !email}
        onClick={() => {
          if (!email) {
            setError("Email is required");
            return;
          }
          setIsLoading(true);
          // @ts-ignore
          initializePayment(onSuccess, onClose)
        }}
        className="w-full bg-primary hover:bg-primary/90 disabled:bg-muted text-primary-foreground font-bold py-3 rounded-null transition flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader size={20} className="animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <ExternalLink size={20} />
            Pay with Paystack
          </>
        )}
      </button>
    );
  };


  return (
    <div className="bg-card rounded-null p-6 border border-border">
      <h3 className="font-bold text-lg text-foreground mb-4">Choose Payment Method</h3>

      {paymentStatus === 'idle' && (
        <>
          {/* Payment Method Selector */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setPaymentMethod('all')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-null border transition ${paymentMethod === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:border-primary/50'
                }`}
            >
              <ExternalLink size={18} />
              <span className="text-sm font-medium">All Options</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('mpesa')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-null border transition ${paymentMethod === 'mpesa'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:border-primary/50'
                }`}
            >
              <Smartphone size={18} />
              <span className="text-sm font-medium">M-Pesa</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-null border transition ${paymentMethod === 'card'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:border-primary/50'
                }`}
            >
              <CreditCard size={18} />
              <span className="text-sm font-medium">Card</span>
            </button>
          </div>

          <div className="space-y-4">
            {/* Email - Required for Paystack */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-4 py-2 border border-input rounded-null bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <p className="text-xs text-muted-foreground mt-1">Receipt will be sent to this email</p>
            </div>

            {/* Amount Display */}
            <div className="bg-muted p-3 rounded-null">
              <p className="text-sm text-muted-foreground">Amount:</p>
              <p className="text-2xl font-bold text-foreground">KES {amount.toLocaleString()}</p>
            </div>

            {/* Payment Method Info */}
            <div className="bg-muted/50 p-3 rounded-null text-sm text-muted-foreground">
              {paymentMethod === 'all' && (
                <p>Card, M-Pesa, Bank Transfer supported by Paystack.</p>
              )}
              {paymentMethod === 'mpesa' && (
                <p>Select M-Pesa option in the popup window.</p>
              )}
              {paymentMethod === 'card' && (
                <p>Select Card option in the popup window.</p>
              )}
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-null">
                {error}
              </div>
            )}

            <PaystackHookExample />

            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck size={14} className="text-primary" />
              <span>Secure payment powered by Paystack</span>
            </div>
          </div>
        </>
      )}

      {paymentStatus === 'success' && (
        <div className="bg-primary/10 border border-primary/20 p-6 rounded-null text-center">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-primary font-bold">Payment Successful!</p>
          <p className="text-sm text-primary/80 mt-2">Transaction ID: {transactionId}</p>
        </div>
      )}

      {paymentStatus === 'failed' && (
        <div className="bg-destructive/10 border border-destructive/20 p-6 rounded-null text-center">
          <div className="text-4xl mb-2">❌</div>
          <p className="text-destructive font-bold">Payment Failed</p>
          {error && <p className="text-sm text-destructive/80 mt-1">{error}</p>}
          <button
            onClick={() => {
              setPaymentStatus('idle');
              setError(null);
            }}
            className="mt-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold py-2 px-4 rounded-null"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
