// STRIPE DISABLED: All Stripe service functionality has been commented out
// This file is preserved for future re-enablement of Stripe integration

/*
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// const { logger } = require("../utils/logger"); // Use if available, else console

/**
 * Stripe Service for handling Connect Account operations
 *\/
class StripeService {
  /**
   * Create a Stripe Express account for a company
   * @param {Object} company - The company object
   * @returns {Promise<Object>} The created account object
   *\/
  async createExpressAccount(company) {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error("STRIPE_SECRET_KEY is not defined");
      }

      const capabilities = {
        transfers: { requested: true },
      };

      // Card payments are not supported for RW Express accounts by default
      if (company.country !== "RW") {
        capabilities.card_payments = { requested: true };
      }

      const account = await stripe.accounts.create({
        type: "express",
        country: company.country || "RW", // Default to RW or handle validation
        email: company.email,
        business_type: "company",
        business_profile: {
          name: company.name,
          url: company.domain ? `https://${company.domain}` : undefined,
        },
        capabilities,
        metadata: {
          company_id: company.id,
        },
      });

      console.log(`[Stripe] Created Express account ${account.id} for company ${ company.id }`);
      return account;
    } catch (error) {
      console.error("[Stripe] Create Account Error:", error);
      throw new Error(`Failed to create Stripe account: ${ error.message } `);
    }
  }

  /**
   * Create an account link for onboarding
   * @param {string} accountId - The Stripe Connect Account ID
   * @param {string} returnUrl - URL to redirect after flow
   * @param {string} refreshUrl - URL to redirect if flow expires/fails
   * @returns {Promise<Object>} The account link object
   *\/
  async createOnboardingLink(accountId, returnUrl, refreshUrl) {
    try {
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      console.log(`[Stripe] Generated onboarding link for ${ accountId }`);
      return accountLink;
    } catch (error) {
      console.error("[Stripe] Create Link Error:", error);
      throw new Error(`Failed to create onboarding link: ${ error.message } `);
    }
  }

  /**
   * Check account status
   * @param {string} accountId - The Stripe Connect Account ID
   * @returns {Promise<Object>} The account object
   *\/
  async checkAccountStatus(accountId) {
    try {
      const account = await stripe.accounts.retrieve(accountId);
      return account;
    } catch (error) {
      console.error("[Stripe] Check Status Error:", error);
      throw new Error(`Failed to retrieve account status: ${ error.message } `);
    }
  }

  /**
   * Construct webhook event from signature
   *\/
  constructEvent(payload, signature, secret) {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  }
}

module.exports = new StripeService();
*/

// Export empty object to prevent import errors
module.exports = {};
