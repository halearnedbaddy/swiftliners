/**
 * Transaction API Edge Function
 * Handles transactions, payments, and order management
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateTransactionId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${timestamp}-${random}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } }
    );

    const url = new URL(req.url);
    const path = url.pathname.replace("/transaction-api", "");
    const method = req.method;

    // Get current user if authenticated
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: authData } = await supabase.auth.getUser(token);
      userId = authData.user?.id || null;
    }

    // GET /transactions - Get user's transactions
    if (method === "GET" && (path === "" || path === "/")) {
      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const role = url.searchParams.get("role") || "all";
      const status = url.searchParams.get("status");
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");

      let query = supabase.from("transactions").select("*", { count: "exact" });

      if (role === "buyer") {
        query = query.eq("buyer_id", userId);
      } else if (role === "seller") {
        query = query.eq("seller_id", userId);
      } else {
        query = query.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
      }

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        data,
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET /transactions/:id - Get transaction details
    if (method === "GET" && path.match(/^\/[a-zA-Z0-9-]+$/)) {
      const transactionId = path.substring(1);

      const { data: transaction, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .maybeSingle();

      if (error) throw error;
      if (!transaction) {
        return new Response(JSON.stringify({ success: false, error: "Transaction not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, data: transaction }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /transactions - Create transaction (seller creates payment link)
    if (method === "POST" && (path === "" || path === "/")) {
      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { itemName, amount, description } = await req.json();

      if (!itemName || !amount) {
        return new Response(JSON.stringify({ success: false, error: "Item name and amount are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: transaction, error } = await supabase
        .from("transactions")
        .insert({
          seller_id: userId,
          item_name: itemName,
          description,
          amount,
          status: "PENDING",
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        data: {
          ...transaction,
          paymentLink: `/pay/${transaction.id}`,
        },
      }), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /transactions/:id/pay - Initiate payment (buyer pays)
    if (method === "POST" && path.match(/^\/[a-zA-Z0-9-]+\/pay$/)) {
      const transactionId = path.split("/")[1];
      const { buyerName, buyerPhone, buyerEmail, paymentMethod } = await req.json();

      if (!buyerName || !buyerPhone) {
        return new Response(JSON.stringify({ success: false, error: "Buyer name and phone are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: transaction, error } = await supabase
        .from("transactions")
        .update({
          buyer_id: userId,
          buyer_name: buyerName,
          buyer_phone: buyerPhone,
          buyer_email: buyerEmail,
          payment_method: paymentMethod || "MPESA",
          status: "PROCESSING",
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId)
        .eq("status", "PENDING")
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        message: "Payment initiated",
        data: transaction,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /transactions/:id/confirm - Confirm payment
    if (method === "POST" && path.match(/^\/[a-zA-Z0-9-]+\/confirm$/)) {
      const transactionId = path.split("/")[1];
      const { paymentReference } = await req.json();

      // Get transaction
      const { data: transaction } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .maybeSingle();

      if (!transaction) {
        return new Response(JSON.stringify({ success: false, error: "Transaction not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update transaction to PAID
      const { data: updated, error } = await supabase
        .from("transactions")
        .update({
          status: "PAID",
          payment_reference: paymentReference || `PAY-${Date.now()}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId)
        .select()
        .single();

      if (error) throw error;

      // Update seller's pending balance
      const platformFee = transaction.amount * 0.05; // 5% fee
      const sellerPayout = transaction.amount - platformFee;

      await supabase.rpc("increment_wallet_pending", {
        p_user_id: transaction.seller_id,
        p_amount: sellerPayout,
      });

      return new Response(JSON.stringify({
        success: true,
        message: "Payment confirmed. Funds in escrow.",
        data: { ...updated, sellerPayout, platformFee },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /transactions/:id/ship - Add shipping info
    if (method === "POST" && path.match(/^\/[a-zA-Z0-9-]+\/ship$/)) {
      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const transactionId = path.split("/")[1];
      const { trackingNumber, shippingCourier, estimatedDelivery } = await req.json();

      const { data: transaction, error } = await supabase
        .from("transactions")
        .update({
          status: "SHIPPED",
          tracking_number: trackingNumber,
          shipping_courier: shippingCourier,
          estimated_delivery: estimatedDelivery,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId)
        .eq("seller_id", userId)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, data: transaction }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST /transactions/:id/deliver - Confirm delivery (buyer)
    if (method === "POST" && path.match(/^\/[a-zA-Z0-9-]+\/deliver$/)) {
      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const transactionId = path.split("/")[1];

      // Get transaction
      const { data: transaction } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .eq("buyer_id", userId)
        .maybeSingle();

      if (!transaction) {
        return new Response(JSON.stringify({ success: false, error: "Transaction not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update to COMPLETED
      const { data: updated, error } = await supabase
        .from("transactions")
        .update({
          status: "COMPLETED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId)
        .select()
        .single();

      if (error) throw error;

      // Release funds to seller
      const platformFee = transaction.amount * 0.05;
      const sellerPayout = transaction.amount - platformFee;

      // Move from pending to available
      const { data: wallet } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", transaction.seller_id)
        .maybeSingle();

      if (wallet) {
        await supabase
          .from("wallets")
          .update({
            available_balance: (wallet.available_balance || 0) + sellerPayout,
            pending_balance: Math.max(0, (wallet.pending_balance || 0) - sellerPayout),
            total_earned: (wallet.total_earned || 0) + sellerPayout,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", transaction.seller_id);
      }

      return new Response(JSON.stringify({
        success: true,
        message: "Delivery confirmed. Funds released to seller.",
        data: updated,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PUT /transactions/:id - Update transaction status
    if (method === "PUT" && path.match(/^\/[a-zA-Z0-9-]+$/)) {
      if (!userId) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const transactionId = path.substring(1);
      const body = await req.json();

      const { data: transaction, error } = await supabase
        .from("transactions")
        .update({
          ...body,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transactionId)
        .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
        .select()
        .single();

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, data: transaction }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Transaction API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
