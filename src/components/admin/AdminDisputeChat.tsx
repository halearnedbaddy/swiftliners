import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Loader, User, Shield, Clock, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  dispute_id: string;
  sender_id: string;
  message: string;
  is_admin: boolean | null;
  created_at: string;
  attachments?: string[] | null;
}

interface Dispute {
  id: string;
  reason: string;
  status: string;
  description?: string;
  opened_by_id: string;
  transaction?: {
    item_name: string;
    amount: number;
    buyer_id?: string;
    seller_id?: string;
  };
}

interface AdminDisputeChatProps {
  dispute: Dispute;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: () => void;
}

export function AdminDisputeChat({ dispute, isOpen, onClose, onStatusChange }: AdminDisputeChatProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [participants, setParticipants] = useState<Record<string, { name: string; role: string }>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('dispute_messages')
        .select('*')
        .eq('dispute_id', dispute.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      // Fetch participant names
      const senderIds = [...new Set((data || []).map(m => m.sender_id))];
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, name')
          .in('user_id', senderIds);

        const { data: roles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', senderIds);

        const participantMap: Record<string, { name: string; role: string }> = {};
        (profiles || []).forEach(p => {
          const role = roles?.find(r => r.user_id === p.user_id)?.role || 'USER';
          participantMap[p.user_id] = { name: p.name, role };
        });
        setParticipants(participantMap);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      toast({
        title: 'Error',
        description: 'Failed to load messages',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [dispute.id, toast]);

  // Set up realtime subscription
  useEffect(() => {
    if (!isOpen) return;

    fetchMessages();

    // Subscribe to new messages in this dispute
    const channel = supabase
      .channel(`dispute-messages-${dispute.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dispute_messages',
          filter: `dispute_id=eq.${dispute.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          
          // Fetch sender info if not already known
          if (!participants[newMsg.sender_id]) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('user_id, name')
              .eq('user_id', newMsg.sender_id)
              .single();

            const { data: role } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', newMsg.sender_id)
              .single();

            if (profile) {
              setParticipants(prev => ({
                ...prev,
                [newMsg.sender_id]: { 
                  name: profile.name, 
                  role: role?.role || 'USER' 
                },
              }));
            }
          }

          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, dispute.id, fetchMessages, participants]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    try {
      setSending(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('dispute_messages')
        .insert({
          dispute_id: dispute.id,
          sender_id: user.id,
          message: newMessage.trim(),
          is_admin: true,
        });

      if (error) throw error;

      setNewMessage('');
      
      // Create notification for dispute participants
      await supabase.from('notifications').insert({
        user_id: dispute.opened_by_id,
        type: 'DISPUTE_UPDATE',
        title: 'New message in your dispute',
        message: `Admin has responded to your dispute case.`,
        data: { disputeId: dispute.id },
      });

    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      type DisputeStatusType = 'OPEN' | 'UNDER_REVIEW' | 'AWAITING_SELLER' | 'AWAITING_BUYER' | 'RESOLVED_BUYER' | 'RESOLVED_SELLER' | 'CLOSED';
      const { error } = await supabase
        .from('disputes')
        .update({ status: newStatus as DisputeStatusType, updated_at: new Date().toISOString() })
        .eq('id', dispute.id);

      if (error) throw error;

      toast({
        title: 'Status Updated',
        description: `Dispute status changed to ${newStatus}`,
      });

      onStatusChange?.();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  if (!isOpen) return null;

  const getParticipantLabel = (senderId: string, isAdmin: boolean) => {
    if (isAdmin) return { name: 'Admin', role: 'ADMIN', color: 'text-purple-600' };
    const participant = participants[senderId];
    if (!participant) return { name: 'User', role: 'USER', color: 'text-gray-600' };
    return {
      name: participant.name,
      role: participant.role,
      color: participant.role === 'SELLER' ? 'text-blue-600' : 'text-green-600',
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-primary">
              Dispute: {dispute.reason.replace(/_/g, ' ')}
            </h3>
            <p className="text-sm text-muted-foreground">
              Case #{dispute.id.slice(0, 8)} • {dispute.transaction?.item_name || 'N/A'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={dispute.status}
              onChange={(e) => handleUpdateStatus(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-primary"
            >
              <option value="OPEN">Open</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="AWAITING_SELLER">Awaiting Seller</option>
              <option value="AWAITING_BUYER">Awaiting Buyer</option>
              <option value="RESOLVED_BUYER">Resolved (Buyer)</option>
              <option value="RESOLVED_SELLER">Resolved (Seller)</option>
              <option value="CLOSED">Closed</option>
            </select>
            <button
              onClick={fetchMessages}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              title="Refresh messages"
            >
              <RefreshCw size={18} />
            </button>
            <button 
              onClick={onClose} 
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Dispute Info */}
        {dispute.description && (
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-sm text-gray-600">
              <strong>Description:</strong> {dispute.description}
            </p>
            {dispute.transaction && (
              <p className="text-sm text-gray-600 mt-1">
                <strong>Amount:</strong> KES {dispute.transaction.amount.toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader size={24} className="animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const participant = getParticipantLabel(msg.sender_id, msg.is_admin || false);
              const isFromAdmin = msg.is_admin;

              return (
                <div
                  key={msg.id}
                  className={`flex ${isFromAdmin ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg p-3 ${
                      isFromAdmin
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {isFromAdmin ? (
                        <Shield size={14} />
                      ) : (
                        <User size={14} />
                      )}
                      <span className={`text-xs font-semibold ${isFromAdmin ? '' : participant.color}`}>
                        {participant.name}
                        {participant.role !== 'ADMIN' && (
                          <span className="ml-1 opacity-70">({participant.role})</span>
                        )}
                      </span>
                    </div>
                    <p className="text-sm">{msg.message}</p>
                    <div className={`flex items-center gap-1 mt-2 text-xs ${isFromAdmin ? 'text-primary-foreground/70' : 'text-gray-500'}`}>
                      <Clock size={12} />
                      {new Date(msg.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message as admin..."
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-primary"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              {sending ? (
                <Loader size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
