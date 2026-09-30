'use client';

import { Legal } from '@/components/Legal';

// DRAFT terms of use. A lawyer must review and complete them before launch.
export default function TermsPage() {
  return (
    <Legal
      title="Terms of Use"
      updated="30 September 2026"
      sections={(brand, email) => [
        {
          title: 'About these terms',
          body: [`These terms apply when you use ${brand} on the web or in our apps. By signing in you agree to them and to our Privacy Policy. If you use ${brand} for a business, you accept them on its behalf.`],
        },
        {
          title: 'Your account',
          body: ['You sign in with your own mobile number and keep your one-time codes private. You are responsible for what happens under your account. We may suspend accounts that break these terms.'],
        },
        {
          title: 'Reviews and photos',
          body: [
            [
              'Reviews must describe your own genuine visit. Do not post reviews for a business you own, manage or work for, or in exchange for payment, discounts or gifts.',
              'Do not post anything abusive, hateful, obscene, defamatory, private information about others, spam, links or advertising.',
              'Upload only photos you took, and do not photograph people without their permission.',
              'We may hold, hide or remove content that breaks these rules, including automatically, and we may limit how often you can post.',
            ],
            `You keep ownership of what you post and give ${brand} a non-exclusive, royalty-free, worldwide licence to host, display, adapt and share it as part of the service.`,
          ],
        },
        {
          title: 'Listings and restaurant partners',
          body: [
            'Information on listings comes from restaurants, our field team and diners. We work to keep it accurate but cannot guarantee menus, prices, timings or offers — please check with the restaurant.',
            [
              'Partners must provide accurate information and genuine documents, keep hours, menus and offers current, and honour offers they publish.',
              'Partners may reply to reviews but may not edit, remove or pay for reviews, or pressure diners to change them.',
              'Changes to a live listing’s name or address are checked by our team before they appear.',
              'Owners are responsible for the team members they invite.',
            ],
            'Listings added by our field team are published with the owner’s consent. Owners can claim, correct or ask us to remove them.',
          ],
        },
        {
          title: 'Acceptable use',
          body: ['Do not misuse the service: no scraping, automated access beyond normal use, attempts to break security, or use that disrupts others.'],
        },
        {
          title: 'Liability',
          body: [
            `${brand} is provided "as is". We are not responsible for food, service or any dealings between you and a restaurant. To the extent the law allows, our liability for any claim is limited to [AMOUNT].`,
          ],
        },
        {
          title: 'Changes and ending',
          body: ['We may update these terms and will post changes here. You can stop using the service and delete your account at any time.'],
        },
        {
          title: 'Law and disputes',
          body: [`These terms are governed by the laws of India. Courts at [CITY] have jurisdiction. Contact us first at ${email} — most problems can be sorted out quickly.`],
        },
      ]}
    />
  );
}
