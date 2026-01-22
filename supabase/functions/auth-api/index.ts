import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://pxyyncsnjpuwvnwyfdwx.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Create admin client for OTP operations
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Generate 6-digit OTP
function generateOTPCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Normalize phone number to E.164 format
function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "254" + cleaned.substring(1);
  }
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
}

// Validate phone number
function validatePhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  return /^\+\d{10,15}$/.test(normalized);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    switch (path) {
      case "request-otp":
        return await handleRequestOTP(req);
      case "verify-otp":
        return await handleVerifyOTP(req);
      case "register":
        return await handleRegister(req);
      case "login":
        return await handleLogin(req);
      case "register-email":
        return await handleRegisterEmail(req);
      case "login-email":
        return await handleLoginEmail(req);
      case "profile":
        return await handleGetProfile(req);
      default:
        return new Response(
          JSON.stringify({ success: false, error: "Not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Auth API error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleRequestOTP(req: Request): Promise<Response> {
  const { phone, purpose } = await req.json();

  if (!validatePhoneNumber(phone)) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid phone number format" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  const validPurposes = ["LOGIN", "REGISTRATION", "PASSWORD_RESET", "VERIFICATION"];
  
  if (!validPurposes.includes(purpose)) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid OTP purpose" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Check if phone exists for login/registration validation
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("phone", normalizedPhone)
    .single();

  if (purpose === "REGISTRATION" && existingProfile) {
    return new Response(
      JSON.stringify({ success: false, error: "Phone number already registered" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (purpose === "LOGIN" && !existingProfile) {
    // Return success to prevent phone enumeration
    return new Response(
      JSON.stringify({ success: true, message: "OTP sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Rate limiting check
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("otps")
    .select("*", { count: "exact", head: true })
    .eq("phone", normalizedPhone)
    .gte("created_at", fiveMinutesAgo);

  if (count && count >= 3) {
    return new Response(
      JSON.stringify({ success: false, error: "Too many OTP requests. Please try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Generate and store OTP
  const code = generateOTPCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  await supabaseAdmin.from("otps").insert({
    phone: normalizedPhone,
    code,
    purpose,
    expires_at: expiresAt,
  });

  // In production, send SMS here
  console.log(`OTP for ${normalizedPhone}: ${code}`);

  return new Response(
    JSON.stringify({ 
      success: true, 
      message: "OTP sent successfully",
      // Only include OTP in development
      ...(Deno.env.get("ENVIRONMENT") !== "production" && { otp: code })
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleVerifyOTP(req: Request): Promise<Response> {
  const { phone, code, purpose } = await req.json();

  const normalizedPhone = normalizePhoneNumber(phone);

  // Find valid OTP
  const { data: otp } = await supabaseAdmin
    .from("otps")
    .select("*")
    .eq("phone", normalizedPhone)
    .eq("purpose", purpose)
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!otp) {
    return new Response(
      JSON.stringify({ success: false, error: "OTP expired or not found" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (otp.attempts >= otp.max_attempts) {
    return new Response(
      JSON.stringify({ success: false, error: "Maximum verification attempts exceeded" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (otp.code !== code) {
    // Increment attempts
    await supabaseAdmin
      .from("otps")
      .update({ attempts: otp.attempts + 1 })
      .eq("id", otp.id);

    const remaining = otp.max_attempts - otp.attempts - 1;
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: remaining > 0 
          ? `Invalid OTP. ${remaining} attempts remaining.`
          : "Maximum attempts exceeded. Please request a new OTP."
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Mark OTP as used
  await supabaseAdmin
    .from("otps")
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq("id", otp.id);

  return new Response(
    JSON.stringify({ success: true, message: "OTP verified successfully" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleRegister(req: Request): Promise<Response> {
  const { phone, name, email, role, otp } = await req.json();

  if (!phone || !name || !otp) {
    return new Response(
      JSON.stringify({ success: false, error: "Phone, name, and OTP are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  const userRole = role || "buyer";

  // Verify OTP first
  const { data: otpRecord } = await supabaseAdmin
    .from("otps")
    .select("*")
    .eq("phone", normalizedPhone)
    .eq("purpose", "REGISTRATION")
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!otpRecord || otpRecord.code !== otp) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid or expired OTP" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Mark OTP as used
  await supabaseAdmin
    .from("otps")
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq("id", otpRecord.id);

  // Create Supabase auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    phone: normalizedPhone,
    phone_confirm: true,
    user_metadata: { name, role: userRole },
  });

  if (authError) {
    console.error("Auth error:", authError);
    return new Response(
      JSON.stringify({ success: false, error: authError.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Update profile with additional info
  if (email) {
    await supabaseAdmin
      .from("profiles")
      .update({ email, name })
      .eq("user_id", authData.user.id);
  }

  // Generate session
  const { data: session, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: email || `${normalizedPhone.replace("+", "")}@phone.local`,
  });

  // Get user profile and role
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("user_id", authData.user.id)
    .single();

  const { data: userRoleData } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id)
    .single();

  return new Response(
    JSON.stringify({
      success: true,
      message: "Registration successful",
      data: {
        user: {
          id: authData.user.id,
          phone: normalizedPhone,
          name,
          email,
          role: userRoleData?.role || userRole,
        },
      },
    }),
    { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleLogin(req: Request): Promise<Response> {
  const { phone, otp } = await req.json();

  if (!phone || !otp) {
    return new Response(
      JSON.stringify({ success: false, error: "Phone and OTP are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const normalizedPhone = normalizePhoneNumber(phone);

  // Verify OTP
  const { data: otpRecord } = await supabaseAdmin
    .from("otps")
    .select("*")
    .eq("phone", normalizedPhone)
    .eq("purpose", "LOGIN")
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!otpRecord || otpRecord.code !== otp) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid or expired OTP" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Mark OTP as used
  await supabaseAdmin
    .from("otps")
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq("id", otpRecord.id);

  // Find user by phone
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*, user_id")
    .eq("phone", normalizedPhone)
    .single();

  if (!profile) {
    return new Response(
      JSON.stringify({ success: false, error: "User not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get user role
  const { data: userRole } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.user_id)
    .single();

  // Update last login
  await supabaseAdmin
    .from("profiles")
    .update({ last_login: new Date().toISOString() })
    .eq("user_id", profile.user_id);

  return new Response(
    JSON.stringify({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: profile.user_id,
          phone: profile.phone,
          name: profile.name,
          email: profile.email,
          role: userRole?.role || "buyer",
        },
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleRegisterEmail(req: Request): Promise<Response> {
  const { email, password, name, role } = await req.json();

  if (!email || !password || !name) {
    return new Response(
      JSON.stringify({ success: false, error: "Email, password, and name are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (password.length < 8) {
    return new Response(
      JSON.stringify({ success: false, error: "Password must be at least 8 characters" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const userRole = role || "buyer";

  // Create user with Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: email.toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { name, role: userRole },
  });

  if (authError) {
    console.error("Auth error:", authError);
    if (authError.message.includes("already")) {
      return new Response(
        JSON.stringify({ success: false, error: "Email already registered" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ success: false, error: authError.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get user role
  const { data: userRoleData } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id)
    .single();

  return new Response(
    JSON.stringify({
      success: true,
      message: "Registration successful",
      data: {
        user: {
          id: authData.user.id,
          email: email.toLowerCase(),
          name,
          role: userRoleData?.role || userRole,
        },
      },
    }),
    { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleLoginEmail(req: Request): Promise<Response> {
  const { email, password } = await req.json();

  if (!email || !password) {
    return new Response(
      JSON.stringify({ success: false, error: "Email and password are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Sign in with Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
    email: email.toLowerCase(),
    password,
  });

  if (authError) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid credentials" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get profile and role
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("user_id", authData.user.id)
    .single();

  const { data: userRole } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id)
    .single();

  // Update last login
  await supabaseAdmin
    .from("profiles")
    .update({ last_login: new Date().toISOString() })
    .eq("user_id", authData.user.id);

  return new Response(
    JSON.stringify({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: authData.user.id,
          phone: profile?.phone,
          name: profile?.name,
          email: authData.user.email,
          role: userRole?.role || "buyer",
        },
        session: authData.session,
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleGetProfile(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  
  if (!authHeader) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.replace("Bearer ", "");
  
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  
  if (userError || !userData.user) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("user_id", userData.user.id)
    .single();

  const { data: userRole } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .single();

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        user: {
          id: userData.user.id,
          phone: profile?.phone,
          name: profile?.name,
          email: profile?.email || userData.user.email,
          role: userRole?.role || "buyer",
          profilePicture: profile?.profile_picture,
          memberSince: profile?.member_since,
        },
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
