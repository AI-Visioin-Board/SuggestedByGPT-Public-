import { Box, Container, Typography, Button, Paper } from '@mui/material';
import { Cancel } from '@mui/icons-material';
import { Link } from 'wouter';

export default function PaymentCancel() {
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
        <Cancel
          sx={{
            fontSize: 80,
            color: 'warning.main',
            mb: 3,
          }}
        />
        
        <Typography variant="h3" gutterBottom fontWeight="bold">
          Payment Cancelled
        </Typography>
        
        <Typography variant="h6" color="text.secondary" paragraph sx={{ mb: 4 }}>
          Your payment was cancelled. No charges have been made to your account.
        </Typography>
        
        <Box sx={{ mb: 4 }}>
          <Typography variant="body1" paragraph>
            If you experienced any issues during checkout, please don't hesitate to contact us.
          </Typography>
          <Typography variant="body1" paragraph>
            We're here to help you get started with AI optimization for your business.
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/get-started">
            <Button
              variant="contained"
              size="large"
              sx={{
                px: 4,
                py: 1.5,
                fontSize: '1.1rem',
              }}
            >
              Try Again
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
