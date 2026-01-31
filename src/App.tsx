import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CloudAuthProvider } from "@/contexts/CloudAuthContext";
import { SupabaseAuthProvider } from "@/contexts/SupabaseAuthContext";
import { PaymentPage } from "./pages/PaymentPage";
import { HomePage } from "./pages/HomePage";
import { SellerDashboard } from "./pages/SellerDashboard";
import { BuyerDashboard } from "./pages/BuyerDashboard";
import { AdminDashboard } from "./pages/AdminDashboard";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { LegalPage } from "./pages/LegalPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { StoreFrontPage } from "./pages/StoreFrontPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { BuyPage } from "./pages/BuyPage";

function App() {
  return (
    <SupabaseAuthProvider>
      <CloudAuthProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/seller" element={<SellerDashboard />} />
              <Route path="/buyer" element={<BuyerDashboard />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/pay/:transactionId" element={<PaymentPage />} />
              <Route path="/buy/:linkId" element={<BuyPage />} />
              <Route path="/store/:storeSlug" element={<StoreFrontPage />} />
              <Route path="/store/:storeSlug/product/:productId" element={<ProductDetailPage />} />
              <Route path="/legal" element={<LegalPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </CloudAuthProvider>
    </SupabaseAuthProvider>
  );
}

export default App;
