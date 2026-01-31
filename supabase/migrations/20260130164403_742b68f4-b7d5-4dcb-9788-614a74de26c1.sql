-- Create wallet_transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reference TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own wallet transactions
CREATE POLICY "Users can view own wallet transactions" 
ON public.wallet_transactions
FOR SELECT 
USING (auth.uid() = user_id);

-- Policy: Users can insert their own wallet transactions
CREATE POLICY "Users can insert own wallet transactions" 
ON public.wallet_transactions
FOR INSERT 
WITH CHECK (auth.uid() = user_id);