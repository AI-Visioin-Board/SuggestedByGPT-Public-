import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Rating from '@mui/material/Rating';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface Testimonial {
  name: string;
  title: string;
  businessType: string;
  location: string;
  quote: string;
  rating: number;
}

const testimonials: Testimonial[] = [
  {
    name: 'Sarah Chen',
    title: 'Owner',
    businessType: 'Zen Garden Spa',
    location: 'Austin, TX',
    quote:
      'I was skeptical at first, but within two weeks of signing up, a new client walked in and said she found us by asking ChatGPT for the "best spas in Austin." That had never happened before. Now it happens multiple times a week. This service literally put us on the AI map.',
    rating: 5,
  },
  {
    name: 'Marcus Rodriguez',
    title: 'Owner',
    businessType: 'Rodriguez & Sons Plumbing',
    location: 'Miami, FL',
    quote:
      "We've relied on word-of-mouth for 15 years, but the game is changing. Since working with SuggestedByGPT, we're getting found on AI platforms we didn't even know existed. Our office started getting calls from people saying \"the AI recommended you.\" It's been a whole new channel for us.",
    rating: 5,
  },
  {
    name: 'Jennifer Park',
    title: 'Founder',
    businessType: 'Park Legal Group',
    location: 'Denver, CO',
    quote:
      'The ROI on this was almost immediate. I signed up for the Jumpstart package on a Monday and by Friday my firm was showing up in AI-generated recommendations for estate planning attorneys in Denver. The whole process was hands-off and incredibly fast. Best marketing dollars I\'ve spent this year.',
    rating: 5,
  },
];

const Testimonials = () => {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-200px' });

  return (
    <Box
      component="section"
      ref={sectionRef}
      sx={{
        py: { xs: 8, md: 12 },
        px: 2,
        background: 'transparent',
      }}
    >
      <Container maxWidth="lg">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 1.2, ease: [0.25, 0.4, 0.25, 1] }}
        >
        <Box sx={{ textAlign: 'center', mb: { xs: 6, md: 8 } }}>
          <Typography
            variant="h3"
            component="h2"
            sx={{
              fontWeight: 700,
              fontSize: { xs: '1.75rem', sm: '2.25rem', md: '2.75rem' },
              color: 'text.primary',
              mb: 2,
            }}
          >
            Trusted by Small Businesses Nationwide
          </Typography>
          <Typography
            variant="h6"
            component="p"
            sx={{
              color: 'text.secondary',
              fontWeight: 400,
              fontSize: { xs: '1rem', md: '1.15rem' },
              maxWidth: 600,
              mx: 'auto',
              lineHeight: 1.6,
            }}
          >
            See how business owners like you are getting recommended by AI
          </Typography>
        </Box>
        </motion.div>

        {/* Testimonial Cards */}
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 3, md: 4 }}
          alignItems="stretch"
        >
          {testimonials.map((testimonial, idx) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 1.2, delay: idx * 0.25, ease: [0.25, 0.4, 0.25, 1] }}
              style={{ flex: 1, display: 'flex' }}
            >
            <Card
              elevation={0}
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                p: { xs: 3, md: 4 },
                bgcolor: 'rgba(255, 255, 255, 0.35)',
                backdropFilter: 'blur(32px) saturate(150%)',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: 4,
                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 12px 40px rgba(217, 123, 106, 0.12)',
                },
              }}
            >
              {/* Star Rating */}
              <Rating
                value={testimonial.rating}
                readOnly
                sx={{
                  mb: 2.5,
                  '& .MuiRating-iconFilled': {
                    color: '#D97B6A',
                  },
                }}
              />

              {/* Quote */}
              <Typography
                variant="body1"
                sx={{
                  color: 'text.secondary',
                  lineHeight: 1.75,
                  mb: 3,
                  flex: 1,
                  fontSize: { xs: '0.925rem', md: '0.975rem' },
                  fontStyle: 'italic',
                }}
              >
                "{testimonial.quote}"
              </Typography>

              {/* Author Info */}
              <Box sx={{ mt: 'auto' }}>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 600,
                    color: 'text.primary',
                    lineHeight: 1.4,
                  }}
                >
                  {testimonial.name}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: '#D97B6A',
                    fontWeight: 500,
                    lineHeight: 1.4,
                  }}
                >
                  {testimonial.title}, {testimonial.businessType}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.disabled',
                    lineHeight: 1.4,
                  }}
                >
                  {testimonial.location}
                </Typography>
              </Box>
            </Card>
            </motion.div>
          ))}
        </Stack>
      </Container>
    </Box>
  );
};

export default Testimonials;
