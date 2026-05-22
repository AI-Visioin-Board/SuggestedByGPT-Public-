/**
 * Terms of Service page
 * URL: /terms
 * Provides to Stripe as TOS URL: https://suggestedbygpt.com/terms
 */

import {
  Box,
  Container,
  Typography,
  Stack,
  AppBar,
  Toolbar,
  Button,
} from '@mui/material';
import { AutoAwesome, ArrowBack } from '@mui/icons-material';
import { Link } from 'wouter';

export default function Terms() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F5F3F0' }}>
      {/* Navigation */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(245, 243, 240, 0.9)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Link href="/">
            <Stack direction="row" spacing={1} alignItems="center" sx={{ cursor: 'pointer' }}>
              <AutoAwesome sx={{ color: '#D97B6A' }} />
              <Typography variant="h6" fontWeight={700} sx={{ color: '#2C2C2C' }}>
                SuggestedByGPT
              </Typography>
            </Stack>
          </Link>
          <Link href="/">
            <Button
              startIcon={<ArrowBack />}
              sx={{ color: '#2C2C2C', textTransform: 'none', fontWeight: 500 }}
            >
              Back to Home
            </Button>
          </Link>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
        <Stack spacing={4}>
          <Box>
            <Typography
              variant="h3"
              sx={{ fontWeight: 800, color: '#2C2C2C', mb: 1, fontSize: { xs: '1.8rem', md: '2.5rem' } }}
            >
              Terms of Service
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Last updated: April 12, 2026
            </Typography>
          </Box>

          <Box
            sx={{
              bgcolor: '#fff',
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
              p: { xs: 3, md: 5 },
            }}
          >
            <Stack spacing={4} sx={{ '& p': { lineHeight: 1.8, color: '#444' }, '& h5': { color: '#2C2C2C' } }}>
              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  1. Agreement to Terms
                </Typography>
                <Typography variant="body1">
                  By accessing or using the SuggestedByGPT website (suggestedbygpt.com) and purchasing any of our services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services or make any purchases. By checking the &quot;I agree&quot; checkbox and proceeding to checkout, you acknowledge that you have read, understood, and agree to these terms and our Privacy Policy.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  2. Services Description
                </Typography>
                <Typography variant="body1">
                  SuggestedByGPT provides AI visibility optimization services for businesses. Our services include AI visibility audits, schema markup generation, citation audits, robots.txt optimization, llms.txt generation, FAQ schema creation, directory submissions, Google Business Profile optimization, content optimization, competitor analysis, social proof strategy, guest article placement on third-party blogs, Reddit community engagement on your behalf, and ongoing progress check-ins. Services are delivered as digital deliverables through your secure client portal.
                </Typography>
                <Typography variant="body1" sx={{ mt: 2 }}>
                  We offer the following service packages:
                </Typography>
                <Typography component="ul" sx={{ pl: 3, mt: 1, '& li': { mb: 0.5, lineHeight: 1.8, color: '#444' } }}>
                  <li><strong>Free AI Needs Assessment ($0):</strong> 1 deliverable — AI visibility score and personalized recommendations. No credit card required.</li>
                  <li><strong>AI Jumpstart ($99 one-time):</strong> 10 deliverables focused on foundational AI visibility optimization, delivered in 5-7 business days.</li>
                  <li><strong>AI Dominator ($299 upfront + $89/month for 2 months):</strong> 21 deliverables for comprehensive AI visibility optimization including all Jumpstart deliverables plus GBP optimization, content rewrite, competitor analysis, directory submissions, schema installation, social proof strategy, 9 guest articles, Reddit community engagement (30 posts), and 2 monthly check-ins. The $89/month subscription is automatically created after the initial payment and auto-cancels after 2 payments ($477 total).</li>
                </Typography>
                <Typography variant="body1" sx={{ mt: 2 }}>
                  Prices may be temporarily reduced via promotional offers. The price displayed at checkout is the binding price for your purchase. Jumpstart clients may upgrade to AI Dominator; the Jumpstart purchase amount is credited toward the upgrade price.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  3. Nature of Digital Services
                </Typography>
                <Typography variant="body1">
                  All deliverables are digital products generated by automated AI systems and delivered electronically through your client portal. You acknowledge that: (a) digital services cannot be &quot;returned&quot; once generated; (b) delivery begins automatically within minutes of purchase; and (c) you are purchasing the generation and delivery of digital reports, code, optimization materials, and services, not guaranteed business outcomes such as specific rankings, traffic increases, or revenue.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  4. Service Delivery
                </Typography>
                <Typography variant="body1">
                  Upon successful payment, your AI Visibility Assessment begins processing automatically within minutes. Remaining deliverables are processed by our automated systems and delivered to your client portal. You will receive email notifications as deliverables are completed and available for review.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  Delivery timelines are estimates and may vary based on the complexity of your business, website accessibility, and third-party service availability. We are not liable for delays caused by factors outside our control, including but not limited to: website downtime, third-party API limitations, or incomplete information provided during the intake process.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  5. AI-Generated Content Disclosure
                </Typography>
                <Typography variant="body1">
                  Our services utilize artificial intelligence technology, including large language models, to generate deliverables such as audit reports, schema markup, content recommendations, and optimization guides. While we strive for accuracy and quality, AI-generated content may occasionally contain errors or require human review before implementation. You are responsible for reviewing all deliverables before implementing them on your website or business listings.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  6. Payment Terms
                </Typography>
                <Typography variant="body1">
                  All payments are processed securely through Stripe. Prices are listed in US Dollars (USD). Payment is required in full at the time of purchase before services begin. We accept major credit cards and other payment methods supported by Stripe.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  The AI Dominator package includes a recurring subscription of $89/month for 2 months, which is automatically created after the initial payment. This subscription auto-cancels after 2 payments. You will be charged a total of $477 ($299 upfront + $89 x 2 months) unless a promotional discount was applied at checkout.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  Promotional codes may be applied at checkout when available. Promotional codes cannot be combined and have no cash value.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  7. Refund Policy
                </Typography>
                <Typography variant="body1">
                  Because our services are digital in nature and delivery begins immediately and automatically upon payment, all sales are generally final.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  If you are unsatisfied with the quality of deliverables, please contact us at suggestedbygpt@gmail.com within 14 days of purchase. We will work with you to resolve any issues, which may include revising deliverables or issuing a partial or full refund at our discretion. Refund requests after deliverables have been accessed or downloaded will generally not be granted.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  <strong>Important:</strong> You must contact us at suggestedbygpt@gmail.com before initiating any dispute or chargeback with your payment provider. We commit to responding within 48 business hours. Please allow 5 business days for resolution before filing a payment dispute. Chargebacks filed without first contacting us and attempting resolution constitute a breach of these Terms and may result in the immediate suspension of your account and portal access.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  We reserve the right to contest all chargebacks and payment disputes with evidence of service delivery, including your electronic consent record, IP address, deliverable completion timestamps, and portal activity logs.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  The Dominator monthly subscription cannot be cancelled mid-cycle for a refund of already-charged amounts. The subscription auto-cancels after 2 months as described in Section 6.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  8. Dispute Resolution
                </Typography>
                <Typography variant="body1">
                  Any dispute arising from these Terms or our services shall first be addressed through informal negotiation by contacting suggestedbygpt@gmail.com. If informal resolution is not achieved within 30 days, disputes shall be resolved through binding arbitration administered under the rules of the American Arbitration Association, conducted in the State of Georgia. For disputes involving amounts under $500, arbitration shall be conducted entirely by written submission.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  You agree to waive any right to participate in a class action lawsuit or class-wide arbitration. Either party may bring claims in small claims court if the claim qualifies.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  9. Electronic Consent and Digital Signature
                </Typography>
                <Typography variant="body1">
                  By checking the &quot;I agree&quot; checkbox and completing your purchase, you provide your legally binding electronic consent and digital signature under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. 7001 et seq.) and the Georgia Uniform Electronic Transactions Act.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  We record the date, time, IP address, browser information, and specific version of these Terms you agreed to. This record constitutes evidence of your informed consent and may be used in the event of a dispute.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  10. Client Portal Access
                </Typography>
                <Typography variant="body1">
                  Upon purchase, you will receive a magic link via email to access your secure client portal. Your portal contains all deliverables, progress updates, and communication tools. You are responsible for maintaining the security of your email address used for portal access. We are not responsible for unauthorized access resulting from compromised email accounts.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  11. Intellectual Property
                </Typography>
                <Typography variant="body1">
                  Upon full payment, you receive a non-exclusive, perpetual license to use all deliverables created for your business. This includes schema markup code, content drafts, audit reports, and optimization guides. You may implement these deliverables on your website and business listings.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  SuggestedByGPT retains the right to use anonymized, aggregated data from service delivery to improve our products and services. We will never share your specific business data, deliverables, or proprietary information with third parties without your explicit consent.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  12. Accuracy of Information
                </Typography>
                <Typography variant="body1">
                  You agree to provide accurate and complete information during the intake process. The quality of our deliverables depends on the accuracy of the information you provide, including your business name, address, website URL, and services offered. We are not responsible for deliverables that are inaccurate due to incorrect or incomplete intake information.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  13. Limitation of Liability
                </Typography>
                <Typography variant="body1">
                  SuggestedByGPT provides optimization recommendations and deliverables designed to improve your visibility in AI-powered platforms. We do not guarantee specific results, rankings, or increases in traffic, leads, or revenue. AI platform algorithms change frequently, and visibility results may vary.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  To the maximum extent permitted by law, SuggestedByGPT shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities, arising from the use of our services.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  Our total liability for any claim arising from or related to these terms shall not exceed the amount you paid for the specific service giving rise to the claim.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  14. Third-Party Services
                </Typography>
                <Typography variant="body1">
                  Our services may involve interaction with third-party platforms including but not limited to Google Business Profile, Bing Places, Reddit, various directory sites, guest article platforms, and AI platforms (ChatGPT, Gemini, Perplexity, Claude). We are not responsible for changes to these platforms&apos; terms of service, algorithms, or availability. Our recommendations are based on current best practices and may need to be updated as platforms evolve.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  14a. Managed Reddit Account (Dominator clients)
                </Typography>
                <Typography variant="body1">
                  As part of the Dominator package, SuggestedByGPT creates and operates a dedicated Reddit account on your business&apos;s behalf for the purpose of community engagement. This account is identified by a username derived from your business name and uses an email address on a domain controlled by SuggestedByGPT. The account exists solely to participate in relevant subreddit conversations on your behalf and follows a 30-day organic warm-up period before any promotional activity, in compliance with Reddit&apos;s usage norms.
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  By signing up for the Dominator package, you grant SuggestedByGPT authority to operate this account on your behalf for the duration of your engagement and any retention period thereafter. You may request transfer of the account credentials to you at any time, including upon cancellation, by emailing suggestedbygpt@gmail.com. SuggestedByGPT is not liable for actions taken by Reddit (including but not limited to account suspension, shadowbanning, or post removal) that arise from changes to Reddit&apos;s policies or algorithms outside our control. We follow industry best practices for organic engagement and never engage in spam, vote manipulation, or other prohibited activity.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  15. Account Termination
                </Typography>
                <Typography variant="body1">
                  We reserve the right to suspend or terminate portal access for accounts that violate these terms, engage in fraudulent activity, or file chargebacks without first attempting to resolve the issue through our support channels. You may request account deletion at any time by contacting suggestedbygpt@gmail.com.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  16. Changes to Terms
                </Typography>
                <Typography variant="body1">
                  We reserve the right to modify these Terms of Service at any time. Changes will be posted on this page with an updated revision date. Continued use of our services after changes are posted constitutes acceptance of the modified terms. For material changes, we will make reasonable efforts to notify active clients via email.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  17. Governing Law
                </Typography>
                <Typography variant="body1">
                  These Terms of Service shall be governed by and construed in accordance with the laws of the State of Georgia, United States, without regard to its conflict of law provisions.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  18. Contact Information
                </Typography>
                <Typography variant="body1">
                  If you have any questions about these Terms of Service, please contact us:
                </Typography>
                <Typography component="ul" sx={{ pl: 3, mt: 1, '& li': { mb: 0.5, lineHeight: 1.8, color: '#444' } }}>
                  <li>Email: suggestedbygpt@gmail.com</li>
                  <li>Website: suggestedbygpt.com/support</li>
                </Typography>
              </section>
            </Stack>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
