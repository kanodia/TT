'use client';

import { Legal } from '@/components/Legal';

// DRAFT privacy notice aimed at India's Digital Personal Data Protection Act 2023 (spec 11.2).
// Matches what the code actually does; a lawyer must review it before launch.
export default function PrivacyPage() {
  return (
    <Legal
      title="Privacy Policy"
      updated="30 September 2026"
      sections={(brand, email) => [
        {
          title: 'Who we are',
          body: [
            `${brand} ("we") helps people find restaurants, dhabas, sweet shops and cafés, and helps those businesses keep their listings up to date. This policy explains what personal data we collect, why, and the choices you have.`,
            `The data fiduciary is [COMPANY LEGAL NAME, REGISTERED ADDRESS]. Questions and complaints: ${email}.`,
          ],
        },
        {
          title: 'What we collect',
          body: [
            [
              'Account: your mobile number (your sign-in), and optionally your name, email and profile photo.',
              'Content you add: reviews, ratings, photos, dishes you tried, reports and suggested corrections, and your saved lists.',
              'Location: when you allow it, your approximate location is used for that request to show places near you. We do not keep a history of your precise location. Saved places (Home, Work) are stored only if you save them.',
              'Device and usage: a random device identifier and events such as pages viewed, searches and taps on Call or Directions, used for analytics and to detect fake reviews. Precise coordinates are removed from these events.',
              'Restaurant partners: business details you submit, team members you invite, and verification documents (such as FSSAI licence or GST registration), which are stored privately and seen only by our verification team.',
              'Field capture: our field team records business details, photos and the owner’s name, phone number and consent. Photo location data is used only to check that a capture is genuine.',
            ],
          ],
        },
        {
          title: 'Why we use it',
          body: [
            [
              'To sign you in with a one-time code and keep your account secure.',
              'To show relevant places, save your lists and publish your reviews under the name you choose.',
              'To keep listings accurate and reviews honest, including automatic checks for spam and fake reviews.',
              'To send you messages you need (sign-in codes, listing decisions, review alerts for restaurants) and ones you opted into.',
              'To understand how the service is used and fix problems.',
            ],
            'We rely on your consent, which you give when you sign in or submit content, and which you can withdraw at any time by deleting your account.',
          ],
        },
        {
          title: 'Who we share it with',
          body: [
            'Your reviews, review photos, name and profile photo are public. Restaurants see the reviews about them and can reply publicly.',
            'We use service providers who process data on our behalf, under contract: cloud hosting and storage, SMS and email delivery, error monitoring (with phone numbers and tokens removed), and an AI provider that summarises published reviews. We do not sell your personal data.',
            'We may disclose data where the law requires it.',
          ],
        },
        {
          title: 'How long we keep it',
          body: [
            [
              'One-time codes: deleted within a day.',
              'Sign-in sessions: up to 30 days, or until you sign out.',
              'Account data: until you delete your account. Deletion runs 7 days after you ask (signing in again cancels it). Your personal details, saved places and lists are erased; published reviews stay but are no longer linked to you.',
              'Verification documents: for as long as the listing is managed on our platform, or as the law requires.',
            ],
          ],
        },
        {
          title: 'Your rights',
          body: [
            'You can see and download your data, correct it, and delete your account from Account → Your data & privacy. You can also withdraw consent, nominate someone to exercise your rights, and raise a grievance with us.',
            `Grievance officer: [NAME], ${email}. We aim to respond within 30 days. If you are not satisfied, you may complain to the Data Protection Board of India.`,
          ],
        },
        {
          title: 'Children',
          body: ['The service is meant for people aged 18 and over. We do not knowingly collect personal data from children without verifiable consent from a parent or guardian.'],
        },
        {
          title: 'Security',
          body: ['Data is sent over HTTPS. Sign-in tokens are short-lived and stored hashed, verification documents are kept in private encrypted storage, and access is limited to people who need it.'],
        },
        {
          title: 'Changes',
          body: ['We will post any changes here and tell you in the app if they are significant.'],
        },
      ]}
    />
  );
}
