interface RazorpayContact {
  create: (options: {
    name: string;
    email: string;
    contact: string;
    type: string;
    [key: string]: any;
  }) => Promise<{ id: string; [key: string]: any }>;
}

interface RazorpayFundAccount {
  create: (options: {
    contact_id: string;
    account_type: string;
    bank_account: {
      name: string;
      account_number: string;
      ifsc: string;
    };
    [key: string]: any;
  }) => Promise<{ id: string; [key: string]: any }>;
}

interface RazorpaySubscription {
  create: (options: {
    plan_id: string;
    customer_notify: number;
    total_count: number;
    [key: string]: any;
  }) => Promise<{ id: string; [key: string]: any }>;
}

interface Razorpay {
  contact: RazorpayContact;
  fund_account: RazorpayFundAccount;
  subscriptions: RazorpaySubscription;
}

declare module "razorpay" {
  export default class Razorpay {
    constructor(options: { key_id: string; key_secret: string });
    contact: RazorpayContact;
    fund_account: RazorpayFundAccount;
    subscriptions: RazorpaySubscription;
  }
}
