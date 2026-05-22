import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createPromoCode() {
  try {
    // First, create a coupon with 100% off
    const coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: 'forever',
      name: 'GPT Test Code - 100% Off',
    });
    
    console.log('✅ Coupon created:', coupon.id);
    
    // Then, create a promotion code with the code "GPT"
    const promotionCode = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: 'GPT',
      active: true,
    });
    
    console.log('✅ Promotion code created:', promotionCode.code);
    console.log('   Coupon ID:', promotionCode.coupon.id);
    console.log('   Discount:', promotionCode.coupon.percent_off + '% off');
    console.log('\n🎉 You can now use code "GPT" at checkout for 100% off!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createPromoCode();
