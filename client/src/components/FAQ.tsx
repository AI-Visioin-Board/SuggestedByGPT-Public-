import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface FAQItem {
  question: string;
  answer: string;
}

const faqItems: FAQItem[] = [
  {
    question: 'What exactly is AI visibility optimization?',
    answer:
      'AI visibility optimization is the process of making your business appear when people ask AI chatbots — like ChatGPT, Google Gemini, Perplexity, and others — for recommendations. When someone types "best plumber near me" or "top-rated spas in Austin" into an AI assistant, our service ensures your business is part of the answer. Think of it like SEO, but for the new wave of AI-powered search and discovery.',
  },
  {
    question: 'How long does it take to see results?',
    answer:
      'Timelines depend on the package you choose. With the Jumpstart package, most businesses begin appearing in AI recommendations within 3 to 5 business days. The Dominator package, which includes deeper optimization across more platforms and directories, typically takes 7 to 10 business days for full implementation. Many clients report seeing their first AI-referred customer within the first two weeks.',
  },
  {
    question: 'Do I need any technical knowledge?',
    answer:
      'Not at all. We handle about 90% of the work for you. Once you provide your basic business information, our team gets to work right away. Along the way, we may ask for a couple of things — like access to your website back office so we can install optimizations, or a quick approval before we make any visible changes to your site. There is no learning curve and nothing technical for you to do. You focus on running your business while we handle the optimization.',
  },
  {
    question: 'Will this work for my type of business?',
    answer:
      'If you run a local or service-based business, the answer is almost certainly yes. We have helped spas, law firms, plumbers, dentists, restaurants, salons, fitness studios, auto shops, real estate agents, and many more. Any business that serves customers in a specific area and could benefit from being recommended by AI assistants is a great fit for our service.',
  },
  {
    question: "What's the difference between the three options?",
    answer:
      'The free AI Needs Assessment gives you a snapshot of how AI currently views your business — great for understanding where you stand. The Jumpstart package ($99 one-time) handles core AI visibility with 10 automated deliverables across the most popular platforms. The Dominator package ($299 + $89/mo for 2 months) goes further — it includes everything in Jumpstart plus hands-on optimization, competitive analysis, 9 guest articles on industry blogs, directory submissions, and 2 monthly progress check-ins.',
  },
  {
    question: 'How does the pricing work?',
    answer:
      'The AI Jumpstart is a one-time fee of $99 with no recurring charges. The AI Dominator is $299 upfront plus $89/month for 2 months ($477 total) to cover the extended hands-on work over 8-10 weeks. There are no hidden costs and no long-term contracts. The free assessment is completely free with no credit card required.',
  },
  {
    question: 'What is the free AI Needs Assessment?',
    answer:
      'The free AI Needs Assessment is a no-obligation snapshot of how AI currently sees your business. We scan your website and check your presence across ChatGPT, Gemini, Perplexity, and Claude — then deliver a personalized PDF report with your AI visibility score (rated 0-100), what is working well, what needs improvement, and specific recommendations. No credit card required. After reviewing your results, you can upgrade to our Jumpstart or Dominator packages if you want us to implement the recommendations for you.',
  },
  {
    question: 'What are the guest articles in the Dominator package?',
    answer:
      'As part of the AI Dominator package, we publish 9 guest articles on relevant industry blogs over 3 months (3 articles per month). Each article naturally mentions your business with a backlink to your website. This boosts your traditional SEO through high-quality backlinks and increases your AI visibility by creating more brand mentions across the web — both of which help AI models recommend your business more often.',
  },
];

const FAQ = () => {
  return (
    <Box
      component="section"
      sx={{
        py: { xs: 8, md: 12 },
        px: 2,
        background: 'transparent',
      }}
    >
      <Container maxWidth="lg">
        {/* Section Header */}
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
            Frequently Asked Questions
          </Typography>
        </Box>

        {/* Accordion FAQ Items */}
        <Box sx={{ maxWidth: 800, mx: 'auto' }}>
          {faqItems.map((item, index) => (
            <Accordion
              key={index}
              disableGutters
              elevation={0}
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.4)',
                backdropFilter: 'blur(30px)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                borderRadius: '12px !important',
                mb: 2,
                overflow: 'hidden',
                '&::before': {
                  display: 'none',
                },
                '&.Mui-expanded': {
                  mb: 2,
                },
              }}
            >
              <AccordionSummary
                expandIcon={
                  <ExpandMoreIcon sx={{ color: '#D97B6A', fontSize: 28 }} />
                }
                sx={{
                  px: { xs: 2.5, md: 3.5 },
                  py: { xs: 1, md: 1.5 },
                  '& .MuiAccordionSummary-content': {
                    my: 1.5,
                  },
                }}
              >
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 600,
                    color: 'text.primary',
                    fontSize: { xs: '0.975rem', md: '1.075rem' },
                    lineHeight: 1.5,
                  }}
                >
                  {item.question}
                </Typography>
              </AccordionSummary>
              <AccordionDetails
                sx={{
                  px: { xs: 2.5, md: 3.5 },
                  pb: { xs: 2.5, md: 3 },
                  pt: 0,
                }}
              >
                <Typography
                  variant="body1"
                  sx={{
                    color: 'text.secondary',
                    lineHeight: 1.75,
                    fontSize: { xs: '0.9rem', md: '0.95rem' },
                  }}
                >
                  {item.answer}
                </Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Container>
    </Box>
  );
};

export default FAQ;
