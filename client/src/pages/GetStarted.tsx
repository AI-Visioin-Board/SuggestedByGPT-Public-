/*
  Design: Glassmorphism + Material UI
  - MUI TextField, Stepper, Chip, ToggleButton for form controls
  - Tailwind for layout and glassmorphism cards
  - Outfit (display) + Inter (body) typography
  - Terracotta primary + Sage accent
*/

import {
  TextField,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
  Checkbox,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormHelperText,
  Alert,
  Fade,
} from "@mui/material";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  Globe,
  MessageSquare,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
  Send,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { scrapeWebsite } from "@/lib/websiteScraper";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { TOS_VERSION } from '@shared/legal';
import TosCheckbox from '@/components/TosCheckbox';
import { trackEvent } from '@/lib/analytics';

const PACKAGE_1_DELIVERABLES = [
  {
    icon: <FileSearch className="w-5 h-5" />,
    title: "AI Visibility Audit Report",
    desc: "Complete audit of your AI visibility — how ChatGPT, Gemini, and Claude see your business today.",
  },
  {
    icon: <Globe className="w-5 h-5" />,
    title: "Custom Schema Markup Code",
    desc: "Structured data code (LocalBusiness, Organization, Service, FAQ) so AI can read your business.",
  },
  {
    icon: <Search className="w-5 h-5" />,
    title: "Citation/NAP Audit Report",
    desc: "Scan Yelp, Apple Maps, BBB, Facebook, LinkedIn for inconsistencies + step-by-step fix guide.",
  },
  {
    icon: <ClipboardList className="w-5 h-5" />,
    title: "robots.txt AI Crawler Audit",
    desc: "Ensure AI crawlers (GPTBot, Google-Extended, ClaudeBot) can access and index your site.",
  },
  {
    icon: <Sparkles className="w-5 h-5" />,
    title: "llms.txt File Generation",
    desc: "Custom llms.txt file that tells AI models exactly what your business does and offers.",
  },
  {
    icon: <MessageSquare className="w-5 h-5" />,
    title: "FAQ Schema + Content Drafts",
    desc: "AI-optimized FAQ content with schema markup for conversational query matching.",
  },
  {
    icon: <Star className="w-5 h-5" />,
    title: "Review Strategy Templates",
    desc: "Custom email/SMS templates to ethically generate more reviews that AI platforms weigh heavily.",
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: "Bing Places Optimization Guide",
    desc: "Step-by-step guide to optimize your Bing Places listing for Microsoft Copilot visibility.",
  },
];

const PACKAGE_2_EXTRAS = [
  {
    icon: <Rocket className="w-5 h-5" />,
    title: "Google Business Profile Optimization",
    desc: "Optimized GBP description, categories, Q&A, and post templates — or full setup if you don't have one.",
  },
  {
    icon: <Globe className="w-5 h-5" />,
    title: "Website Content Rewrite for AI",
    desc: "AI-optimized rewrites of key pages (Home, About, Services) for conversational query matching.",
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: "Competitor Deep Dive Analysis",
    desc: "Analysis of top 3 competitors across AI platforms with gap identification and opportunity mapping.",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Directory Submissions (10-15 sites)",
    desc: "Automated and guided submissions to top directories — tracked with verification status.",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Schema Installation on Your Website",
    desc: "Direct installation of schema markup on your website via CMS (WordPress/Shopify/Wix/Squarespace).",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Social Proof Strategy",
    desc: "Review generation plan, testimonial templates, and social posting schedule across platforms.",
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: "Month 1 Progress Check-in",
    desc: "AI-generated progress report at 30 days — deliverables completed, visibility score changes.",
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: "Month 2 Check-in + Final Report",
    desc: "Final progress report at 60 days — complete summary of all optimizations and next steps.",
  },
  {
    icon: <Globe className="w-5 h-5" />,
    title: "9 Guest Articles on Industry Blogs",
    desc: "3 articles per month on relevant blogs with backlinks to your website — boosts SEO and AI visibility.",
  },
];

const PACKAGE_0_DELIVERABLES = [
  {
    icon: <FileSearch className="w-5 h-5" />,
    title: "AI Visibility Audit Report",
    desc: "See how ChatGPT, Gemini, Perplexity, and Claude view your business — scored 0-100 with specific recommendations.",
  },
];

const CMS_OPTIONS = [
  "WordPress",
  "Wix",
  "Squarespace",
  "Shopify",
  "Custom / Other",
  "Don't Know",
];

export default function GetStarted() {
  const urlParams = new URLSearchParams(window.location.search);
  const packageParam = urlParams.get('package');
  const initialPackage = packageParam === '0' ? 0 : packageParam === '2' ? 2 : 1;
  const [selectedPackage, setSelectedPackage] = useState<0 | 1 | 2>(initialPackage);
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    businessName: "",
    businessAddress: "",
    businessPhone: "",
    websiteUrl: "",
    industry: "",
    servicesOffered: "",
    gbpUrl: "",
    hasGbp: "",
    competitors: "",
    targetLocation: "",
    socialLinks: "",
    goals: "",
    websiteCms: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [hasAutoFilled, setHasAutoFilled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);

  const createCheckout = trpc.stripe.createCheckoutSession.useMutation();
  const submitFreeAssessment = trpc.stripe.submitFreeAssessment.useMutation();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleAutoFill = async () => {
    if (!formData.websiteUrl.trim()) {
      toast.error("Please enter a website URL first");
      return;
    }

    setIsScanning(true);
    toast.info("Scanning your website...", { duration: 2000 });

    try {
      const scrapedData = await scrapeWebsite(formData.websiteUrl);
      
      // Update form with scraped data (only fill empty fields)
      setFormData(prev => ({
        ...prev,
        businessName: prev.businessName || scrapedData.businessName || "",
        industry: prev.industry || scrapedData.industry || "",
        servicesOffered: prev.servicesOffered || scrapedData.servicesOffered || "",
        businessPhone: prev.businessPhone || scrapedData.businessPhone || "",
        businessAddress: prev.businessAddress || scrapedData.businessAddress || "",
        socialLinks: prev.socialLinks || scrapedData.socialLinks || "",
      }));

      setHasAutoFilled(true);
      toast.success("Information extracted! Please review and complete any missing fields.", { duration: 4000 });
    } catch (error) {
      console.error('Auto-fill error:', error);
      toast.error("Couldn't auto-fill from website. Please enter information manually.");
    } finally {
      setIsScanning(false);
    }
  };

  const validateStep = (step: number): boolean => {
    // Validation disabled for preview mode
    return true;
  };

  const handleNext = () => {
    if (validateStep(activeStep)) {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(activeStep)) return;

    if (!tosAccepted) {
      toast.error("Please accept the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setIsSubmitting(true);
    trackEvent('email_submitted', 'get_started');
    if (selectedPackage === 0) {
      trackEvent('click_free_assessment', 'get_started');
    } else {
      trackEvent('checkout_started', selectedPackage === 1 ? 'jumpstart' : 'dominator');
    }

    try {
      // ── Free Assessment — bypass Stripe entirely ──
      if (selectedPackage === 0) {
        toast.info("Generating your free assessment...", { duration: 3000 });

        const result = await submitFreeAssessment.mutateAsync({
          name: formData.fullName,
          email: formData.email,
          phone: formData.phone || undefined,
          websiteUrl: formData.websiteUrl,
          businessName: formData.businessName,
          industry: formData.industry || undefined,
          targetLocation: formData.targetLocation || undefined,
          servicesOffered: formData.servicesOffered || undefined,
          competitors: formData.competitors || undefined,
          goals: formData.goals || undefined,
          tosAccepted: true as const,
          tosVersion: TOS_VERSION,
        });

        if (result.success && result.redirectUrl) {
          toast.success("Assessment started! Redirecting to your portal...", { duration: 2000 });
          // Redirect to magic link (logs them in) or login page
          window.location.href = result.redirectUrl;
        } else {
          toast.error("Something went wrong. Please try again.");
        }
        return;
      }

      // ── Paid packages — Stripe checkout ──
      toast.info("Redirecting to secure checkout...", { duration: 3000 });

      const productId = selectedPackage === 1 ? 'AI_JUMPSTART' : 'AI_DOMINATOR';
      const result = await createCheckout.mutateAsync({
        productId: productId as 'AI_JUMPSTART' | 'AI_DOMINATOR',
        customerEmail: formData.email || undefined,
        customerName: formData.fullName || undefined,
        origin: window.location.origin,
        businessName: formData.businessName,
        businessWebsite: formData.websiteUrl,
        businessPhone: formData.businessPhone,
        businessAddress: formData.businessAddress,
        industry: formData.industry,
        targetLocation: formData.targetLocation,
        servicesOffered: formData.servicesOffered,
        websiteCms: formData.websiteCms,
        hasGbp: formData.hasGbp,
        gbpUrl: formData.gbpUrl,
        socialLinks: formData.socialLinks,
        competitors: formData.competitors,
        goals: formData.goals,
        tosAccepted: true as const,
        tosVersion: TOS_VERSION,
        flow: 'get_started' as const,
      });

      if (result.url) {
        // Redirect to Stripe Checkout in the same tab
        window.location.href = result.url;
      } else {
        toast.error("Failed to create checkout session. Please try again.");
      }
    } catch (error: any) {
      console.error('Checkout error:', error);
      toast.error(error.message || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const deliverables =
    selectedPackage === 0
      ? PACKAGE_0_DELIVERABLES
      : selectedPackage === 1
        ? PACKAGE_1_DELIVERABLES
        : [...PACKAGE_1_DELIVERABLES, ...PACKAGE_2_EXTRAS];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b glass sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <Link href="/">
            <a className="flex items-center gap-2 text-xl font-bold">
              <Sparkles className="w-7 h-7 text-primary" />
              <span className="font-display">SuggestedByGPT</span>
            </a>
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/">
              <a className="text-sm font-medium hover:text-primary transition-colors">
                Home
              </a>
            </Link>
            <Link href="/about">
              <a className="text-sm font-medium hover:text-primary transition-colors">
                About
              </a>
            </Link>
            <Link href="/blog">
              <a className="text-sm font-medium hover:text-primary transition-colors">
                Blog
              </a>
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <section className="flex-1 py-16 md:py-24">
        <div className="container max-w-4xl">
          <div className="space-y-12">
            {/* Hero */}
            <div className="text-center space-y-4">
              <h1 className="text-4xl md:text-5xl font-bold font-display">
                Let's Get Your Business AI-Visible
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Fill out the form below so we can start optimizing your business
                for AI recommendations. It takes about 5 minutes — then we
                handle everything.
              </p>
            </div>

            {/* Package Selection */}
            <Card className="glass p-8 border">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold mb-4">
                    Select Your Package
                  </h2>
                  <div className="flex flex-wrap gap-4">
                    <Button
                      variant={selectedPackage === 0 ? "default" : "outline"}
                      size="lg"
                      onClick={() => setSelectedPackage(0)}
                      className="font-semibold"
                    >
                      Free Assessment
                    </Button>
                    <Button
                      variant={selectedPackage === 1 ? "default" : "outline"}
                      size="lg"
                      onClick={() => setSelectedPackage(1)}
                      className="font-semibold"
                    >
                      AI Jumpstart — $99
                    </Button>
                    <Button
                      variant={selectedPackage === 2 ? "default" : "outline"}
                      size="lg"
                      onClick={() => setSelectedPackage(2)}
                      className="font-semibold"
                    >
                      AI Dominator — $299
                    </Button>
                  </div>
                </div>

                {/* Deliverables Display */}
                <div>
                  <h3 className="text-xl font-semibold mb-4">
                    Here's What You'll Get
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    {selectedPackage === 0
                      ? "Your free assessment includes a comprehensive AI visibility audit — see exactly how AI platforms view your business today."
                      : selectedPackage === 1
                        ? "Your AI Jumpstart package includes these 10 deliverables — everything you need to become visible to AI platforms."
                        : "Your AI Dominator package includes all 21 deliverables — the complete optimization experience with ongoing support."}
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    {deliverables.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex gap-3 p-4 rounded-lg bg-background/40 border border-border/50"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          {item.icon}
                        </div>
                        <div>
                          <p className="font-semibold text-sm mb-1">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedPackage === 0 && (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm font-medium text-primary mb-1">
                      💡 Want us to handle everything?
                    </p>
                    <p className="text-sm text-muted-foreground">
                      After your assessment, you can upgrade to AI Jumpstart ($99) for 10 automated deliverables,
                      or AI Dominator ($299) for the complete 21-deliverable package with hands-on implementation.
                    </p>
                  </div>
                )}
                {selectedPackage === 1 && (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm font-medium text-primary mb-1">
                      💡 Want the full treatment?
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade to AI Dominator for GBP creation, website content rewrite, advanced schema, competitor analysis,
                      and 30-day monitoring.
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Form Stepper */}
            <Card className="glass p-8 border">
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-2">
                  Tell Us About Your Business
                </h2>
                <p className="text-muted-foreground text-sm">
                  We need a few details to get started. This should take about 5
                  minutes.
                </p>
              </div>

              <Stepper
                activeStep={activeStep}
                orientation="vertical"
                sx={{
                  "& .MuiStepConnector-line": {
                    borderColor: "rgba(200, 195, 220, 0.3)",
                    minHeight: "24px",
                  },
                  "& .MuiStepLabel-label": {
                    fontFamily: '"Outfit", system-ui, sans-serif',
                    fontWeight: 600,
                    fontSize: "1.1rem",
                  },
                  "& .MuiStepLabel-label.Mui-active": {
                    color: "#1e1b3a",
                  },
                  "& .MuiStepLabel-label.Mui-completed": {
                    color: "#D97B6A",
                  },
                }}
              >
                {/* Step 1: Contact Info */}
                <Step>
                  <StepLabel>Your Contact Info</StepLabel>
                  <StepContent
                    TransitionProps={{ unmountOnExit: false }}
                    sx={{ borderColor: "rgba(200, 195, 220, 0.3)" }}
                  >
                    <div className="mt-6 space-y-6 max-w-2xl">
                      <TextField
                        label="Full Name"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleChange}
                        required
                        sx={{ width: '100%', maxWidth: '500px', mb: 3 }}
                      />
                      <TextField
                        label="Email Address"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        sx={{ width: '100%', maxWidth: '500px', mb: 3 }}
                      />
                      <TextField
                        label="Phone Number (optional)"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        sx={{ width: '100%', maxWidth: '500px', mb: 3 }}
                      />
                      <div className="flex gap-3 pt-4">
                        <Button onClick={handleNext} size="lg">
                          Next <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </div>
                  </StepContent>
                </Step>

                {/* Step 2: Online Presence */}
                <Step>
                  <StepLabel>Your Online Presence</StepLabel>
                  <StepContent
                    TransitionProps={{ unmountOnExit: false }}
                    sx={{ borderColor: "rgba(200, 195, 220, 0.3)" }}
                  >
                    <div className="mt-6 space-y-6 max-w-2xl">
                      <div>
                        <TextField
                          label="Website URL"
                          name="websiteUrl"
                          value={formData.websiteUrl}
                          onChange={handleChange}
                          required
                          sx={{ width: '100%', maxWidth: '500px', mb: 3 }}
                          helperText="We'll scan your site to pre-fill some fields"
                        />
                        {formData.websiteUrl && !hasAutoFilled && (
                          <Button
                            onClick={handleAutoFill}
                            disabled={isScanning}
                            variant="outline"
                            size="sm"
                            className="mt-3"
                          >
                            {isScanning ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Scanning...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 mr-2" />
                                Auto-Fill from Website
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                      <FormControl component="fieldset" sx={{ maxWidth: '500px' }}>
                        <FormLabel component="legend" sx={{ mb: 2 }}>
                          Do you have a Google Business Profile?
                        </FormLabel>
                        <RadioGroup
                          name="hasGbp"
                          value={formData.hasGbp}
                          onChange={handleChange}
                        >
                          <FormControlLabel value="yes" control={<Radio />} label="Yes, I have one" />
                          <FormControlLabel value="no" control={<Radio />} label="No, I need one created" />
                          <FormControlLabel value="not_sure" control={<Radio />} label="Not sure" />
                        </RadioGroup>
                      </FormControl>

                      {formData.hasGbp === "yes" && (
                        <TextField
                          label="Google Business Profile URL"
                          name="gbpUrl"
                          value={formData.gbpUrl}
                          onChange={handleChange}
                          sx={{ width: '100%', maxWidth: '500px', mb: 3 }}
                          helperText="e.g., https://g.page/your-business"
                        />
                      )}

                      <TextField
                        label="Social Media Links (optional)"
                        name="socialLinks"
                        value={formData.socialLinks}
                        onChange={handleChange}
                        multiline
                        rows={3}
                        sx={{ width: '100%', maxWidth: '500px', mb: 3 }}
                        helperText="Facebook, Instagram, LinkedIn, etc. (one per line)"
                      />

                      <div className="flex gap-3 pt-4">
                        <Button onClick={handleBack} variant="outline" size="lg">
                          <ArrowLeft className="w-4 h-4 mr-2" /> Back
                        </Button>
                        <Button onClick={handleNext} size="lg">
                          Next <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </div>
                  </StepContent>
                </Step>

                {/* Step 3: Business Details */}
                <Step>
                  <StepLabel>Business Details</StepLabel>
                  <StepContent
                    TransitionProps={{ unmountOnExit: false }}
                    sx={{ borderColor: "rgba(200, 195, 220, 0.3)" }}
                  >
                    {hasAutoFilled && (
                      <Alert severity="info" sx={{ mb: 3, maxWidth: '600px' }}>
                        📝 Please review the information below
                        <br />
                        We've pre-filled some fields from your website. Make sure everything is accurate and complete any missing information.
                      </Alert>
                    )}

                    <div className="mt-6 space-y-6 max-w-2xl">
                      <TextField
                        label="Business Name"
                        name="businessName"
                        value={formData.businessName}
                        onChange={handleChange}
                        required
                        sx={{ width: '100%', maxWidth: '500px', mb: 3 }}
                      />

                      <TextField
                        label="Industry / Category"
                        name="industry"
                        value={formData.industry}
                        onChange={handleChange}
                        required
                        sx={{ width: '100%', maxWidth: '500px', mb: 3 }}
                        helperText="e.g., Plumbing, Real Estate, Marketing Agency"
                      />

                      <TextField
                        label="Business Address"
                        name="businessAddress"
                        value={formData.businessAddress}
                        onChange={handleChange}
                        required
                        sx={{ width: '100%', maxWidth: '500px', mb: 3 }}
                      />

                      <TextField
                        label="Business Phone"
                        name="businessPhone"
                        value={formData.businessPhone}
                        onChange={handleChange}
                        required
                        sx={{ width: '100%', maxWidth: '500px', mb: 3 }}
                      />

                      <TextField
                        label="Target Location / Service Area"
                        name="targetLocation"
                        value={formData.targetLocation}
                        onChange={handleChange}
                        required
                        sx={{ width: '100%', maxWidth: '500px', mb: 3 }}
                        helperText="e.g., Miami, FL or South Florida"
                      />

                      <TextField
                        label="Services You Offer"
                        name="servicesOffered"
                        value={formData.servicesOffered}
                        onChange={handleChange}
                        required
                        multiline
                        rows={4}
                        sx={{ width: '100%', maxWidth: '600px', mb: 3 }}
                        helperText="List your main services, separated by commas"
                      />

                      <FormControl component="fieldset" sx={{ maxWidth: '500px' }}>
                        <FormLabel component="legend" sx={{ mb: 2 }}>
                          What platform is your website built on?
                        </FormLabel>
                        <RadioGroup
                          name="websiteCms"
                          value={formData.websiteCms}
                          onChange={handleChange}
                        >
                          {CMS_OPTIONS.map((cms) => (
                            <FormControlLabel
                              key={cms}
                              value={cms}
                              control={<Radio />}
                              label={cms}
                            />
                          ))}
                        </RadioGroup>
                        <FormHelperText>
                          This helps us provide platform-specific schema instructions
                        </FormHelperText>
                      </FormControl>

                      <div className="flex gap-3 pt-4">
                        <Button onClick={handleBack} variant="outline" size="lg">
                          <ArrowLeft className="w-4 h-4 mr-2" /> Back
                        </Button>
                        <Button onClick={handleNext} size="lg">
                          Next <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </div>
                  </StepContent>
                </Step>

                {/* Step 4: Competition & Goals */}
                <Step>
                  <StepLabel>Competition & Goals</StepLabel>
                  <StepContent
                    TransitionProps={{ unmountOnExit: false }}
                    sx={{ borderColor: "rgba(200, 195, 220, 0.3)" }}
                  >
                    <div className="mt-6 space-y-6 max-w-2xl">
                      <TextField
                        label="Top Competitors (up to 3)"
                        name="competitors"
                        value={formData.competitors}
                        onChange={handleChange}
                        multiline
                        rows={3}
                        sx={{ width: '100%', maxWidth: '600px', mb: 3 }}
                        helperText="Don't worry if you're not sure — we'll identify them during your AI Needs Assessment."
                      />

                      <TextField
                        label="Any specific goals or concerns? (optional)"
                        name="goals"
                        value={formData.goals}
                        onChange={handleChange}
                        multiline
                        rows={4}
                        sx={{ width: '100%', maxWidth: '600px', mb: 3 }}
                        placeholder="Tell us what you're hoping to achieve or any challenges you're facing..."
                      />

                      {/* Terms of Service Checkbox */}
                      <div className="pt-2">
                        <TosCheckbox checked={tosAccepted} onChange={setTosAccepted} />
                      </div>

                      <div className="flex gap-3 pt-4">
                        <Button onClick={handleBack} variant="outline" size="lg">
                          <ArrowLeft className="w-4 h-4 mr-2" /> Back
                        </Button>
                        <Button
                          onClick={handleSubmit}
                          disabled={isSubmitting || !tosAccepted}
                          size="lg"
                          className="font-semibold"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {selectedPackage === 0 ? 'Generating...' : 'Processing...'}
                            </>
                          ) : selectedPackage === 0 ? (
                            <>
                              Get My Free Assessment <Sparkles className="w-4 h-4 ml-2" />
                            </>
                          ) : (
                            <>
                              Submit & Pay <Send className="w-4 h-4 ml-2" />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </StepContent>
                </Step>
              </Stepper>
            </Card>

            <p className="text-center text-xs text-muted-foreground">
              Your information is secure and will only be used for your optimization package.
              View our{' '}
              <a href="/terms" className="underline hover:text-primary">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" className="underline hover:text-primary">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
