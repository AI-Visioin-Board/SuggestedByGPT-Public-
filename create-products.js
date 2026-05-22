const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

async function createProducts() {
  // Create AI Jumpstart product
  const jumpstart = await fetch('https://api.stripe.com/v1/products', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      name: 'AI Jumpstart',
      description: 'Core AI optimization — schema markup, citation audit, AI visibility report, and review strategy. Delivered in 3-5 business days.',
    }),
  });
  
  const jumpstartData = await jumpstart.json();
  console.log('AI Jumpstart Product:', jumpstartData.id);
  
  // Create price for AI Jumpstart
  const jumpstartPrice = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      product: jumpstartData.id,
      unit_amount: '9900',
      currency: 'usd',
    }),
  });
  
  const jumpstartPriceData = await jumpstartPrice.json();
  console.log('AI Jumpstart Price ID:', jumpstartPriceData.id);
  
  // Create AI Dominator product
  const dominator = await fetch('https://api.stripe.com/v1/products', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      name: 'AI Dominator',
      description: 'Everything in Package 1, plus GBP creation, content rewrite, advanced schema, competitor analysis, and 2x monthly check-ins. 7-10 business days.',
    }),
  });
  
  const dominatorData = await dominator.json();
  console.log('AI Dominator Product:', dominatorData.id);
  
  // Create price for AI Dominator
  const dominatorPrice = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      product: dominatorData.id,
      unit_amount: '29900',
      currency: 'usd',
    }),
  });
  
  const dominatorPriceData = await dominatorPrice.json();
  console.log('AI Dominator Price ID:', dominatorPriceData.id);
}

createProducts().catch(console.error);
