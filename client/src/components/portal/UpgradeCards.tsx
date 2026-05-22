/**
 * UpgradeCards — Dark glass upgrade CTAs for Assessment and Jumpstart users.
 * Preserves all pricing, features, and Stripe checkout logic from ClientPortal.
 */
import { useState } from "react";
import { Box, Button, Chip, Divider, Stack, Typography, useTheme } from "@mui/material";
import { ArrowForward, CheckCircle, TrendingUp } from "@mui/icons-material";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { GlassCard } from "./GlassCard";
import { FadeIn } from "./FadeIn";
import { ACTIVE_PROMO } from "@shared/products";
import TosCheckbox from "@/components/TosCheckbox";
import { TOS_VERSION } from "@shared/legal";

interface UpgradeCardsProps {
  packageType: string;
  orderId: number;
  userEmail?: string | null;
  userName?: string | null;
}

export function UpgradeCards({ packageType, orderId, userEmail, userName }: UpgradeCardsProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [isProcessing, setIsProcessing] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);

  const createCheckoutSession = trpc.stripe.createCheckoutSession.useMutation();
  const createUpgradeSession = trpc.stripe.createUpgradeCheckoutSession.useMutation();

  const handlePurchase = async (productId: "AI_JUMPSTART" | "AI_DOMINATOR") => {
    setIsProcessing(true);
    try {
      const result = await createCheckoutSession.mutateAsync({
        productId,
        customerEmail: userEmail ?? undefined,
        customerName: userName ?? undefined,
        origin: window.location.origin,
        tosAccepted: true as const,
        tosVersion: TOS_VERSION,
        flow: 'get_started' as const,
      });
      if (result.url) window.location.href = result.url;
    } catch (error: any) {
      console.error("Payment error:", error);
      toast.error("Failed to create checkout session. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleUpgrade = async () => {
    setIsProcessing(true);
    try {
      const result = await createUpgradeSession.mutateAsync({
        orderId,
        origin: window.location.origin,
        tosAccepted: true as const,
        tosVersion: TOS_VERSION,
      });
      if (result.url) window.location.href = result.url;
    } catch (error: any) {
      console.error("Upgrade error:", error);
      toast.error(error.message || "Failed to create upgrade session. Please try again.");
      setIsProcessing(false);
    }
  };

  // Check promo status
  const promo = ACTIVE_PROMO;
  const promoActive = promo && new Date(promo.expiresAt).getTime() > Date.now() && !!promo.discounts.AI_DOMINATOR;
  const domPromo = promoActive ? promo.discounts.AI_DOMINATOR : null;

  // Jumpstart → Dominator upgrade
  if (packageType === "jumpstart") {
    return (
      <FadeIn>
        <GlassCard accent sx={{ mb: 3 }}>
          <Stack spacing={2.5}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <TrendingUp sx={{ fontSize: 32, color: "#D97B6A" }} />
              <Box>
                <Typography sx={{ fontSize: 18, fontWeight: 800, color: "text.primary" }}>
                  Upgrade to AI Dominator
                </Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  Get the complete AI optimization package for just $200 more
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)" }} />

            <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.primary" }}>
              What You'll Get:
            </Typography>

            <Stack spacing={1}>
              {[
                "GBP creation or full optimization",
                "Website content optimization for AI",
                "Advanced schema markup (services, pricing, breadcrumbs)",
                "Competitor deep dive & reverse engineering",
                "Social proof strategy across all platforms",
                "2x check-ins over 30 days",
              ].map((text) => (
                <Stack key={text} direction="row" spacing={1} alignItems="flex-start">
                  <CheckCircle sx={{ color: "#D97B6A", fontSize: 16, mt: 0.2 }} />
                  <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{text}</Typography>
                </Stack>
              ))}
            </Stack>

            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pt: 1 }}>
              <Box>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Upgrade Price</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 800, color: "#D97B6A" }}>$200</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  (Total: $299 - $99 already paid)
                </Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  + $89/mo x 2 months
                </Typography>
              </Box>
              <Button
                variant="contained"
                endIcon={<ArrowForward />}
                onClick={handleUpgrade}
                disabled={isProcessing || !tosAccepted}
                sx={{
                  py: 1.5, px: 3, borderRadius: 12, fontWeight: 700,
                  background: "linear-gradient(135deg, #D97B6A, #E8A99A)",
                  "&:hover": { background: "linear-gradient(135deg, #C4695A, #D97B6A)" },
                }}
              >
                {isProcessing ? "Processing..." : "Upgrade Now"}
              </Button>
            </Box>
            <TosCheckbox checked={tosAccepted} onChange={setTosAccepted} />
          </Stack>
        </GlassCard>
      </FadeIn>
    );
  }

  // Assessment → Jumpstart + Dominator dual cards
  if (packageType === "assessment") {
    return (
      <FadeIn>
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: "text.primary", textAlign: "center", mb: 2.5 }}>
            Ready to Take Action on Your Results?
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2.5 }}>
            {/* Jumpstart */}
            <GlassCard hover>
              <Stack spacing={2}>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: "text.primary" }}>AI Jumpstart</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.6 }}>
                  8 automated deliverables — schema markup, citation audit, robots.txt, llms.txt, FAQ schema, and more. Delivered in 5-7 days.
                </Typography>
                <Box>
                  <Typography sx={{ fontSize: 28, fontWeight: 800, color: "#D97B6A" }}>$99</Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>one-time</Typography>
                </Box>
                <Button
                  fullWidth variant="outlined"
                  onClick={() => handlePurchase("AI_JUMPSTART")}
                  disabled={isProcessing || !tosAccepted}
                  sx={{
                    py: 1, borderRadius: 10,
                    borderColor: "divider",
                    color: "rgba(255,255,255,0.7)",
                    "&:hover": { borderColor: "#D97B6A", color: "#D97B6A" },
                  }}
                >
                  {isProcessing ? "Processing..." : "Get AI Jumpstart"}
                </Button>
              </Stack>
            </GlassCard>

            {/* Dominator */}
            <Box sx={{ position: "relative" }}>
              <Chip
                label={promoActive ? `SAVE $${domPromo!.savings}` : "BEST VALUE"}
                size="small"
                sx={{
                  position: "absolute", top: 12, right: 12, zIndex: 1,
                  bgcolor: promoActive ? "#34D399" : "#D97B6A", color: promoActive ? "#000" : "text.primary", fontWeight: 700, fontSize: "0.6rem",
                }}
              />
              <GlassCard accent hover sx={{ height: "100%" }}>
                <Stack spacing={2}>
                  <Typography sx={{ fontSize: 16, fontWeight: 700, color: "text.primary" }}>AI Dominator</Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.6 }}>
                    Everything in Jumpstart plus GBP optimization, content rewrite, competitor analysis, directory submissions, schema installation, guest articles, and monthly check-ins.
                  </Typography>
                  <Box>
                    {domPromo ? (
                      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                        <Typography sx={{ fontSize: 18, fontWeight: 600, color: "text.secondary", textDecoration: "line-through" }}>${domPromo.originalPrice}</Typography>
                        <Typography sx={{ fontSize: 28, fontWeight: 800, color: "#34D399" }}>${domPromo.promoPrice}</Typography>
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: 28, fontWeight: 800, color: "#D97B6A" }}>$299</Typography>
                    )}
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                      upfront + $89/mo x 2 months
                    </Typography>
                    {promoActive && (
                      <Typography sx={{ fontSize: 11, color: "#34D399", fontWeight: 600, mt: 0.5 }}>
                        {promo!.badge} — Limited time offer
                      </Typography>
                    )}
                  </Box>
                  <Button
                    fullWidth variant="contained"
                    endIcon={<ArrowForward />}
                    onClick={() => handlePurchase("AI_DOMINATOR")}
                    disabled={isProcessing || !tosAccepted}
                    sx={{
                      py: 1, borderRadius: 10, fontWeight: 700,
                      background: "linear-gradient(135deg, #D97B6A, #E8A99A)",
                      "&:hover": { background: "linear-gradient(135deg, #C4695A, #D97B6A)" },
                    }}
                  >
                    {isProcessing ? "Processing..." : "Get AI Dominator"}
                  </Button>
                </Stack>
              </GlassCard>
            </Box>
          </Box>
          <Box sx={{ mt: 2, textAlign: "center" }}>
            <TosCheckbox checked={tosAccepted} onChange={setTosAccepted} />
          </Box>
        </Box>
      </FadeIn>
    );
  }

  return null;
}
