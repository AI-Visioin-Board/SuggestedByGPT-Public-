/**
 * Privacy Policy page
 * URL: /privacy
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

export default function PrivacyPolicy() {
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
              Privacy Policy
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
                  1. Introduction
                </Typography>
                <Typography variant="body1">
                  SuggestedByGPT (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy and is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website (suggestedbygpt.com) and use our services.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  2. Information We Collect
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  Information you provide directly:
                </Typography>
                <Typography component="ul" sx={{ pl: 3, mt: 1, '& li': { mb: 0.5, lineHeight: 1.8, color: '#444' } }}>
                  <li><strong>Contact information:</strong> Name, email address, and phone number provided during the intake form or support ticket submission.</li>
                  <li><strong>Business information:</strong> Business name, address, phone number, website URL, industry, services offered, Google Business Profile URL, social media links, competitors, and goals.</li>
                  <li><strong>Payment information:</strong> Payment details are processed securely through Stripe. We do not store credit card numbers on our servers.</li>
                  <li><strong>Communications:</strong> Messages sent through support tickets, the client portal chat, or email.</li>
                  <li><strong>Consent records:</strong> When you accept our Terms of Service, we record your IP address, browser information, timestamp, and the version of the Terms you agreed to.</li>
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600, mt: 2 }}>
                  Information collected automatically:
                </Typography>
                <Typography component="ul" sx={{ pl: 3, mt: 1, '& li': { mb: 0.5, lineHeight: 1.8, color: '#444' } }}>
                  <li><strong>Usage data:</strong> Pages visited, time spent on pages, and interaction patterns with our website.</li>
                  <li><strong>Device information:</strong> Browser type, operating system, and device type.</li>
                  <li><strong>Website scan data:</strong> If you use our free AI Visibility Scanner, we analyze your publicly available website content and store the scan results.</li>
                  <li><strong>Voice interaction data:</strong> If you use our voice agent feature, your voice input is processed in real-time. We store conversation transcripts and summaries but do not store raw audio recordings.</li>
                  <li><strong>Cookies:</strong> We use essential cookies to maintain your session and preferences. We do not use third-party tracking cookies for advertising.</li>
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  3. How We Use Your Information
                </Typography>
                <Typography variant="body1">
                  We use the information we collect to:
                </Typography>
                <Typography component="ul" sx={{ pl: 3, mt: 1, '& li': { mb: 0.5, lineHeight: 1.8, color: '#444' } }}>
                  <li>Deliver the AI visibility optimization services you purchased.</li>
                  <li>Generate personalized deliverables including audits, schema markup, and content recommendations.</li>
                  <li>Communicate with you about your order status, deliverables, and support inquiries.</li>
                  <li>Process payments through Stripe.</li>
                  <li>Send transactional emails (order confirmations, deliverable notifications, portal access links).</li>
                  <li>Engage with relevant online communities (such as Reddit) on your behalf as part of the AI Dominator package.</li>
                  <li>Improve our services and develop new features.</li>
                  <li>Respond to support tickets and customer service requests.</li>
                  <li>Maintain records of consent for legal and compliance purposes.</li>
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  4. AI Processing of Your Data
                </Typography>
                <Typography variant="body1">
                  Our service uses artificial intelligence, including large language models and voice AI, to process your business information and generate deliverables. This means:
                </Typography>
                <Typography component="ul" sx={{ pl: 3, mt: 1, '& li': { mb: 0.5, lineHeight: 1.8, color: '#444' } }}>
                  <li>Your business information (name, website, services, etc.) is sent to AI service providers to generate audit reports, schema markup, and optimization recommendations.</li>
                  <li>Your publicly available website content may be analyzed by our AI systems.</li>
                  <li>Support messages may be processed by AI to provide automated responses, with human oversight for escalated issues.</li>
                  <li>Voice conversations are transcribed by Deepgram (speech-to-text) and processed by Google Gemini Live (AI responses).</li>
                  <li>Reddit threads and communities relevant to your business are discovered and analyzed via the Reddit API for community engagement services.</li>
                  <li>We do not use your data to train AI models. Your business information is processed solely for delivering your purchased services.</li>
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  5. Data Sharing and Disclosure
                </Typography>
                <Typography variant="body1">
                  We do not sell your personal information. We may share your information with:
                </Typography>
                <Typography component="ul" sx={{ pl: 3, mt: 1, '& li': { mb: 0.5, lineHeight: 1.8, color: '#444' } }}>
                  <li><strong>Stripe:</strong> For payment processing. Stripe&apos;s privacy policy governs their handling of your payment data.</li>
                  <li><strong>Supabase:</strong> For authentication services (magic link login).</li>
                  <li><strong>Resend:</strong> For transactional email delivery. Email addresses are shared with Resend solely for sending service-related communications.</li>
                  <li><strong>Anthropic (Claude):</strong> Business information is processed through Claude APIs to generate deliverables.</li>
                  <li><strong>Deepgram:</strong> Voice data is processed through Deepgram&apos;s speech-to-text API for the voice agent feature.</li>
                  <li><strong>Google (Gemini Live):</strong> Voice conversation data is processed through Google&apos;s Gemini Live API for AI-powered voice responses.</li>
                  <li><strong>Reddit:</strong> We access publicly available Reddit data through their API for community engagement services.</li>
                  <li><strong>Collaborator.pro:</strong> For guest article placement, article content and your business URL are shared with the Collaborator.pro marketplace.</li>
                  <li><strong>SerpAPI:</strong> Your business name and website may be queried through SerpAPI for search visibility analysis.</li>
                  <li><strong>Legal requirements:</strong> We may disclose information when required by law, court order, or to protect our rights and safety.</li>
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  6. Data Security
                </Typography>
                <Typography variant="body1">
                  We implement reasonable security measures to protect your information, including:
                </Typography>
                <Typography component="ul" sx={{ pl: 3, mt: 1, '& li': { mb: 0.5, lineHeight: 1.8, color: '#444' } }}>
                  <li>HTTPS encryption for all data in transit.</li>
                  <li>Secure authentication via magic links (passwordless login).</li>
                  <li>Role-based access controls for client data.</li>
                  <li>Encrypted database connections.</li>
                  <li>Client credentials (CMS passwords, etc.) encrypted using AES-256-GCM encryption at rest.</li>
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  While we strive to protect your information, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  7. Data Retention
                </Typography>
                <Typography variant="body1">
                  We retain your personal and business information for as long as your account is active or as needed to provide services. Deliverables remain accessible in your client portal indefinitely. Consent records (ToS acceptance) are retained for the duration required to defend potential disputes. You may request deletion of your account and associated data at any time by contacting us at suggestedbygpt@gmail.com. We will process deletion requests within 30 days, except where retention is required by law or for legitimate business purposes (e.g., financial records, dispute evidence).
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  8. Your Rights
                </Typography>
                <Typography variant="body1">
                  Depending on your location, you may have the following rights regarding your personal data:
                </Typography>
                <Typography component="ul" sx={{ pl: 3, mt: 1, '& li': { mb: 0.5, lineHeight: 1.8, color: '#444' } }}>
                  <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
                  <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data.</li>
                  <li><strong>Deletion:</strong> Request deletion of your personal data.</li>
                  <li><strong>Portability:</strong> Request a copy of your data in a structured, machine-readable format.</li>
                  <li><strong>Objection:</strong> Object to certain processing of your personal data.</li>
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  To exercise any of these rights, contact us at suggestedbygpt@gmail.com.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  9. Children&apos;s Privacy
                </Typography>
                <Typography variant="body1">
                  Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child under 18, we will take steps to delete it promptly.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  10. Changes to This Policy
                </Typography>
                <Typography variant="body1">
                  We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date. We encourage you to review this page periodically. For material changes, we will make reasonable efforts to notify active clients via email.
                </Typography>
              </section>

              <section>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  11. Contact Us
                </Typography>
                <Typography variant="body1">
                  If you have questions or concerns about this Privacy Policy or our data practices, please contact us:
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
