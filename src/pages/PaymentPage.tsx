import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { SellerActions } from "@/components/SellerActions";
import { SellerDeliveryActions } from "@/components/SellerDeliveryActions";
import { BuyerConfirmActions } from "@/components/BuyerConfirmActions";
import { PaymentWidget } from "@/components/PaymentWidget";
import { api } from "@/services/api";

interface TransactionDetails {
  id: string;
  status: string;
  amount: number;
  currency: string;
  itemName: string;
  itemDescription?: string | null;
  itemImages?: string[];
  sellerId: string;
  buyerId?: string | null;
  buyerPhone?: string | null;
  buyerName?: string | null;
  expiresAt?: string | null;
  paidAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  courierName?: string | null;
  trackingNumber?: string | null;
  deliveryProofUrls?: string[];
  seller?: {
    name: string;
    phone: string;
  };
}

// Demo data for preview
const DEMO_TRANSACTION: TransactionDetails = {
  id: "demo-transaction",
  status: "PENDING",
  amount: 5000,
  currency: "KES",
  itemName: "iPhone 13 Pro Max",
  itemDescription: "Brand new, sealed in box. 256GB Sierra Blue.",
  itemImages: [],
  sellerId: "demo-seller",
  buyerId: null,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  seller: {
    name: "Demo Seller",
    phone: "+254712345678",
  },
};

const statusColors: Record<string, string> = {
  PENDING: "bg-[#5d2ba3]/20 text-[#5d2ba3]",
  PROCESSING: "bg-[#5d2ba3]/20 text-[#5d2ba3]",
  PAID: "bg-[#5d2ba3]/20 text-[#5d2ba3]",
  ACCEPTED: "bg-[#3d1a7a]/20 text-[#3d1a7a]",
  SHIPPED: "bg-[#5d2ba3]/20 text-[#5d2ba3]",
  DELIVERED: "bg-[#5d2ba3]/20 text-[#5d2ba3]",
  COMPLETED: "bg-[#5d2ba3]/20 text-[#5d2ba3]",
  DISPUTED: "bg-[#4F4A41]/20 text-[#4F4A41]",
  CANCELLED: "bg-gray-100 text-gray-800",
  REFUNDED: "bg-[#5d2ba3]/20 text-[#5d2ba3]",
};

export function PaymentPage() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const [data, setData] = useState<TransactionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  const fetchTransaction = async () => {
    if (!transactionId) return;
    
    // Use demo data for demo transaction
    if (transactionId === "demo-transaction") {
      setData(DEMO_TRANSACTION);
      setLoading(false);
      return;
    }

    try {
      const response = await api.getTransaction(transactionId);
      if (response.success && response.data) {
        setData(response.data as TransactionDetails);
      } else {
        setError(response.error || "Transaction not found");
      }
    } catch {
      setError("Failed to load transaction details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransaction();
  }, [transactionId]);

  const handleSimulatePayment = async () => {
    if (!transactionId || transactionId === "demo-transaction") return;
    
    setSimulating(true);
    try {
      const response = await api.request('/api/v1/payments/simulate-payment', {
        method: 'POST',
        body: { transactionId },
        requireAuth: false,
      });
      
      if (response.success) {
        // Refresh transaction data
        await fetchTransaction();
      } else {
        setError(response.error || "Failed to simulate payment");
      }
    } catch {
      setError("Failed to simulate payment");
    } finally {
      setSimulating(false);
    }
  };

  const handlePaymentSuccess = () => {
    fetchTransaction();
  };

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-10">
        <div className="h-8 w-8 animate-spin rounded-null-full border-4 border-primary border-t-transparent" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
        <h1 className="text-xl font-semibold text-foreground">Transaction not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This link may have expired or the transaction ID is invalid.
        </p>
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
      </main>
    );
  }

  const showPaymentWidget = ['PENDING', 'PROCESSING'].includes(data.status);
  const showSellerActions = ['PAID'].includes(data.status);
  const showDeliveryActions = ['ACCEPTED', 'SHIPPED'].includes(data.status);
  const showBuyerConfirm = ['DELIVERED'].includes(data.status);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">
          {data.itemName}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Secure escrow payment via PayLoom
        </p>
      </header>

      {/* Transaction Details Card */}
      <section className="rounded-null-lg border border-border bg-card p-4 text-sm space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Amount</span>
          <span className="text-xl font-bold text-foreground">
            {data.currency} {data.amount.toLocaleString()}
          </span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Status</span>
          <span className={`inline-flex items-center rounded-null-full px-3 py-1 text-xs font-medium ${statusColors[data.status] || 'bg-gray-100 text-gray-800'}`}>
            {data.status}
          </span>
        </div>

        {data.seller && (
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Seller</span>
            <span className="text-foreground">{data.seller.name}</span>
          </div>
        )}

        {data.itemDescription && (
          <div className="pt-3 border-t border-border">
            <p className="text-muted-foreground text-xs mb-1">Description</p>
            <p className="text-foreground">{data.itemDescription}</p>
          </div>
        )}

        {data.expiresAt && data.status === 'PENDING' && (
          <p className="text-xs text-muted-foreground">
            Link expires: {new Date(data.expiresAt).toLocaleString()}
          </p>
        )}

        {data.courierName && (
          <div className="pt-3 border-t border-border">
            <p className="text-muted-foreground text-xs mb-1">Shipping Info</p>
            <p className="text-foreground">
              {data.courierName} - {data.trackingNumber}
            </p>
          </div>
        )}

        {data.deliveryProofUrls && data.deliveryProofUrls.length > 0 && (
          <div className="pt-3 border-t border-border">
            <p className="text-muted-foreground text-xs mb-1">Delivery Proof</p>
            <div className="flex gap-2 flex-wrap">
              {data.deliveryProofUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary text-xs underline hover:no-underline"
                >
                  View Proof {i + 1}
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Payment Widget for pending transactions */}
      {showPaymentWidget && transactionId && transactionId !== "demo-transaction" && (
        <section className="space-y-4">
          <PaymentWidget
            transactionId={transactionId}
            amount={data.amount}
            buyerName={data.buyerName || "Customer"}
            onPaymentSuccess={handlePaymentSuccess}
          />
          
          {/* Simulate Payment Button for Testing */}
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground mb-2 text-center">
              For testing without M-Pesa credentials:
            </p>
            <button
              onClick={handleSimulatePayment}
              disabled={simulating}
              className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium py-2 px-4 rounded-null-lg transition disabled:opacity-50"
            >
              {simulating ? "Simulating..." : "Simulate Payment (Demo)"}
            </button>
          </div>
        </section>
      )}

      {/* Demo mode payment widget */}
      {showPaymentWidget && transactionId === "demo-transaction" && (
        <div className="bg-[#5d2ba3]/10 border border-[#5d2ba3]/30 rounded-null-lg p-4 text-center">
          <p className="text-[#5d2ba3] text-sm">
            This is a demo transaction. Connect to a real backend to process payments.
          </p>
        </div>
      )}

      {/* Seller Actions */}
      {showSellerActions && transactionId && (
        <SellerActions transactionId={transactionId} initialStatus={data.status} />
      )}

      {/* Delivery Actions */}
      {showDeliveryActions && transactionId && (
        <SellerDeliveryActions transactionId={transactionId} initialStatus={data.status} />
      )}

      {/* Buyer Confirmation */}
      {showBuyerConfirm && transactionId && (
        <BuyerConfirmActions transactionId={transactionId} initialStatus={data.status} />
      )}

      {/* Completed Status */}
      {data.status === 'COMPLETED' && (
        <div className="bg-[#5d2ba3]/10 border border-[#5d2ba3]/30 rounded-null-lg p-6 text-center">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-[#5d2ba3] font-bold">Transaction Completed!</p>
          <p className="text-sm text-[#5d2ba3] mt-2">
            Funds have been released to the seller.
          </p>
        </div>
      )}

      {/* Transaction ID */}
      <p className="text-xs text-muted-foreground text-center">
        Transaction ID: {data.id}
      </p>
    </main>
  );
}
