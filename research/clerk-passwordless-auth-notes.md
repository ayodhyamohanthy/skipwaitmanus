# Clerk Passwordless Employee Sign-In Notes

Clerk’s current authentication documentation states that email OTP and email-link sign-in are configured under **User & authentication** in the Clerk Dashboard. For an email-OTP-only strategy, Clerk requires email addresses, sign-up verification by **Email verification code**, sign-in by **Email verification code**, and password disabled. Email-link support additionally requires sign-up and sign-in email-link strategies to be enabled. Both email codes and links expire after ten minutes; prebuilt components apply a 30-second resend cooldown to email-code requests.

For skipwait.me, the required production configuration is: enable both **Email verification code** and **Email verification link** for email sign-in, enable the matching verification strategies at sign-up, and disable the password strategy. The existing in-app work-email OTP remains a separate verified-email-enrollment step after authentication and must not be removed.

The authenticated Clerk Dashboard has been opened at the SkipWait Production instance. The application uses the generic `SignInButton` modal for the employee entry point, so it will automatically stop showing password once the instance-level strategies are updated. A custom UI is unnecessary unless the product later needs to present its own OTP and magic-link chooser.

## Sources

- [Clerk — Sign-up and sign-in options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options)
- [Clerk — Custom email or phone OTP flow](https://clerk.com/docs/guides/development/custom-flows/authentication/email-sms-otp)
- [Clerk — Custom email-link flow](https://clerk.com/docs/nextjs/guides/development/custom-flows/authentication/email-links)
