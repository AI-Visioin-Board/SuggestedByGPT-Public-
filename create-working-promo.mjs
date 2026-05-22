import Stripe from 'stripe';
import * as dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createWorkingPromoCode() {
  try {
    // Step 1: Create a coupon with 100% off and NO restrictions
    console.log('Creating 100% off coupon with NO restrictions...');
    const coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: 'once',
      name: 'GPT Test - 100% Off (No Restrictions)',
      // NO applies_to restriction - works for ALL products
    });
    
    console.log('✓ Coupon created:', coupon.id);
    
    // Step 2: Create a promotion code "GPT" linked to this coupon
    console.log('Creating promotion code "GPT"...');
    const promotionCode = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: 'GPT',
      // NO restrictions on customer, first_time_transaction, minimum_amount, etc.
    });
    
    console.log('✓ Promotion code created successfully!');
    console.log('');
    console.log('='.repeat(60));
    console.log('PROMO CODE READY FOR TESTING');
    console.log('='.repeat(60));
    console.log('Code:', promotionCode.code);
    console.log('Coupon ID:', coupon.id);
    console.log('Promotion Code ID:', promotionCode.id);
    console.log('Discount:', coupon.percent_off + '% off');
    console.log('Applies to: ALL products (no restrictions)');
    console.log('');
    console.log('You can now use code "GPT" at checkout for 100% off!');
    
  } catch (error) {
    console.error('Error creating promo code:', error.message);
    if (error.code === 'resource_already_exists') {
      console.log('');
      console.log('The code "GPT" already exists. Deleting and recreating...');
      
      // List all promotion codes to find the existing one
      const codes = await stripe.promotionCodes.list({ code: 'GPT', limit: 1 });
      if (codes.data.length > 0) {
        await stripe.promotionCodes.update(codes.data[0].id, { active: false });
        console.log('✓ Deactivated existing GPT code');
        
        // Create a new one with a slightly different code
        const newCode = await stripe.promotionCodes.create({
          coupon: (await stripe.coupons.create({
            percent_off: 100,
            duration: 'once',
            name: 'GPT Test - 100% Off (No Restrictions v2)',
          })).id,
          code: 'GPTTEST',
          active: true,
        });
        
        console.log('✓ Created new code: GPTTEST');
        console.log('Use code "GPTTEST" at checkout for 100% off!');
      }
    }
  }
}

createWorkingPromoCode();
