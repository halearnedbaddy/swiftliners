import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Zap, Globe } from 'lucide-react';

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="border-b border-border">
        <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">P</span>
            </div>
            <span className="text-xl font-bold text-foreground">PayLoom</span>
          </div>
          <div className="flex gap-4">
            <Link 
              to="/login" 
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition"
            >
              Login
            </Link>
            <Link 
              to="/signup" 
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6">
            Payment Infrastructure<br />
            <span className="text-primary">Built for Africa</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Create payment links, manage escrow transactions, and grow your business with secure, instant payments across the continent.
          </p>
          <div className="flex gap-4 justify-center">
            <Link 
              to="/signup" 
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition flex items-center gap-2"
            >
              Start Selling <ArrowRight className="w-4 h-4" />
            </Link>
            <Link 
              to="/demo" 
              className="px-6 py-3 border border-border text-foreground rounded-lg hover:bg-muted transition"
            >
              View Demo
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-20">
          <h2 className="text-3xl font-bold text-foreground text-center mb-12">
            Everything you need to accept payments
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 bg-card border border-border rounded-xl">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Instant Payment Links</h3>
              <p className="text-muted-foreground">
                Generate shareable payment links in seconds. No coding required.
              </p>
            </div>
            <div className="p-6 bg-card border border-border rounded-xl">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Secure Escrow</h3>
              <p className="text-muted-foreground">
                Funds held safely until delivery is confirmed. Protection for both parties.
              </p>
            </div>
            <div className="p-6 bg-card border border-border rounded-xl">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Globe className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Multi-Currency</h3>
              <p className="text-muted-foreground">
                Accept payments in multiple African currencies with automatic conversion.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© 2026 PayLoom Instants. Complete Payment Infrastructure for Africa.</p>
        </div>
      </footer>
    </div>
  );
}
