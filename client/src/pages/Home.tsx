/*
  Design Philosophy: Ethereal Tech
  - Glassmorphism cards with frosted blur effects
  - Deep blue-to-lavender gradients with warm amber/cyan accents
  - Outfit (display) + Inter (body) typography
  - Spacious asymmetric layouts, smooth animations
*/

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, CheckCircle2, Sparkles, TrendingUp, Zap } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

export default function Home() {
  // The userAuth hooks provides authentication state
  // To implement login/logout functionality, simply call logout() or redirect to getLoginUrl()
  let { user, loading, error, isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b">
        <div className="container mx-auto flex items-center justify-between h-20">
          <Link href="/">
            <a className="flex items-center gap-2 text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              <Sparkles className="w-7 h-7 text-primary" />
              <span className="bg-gradient-to-r from-primary to-[oklch(0.72_0.15_65)] bg-clip-text text-transparent">
                SuggestedByGPT
              </span>
            </a>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </a>
            <Link href="/about">
              <a className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">About</a>
            </Link>
            <Link href="/blog">
              <a className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Blog</a>
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <Link href="/portal">
                <Button variant="outline" size="lg" className="font-semibold">
                  My Portal
                </Button>
              </Link>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="font-semibold"
                  onClick={() => window.location.href = getLoginUrl("/portal")}
                >
                  Client Login
                </Button>
                <Link href="/get-started">
                  <Button size="lg" className="flex items-center gap-2 font-semibold">
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section 
        className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20"
        style={{
          backgroundImage: `url('https://private-us-east-1.manuscdn.com/sessionFile/DRxmkCenkWBLDETtntGXuu/sandbox/PzjMnZr91O178HU0QohzOF-img-1_1771668032000_na1fn_aGVyby1tYWluLWJn.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvRFJ4bWtDZW5rV0JMREVUdG50R1h1dS9zYW5kYm94L1B6ak1uWnI5MU8xNzhIVTBRb2h6T0YtaW1nLTFfMTc3MTY2ODAzMjAwMF9uYTFmbl9hR1Z5YnkxdFlXbHVMV0puLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=oCxYy2~H1M3K3hPiOYJB0iJIUn5srW5HXEDZ4Zrmz3Mwip~AA8ki5eAM4naYz3bkj6QZX4SBvQ3WExgg2S7wgmVrC1HNVBXZ1bNDpLET-tmDAv2Mjx76zp-oaT8hGYDJbwitvnBGTyaAcVn7Us2RYOtqIu-LZwoWVa1AWv-F452Y4YJ~Fi5LATpLq~XAwCY4M47vz4KtwN5FiRHdxaOD3ce24Iatx2xEYe6rNN59wPuQzinQOTI9p1WX~xe3BTMixZnqPVAZeu~mNcyXKxytrF1rGQsYhXKn-KsrGuLaaT9mOZfkeWHB4Regud30KWCALiepzwtzBrRqLxEufrnkCg__')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/40 to-background"></div>
        
        <div className="container relative z-10 grid lg:grid-cols-2 gap-12 items-center py-20">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm font-medium">
              <Zap className="w-4 h-4 text-[oklch(0.72_0.15_65)]" />
              <span>1.5B+ People Use AI Platforms Weekly</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold leading-tight tracking-tight">
              Your Business,{" "}
              <span className="bg-gradient-to-r from-primary via-[oklch(0.72_0.15_65)] to-primary bg-clip-text text-transparent">
                Suggested by GPT
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-2xl">
              Over 1.5 billion people rely on AI platforms weekly to find recommendations. Without proper optimization, your business remains invisible to these systems.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/get-started">
                <Button size="lg" className="text-lg px-8 py-6 font-semibold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all">
                  Start at $99
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <a href="#pricing" className="inline-flex">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6 font-semibold glass border-2">
                  See Pricing
                </Button>
              </a>
            </div>
            
            <div className="flex items-center gap-8 pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">3-Day Delivery</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Minimal Client Effort</span>
              </div>
            </div>
          </div>
          
          <div className="hidden lg:block relative">
            <div className="glass rounded-3xl p-8 shadow-2xl">
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold mb-1">ChatGPT User:</p>
                    <p className="text-sm text-muted-foreground">"What's the best SEO agency in Miami?"</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-4 rounded-xl bg-[oklch(0.72_0.15_65)]/10 border border-[oklch(0.72_0.15_65)]/20">
                  <div className="w-10 h-10 rounded-full bg-[oklch(0.72_0.15_65)]/20 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-[oklch(0.72_0.15_65)]" />
                  </div>
                  <div>
                    <p className="font-semibold mb-1">GPT Response:</p>
                    <p className="text-sm text-muted-foreground">"I'd recommend <strong className="text-foreground">Your Business Name</strong> - they specialize in..."</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-32 bg-gradient-to-b from-background to-muted/30">
        <div className="container">
          <div className="max-w-4xl mx-auto text-center space-y-12">
            <h2 className="text-4xl md:text-5xl font-bold">
              This Isn't 2016 Anymore. <span className="text-primary">It's 2026.</span>
            </h2>
            
            <div className="grid md:grid-cols-3 gap-6 text-left">
              <Card className="glass p-8 space-y-4 border-2">
                <div className="text-5xl font-bold text-primary">800M</div>
                <p className="text-lg font-semibold">ChatGPT Weekly Users</p>
                <p className="text-sm text-muted-foreground">Asking for recommendations, advice, and solutions</p>
              </Card>
              
              <Card className="glass p-8 space-y-4 border-2">
                <div className="text-5xl font-bold text-[oklch(0.72_0.15_65)]">750M</div>
                <p className="text-lg font-semibold">Google Gemini Monthly Users</p>
                <p className="text-sm text-muted-foreground">Searching for local businesses and services</p>
              </Card>
              
              <Card className="glass p-8 space-y-4 border-2">
                <div className="text-5xl font-bold text-primary">30M</div>
                <p className="text-lg font-semibold">Claude Monthly Users</p>
                <p className="text-sm text-muted-foreground">Looking for trusted, verified providers</p>
              </Card>
            </div>
            
            <div className="pt-8">
              <h3 className="text-2xl md:text-3xl font-bold mb-8">
                The Problem? <span className="text-destructive">Most Businesses Are Invisible to AI.</span>
              </h3>
              
              <div className="glass rounded-2xl p-8 md:p-12 text-left space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-destructive font-bold">✗</span>
                  </div>
                  <div>
                    <p className="font-semibold text-lg mb-1">Your website isn't structured for AI to understand</p>
                    <p className="text-muted-foreground">No schema markup, no entity optimization, no knowledge graph sync</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-destructive font-bold">✗</span>
                  </div>
                  <div>
                    <p className="font-semibold text-lg mb-1">Your business data is scattered and inconsistent</p>
                    <p className="text-muted-foreground">Different info across platforms confuses AI models</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-destructive font-bold">✗</span>
                  </div>
                  <div>
                    <p className="font-semibold text-lg mb-1">You're not indexed in AI training sources</p>
                    <p className="text-muted-foreground">Missing from directories, citations, and authoritative databases</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-destructive font-bold">✗</span>
                  </div>
                  <div>
                    <p className="font-semibold text-lg mb-1">Your content isn't optimized for conversational queries</p>
                    <p className="text-muted-foreground">AI needs natural language, not keyword-stuffed pages</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section 
        id="how-it-works" 
        className="py-32 relative overflow-hidden"
        style={{
          backgroundImage: `url('https://private-us-east-1.manuscdn.com/sessionFile/DRxmkCenkWBLDETtntGXuu/sandbox/PzjMnZr91O178HU0QohzOF-img-2_1771668034000_na1fn_aG93LWl0LXdvcmtzLWJn.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvRFJ4bWtDZW5rV0JMREVUdG50R1h1dS9zYW5kYm94L1B6ak1uWnI5MU8xNzhIVTBRb2h6T0YtaW1nLTJfMTc3MTY2ODAzNDAwMF9uYTFmbl9hRzkzTFdsMExYZHZjbXR6TFdKbi5wbmc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xOTIwLGhfMTkyMC9mb3JtYXQsd2VicC9xdWFsaXR5LHFfODAiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=DWvB885ZPAs8g0uJ2fIOgHvsXiZf6pGa3rrxhB2AqdICOigzwUjECSPwshJp~ngXJ~rPf09UVzZ8eIYtNh1s464s7QAcDa3AnCryu7BZ1-1ZYdluTKAlvrHVLJpqRP5dXNzSHLlZQ0PV7hughLGiw-1OATuEu5hP~kNM4ygtPrkPqgcgtL52Q0Y5DVEstvkkAz2XcD-wKdL1N6xTFCGXjDQOySO6WLNaWsQ225Pn95pXL69vTBml9EuRlCabyILSW7~Zdh~IfP4baPGE9XFHCsKtTUyUCeZIllPGfUnP5nSbYMKKn3GZ6Uycpd6ZO0SpZeXs7bGLAoPQ8o3ONKeQXw__')`,
          backgroundSize: 'cover',
          backgroundPosition: 'left center',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent"></div>
        
        <div className="container relative z-10">
          <div className="max-w-3xl space-y-16">
            <div className="space-y-6">
              <h2 className="text-4xl md:text-5xl font-bold">
                We Do It <span className="text-primary">For You</span>
              </h2>
              <p className="text-xl text-muted-foreground">
                No technical knowledge required. No ongoing contracts. We handle everything in 3 days.
              </p>
            </div>
            
            <div className="space-y-8">
              <div className="flex gap-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">1</span>
                </div>
                <div className="space-y-2 pt-2">
                  <h3 className="text-2xl font-bold">Google Business Profile Optimization</h3>
                  <p className="text-lg text-muted-foreground">
                    We create or optimize your GBP with complete business information, photos, and AI-friendly descriptions. You verify via email—that's it.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[oklch(0.72_0.15_65)]/20 flex items-center justify-center">
                  <span className="text-2xl font-bold text-[oklch(0.72_0.15_65)]">2</span>
                </div>
                <div className="space-y-2 pt-2">
                  <h3 className="text-2xl font-bold">Schema Markup & Citations</h3>
                  <p className="text-lg text-muted-foreground">
                    We add structured data to your website and audit your business listings across directories. We provide step-by-step guides for implementation.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">3</span>
                </div>
                <div className="space-y-2 pt-2">
                  <h3 className="text-2xl font-bold">Review Strategy & Follow-Up</h3>
                  <p className="text-lg text-muted-foreground">
                    We provide templates for generating customer reviews and (for Phase 2) a 30-day follow-up to monitor AI recommendation performance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 bg-gradient-to-b from-muted/30 to-background relative overflow-hidden">
        <div 
          className="absolute top-0 right-0 w-1/2 h-full opacity-20"
          style={{
            backgroundImage: `url('https://private-us-east-1.manuscdn.com/sessionFile/DRxmkCenkWBLDETtntGXuu/sandbox/PzjMnZr91O178HU0QohzOF-img-3_1771668027000_na1fn_cHJpY2luZy1hY2NlbnQ.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvRFJ4bWtDZW5rV0JMREVUdG50R1h1dS9zYW5kYm94L1B6ak1uWnI5MU8xNzhIVTBRb2h6T0YtaW1nLTNfMTc3MTY2ODAyNzAwMF9uYTFmbl9jSEpwWTJsdVp5MWhZMk5sYm5RLnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=r8oD0o0uj~a6h0-W2YoiyQCY7phTAl7IxYCBug70M0IvGguhMcu8eygbkKuY9A3Ez5irD8invGyznsjI9Lfnqw5p6ejuDPvD0UOA4qrNrKKSc~5qEYvs6YYi8qbyGhTBa8B3xU1FuBu2Phvp-hJ3ist2ny3oPEnGF9bI3wjiQ7-J3OiE17-Dc06weQAEtLQb55o~Mu6vU3JBcYZIS9A7rfTIcDT7Syr8xnaWjkP3kEondI5YJ8kf0JLNezeR69WtGbAHkfyV~uvgLg6XX2-c14qyaSlqjMjEldOCOJZfJoJ9DDdBgGGVcYSR5H6UuGXKnyTRs6fBr8qNHUU59JXHnQ__')`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        ></div>
        
        <div className="container relative z-10">
          <div className="text-center space-y-6 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Choose the package that fits your business. Both are 90% done-for-you with a full AI Needs Assessment. Start with Package 1 or go all-in with Package 2.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* AI Jumpstart */}
            <Card className="glass p-8 md:p-10 space-y-8 border-2 hover:border-primary/50 transition-all hover:shadow-xl">
              <div className="space-y-4">
                <h3 className="text-2xl font-bold">AI Jumpstart</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-extrabold">$99</span>
                  <span className="text-muted-foreground">one-time</span>
                </div>
                <p className="text-muted-foreground">
                  Core AI optimization — schema markup, citation audit, AI visibility report, and review strategy. Delivered in 3-5 business days.
                </p>
              </div>
              
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>AI Needs Assessment & visibility audit</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>Schema markup implementation</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>Citation audit & cleanup guide</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>Review generation strategy & templates</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>Website content assessment</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>AI visibility report</span>
                </li>
              </ul>
              
              <Link href="/get-started">
                <Button size="lg" variant="outline" className="w-full text-lg font-semibold border-2">
                  Get Started
                </Button>
              </Link>
            </Card>
            
            {/* AI Dominator */}
            <Card className="glass p-8 md:p-10 space-y-8 border-2 border-primary/50 hover:border-primary transition-all shadow-xl hover:shadow-2xl relative overflow-hidden">
              <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                RECOMMENDED
              </div>
              
              <div className="space-y-4">
                <h3 className="text-2xl font-bold">AI Dominator</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-extrabold">$199</span>
                  <span className="text-muted-foreground">one-time</span>
                </div>
                <p className="text-muted-foreground">
                  Everything in Package 1, plus GBP creation, content rewrite, advanced schema, competitor analysis, and 2x monthly check-ins. 7-10 business days.
                </p>
              </div>
              
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span><strong>Everything in AI Jumpstart</strong>, plus:</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>GBP creation or full optimization</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>Website content optimization for AI</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>Advanced schema markup (services, pricing, breadcrumbs)</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>Competitor deep dive & reverse engineering</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>Social proof strategy across all platforms</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>2x check-ins over 30 days</span>
                </li>
              </ul>
              
              <Link href="/get-started">
                <Button size="lg" className="w-full text-lg font-semibold shadow-lg shadow-primary/30">
                  Get Started
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 relative overflow-hidden">
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url('https://private-us-east-1.manuscdn.com/sessionFile/DRxmkCenkWBLDETtntGXuu/sandbox/PzjMnZr91O178HU0QohzOF-img-4_1771668026000_na1fn_Y3RhLXZpc3VhbA.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvRFJ4bWtDZW5rV0JMREVUdG50R1h1dS9zYW5kYm94L1B6ak1uWnI5MU8xNzhIVTBRb2h6T0YtaW1nLTRfMTc3MTY2ODAyNjAwMF9uYTFmbl9ZM1JoTFhacGMzVmhiQS5wbmc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xOTIwLGhfMTkyMC9mb3JtYXQsd2VicC9xdWFsaXR5LHFfODAiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=Zjh4avT7IIT1I2YM7FkB0kW0A-69dx4Hg7iGVpG6RWiCwbXEQSVvEoBbLWoEeNQNXzGro6-d5~5EjCkKeXUdtSMo3mjNXKRQi8NzBpxZnL3LWbZUrQKCLo6ajt9-0of1dlogDmWjJvOcoQAbjMeMhKbpJXz0HVFODA1Ba9uqu~Klnk06X9sw1v2nz6rxlrWLAVoZqu6NuAguq~oXjF9Gve6twMZ0S7RwwjUxs3lKYun-Iugskx7n5Uwinc93QjK415QLnXDQ0MpzV331xF-tllAfxazI0lcp80PZG8NAegR1krQr4HX1bkd41rmksqbjbyWnmMOs5di9afxFn--nFA__')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/60 to-background"></div>
        
        <div className="container relative z-10">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-4xl md:text-6xl font-extrabold leading-tight">
              Don't Get Left Behind in the <span className="bg-gradient-to-r from-primary to-[oklch(0.72_0.15_65)] bg-clip-text text-transparent">AI Revolution</span>
            </h2>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
              Every day you wait, your competitors are being recommended instead of you. 
              Get AI-ready in 3 days.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link href="/get-started">
                <Button size="lg" className="text-lg px-10 py-7 font-semibold shadow-lg shadow-primary/30">
                  Start with Package 1 - $99
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="text-lg px-10 py-7 font-semibold glass border-2">
                Talk to an Expert
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t glass py-12">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <Link href="/">
                <a className="flex items-center gap-2 text-xl font-bold">
                  <Sparkles className="w-6 h-6 text-primary" />
                  <span>SuggestedByGPT</span>
                </a>
              </Link>
              <p className="text-sm text-muted-foreground">
                Making your business visible to AI, one optimization at a time.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><Link href="/blog"><a className="hover:text-foreground transition-colors">Blog</a></Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/about"><a className="hover:text-foreground transition-colors">About</a></Link></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>&copy; 2026 SuggestedByGPT. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
