import { useState, useEffect } from 'react';
import { XIcon, LoaderIcon, AlertTriangleIcon } from '@/components/icons';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CreateDisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userRole: 'buyer' | 'seller';
}

interface OrderOption {
  id: string;
  item_name: string;
  amount: number;
  created_at: string | null;
  seller_id?: string | null;
  buyer_id?: string | null;
}

const DISPUTE_TYPES = {
  buyer: [
    { value: 'ITEM_NOT_RECEIVED', label: 'Item Not Received' },
    { value: 'NOT_AS_DESCRIBED', label: 'Not As Described' },
    { value: 'DAMAGED', label: 'Item Damaged' },
    { value: 'WRONG_ITEM', label: 'Wrong Item Received' },
    { value: 'REFUND_REQUEST', label: 'Refund Request' },
    { value: 'OTHER', label: 'Other' },
  ],
  seller: [
    { value: 'BUYER_NOT_RESPONDING', label: 'Buyer Not Responding' },
    { value: 'PAYMENT_ISSUE', label: 'Payment Issue' },
    { value: 'RETURN_REQUEST', label: 'Return Request' },
    { value: 'FALSE_CLAIM', label: 'False Claim by Buyer' },
    { value: 'OTHER', label: 'Other' },
  ],
};

export function CreateDisputeModal({ isOpen, onClose, onSuccess, userRole }: CreateDisputeModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [form, setForm] = useState({
    transactionId: '',
    reason: '',
    description: '',
  });

  useEffect(() => {
    if (isOpen) {
      loadOrders();
    }
  }, [isOpen, userRole]);

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get transactions based on user role
      const query = supabase
        .from('transactions')
        .select('id, item_name, amount, created_at, seller_id, buyer_id')
        .in('status', ['paid', 'accepted', 'shipped', 'delivered', 'completed']);

      if (userRole === 'buyer') {
        query.eq('buyer_id', user.id);
      } else {
        query.eq('seller_id', user.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.transactionId || !form.reason || !form.description) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (form.description.length < 20) {
      toast({
        title: 'Error',
        description: 'Description must be at least 20 characters',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create the dispute
      const { data: dispute, error: disputeError } = await supabase
        .from('disputes')
        .insert({
          transaction_id: form.transactionId,
          opened_by_id: user.id,
          reason: form.reason,
          description: form.description,
          status: 'open',
        })
        .select()
        .single();

      if (disputeError) throw disputeError;

      // Create initial message
      await supabase
        .from('dispute_messages')
        .insert({
          dispute_id: dispute.id,
          sender_id: user.id,
          message: form.description,
          is_admin: false,
        });

      toast({
        title: 'Dispute Created',
        description: `Dispute ID: ${dispute.id.slice(0, 8)}. Our team will review it shortly.`,
      });

      onSuccess();
      onClose();
      setForm({ transactionId: '', reason: '', description: '' });
    } catch (err: any) {
      console.error('Failed to create dispute:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to create dispute',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#5d2ba3]/20 rounded-full flex items-center justify-center">
              <AlertTriangleIcon className="text-[#5d2ba3]" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#3d1a7a]">Create New Dispute</h2>
              <p className="text-sm text-gray-500">Report an issue with your {userRole === 'buyer' ? 'purchase' : 'sale'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition">
            <XIcon size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Order Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Select Order *
            </label>
            {loadingOrders ? (
              <div className="flex items-center justify-center py-4">
                <LoaderIcon size={24} className="animate-spin text-[#5d2ba3]" />
              </div>
            ) : orders.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500">
                No orders available for dispute
              </div>
            ) : (
              <select
                value={form.transactionId}
                onChange={(e) => setForm({ ...form, transactionId: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#3d1a7a] bg-white"
                required
              >
                <option value="">Select an order...</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.item_name} - KES {order.amount.toLocaleString()} ({order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Dispute Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Dispute Type *
            </label>
            <select
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#3d1a7a] bg-white"
              required
            >
              <option value="">Select type...</option>
              {DISPUTE_TYPES[userRole].map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Description * <span className="font-normal text-gray-400">(min 20 characters)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe your issue in detail. Include relevant dates, what went wrong, and what resolution you're seeking..."
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#3d1a7a] resize-none"
              rows={5}
              maxLength={1000}
              required
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{form.description.length}/1000</p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>What happens next?</strong><br />
              Our team will review your dispute within 24-48 hours. You'll receive updates via the messaging system and notifications.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.transactionId || !form.reason || form.description.length < 20}
              className="flex-1 px-4 py-3 bg-[#3d1a7a] text-white rounded-lg font-medium hover:bg-[#250e52] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <LoaderIcon size={18} className="animate-spin" />
                  Creating...
                </>
              ) : (
                'Submit Dispute'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
