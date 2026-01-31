import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { LoaderIcon, ShieldIcon, CheckCircleIcon, ChevronRightIcon, XIcon } from '@/components/icons';

const SUPABASE_URL = "https://pxyyncsnjpuwvnwyfdwx.supabase.co";

interface PaymentLinkData {
  id: string;
  productName: string;
  productDescription?: string;
  price: number;
  originalPrice?: number;
  currency: string;
  images: string[];
  status: string;
  seller: {
    name: string;
    sellerProfile?: {
      rating: number;
      totalReviews: number;
      isVerified: boolean;
    };
  };
}

export function BuyPage() {
  const { linkId } = useParams<{ linkId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [link, setLink] = useState<PaymentLinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [processing, setProcessing] = useState(false);
  
  const [buyerInfo, setBuyerInfo] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
  });

  useEffect(() => {
    if (linkId) {
      loadPaymentLink();
    }
  }, [linkId]);

  const loadPaymentLink = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch from links-api edge function
      const response = await fetch(`${SUPABASE_URL}/functions/v1/links-api/${linkId}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (result.success && result.data) {
        setLink(result.data);
      } else {
        setError(result.error || 'Payment link not found');
      }
    } catch (err) {
      console.error('Failed to load payment link:', err);
      setError('Failed to load payment link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!buyerInfo.name || !buyerInfo.phone) {
      toast({
        title: 'Required Fields',
        description: 'Please enter your name and phone number',
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);

    try {
      // Create transaction via links-api
      const response = await fetch(`${SUPABASE_URL}/functions/v1/links-api/${linkId}/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          buyerName: buyerInfo.name,
          buyerPhone: buyerInfo.phone,
          buyerEmail: buyerInfo.email || `${buyerInfo.phone.replace(/\D/g, '')}@payloom.temp`,
          deliveryAddress: buyerInfo.address,
          paymentMethod: 'PAYSTACK',
        }),
      });

      const result = await response.json();

      if (result.success && result.data?.transactionId) {
        // Redirect to payment page
        navigate(`/pay/${result.data.transactionId}`);
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to create order',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to process checkout',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <LoaderIcon size={48} className="animate-spin text-[#5d2ba3] mx-auto mb-4" />
          <p className="text-gray-600">Loading product...</p>
        </div>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XIcon size={32} className="text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Link Not Available</h1>
          <p className="text-gray-600 mb-6">{error || 'This payment link is invalid or has expired.'}</p>
          <Link
            to="/"
            className="inline-block px-6 py-3 bg-[#3d1a7a] text-white rounded-lg hover:bg-[#250e52] transition font-medium"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  const discount = link.originalPrice ? Math.round(((link.originalPrice - link.price) / link.originalPrice) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.jpeg" alt="PayLoom" className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-2 text-sm text-[#5d2ba3]">
            <ShieldIcon size={16} />
            <span>Secure Checkout</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Product Images */}
          <div className="space-y-4">
            <div className="aspect-square bg-white rounded-lg border border-gray-200 overflow-hidden">
              {link.images && link.images.length > 0 ? (
                <img
                  src={link.images[activeImage]}
                  alt={link.productName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                  No image available
                </div>
              )}
            </div>
            
            {/* Thumbnails */}
            {link.images && link.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {link.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(idx)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition ${
                      activeImage === idx ? 'border-[#5d2ba3]' : 'border-gray-200'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            {/* Seller Info */}
            <div className="flex items-center gap-3 text-sm">
              <div className="w-10 h-10 bg-[#5d2ba3]/20 rounded-full flex items-center justify-center text-[#5d2ba3] font-bold">
                {link.seller.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-gray-900">{link.seller.name}</p>
                {link.seller.sellerProfile?.isVerified && (
                  <span className="inline-flex items-center gap-1 text-xs text-[#5d2ba3]">
                    <CheckCircleIcon size={12} /> Verified Seller
                  </span>
                )}
              </div>
            </div>

            {/* Product Name & Price */}
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{link.productName}</h1>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-[#3d1a7a]">
                  {link.currency} {link.price.toLocaleString()}
                </span>
                {link.originalPrice && link.originalPrice > link.price && (
                  <>
                    <span className="text-lg text-gray-400 line-through">
                      {link.currency} {link.originalPrice.toLocaleString()}
                    </span>
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-sm font-medium rounded">
                      {discount}% OFF
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            {link.productDescription && (
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Description</h3>
                <p className="text-gray-600">{link.productDescription}</p>
              </div>
            )}

            {/* Security Features */}
            <div className="bg-[#5d2ba3]/5 border border-[#5d2ba3]/20 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircleIcon size={16} className="text-[#5d2ba3]" />
                <span>Escrow Protection - Payment held securely</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircleIcon size={16} className="text-[#5d2ba3]" />
                <span>Money-back guarantee if item not received</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircleIcon size={16} className="text-[#5d2ba3]" />
                <span>Secure payment via Paystack</span>
              </div>
            </div>

            {/* Buy Button */}
            <button
              onClick={() => setShowCheckout(true)}
              className="w-full py-4 bg-[#3d1a7a] text-white rounded-lg font-bold text-lg hover:bg-[#250e52] transition flex items-center justify-center gap-2"
            >
              Buy Now
              <ChevronRightIcon size={20} />
            </button>
          </div>
        </div>
      </main>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCheckout(false)} />
          
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#3d1a7a]">Complete Your Purchase</h2>
              <button onClick={() => setShowCheckout(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <XIcon size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Order Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex gap-4">
                  {link.images?.[0] && (
                    <img src={link.images[0]} alt="" className="w-16 h-16 object-cover rounded-lg" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{link.productName}</p>
                    <p className="text-lg font-bold text-[#3d1a7a]">
                      {link.currency} {link.price.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Buyer Info Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
                  <input
                    type="text"
                    value={buyerInfo.name}
                    onChange={(e) => setBuyerInfo({ ...buyerInfo, name: e.target.value })}
                    placeholder="Enter your full name"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#3d1a7a]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    value={buyerInfo.phone}
                    onChange={(e) => setBuyerInfo({ ...buyerInfo, phone: e.target.value })}
                    placeholder="+254 712 345 678"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#3d1a7a]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    value={buyerInfo.email}
                    onChange={(e) => setBuyerInfo({ ...buyerInfo, email: e.target.value })}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#3d1a7a]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
                  <textarea
                    value={buyerInfo.address}
                    onChange={(e) => setBuyerInfo({ ...buyerInfo, address: e.target.value })}
                    placeholder="Enter delivery address"
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#3d1a7a] resize-none"
                  />
                </div>
              </div>

              {/* Checkout Button */}
              <button
                onClick={handleCheckout}
                disabled={processing || !buyerInfo.name || !buyerInfo.phone}
                className="w-full py-4 bg-[#3d1a7a] text-white rounded-lg font-bold hover:bg-[#250e52] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <LoaderIcon size={20} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Proceed to Payment
                    <ChevronRightIcon size={20} />
                  </>
                )}
              </button>

              <p className="text-xs text-center text-gray-500">
                By proceeding, you agree to our Terms of Service and Privacy Policy
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BuyPage;
