import { Box, Container, Typography, Button, Paper } from '@mui/material';
import { CheckCircle } from '@mui/icons-material';
import { Link } from 'wouter';
import { useEffect } from 'react';
import { trackEvent } from '@/lib/analytics';

export default function PaymentSuccess() {
  useEffect(() => { trackEvent('checkout_completed'); }, []);
  return (
    <Container maxWidth="md" sx={{ py: 8 }}>
      <Paper
        elevation={0}
        sx={{
          p: 6,
          textAlign: 'center',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
        }}
      >
        <CheckCircle
          sx={{
            fontSize: 80,
            color: 'success.main',
            mb: 3,
          }}
        />
        
        <Typography variant="h3" gutterBottom fontWeight="bold">
          Payment Successful!
        </Typography>
        
        <Typography variant="h6" color="text.secondary" paragraph sx={{ mb: 4 }}>
          Thank you for your purchase! Your payment has been confirmed and your AI optimization is starting now.
        </Typography>
        
        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 4,
            bgcolor: 'rgba(139, 154, 142, 0.05)',
            border: '1px solid',
            borderColor: 'rgba(139, 154, 142, 0.2)',
            borderRadius: 2,
            textAlign: 'left',
          }}
        >
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            📧 Check Your Email
          </Typography>
          <Typography variant="body1" paragraph>
            You'll receive a payment receipt from Stripe and a welcome email within the next few minutes. Your AI Visibility Assessment is already being generated!
          </Typography>
          
          <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ mt: 3 }}>
            🔐 Track Your Progress
          </Typography>
          <Typography variant="body1" paragraph>
            Log in to your client portal using the email address you just paid with. You'll see your order status, deliverables, and can message our team directly.
          </Typography>
          
          <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ mt: 3 }}>
            ⏱️ What Happens Next?
          </Typography>
          <Typography variant="body1">
            Your AI Visibility Assessment will be delivered within minutes. After that, our AI agent processes additional deliverables every 3 hours. Full delivery typically takes 3 days.
          </Typography>
        </Paper>
        
        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 4,
            bgcolor: 'rgba(217, 123, 106, 0.06)',
            border: '1px solid',
            borderColor: 'rgba(217, 123, 106, 0.25)',
            borderRadius: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            📬 Your Portal Access Link Is in Your Inbox
          </Typography>
          <Typography variant="body1" color="text.secondary">
            We just sent a welcome email to the address you used at checkout. Click the link inside to access your client portal — no password needed.
          </Typography>
        </Paper>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/login">
            <Button
              variant="contained"
              size="large"
              sx={{
                px: 4,
                py: 1.5,
                fontSize: '1.1rem',
              }}
            >
              Go to Login
            </Button>
          </Link>

          <Link href="/">
            <Button
              variant="outlined"
              size="large"
              sx={{
                px: 4,
                py: 1.5,
                fontSize: '1.1rem',
              }}
            >
              Back to Home
            </Button>
          </Link>
        </Box>
      </Paper>
    </Container>
  );
}
