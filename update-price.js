const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

async function updatePrice() {
  // Create new price for AI Dominator at $199
  const newPrice = await fetch('https://api.stripe.com/v1/prices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      product: 'prod_U27mpWsjw3AVWm', // AI Dominator product ID
      unit_amount: '19900', // $199.00 in cents
      currency: 'usd',
    }),
  });
  
  const priceData = await newPrice.json();
  console.log('New AI Dominator Price ID ($199):', priceData.id);
}

updatePrice().catch(console.error);
